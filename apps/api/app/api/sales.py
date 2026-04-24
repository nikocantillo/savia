"""
Daily sales data entry and listing.
"""
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, DailySales, Branch
from app.schemas import DailySalesCreate, DailySalesOut

router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("", response_model=list[DailySalesOut])
def list_sales(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    branch_id: uuid.UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
):
    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()

    q = (
        db.query(DailySales)
        .filter(
            DailySales.organization_id == current_user.organization_id,
            DailySales.date >= from_date,
            DailySales.date <= to_date,
        )
    )
    if branch_id:
        q = q.filter(DailySales.branch_id == branch_id)

    rows = q.order_by(DailySales.date.desc()).all()

    result = []
    for r in rows:
        out = DailySalesOut.model_validate(r)
        if r.branch:
            out.branch_name = r.branch.name
        result.append(out)
    return result


@router.post("", response_model=DailySalesOut, status_code=201)
def create_or_update_sale(
    body: DailySalesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.branch_id:
        branch = (
            db.query(Branch)
            .filter(Branch.id == body.branch_id, Branch.organization_id == current_user.organization_id)
            .first()
        )
        if not branch:
            raise HTTPException(404, "Sucursal no encontrada")

    existing = (
        db.query(DailySales)
        .filter(
            DailySales.organization_id == current_user.organization_id,
            DailySales.branch_id == body.branch_id,
            DailySales.date == body.date,
        )
        .first()
    )

    if existing:
        existing.total_revenue = body.total_revenue
        existing.transaction_count = body.transaction_count
        existing.notes = body.notes
        db.commit()
        db.refresh(existing)
        out = DailySalesOut.model_validate(existing)
        if existing.branch:
            out.branch_name = existing.branch.name
        return out

    sale = DailySales(
        organization_id=current_user.organization_id,
        branch_id=body.branch_id,
        date=body.date,
        total_revenue=body.total_revenue,
        transaction_count=body.transaction_count,
        notes=body.notes,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)
    out = DailySalesOut.model_validate(sale)
    if sale.branch:
        out.branch_name = sale.branch.name
    return out


@router.delete("/{sale_id}", status_code=204)
def delete_sale(
    sale_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sale = (
        db.query(DailySales)
        .filter(DailySales.id == sale_id, DailySales.organization_id == current_user.organization_id)
        .first()
    )
    if not sale:
        raise HTTPException(404, "Registro no encontrado")
    db.delete(sale)
    db.commit()
    return None
