"""
SupplyPulse API – FastAPI application entry point.
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.api import auth, invoices, dashboard, items, alerts, agent, reports, suppliers, payments, branches, sales, margin, notifications

settings = get_settings()

app = FastAPI(
    title="SupplyPulse API",
    version="0.1.0",
    description="B2B invoice intelligence for restaurants",
)

# CORS
origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(invoices.router)
app.include_router(dashboard.router)
app.include_router(items.router)
app.include_router(alerts.router)
app.include_router(agent.router)
app.include_router(reports.router)
app.include_router(suppliers.router)
app.include_router(payments.router)
app.include_router(branches.router)
app.include_router(sales.router)
app.include_router(margin.router)
app.include_router(notifications.router)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception:
        return {"status": "degraded", "db": "disconnected"}
