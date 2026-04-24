"""
Alert endpoints.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Alert, MasterItem
from app.schemas import AlertOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    unread_only: bool = False,
):
    query = (
        db.query(Alert)
        .options(joinedload(Alert.master_item))
        .filter(Alert.organization_id == current_user.organization_id)
    )
    if unread_only:
        query = query.filter(Alert.is_read == False)

    alerts = query.order_by(Alert.created_at.desc()).limit(100).all()

    result = []
    for a in alerts:
        out = AlertOut.model_validate(a)
        if a.master_item:
            out.master_item_name = a.master_item.name
        result.append(out)
    return result


@router.put("/{alert_id}/read", response_model=AlertOut)
def mark_alert_read(
    alert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = (
        db.query(Alert)
        .options(joinedload(Alert.master_item))
        .filter(
            Alert.id == alert_id,
            Alert.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not alert:
        raise HTTPException(404, "Alert not found")

    alert.is_read = True
    db.commit()
    db.refresh(alert)

    out = AlertOut.model_validate(alert)
    if alert.master_item:
        out.master_item_name = alert.master_item.name
    return out
