"""
Dashboard / analytics endpoints.
"""
from datetime import datetime, timedelta, timezone, date as date_type
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Invoice, LineItem, MasterItem
from app.schemas import DashboardSummary, SupplierSpend, PriceIncrease

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = current_user.organization_id
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).date()

    # ── Spend by supplier ───────────────────────────────────────────
    supplier_rows = (
        db.query(
            Invoice.supplier_name,
            func.sum(Invoice.total).label("total_spend"),
            func.count(Invoice.id).label("invoice_count"),
        )
        .filter(
            Invoice.organization_id == org_id,
            Invoice.status == "completed",
            Invoice.invoice_date >= cutoff_date,
        )
        .group_by(Invoice.supplier_name)
        .order_by(func.sum(Invoice.total).desc())
        .limit(10)
        .all()
    )
    spend_by_supplier = [
        SupplierSpend(
            supplier_name=row.supplier_name or "Unknown",
            total_spend=row.total_spend or 0,
            invoice_count=row.invoice_count,
        )
        for row in supplier_rows
    ]

    # ── Top price increases ─────────────────────────────────────────
    price_increases: list[PriceIncrease] = []

    master_items = (
        db.query(MasterItem)
        .filter(MasterItem.organization_id == org_id)
        .all()
    )

    for mi in master_items:
        # Get line items for this master item, ordered by invoice_date desc
        line_items = (
            db.query(LineItem)
            .join(Invoice)
            .filter(
                LineItem.master_item_id == mi.id,
                LineItem.unit_price.isnot(None),
                Invoice.invoice_date >= cutoff_date,
            )
            .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
            .all()
        )
        if len(line_items) < 2:
            continue

        latest_price = line_items[0].unit_price
        avg_price = sum(li.unit_price for li in line_items[1:]) / len(line_items[1:])

        if avg_price and avg_price > 0:
            pct = float((latest_price - avg_price) / avg_price * 100)
            if pct > 0:
                price_increases.append(PriceIncrease(
                    master_item_id=mi.id,
                    item_name=mi.name,
                    old_avg_price=round(avg_price, 4),
                    new_price=latest_price,
                    pct_change=round(pct, 2),
                ))

    price_increases.sort(key=lambda x: x.pct_change, reverse=True)

    # ── Totals ──────────────────────────────────────────────────────
    total_invoices = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.organization_id == org_id, Invoice.status == "completed")
        .scalar() or 0
    )
    total_spend = (
        db.query(func.sum(Invoice.total))
        .filter(
            Invoice.organization_id == org_id,
            Invoice.status == "completed",
            Invoice.invoice_date >= cutoff_date,
        )
        .scalar() or Decimal("0")
    )
    active_suppliers = (
        db.query(func.count(func.distinct(Invoice.supplier_name)))
        .filter(
            Invoice.organization_id == org_id,
            Invoice.status == "completed",
            Invoice.invoice_date >= cutoff_date,
        )
        .scalar() or 0
    )

    return DashboardSummary(
        spend_by_supplier=spend_by_supplier,
        top_price_increases=price_increases[:10],
        total_invoices=total_invoices,
        total_spend=total_spend,
        active_suppliers=active_suppliers,
    )
