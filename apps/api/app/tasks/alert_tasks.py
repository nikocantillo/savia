"""
Celery tasks: compute daily alerts (price increase, negotiated price
violation, new supplier detection, unusual volume, low margin).
"""
import logging
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal

from sqlalchemy import func as sql_func

from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.models import (
    Organization, MasterItem, LineItem, Invoice, Alert,
    Supplier, NegotiatedPrice, DailySales,
)

logger = logging.getLogger(__name__)


def _alert_exists_recent(db, org_id, alert_type, master_item_id=None, message_contains=None, days=7):
    """Check if a similar alert was already created in the last N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    q = db.query(Alert).filter(
        Alert.organization_id == org_id,
        Alert.alert_type == alert_type,
        Alert.created_at >= cutoff,
    )
    if master_item_id:
        q = q.filter(Alert.master_item_id == master_item_id)
    if message_contains:
        q = q.filter(Alert.message.contains(message_contains))
    return q.first() is not None


@celery_app.task
def compute_daily_alerts_all_orgs():
    """Entry point called by Celery Beat: iterate all orgs."""
    db = SessionLocal()
    try:
        orgs = db.query(Organization).all()
        for org in orgs:
            compute_daily_alerts.delay(str(org.id))
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=1)
def compute_daily_alerts(self, org_id: str):
    db = SessionLocal()
    try:
        org = db.query(Organization).get(org_id)
        if not org:
            logger.error("Org %s not found", org_id)
            return

        alerts_created = 0
        # Price increases are now handled by the PriceMonitorAgent
        alerts_created += _check_negotiated_prices(db, org)
        alerts_created += _check_new_suppliers(db, org)
        alerts_created += _check_unusual_volume(db, org)
        alerts_created += _check_low_margin(db, org)

        db.commit()

        if alerts_created > 0:
            _send_alert_notifications(db, org)
        logger.info(
            "Daily alerts for org %s: %d alerts created", org.name, alerts_created
        )

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to compute alerts for org %s", org_id)
        raise self.retry(exc=exc)
    finally:
        db.close()


def _check_price_increases(db, org) -> int:
    """Original logic: alert when latest price > trailing avg by threshold %."""
    threshold_pct = org.alert_threshold_pct or 10.0
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    count = 0

    master_items = (
        db.query(MasterItem)
        .filter(MasterItem.organization_id == org.id)
        .all()
    )

    for mi in master_items:
        line_items = (
            db.query(LineItem)
            .join(Invoice)
            .filter(
                LineItem.master_item_id == mi.id,
                LineItem.unit_price.isnot(None),
                Invoice.created_at >= cutoff,
                Invoice.status == "completed",
            )
            .order_by(Invoice.created_at.desc())
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

        if pct_change >= threshold_pct:
            if _alert_exists_recent(db, org.id, "price_increase", mi.id):
                continue

            alert = Alert(
                organization_id=org.id,
                master_item_id=mi.id,
                line_item_id=latest.id,
                alert_type="price_increase",
                message=(
                    f"El precio de '{mi.name}' aumentó {pct_change:.1f}% "
                    f"(promedio ${avg_price:.2f} → ${latest.unit_price:.2f})"
                ),
                old_avg_price=avg_price,
                new_price=latest.unit_price,
                pct_change=round(pct_change, 2),
            )
            db.add(alert)
            count += 1

    return count


def _check_negotiated_prices(db, org) -> int:
    """Alert when an invoice line item exceeds the negotiated price for that supplier+item."""
    today = date.today()
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    count = 0

    recent_lines = (
        db.query(LineItem, Invoice)
        .join(Invoice)
        .filter(
            Invoice.organization_id == org.id,
            Invoice.status == "completed",
            Invoice.created_at >= cutoff,
            LineItem.unit_price.isnot(None),
            LineItem.master_item_id.isnot(None),
        )
        .all()
    )

    known_suppliers = {
        s.name.lower(): s.id
        for s in db.query(Supplier).filter(Supplier.organization_id == org.id).all()
    }

    for li, inv in recent_lines:
        if not inv.supplier_name:
            continue
        supplier_id = known_suppliers.get(inv.supplier_name.lower())
        if not supplier_id:
            continue

        neg = (
            db.query(NegotiatedPrice)
            .filter(
                NegotiatedPrice.supplier_id == supplier_id,
                NegotiatedPrice.master_item_id == li.master_item_id,
            )
            .first()
        )
        if not neg:
            continue

        if neg.effective_until and neg.effective_until < today:
            continue

        if li.unit_price > neg.price:
            pct_over = float((li.unit_price - neg.price) / neg.price * 100)
            if _alert_exists_recent(db, org.id, "negotiated_price_exceeded", li.master_item_id):
                continue

            mi = db.query(MasterItem).get(li.master_item_id)
            alert = Alert(
                organization_id=org.id,
                master_item_id=li.master_item_id,
                line_item_id=li.id,
                alert_type="negotiated_price_exceeded",
                message=(
                    f"'{mi.name if mi else 'Item'}' de {inv.supplier_name} a "
                    f"${li.unit_price:.2f} excede el precio pactado de "
                    f"${neg.price:.2f} (+{pct_over:.1f}%)"
                ),
                old_avg_price=neg.price,
                new_price=li.unit_price,
                pct_change=round(pct_over, 2),
            )
            db.add(alert)
            count += 1

    return count


def _check_new_suppliers(db, org) -> int:
    """Alert when invoices arrive from a supplier not in the supplier directory."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    count = 0

    known_suppliers = {
        s.name.lower()
        for s in db.query(Supplier).filter(Supplier.organization_id == org.id).all()
    }

    recent_supplier_names = (
        db.query(Invoice.supplier_name)
        .filter(
            Invoice.organization_id == org.id,
            Invoice.status == "completed",
            Invoice.created_at >= cutoff,
            Invoice.supplier_name.isnot(None),
        )
        .distinct()
        .all()
    )

    for (name,) in recent_supplier_names:
        if name.lower() in known_suppliers:
            continue
        if _alert_exists_recent(db, org.id, "new_supplier", message_contains=name):
            continue

        alert = Alert(
            organization_id=org.id,
            master_item_id=None,
            alert_type="new_supplier",
            message=(
                f"Nuevo proveedor detectado: '{name}'. "
                f"No está registrado en tu directorio de proveedores."
            ),
        )
        db.add(alert)
        count += 1

    return count


def _check_unusual_volume(db, org) -> int:
    """Alert when recent purchase volume of an item deviates >50% from 30-day avg."""
    cutoff_30d = datetime.now(timezone.utc) - timedelta(days=30)
    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
    count = 0

    master_items = (
        db.query(MasterItem)
        .filter(MasterItem.organization_id == org.id)
        .all()
    )

    for mi in master_items:
        avg_qty_30d = (
            db.query(sql_func.avg(LineItem.quantity))
            .join(Invoice)
            .filter(
                LineItem.master_item_id == mi.id,
                LineItem.quantity.isnot(None),
                Invoice.status == "completed",
                Invoice.created_at >= cutoff_30d,
                Invoice.created_at < cutoff_7d,
            )
            .scalar()
        )

        if not avg_qty_30d or avg_qty_30d <= 0:
            continue

        recent_qty = (
            db.query(sql_func.sum(LineItem.quantity))
            .join(Invoice)
            .filter(
                LineItem.master_item_id == mi.id,
                LineItem.quantity.isnot(None),
                Invoice.status == "completed",
                Invoice.created_at >= cutoff_7d,
            )
            .scalar()
        )

        if not recent_qty:
            continue

        pct_diff = float((recent_qty - avg_qty_30d) / avg_qty_30d * 100)

        if abs(pct_diff) >= 50:
            if _alert_exists_recent(db, org.id, "unusual_volume", mi.id):
                continue

            direction = "aumentó" if pct_diff > 0 else "disminuyó"
            alert = Alert(
                organization_id=org.id,
                master_item_id=mi.id,
                alert_type="unusual_volume",
                message=(
                    f"Volumen inusual: la compra de '{mi.name}' {direction} "
                    f"{abs(pct_diff):.0f}% en los últimos 7 días vs. promedio anterior"
                ),
                pct_change=round(pct_diff, 2),
            )
            db.add(alert)
            count += 1

    return count


def _check_low_margin(db, org) -> int:
    """Alert when daily food cost exceeds the organization's target."""
    yesterday = date.today() - timedelta(days=1)
    target = org.food_cost_target_pct or 30.0
    count = 0

    revenue = (
        db.query(sql_func.coalesce(sql_func.sum(DailySales.total_revenue), 0))
        .filter(
            DailySales.organization_id == org.id,
            DailySales.date == yesterday,
        )
        .scalar()
    )

    cost = (
        db.query(sql_func.coalesce(sql_func.sum(Invoice.total), 0))
        .filter(
            Invoice.organization_id == org.id,
            Invoice.status == "completed",
            Invoice.invoice_date == yesterday,
        )
        .scalar()
    )

    if not revenue or revenue <= 0:
        return 0

    food_cost_pct = float(cost / revenue * 100)
    margin_pct = 100.0 - food_cost_pct

    if food_cost_pct > target:
        if _alert_exists_recent(db, org.id, "low_margin"):
            return 0

        alert = Alert(
            organization_id=org.id,
            alert_type="low_margin",
            message=(
                f"Margen bajo ayer: food cost {food_cost_pct:.1f}% "
                f"(objetivo: {target:.0f}%). "
                f"Ingresos: ${revenue:,.0f}, Costos: ${cost:,.0f}, "
                f"Margen: {margin_pct:.1f}%"
            ),
            pct_change=round(food_cost_pct - target, 2),
        )
        db.add(alert)
        count += 1

    return count


def _send_alert_notifications(db, org):
    """Send email notifications for today's unread alerts."""
    try:
        from app.services.notifications import notify_alert

        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        new_alerts = (
            db.query(Alert)
            .filter(
                Alert.organization_id == org.id,
                Alert.created_at >= today_start,
                Alert.is_read == False,
            )
            .all()
        )
        for alert in new_alerts:
            notify_alert(alert, db=db)
    except Exception as e:
        logger.warning("Failed to send alert notifications: %s", e)
