"""
Price Monitor Agent — detects significant price increases,
finds cheaper alternatives across suppliers, and generates
an LLM-powered executive summary with recommendations.
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session

from app.models import (
    MasterItem, LineItem, Invoice, Alert, Supplier, NegotiatedPrice,
)
from app.services.agents.base import BaseAgent, Finding

logger = logging.getLogger(__name__)


class PriceMonitorAgent(BaseAgent):
    agent_type = "price_monitor"

    @property
    def threshold_pct(self) -> float:
        return self.agent_config.get("threshold_pct", 5.0)

    @property
    def lookback_days(self) -> int:
        return self.agent_config.get("lookback_days", 30)

    @property
    def auto_email(self) -> bool:
        return self.agent_config.get("auto_email", True)

    # ── Step 1: Observe ─────────────────────────────────────────────

    def observe(self, db: Session, org_id: UUID) -> dict:
        cutoff = date.today() - timedelta(days=self.lookback_days)

        master_items = (
            db.query(MasterItem)
            .filter(MasterItem.organization_id == org_id)
            .all()
        )

        price_data = []
        for mi in master_items:
            line_items = (
                db.query(LineItem)
                .join(Invoice)
                .filter(
                    LineItem.master_item_id == mi.id,
                    LineItem.unit_price.isnot(None),
                    Invoice.status == "completed",
                    Invoice.invoice_date >= cutoff,
                )
                .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
                .all()
            )
            if len(line_items) < 2:
                continue

            latest = line_items[0]
            older = line_items[1:]
            avg_price = sum(li.unit_price for li in older) / Decimal(len(older))

            if avg_price <= 0:
                continue

            pct_change = float((latest.unit_price - avg_price) / avg_price * 100)

            supplier_prices = (
                db.query(
                    Invoice.supplier_name,
                    sql_func.avg(LineItem.unit_price).label("avg_price"),
                    sql_func.min(LineItem.unit_price).label("min_price"),
                    sql_func.count(LineItem.id).label("count"),
                )
                .join(Invoice)
                .filter(
                    LineItem.master_item_id == mi.id,
                    LineItem.unit_price.isnot(None),
                    Invoice.status == "completed",
                    Invoice.invoice_date >= cutoff,
                )
                .group_by(Invoice.supplier_name)
                .all()
            )

            price_data.append({
                "master_item_id": str(mi.id),
                "item_name": mi.name,
                "category": mi.category,
                "latest_price": float(latest.unit_price),
                "avg_price": float(avg_price),
                "pct_change": round(pct_change, 2),
                "latest_supplier": latest.invoice.supplier_name,
                "latest_date": str(latest.invoice.invoice_date),
                "history_count": len(line_items),
                "suppliers": [
                    {
                        "name": sp.supplier_name or "Desconocido",
                        "avg_price": round(float(sp.avg_price), 2),
                        "min_price": round(float(sp.min_price), 2),
                        "purchases": sp.count,
                    }
                    for sp in supplier_prices
                ],
            })

        return {"price_data": price_data, "org_id": str(org_id)}

    # ── Step 2: Analyze ─────────────────────────────────────────────

    def analyze(self, observations: dict) -> list[Finding]:
        findings: list[Finding] = []
        price_data = observations.get("price_data", [])

        increases = [p for p in price_data if p["pct_change"] >= self.threshold_pct]

        for item in increases:
            severity = _classify_severity(item["pct_change"])
            current_supplier = item["latest_supplier"] or "Desconocido"

            alternatives = [
                s for s in item["suppliers"]
                if s["name"] != current_supplier
                and s["avg_price"] < item["latest_price"]
            ]
            alternatives.sort(key=lambda s: s["avg_price"])

            desc_lines = [
                f"Precio actual: ${item['latest_price']:,.0f} "
                f"(promedio anterior: ${item['avg_price']:,.0f})",
                f"Proveedor: {current_supplier}",
                f"Cambio: +{item['pct_change']:.1f}%",
            ]

            if alternatives:
                best = alternatives[0]
                savings_pct = round(
                    (item["latest_price"] - best["avg_price"])
                    / item["latest_price"] * 100, 1
                )
                desc_lines.append(
                    f"Alternativa: {best['name']} a ${best['avg_price']:,.0f} "
                    f"({savings_pct}% mas barato)"
                )

            findings.append(Finding(
                severity=severity,
                title=f"{item['item_name']} subio {item['pct_change']:.1f}%",
                description="\n".join(desc_lines),
                data={
                    "master_item_id": item["master_item_id"],
                    "item_name": item["item_name"],
                    "latest_price": item["latest_price"],
                    "avg_price": item["avg_price"],
                    "pct_change": item["pct_change"],
                    "current_supplier": current_supplier,
                    "alternatives": alternatives[:3],
                },
            ))

        if findings:
            llm_summary = _generate_llm_summary(findings)
            if llm_summary:
                for f in findings:
                    f.data["llm_analyzed"] = True

        return findings

    # ── Step 3: Act ─────────────────────────────────────────────────

    def act(self, db: Session, org_id: UUID, findings: list[Finding]) -> int:
        actions = 0

        for f in findings:
            if f.severity in ("warning", "critical"):
                master_item_id = f.data.get("master_item_id")
                existing = (
                    db.query(Alert)
                    .filter(
                        Alert.organization_id == org_id,
                        Alert.alert_type == "price_increase",
                        Alert.master_item_id == master_item_id,
                        Alert.is_read == False,
                    )
                    .first()
                )
                if existing:
                    continue

                alert = Alert(
                    organization_id=org_id,
                    master_item_id=master_item_id,
                    alert_type="price_increase",
                    message=f.description,
                    old_avg_price=Decimal(str(f.data.get("avg_price", 0))),
                    new_price=Decimal(str(f.data.get("latest_price", 0))),
                    pct_change=f.data.get("pct_change", 0),
                )
                db.add(alert)
                actions += 1

        if self.auto_email and any(f.severity == "critical" for f in findings):
            try:
                _send_agent_email(db, org_id, findings)
                actions += 1
            except Exception as e:
                logger.warning("Agent email failed: %s", e)

        return actions


def _classify_severity(pct_change: float) -> str:
    if pct_change >= 25:
        return "critical"
    if pct_change >= 10:
        return "warning"
    return "info"


def _generate_llm_summary(findings: list[Finding]) -> str | None:
    """Use LLM to create an executive summary of findings."""
    try:
        from app.config import get_settings
        settings = get_settings()
        if not settings.openai_api_key:
            return None

        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)

        items_text = "\n".join(
            f"- {f.title}: {f.description}" for f in findings[:15]
        )

        response = client.chat.completions.create(
            model=settings.openai_model or "gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Eres un analista de compras de restaurante. "
                        "Genera un resumen ejecutivo breve (3-5 oraciones) en espanol "
                        "de los hallazgos de precios. Incluye las recomendaciones "
                        "mas importantes. Se conciso y accionable."
                    ),
                },
                {"role": "user", "content": f"Hallazgos:\n{items_text}"},
            ],
            temperature=0.3,
            max_tokens=300,
        )
        return response.choices[0].message.content or None
    except Exception as e:
        logger.warning("LLM summary generation failed: %s", e)
        return None


def _send_agent_email(db: Session, org_id: UUID, findings: list[Finding]):
    """Send email for critical findings."""
    from app.services.notifications import send_email
    from app.models import User, NotificationPreference

    critical = [f for f in findings if f.severity == "critical"]
    if not critical:
        return

    items_html = "".join(
        f'<div style="background:#fef2f2;border-left:4px solid #ef4444;'
        f'padding:12px;border-radius:8px;margin-bottom:8px;">'
        f'<strong>{f.title}</strong><br>'
        f'<span style="color:#6b7280;font-size:13px;">{f.description}</span>'
        f'</div>'
        for f in critical[:10]
    )

    html = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px 24px;border-radius:12px 12px 0 0;">
            <h2 style="color:#fff;margin:0;">Sabia AI — Agente de Precios</h2>
            <p style="color:#e0e7ff;margin:4px 0 0;font-size:14px;">
                Se detectaron {len(critical)} alertas criticas
            </p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px;">
            {items_html}
            <p style="margin-top:16px;color:#6b7280;font-size:13px;">
                Revisa los detalles en Sabia AI para tomar accion.
            </p>
        </div>
    </div>
    """

    users = db.query(User).filter(User.organization_id == org_id).all()
    for user in users:
        pref = db.query(NotificationPreference).filter(
            NotificationPreference.user_id == user.id
        ).first()
        if pref and not pref.email_alerts:
            continue
        to_email = (pref.notification_email if pref and pref.notification_email else user.email)
        send_email(
            to_email=to_email,
            subject=f"[Sabia AI] {len(critical)} alertas criticas de precios",
            html_body=html,
            org_id=str(org_id),
            user_id=str(user.id),
        )
