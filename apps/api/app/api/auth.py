"""
Auth endpoints: register, login, mock-login.
"""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Organization, User
from app.schemas import RegisterRequest, LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()
ALGORITHM = "HS256"
IS_PRODUCTION = (
    settings.environment == "production"
    or bool(os.getenv("RAILWAY_ENVIRONMENT"))
    or bool(os.getenv("RENDER"))
)


def _create_token(user: User) -> TokenResponse:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user.id), "org": str(user.organization_id), "exp": expire}
    token = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        organization_id=str(user.organization_id),
        email=user.email,
        full_name=user.full_name,
    )


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    # Check duplicate email
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create org
    org = Organization(name=body.organization_name)
    db.add(org)
    db.flush()

    # Create user
    user = User(
        email=body.email,
        password_hash=pwd_context.hash(body.password),
        full_name=body.full_name,
        organization_id=org.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _create_token(user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _create_token(user)


@router.post("/mock-login", response_model=TokenResponse)
def mock_login(db: Session = Depends(get_db)):
    """Dev-only endpoint: logs in as the first seeded user. Disabled in production."""
    if IS_PRODUCTION:
        raise HTTPException(status_code=404, detail="Not found")
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No users found – run seed first")
    return _create_token(user)
