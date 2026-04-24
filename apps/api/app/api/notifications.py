"""
Notification preferences + onboarding endpoints.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Organization, Branch, NotificationPreference
from app.schemas import NotificationPrefUpdate, NotificationPrefOut, OnboardingUpdate

router = APIRouter(tags=["notifications"])


# ── Notification Preferences ─────────────────────────────────────────

@router.get("/notifications/preferences", response_model=NotificationPrefOut)
def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == current_user.id
    ).first()
    if not pref:
        pref = NotificationPreference(user_id=current_user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


@router.put("/notifications/preferences", response_model=NotificationPrefOut)
def update_preferences(
    body: NotificationPrefUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == current_user.id
    ).first()
    if not pref:
        pref = NotificationPreference(user_id=current_user.id)
        db.add(pref)
        db.flush()

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(pref, key, value)
    db.commit()
    db.refresh(pref)
    return pref


# ── Onboarding ───────────────────────────────────────────────────────

@router.get("/onboarding/status")
def onboarding_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).get(current_user.organization_id)
    branches = db.query(Branch).filter(
        Branch.organization_id == current_user.organization_id
    ).count()
    from app.models import Supplier
    suppliers = db.query(Supplier).filter(
        Supplier.organization_id == current_user.organization_id
    ).count()

    return {
        "onboarding_completed": org.onboarding_completed if org else False,
        "organization_name": org.name if org else "",
        "food_cost_target_pct": org.food_cost_target_pct if org else 30.0,
        "alert_threshold_pct": org.alert_threshold_pct if org else 10.0,
        "branches_count": branches,
        "suppliers_count": suppliers,
    }


@router.post("/onboarding/complete")
def complete_onboarding(
    body: OnboardingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).get(current_user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")

    if body.organization_name:
        org.name = body.organization_name
    if body.food_cost_target_pct is not None:
        org.food_cost_target_pct = body.food_cost_target_pct
    if body.alert_threshold_pct is not None:
        org.alert_threshold_pct = body.alert_threshold_pct
    org.onboarding_completed = body.onboarding_completed

    for branch_name in body.branches:
        name = branch_name.strip()
        if not name:
            continue
        exists = db.query(Branch).filter(
            Branch.organization_id == org.id,
            Branch.name == name,
        ).first()
        if not exists:
            db.add(Branch(organization_id=org.id, name=name))

    # Auto-create notification preferences
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == current_user.id
    ).first()
    if not pref:
        db.add(NotificationPreference(
            user_id=current_user.id,
            email_alerts=True,
            email_weekly_summary=True,
        ))

    db.commit()
    return {"ok": True}
