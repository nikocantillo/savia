"""
Payment management: update payment status, aging report.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sql_func, case
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Invoice
from app.schemas import PaymentUpdate, InvoiceListOut, AgingBucket, AgingReport

router = APIRouter(prefix="/payments", tags=["payments"])


@router.put("/{invoice_id}", response_model=InvoiceListOut)
def update_payment(
    invoice_id: uuid.UUID,
    body: PaymentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_id,
            Invoice.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    invoice.payment_status = body.payment_status
    if body.payment_method is not None:
        invoice.payment_method = body.payment_method
    if body.payment_reference is not None:
        invoice.payment_reference = body.payment_reference
    if body.paid_at is not None:
        invoice.paid_at = body.paid_at
    elif body.payment_status == "paid" and not invoice.paid_at:
        invoice.paid_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.put("/{invoice_id}/due-date")
def set_due_date(
    invoice_id: uuid.UUID,
    due_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_id,
            Invoice.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    invoice.payment_due_date = due_date
    db.commit()
    return {"ok": True}


@router.get("/pending", response_model=list[InvoiceListOut])
def list_unpaid_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.organization_id == current_user.organization_id,
            Invoice.payment_status.in_(["unpaid", "partial", "overdue"]),
            Invoice.status == "completed",
        )
        .order_by(Invoice.payment_due_date.asc().nullslast(), Invoice.created_at.desc())
        .all()
    )
    return invoices


@router.get("/aging", response_model=AgingReport)
def aging_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()

    unpaid_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.organization_id == current_user.organization_id,
            Invoice.payment_status.in_(["unpaid", "partial", "overdue"]),
            Invoice.status == "completed",
        )
        .all()
    )

    buckets = {
        "current": {"count": 0, "total": Decimal("0")},
        "1-30": {"count": 0, "total": Decimal("0")},
        "31-60": {"count": 0, "total": Decimal("0")},
        "61-90": {"count": 0, "total": Decimal("0")},
        "90+": {"count": 0, "total": Decimal("0")},
    }

    total_overdue = Decimal("0")

    for inv in unpaid_invoices:
        amount = inv.total or Decimal("0")
        due = inv.payment_due_date or (inv.invoice_date or today)
        days_overdue = (today - due).days

        if days_overdue <= 0:
            buckets["current"]["count"] += 1
            buckets["current"]["total"] += amount
        elif days_overdue <= 30:
            buckets["1-30"]["count"] += 1
            buckets["1-30"]["total"] += amount
            total_overdue += amount
        elif days_overdue <= 60:
            buckets["31-60"]["count"] += 1
            buckets["31-60"]["total"] += amount
            total_overdue += amount
        elif days_overdue <= 90:
            buckets["61-90"]["count"] += 1
            buckets["61-90"]["total"] += amount
            total_overdue += amount
        else:
            buckets["90+"]["count"] += 1
            buckets["90+"]["total"] += amount
            total_overdue += amount

    total_unpaid = sum(b["total"] for b in buckets.values())

    # Paid in last 30 days
    from datetime import timedelta
    cutoff_30d = datetime.now(timezone.utc) - timedelta(days=30)
    paid_30d = (
        db.query(sql_func.coalesce(sql_func.sum(Invoice.total), 0))
        .filter(
            Invoice.organization_id == current_user.organization_id,
            Invoice.payment_status == "paid",
            Invoice.paid_at >= cutoff_30d,
        )
        .scalar()
    )

    return AgingReport(
        buckets=[
            AgingBucket(bucket=k, count=v["count"], total=v["total"])
            for k, v in buckets.items()
        ],
        total_unpaid=total_unpaid,
        total_overdue=total_overdue,
        total_paid_last_30d=Decimal(str(paid_30d or 0)),
    )
