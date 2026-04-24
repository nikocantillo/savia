"""
Margin analysis: food cost vs revenue, daily/weekly/monthly views.
"""
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Organization, Invoice, DailySales, Branch
from app.schemas import MarginDay, MarginSummary

router = APIRouter(prefix="/margin", tags=["margin"])


@router.get("/summary", response_model=MarginSummary)
def margin_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(30, ge=1, le=365),
    branch_id: str | None = None,
):
    org = db.query(Organization).get(current_user.organization_id)
    target_pct = org.food_cost_target_pct if org else 30.0

    cutoff = date.today() - timedelta(days=days)
    branch_filter = branch_id if branch_id and branch_id != "all" else None

    # Revenue by day (from daily_sales)
    rev_q = (
        db.query(DailySales.date, sql_func.sum(DailySales.total_revenue))
        .filter(
            DailySales.organization_id == current_user.organization_id,
            DailySales.date >= cutoff,
        )
    )
    if branch_filter:
        rev_q = rev_q.filter(DailySales.branch_id == branch_filter)
    rev_q = rev_q.group_by(DailySales.date)
    revenue_by_day = {row[0]: row[1] for row in rev_q.all()}

    # Cost by day (from completed invoices)
    cost_q = (
        db.query(Invoice.invoice_date, sql_func.sum(Invoice.total))
        .filter(
            Invoice.organization_id == current_user.organization_id,
            Invoice.status == "completed",
            Invoice.invoice_date.isnot(None),
            Invoice.invoice_date >= cutoff,
        )
    )
    if branch_filter:
        cost_q = cost_q.filter(Invoice.branch_id == branch_filter)
    cost_q = cost_q.group_by(Invoice.invoice_date)
    cost_by_day = {row[0]: row[1] for row in cost_q.all()}

    all_dates = sorted(set(list(revenue_by_day.keys()) + list(cost_by_day.keys())))

    daily = []
    total_rev = Decimal("0")
    total_cost = Decimal("0")

    for d in all_dates:
        rev = revenue_by_day.get(d, Decimal("0"))
        cost = cost_by_day.get(d, Decimal("0"))
        margin = rev - cost
        margin_pct = float((margin / rev) * 100) if rev > 0 else 0.0

        daily.append(MarginDay(
            date=d,
            revenue=rev,
            cost=cost,
            margin=margin,
            margin_pct=round(margin_pct, 1),
        ))
        total_rev += rev
        total_cost += cost

    total_margin = total_rev - total_cost
    total_margin_pct = float((total_margin / total_rev) * 100) if total_rev > 0 else 0.0

    # By branch breakdown
    by_branch = []
    branches = db.query(Branch).filter(
        Branch.organization_id == current_user.organization_id, Branch.is_active == True
    ).all()

    for br in branches:
        br_rev = (
            db.query(sql_func.coalesce(sql_func.sum(DailySales.total_revenue), 0))
            .filter(DailySales.branch_id == br.id, DailySales.date >= cutoff)
            .scalar()
        )
        br_cost = (
            db.query(sql_func.coalesce(sql_func.sum(Invoice.total), 0))
            .filter(
                Invoice.branch_id == br.id, Invoice.status == "completed",
                Invoice.invoice_date.isnot(None), Invoice.invoice_date >= cutoff,
            )
            .scalar()
        )
        br_margin = br_rev - br_cost
        br_pct = float((br_margin / br_rev) * 100) if br_rev > 0 else 0.0
        by_branch.append({
            "branch_id": str(br.id),
            "branch_name": br.name,
            "revenue": str(br_rev),
            "cost": str(br_cost),
            "margin": str(br_margin),
            "margin_pct": round(br_pct, 1),
        })

    return MarginSummary(
        period_revenue=total_rev,
        period_cost=total_cost,
        period_margin=total_margin,
        period_margin_pct=round(total_margin_pct, 1),
        food_cost_target_pct=target_pct,
        daily=daily,
        by_branch=by_branch,
    )
