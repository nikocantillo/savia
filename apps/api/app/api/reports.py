"""
Reports endpoints — supplier monthly spend breakdown.
"""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Invoice

router = APIRouter(prefix="/reports", tags=["reports"])


# ── Response schemas ─────────────────────────────────────────────────

class MonthlyCell(BaseModel):
    month: int  # 1-12
    month_name: str  # "Ene", "Feb", ...
    total: Decimal
    invoice_count: int


class SupplierMonthlyRow(BaseModel):
    supplier_name: str
    months: list[MonthlyCell]
    year_total: Decimal
    year_invoice_count: int


class SupplierMonthlyReport(BaseModel):
    year: int
    suppliers: list[SupplierMonthlyRow]
    monthly_totals: list[MonthlyCell]
    grand_total: Decimal


MONTH_NAMES = [
    "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]


# ── Endpoint ─────────────────────────────────────────────────────────

@router.get("/supplier-monthly", response_model=SupplierMonthlyReport)
def supplier_monthly_report(
    year: int = Query(default=None, ge=2020, le=2030),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns net purchases by supplier broken down by month for a given year.
    Each row is a supplier; each column is a month (Jan–Dec) plus a yearly total.
    """
    org_id = current_user.organization_id
    if year is None:
        year = date.today().year

    # Query: GROUP BY supplier + month
    rows = (
        db.query(
            Invoice.supplier_name,
            extract("month", Invoice.invoice_date).label("month"),
            func.sum(Invoice.total).label("total"),
            func.count(Invoice.id).label("count"),
        )
        .filter(
            Invoice.organization_id == org_id,
            Invoice.status == "completed",
            Invoice.invoice_date.isnot(None),
            extract("year", Invoice.invoice_date) == year,
        )
        .group_by(Invoice.supplier_name, extract("month", Invoice.invoice_date))
        .order_by(Invoice.supplier_name, extract("month", Invoice.invoice_date))
        .all()
    )

    # Pivot into supplier → {month: (total, count)}
    supplier_data: dict[str, dict[int, tuple[Decimal, int]]] = {}
    for row in rows:
        name = row.supplier_name or "Unknown"
        month = int(row.month)
        if name not in supplier_data:
            supplier_data[name] = {}
        supplier_data[name][month] = (row.total or Decimal("0"), row.count)

    # Build response
    suppliers: list[SupplierMonthlyRow] = []
    monthly_grand: dict[int, tuple[Decimal, int]] = {
        m: (Decimal("0"), 0) for m in range(1, 13)
    }

    for name in sorted(supplier_data.keys()):
        months_data = supplier_data[name]
        month_cells: list[MonthlyCell] = []
        year_total = Decimal("0")
        year_count = 0

        for m in range(1, 13):
            total, count = months_data.get(m, (Decimal("0"), 0))
            month_cells.append(
                MonthlyCell(
                    month=m,
                    month_name=MONTH_NAMES[m],
                    total=total,
                    invoice_count=count,
                )
            )
            year_total += total
            year_count += count
            # Accumulate grand totals
            gt, gc = monthly_grand[m]
            monthly_grand[m] = (gt + total, gc + count)

        suppliers.append(
            SupplierMonthlyRow(
                supplier_name=name,
                months=month_cells,
                year_total=year_total,
                year_invoice_count=year_count,
            )
        )

    # Sort by year total descending
    suppliers.sort(key=lambda s: s.year_total, reverse=True)

    # Monthly totals row
    monthly_totals = [
        MonthlyCell(
            month=m,
            month_name=MONTH_NAMES[m],
            total=monthly_grand[m][0],
            invoice_count=monthly_grand[m][1],
        )
        for m in range(1, 13)
    ]

    grand_total = sum(s.year_total for s in suppliers)

    return SupplierMonthlyReport(
        year=year,
        suppliers=suppliers,
        monthly_totals=monthly_totals,
        grand_total=grand_total,
    )
