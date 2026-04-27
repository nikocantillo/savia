"""
Supplier Evaluation Agent — scores suppliers on price competitiveness,
consistency, negotiated-price compliance, and generates recommendations.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session

from app.models import (
    MasterItem, LineItem, Invoice, Supplier, NegotiatedPrice, Alert,
)
from app.services.agents.base import BaseAgent, Finding

logger = logging.getLogger(__name__)


class SupplierEvalAgent(BaseAgent):
    agent_type = "supplier_eval"

    @property
    def lookback_days(self) -> int:
        return self.agent_config.get("lookback_days", 60)

    @property
    def min_invoices(self) -> int:
        return self.agent_config.get("min_invoices", 2)

    # ── Step 1: Observe ─────────────────────────────────────────────

    def observe(self, db: Session, org_id: UUID) -> dict:
        cutoff = date.today() - timedelta(days=self.lookback_days)

        supplier_rows = (
            db.query(
                Invoice.supplier_name,
                sql_func.count(Invoice.id).label("invoice_count"),
                sql_func.sum(Invoice.total).label("total_spend"),
                sql_func.min(Invoice.invoice_date).label("first_invoice"),
                sql_func.max(Invoice.invoice_date).label("last_invoice"),
            )
            .filter(
                Invoice.organization_id == org_id,
                Invoice.status == "completed",
                Invoice.invoice_date >= cutoff,
                Invoice.supplier_name.isnot(None),
            )
            .group_by(Invoice.supplier_name)
            .having(sql_func.count(Invoice.id) >= self.min_invoices)
            .all()
        )

        suppliers_data = []
        for row in supplier_rows:
            name = row.supplier_name

            item_prices = (
                db.query(
                    MasterItem.name.label("item_name"),
                    MasterItem.id.label("item_id"),
                    sql_func.avg(LineItem.unit_price).label("avg_price"),
                    sql_func.min(LineItem.unit_price).label("min_price"),
                    sql_func.max(LineItem.unit_price).label("max_price"),
                    sql_func.count(LineItem.id).label("line_count"),
                )
                .join(LineItem, LineItem.master_item_id == MasterItem.id)
                .join(Invoice, Invoice.id == LineItem.invoice_id)
                .filter(
                    Invoice.organization_id == org_id,
                    Invoice.supplier_name == name,
                    Invoice.status == "completed",
                    Invoice.invoice_date >= cutoff,
                    LineItem.unit_price.isnot(None),
                )
                .group_by(MasterItem.name, MasterItem.id)
                .all()
            )

            items_analysis = []
            for ip in item_prices:
                market_avg = (
                    db.query(sql_func.avg(LineItem.unit_price))
                    .join(Invoice)
                    .filter(
                        LineItem.master_item_id == ip.item_id,
                        LineItem.unit_price.isnot(None),
                        Invoice.status == "completed",
                        Invoice.organization_id == org_id,
                        Invoice.invoice_date >= cutoff,
                    )
                    .scalar()
                )

                price_vs_market = 0.0
                if market_avg and float(market_avg) > 0:
                    price_vs_market = round(
                        (float(ip.avg_price) - float(market_avg)) / float(market_avg) * 100, 1
                    )

                price_volatility = 0.0
                if ip.avg_price and float(ip.avg_price) > 0:
                    spread = float(ip.max_price) - float(ip.min_price)
                    price_volatility = round(spread / float(ip.avg_price) * 100, 1)

                items_analysis.append({
                    "item_name": ip.item_name,
                    "item_id": str(ip.item_id),
                    "avg_price": round(float(ip.avg_price), 2),
                    "min_price": round(float(ip.min_price), 2),
                    "max_price": round(float(ip.max_price), 2),
                    "line_count": ip.line_count,
                    "price_vs_market_pct": price_vs_market,
                    "price_volatility_pct": price_volatility,
                })

            neg_violations = 0
            neg_total = 0
            supplier_obj = (
                db.query(Supplier)
                .filter(
                    Supplier.organization_id == org_id,
                    Supplier.name == name,
                )
                .first()
            )
            if supplier_obj:
                negs = (
                    db.query(NegotiatedPrice)
                    .filter(NegotiatedPrice.supplier_id == supplier_obj.id)
                    .all()
                )
                neg_total = len(negs)
                for neg in negs:
                    actual_avg = (
                        db.query(sql_func.avg(LineItem.unit_price))
                        .join(Invoice)
                        .filter(
                            LineItem.master_item_id == neg.master_item_id,
                            Invoice.supplier_name == name,
                            Invoice.status == "completed",
                            Invoice.invoice_date >= cutoff,
                            LineItem.unit_price.isnot(None),
                        )
                        .scalar()
                    )
                    if actual_avg and float(actual_avg) > float(neg.price):
                        neg_violations += 1

            suppliers_data.append({
                "supplier_name": name,
                "invoice_count": row.invoice_count,
                "total_spend": round(float(row.total_spend or 0), 2),
                "first_invoice": str(row.first_invoice) if row.first_invoice else None,
                "last_invoice": str(row.last_invoice) if row.last_invoice else None,
                "items": items_analysis,
                "negotiated_total": neg_total,
                "negotiated_violations": neg_violations,
            })

        return {"suppliers": suppliers_data, "org_id": str(org_id)}

    # ── Step 2: Analyze ─────────────────────────────────────────────

    def analyze(self, observations: dict) -> list[Finding]:
        findings: list[Finding] = []

        for sup in observations.get("suppliers", []):
            score = self._compute_score(sup)
            issues = []

            expensive_items = [
                i for i in sup["items"] if i["price_vs_market_pct"] > 15
            ]
            if expensive_items:
                items_text = ", ".join(
                    f"{i['item_name']} (+{i['price_vs_market_pct']}%)"
                    for i in expensive_items[:5]
                )
                issues.append(f"Precios por encima del mercado: {items_text}")

            volatile_items = [
                i for i in sup["items"] if i["price_volatility_pct"] > 30
            ]
            if volatile_items:
                items_text = ", ".join(
                    f"{i['item_name']} ({i['price_volatility_pct']}% variación)"
                    for i in volatile_items[:3]
                )
                issues.append(f"Precios inconsistentes: {items_text}")

            if sup["negotiated_violations"] > 0:
                issues.append(
                    f"Incumplimiento de precios pactados: "
                    f"{sup['negotiated_violations']} de {sup['negotiated_total']} productos"
                )

            if not issues:
                continue

            if score < 40:
                severity = "critical"
            elif score < 70:
                severity = "warning"
            else:
                severity = "info"

            desc_lines = [
                f"Puntuación: {score}/100",
                f"Facturas: {sup['invoice_count']} | Gasto: ${sup['total_spend']:,.0f}",
                "",
                *[f"• {issue}" for issue in issues],
            ]

            findings.append(Finding(
                severity=severity,
                title=f"{sup['supplier_name']} — {score}/100",
                description="\n".join(desc_lines),
                data={
                    "supplier_name": sup["supplier_name"],
                    "score": score,
                    "invoice_count": sup["invoice_count"],
                    "total_spend": sup["total_spend"],
                    "expensive_items": expensive_items[:5],
                    "volatile_items": volatile_items[:3],
                    "neg_violations": sup["negotiated_violations"],
                    "neg_total": sup["negotiated_total"],
                    "issues": issues,
                },
            ))

        findings.sort(key=lambda f: f.data.get("score", 100))

        if findings:
            llm_summary = _generate_supplier_summary(findings)
            if llm_summary:
                for f in findings:
                    f.data["llm_analyzed"] = True

        return findings

    # ── Step 3: Act ─────────────────────────────────────────────────

    def act(self, db: Session, org_id: UUID, findings: list[Finding]) -> int:
        actions = 0
        for f in findings:
            if f.severity != "critical":
                continue

            supplier_name = f.data.get("supplier_name", "")
            existing = (
                db.query(Alert)
                .filter(
                    Alert.organization_id == org_id,
                    Alert.alert_type == "supplier_issue",
                    Alert.message.contains(supplier_name),
                    Alert.is_read == False,
                )
                .first()
            )
            if existing:
                continue

            alert = Alert(
                organization_id=org_id,
                alert_type="supplier_issue",
                message=f.description,
                pct_change=float(f.data.get("score", 0)),
            )
            db.add(alert)
            actions += 1

        return actions

    def _compute_score(self, sup: dict) -> int:
        score = 100.0

        if sup["items"]:
            avg_vs_market = sum(
                abs(i["price_vs_market_pct"]) for i in sup["items"]
            ) / len(sup["items"])
            score -= min(avg_vs_market * 1.5, 40)

        if sup["items"]:
            avg_volatility = sum(
                i["price_volatility_pct"] for i in sup["items"]
            ) / len(sup["items"])
            score -= min(avg_volatility * 0.5, 20)

        if sup["negotiated_total"] > 0:
            violation_rate = sup["negotiated_violations"] / sup["negotiated_total"]
            score -= violation_rate * 30

        return max(0, min(100, round(score)))


def _generate_supplier_summary(findings: list[Finding]) -> str | None:
    try:
        from app.config import get_settings
        settings = get_settings()
        if not settings.openai_api_key:
            return None

        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)

        items_text = "\n".join(
            f"- {f.title}: {f.description}" for f in findings[:10]
        )

        response = client.chat.completions.create(
            model=settings.openai_model or "gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Eres un analista de proveedores de restaurante. "
                        "Genera un resumen ejecutivo breve (3-5 oraciones) en español "
                        "evaluando los proveedores. Incluye recomendaciones concretas "
                        "sobre con quién renegociar o buscar alternativas."
                    ),
                },
                {"role": "user", "content": f"Evaluación:\n{items_text}"},
            ],
            temperature=0.3,
            max_tokens=300,
        )
        return response.choices[0].message.content or None
    except Exception as e:
        logger.warning("LLM supplier summary failed: %s", e)
        return None
