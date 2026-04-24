"""
Branch management: CRUD for multi-location support.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Branch
from app.schemas import BranchCreate, BranchUpdate, BranchOut

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchOut])
def list_branches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_only: bool = False,
):
    q = db.query(Branch).filter(Branch.organization_id == current_user.organization_id)
    if active_only:
        q = q.filter(Branch.is_active == True)
    return q.order_by(Branch.name).all()


@router.post("", response_model=BranchOut, status_code=201)
def create_branch(
    body: BranchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(Branch)
        .filter(
            Branch.organization_id == current_user.organization_id,
            sql_func.lower(Branch.name) == body.name.strip().lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(400, "Ya existe una sucursal con este nombre")

    branch = Branch(
        organization_id=current_user.organization_id,
        name=body.name.strip(),
        address=body.address,
        phone=body.phone,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.put("/{branch_id}", response_model=BranchOut)
def update_branch(
    branch_id: uuid.UUID,
    body: BranchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = (
        db.query(Branch)
        .filter(Branch.id == branch_id, Branch.organization_id == current_user.organization_id)
        .first()
    )
    if not branch:
        raise HTTPException(404, "Sucursal no encontrada")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(branch, key, value)

    db.commit()
    db.refresh(branch)
    return branch


@router.delete("/{branch_id}", status_code=204)
def delete_branch(
    branch_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = (
        db.query(Branch)
        .filter(Branch.id == branch_id, Branch.organization_id == current_user.organization_id)
        .first()
    )
    if not branch:
        raise HTTPException(404, "Sucursal no encontrada")
    db.delete(branch)
    db.commit()
    return None
