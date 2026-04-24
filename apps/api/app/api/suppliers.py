"""
Supplier management: CRUD + negotiated prices.
"""
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.api.deps import get_current_user
from app.models import (
    User, Supplier, NegotiatedPrice, Invoice, MasterItem,
)
from app.schemas import (
    SupplierCreate, SupplierUpdate, SupplierOut, SupplierListOut,
    NegotiatedPriceCreate, NegotiatedPriceOut,
)

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _enrich_supplier(db: Session, supplier: Supplier) -> dict:
    """Add computed invoice_count and total_spend to a supplier."""
    stats = (
        db.query(
            sql_func.count(Invoice.id).label("cnt"),
            sql_func.coalesce(sql_func.sum(Invoice.total), 0).label("spend"),
        )
        .filter(
            Invoice.supplier_name == supplier.name,
            Invoice.organization_id == supplier.organization_id,
            Invoice.status == "completed",
        )
        .first()
    )
    data = {c.key: getattr(supplier, c.key) for c in supplier.__table__.columns}
    data["invoice_count"] = stats.cnt if stats else 0
    data["total_spend"] = stats.spend if stats else Decimal("0")
    return data


# ── CRUD ────────────────────────────────────────────────────────────

@router.get("", response_model=list[SupplierListOut])
def list_suppliers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_only: bool = False,
    q: str | None = None,
):
    query = db.query(Supplier).filter(
        Supplier.organization_id == current_user.organization_id
    )
    if active_only:
        query = query.filter(Supplier.is_active == True)
    if q:
        query = query.filter(Supplier.name.ilike(f"%{q}%"))

    suppliers = query.order_by(Supplier.name).all()

    result = []
    for s in suppliers:
        result.append(SupplierListOut(**_enrich_supplier(db, s)))
    return result


@router.post("", response_model=SupplierOut, status_code=201)
def create_supplier(
    body: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(Supplier)
        .filter(
            Supplier.organization_id == current_user.organization_id,
            sql_func.lower(Supplier.name) == body.name.strip().lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(400, "A supplier with this name already exists")

    supplier = Supplier(
        organization_id=current_user.organization_id,
        name=body.name.strip(),
        tax_id=body.tax_id,
        contact_name=body.contact_name,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        payment_terms_days=body.payment_terms_days,
        notes=body.notes,
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return SupplierOut(**_enrich_supplier(db, supplier))


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(
    supplier_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.id == supplier_id,
            Supplier.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    return SupplierOut(**_enrich_supplier(db, supplier))


@router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: uuid.UUID,
    body: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.id == supplier_id,
            Supplier.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(supplier, key, value)

    db.commit()
    db.refresh(supplier)
    return SupplierOut(**_enrich_supplier(db, supplier))


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(
    supplier_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.id == supplier_id,
            Supplier.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    db.delete(supplier)
    db.commit()
    return None


# ── Negotiated Prices ───────────────────────────────────────────────

@router.get("/{supplier_id}/prices", response_model=list[NegotiatedPriceOut])
def list_negotiated_prices(
    supplier_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.id == supplier_id,
            Supplier.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    prices = (
        db.query(NegotiatedPrice)
        .options(joinedload(NegotiatedPrice.master_item))
        .filter(NegotiatedPrice.supplier_id == supplier_id)
        .all()
    )

    result = []
    for p in prices:
        out = NegotiatedPriceOut.model_validate(p)
        if p.master_item:
            out.master_item_name = p.master_item.name
        result.append(out)
    return result


@router.post("/{supplier_id}/prices", response_model=NegotiatedPriceOut, status_code=201)
def create_negotiated_price(
    supplier_id: uuid.UUID,
    body: NegotiatedPriceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.id == supplier_id,
            Supplier.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    mi = (
        db.query(MasterItem)
        .filter(
            MasterItem.id == body.master_item_id,
            MasterItem.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not mi:
        raise HTTPException(404, "Master item not found")

    existing = (
        db.query(NegotiatedPrice)
        .filter(
            NegotiatedPrice.supplier_id == supplier_id,
            NegotiatedPrice.master_item_id == body.master_item_id,
        )
        .first()
    )
    if existing:
        existing.price = body.price
        existing.effective_from = body.effective_from
        existing.effective_until = body.effective_until
        db.commit()
        db.refresh(existing)
        out = NegotiatedPriceOut.model_validate(existing)
        out.master_item_name = mi.name
        return out

    np = NegotiatedPrice(
        supplier_id=supplier_id,
        master_item_id=body.master_item_id,
        price=body.price,
        effective_from=body.effective_from,
        effective_until=body.effective_until,
    )
    db.add(np)
    db.commit()
    db.refresh(np)
    out = NegotiatedPriceOut.model_validate(np)
    out.master_item_name = mi.name
    return out


@router.delete("/{supplier_id}/prices/{price_id}", status_code=204)
def delete_negotiated_price(
    supplier_id: uuid.UUID,
    price_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.id == supplier_id,
            Supplier.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    np = (
        db.query(NegotiatedPrice)
        .filter(
            NegotiatedPrice.id == price_id,
            NegotiatedPrice.supplier_id == supplier_id,
        )
        .first()
    )
    if not np:
        raise HTTPException(404, "Negotiated price not found")

    db.delete(np)
    db.commit()
    return None
