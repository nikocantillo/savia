"""
Master items + price history endpoints.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, MasterItem, LineItem, Invoice
from app.schemas import (
    MasterItemCreate, MasterItemOut,
    MapMasterItemRequest, LineItemOut,
    PriceHistoryOut, PricePoint,
)
from app.services.classifier import classify_item, CATEGORIES

router = APIRouter(tags=["items"])


# ── Master items CRUD ───────────────────────────────────────────────

@router.get("/master-items", response_model=list[MasterItemOut])
def list_master_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    q: str = Query("", description="Search filter"),
    category: str = Query("", description="Filter by category"),
):
    query = (
        db.query(MasterItem)
        .filter(MasterItem.organization_id == current_user.organization_id)
    )
    if q:
        query = query.filter(MasterItem.name.ilike(f"%{q}%"))
    if category:
        query = query.filter(MasterItem.category == category)
    return query.order_by(MasterItem.name).limit(200).all()


@router.post("/master-items", response_model=MasterItemOut, status_code=201)
def create_master_item(
    body: MasterItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(MasterItem)
        .filter(
            MasterItem.organization_id == current_user.organization_id,
            MasterItem.name == body.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(400, "Master item with this name already exists")

    category = body.category or classify_item(body.name)

    item = MasterItem(
        organization_id=current_user.organization_id,
        name=body.name,
        category=category,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


class UpdateCategoryRequest(BaseModel):
    category: str


@router.put("/master-items/{item_id}/category", response_model=MasterItemOut)
def update_category(
    item_id: uuid.UUID,
    body: UpdateCategoryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.get(MasterItem, item_id)
    if not item or item.organization_id != current_user.organization_id:
        raise HTTPException(404, "Item not found")
    item.category = body.category
    db.commit()
    db.refresh(item)
    return item


@router.post("/master-items/reclassify")
def reclassify_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-classify all master items that have no category or category='Otros'."""
    items = (
        db.query(MasterItem)
        .filter(
            MasterItem.organization_id == current_user.organization_id,
            (MasterItem.category.is_(None)) | (MasterItem.category == "Otros") | (MasterItem.category == ""),
        )
        .all()
    )
    updated = 0
    for item in items:
        new_cat = classify_item(item.name)
        if new_cat != "Otros" and new_cat != item.category:
            item.category = new_cat
            updated += 1

    db.commit()
    return {"reclassified": updated, "total_checked": len(items)}


@router.get("/categories")
def list_categories():
    """Return the list of available product categories."""
    return {"categories": list(CATEGORIES.keys())}


# ── Map line item to master item ────────────────────────────────────

@router.post("/line-items/{line_item_id}/map-master-item", response_model=LineItemOut)
def map_master_item(
    line_item_id: uuid.UUID,
    body: MapMasterItemRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    line_item = (
        db.query(LineItem)
        .join(Invoice)
        .filter(
            LineItem.id == line_item_id,
            Invoice.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not line_item:
        raise HTTPException(404, "Line item not found")

    if body.master_item_id:
        master = db.get(MasterItem, body.master_item_id)
        if not master or master.organization_id != current_user.organization_id:
            raise HTTPException(404, "Master item not found")
        line_item.master_item_id = master.id
    elif body.new_master_item_name:
        category = body.category or classify_item(body.new_master_item_name)
        master = MasterItem(
            organization_id=current_user.organization_id,
            name=body.new_master_item_name,
            category=category,
        )
        db.add(master)
        db.flush()
        line_item.master_item_id = master.id
    else:
        raise HTTPException(400, "Provide master_item_id or new_master_item_name")

    db.commit()
    db.refresh(line_item)

    result = LineItemOut.model_validate(line_item)
    if line_item.master_item:
        result.master_item_name = line_item.master_item.name
    return result


# ── Price history ───────────────────────────────────────────────────

@router.get("/items/{item_id}/price-history", response_model=PriceHistoryOut)
def price_history(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    master_item = db.get(MasterItem, item_id)
    if not master_item or master_item.organization_id != current_user.organization_id:
        raise HTTPException(404, "Item not found")

    rows = (
        db.query(LineItem, Invoice)
        .join(Invoice, LineItem.invoice_id == Invoice.id)
        .filter(
            LineItem.master_item_id == item_id,
            LineItem.unit_price.isnot(None),
        )
        .order_by(Invoice.invoice_date.asc(), Invoice.created_at.asc())
        .all()
    )

    prices = []
    for li, inv in rows:
        d = inv.invoice_date or inv.created_at.date()
        prices.append(PricePoint(
            date=d,
            unit_price=li.unit_price,
            supplier_name=inv.supplier_name,
            invoice_id=inv.id,
        ))

    return PriceHistoryOut(
        master_item_id=item_id,
        item_name=master_item.name,
        prices=prices,
    )


# ── Price history ───────────────────────────────────────────────────

@router.get("/items/{item_id}/price-history", response_model=PriceHistoryOut)
def price_history(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    master_item = db.get(MasterItem, item_id)
    if not master_item or master_item.organization_id != current_user.organization_id:
        raise HTTPException(404, "Item not found")

    rows = (
        db.query(LineItem, Invoice)
        .join(Invoice, LineItem.invoice_id == Invoice.id)
        .filter(
            LineItem.master_item_id == item_id,
            LineItem.unit_price.isnot(None),
        )
        .order_by(Invoice.invoice_date.asc(), Invoice.created_at.asc())
        .all()
    )

    prices = []
    for li, inv in rows:
        d = inv.invoice_date or inv.created_at.date()
        prices.append(PricePoint(
            date=d,
            unit_price=li.unit_price,
            supplier_name=inv.supplier_name,
            invoice_id=inv.id,
        ))

    return PriceHistoryOut(
        master_item_id=item_id,
        item_name=master_item.name,
        prices=prices,
    )
