"""
Pydantic schemas for request/response validation.
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field, EmailStr


# ── Auth ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=4)
    full_name: str | None = None
    organization_name: str = Field(..., min_length=1)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    organization_id: str
    email: str
    full_name: str | None = None


# ── Organization ────────────────────────────────────────────────────

class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    alert_threshold_pct: float
    created_at: datetime

    model_config = {"from_attributes": True}


# ── User ────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    organization_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Invoice ─────────────────────────────────────────────────────────

class LineItemExtracted(BaseModel):
    """Schema for a single extracted line item from an invoice."""
    raw_description: str
    normalized_description: str | None = None
    quantity: Decimal | None = None
    unit: str | None = None
    unit_price: Decimal | None = None
    total_price: Decimal | None = None


class InvoiceExtracted(BaseModel):
    """Schema for the full extracted invoice data (output of LLM/parser)."""
    supplier_name: str | None = None
    invoice_date: str | None = None  # ISO date string
    invoice_number: str | None = None
    currency: str = "USD"
    total: Decimal | None = None
    line_items: list[LineItemExtracted] = []


class LineItemOut(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    master_item_id: uuid.UUID | None
    master_item_name: str | None = None
    raw_description: str
    normalized_description: str | None
    quantity: Decimal | None
    unit: str | None
    unit_price: Decimal | None
    total_price: Decimal | None
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    uploaded_by_id: uuid.UUID
    supplier_id: uuid.UUID | None = None
    supplier_name: str | None
    invoice_date: date | None
    invoice_number: str | None
    currency: str
    total: Decimal | None
    file_type: str | None
    status: str
    error_message: str | None = None
    payment_status: str = "unpaid"
    payment_due_date: date | None = None
    paid_at: datetime | None = None
    payment_method: str | None = None
    payment_reference: str | None = None
    created_at: datetime
    line_items: list[LineItemOut] = []

    model_config = {"from_attributes": True}


class InvoiceListOut(BaseModel):
    id: uuid.UUID
    supplier_id: uuid.UUID | None = None
    supplier_name: str | None
    invoice_date: date | None
    invoice_number: str | None
    currency: str
    total: Decimal | None
    status: str
    payment_status: str = "unpaid"
    payment_due_date: date | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Master Item ─────────────────────────────────────────────────────

class MasterItemCreate(BaseModel):
    name: str = Field(..., min_length=1)
    category: str | None = None


class MasterItemOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    category: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MapMasterItemRequest(BaseModel):
    master_item_id: uuid.UUID | None = None
    new_master_item_name: str | None = None
    category: str | None = None


# ── Dashboard ───────────────────────────────────────────────────────

class SupplierSpend(BaseModel):
    supplier_name: str
    total_spend: Decimal
    invoice_count: int


class PriceIncrease(BaseModel):
    master_item_id: uuid.UUID
    item_name: str
    old_avg_price: Decimal
    new_price: Decimal
    pct_change: float


class DashboardSummary(BaseModel):
    spend_by_supplier: list[SupplierSpend]
    top_price_increases: list[PriceIncrease]
    total_invoices: int
    total_spend: Decimal
    active_suppliers: int


# ── Price History ───────────────────────────────────────────────────

class PricePoint(BaseModel):
    date: date
    unit_price: Decimal
    supplier_name: str | None
    invoice_id: uuid.UUID


class PriceHistoryOut(BaseModel):
    master_item_id: uuid.UUID
    item_name: str
    prices: list[PricePoint]


# ── Alert ───────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    master_item_id: uuid.UUID | None = None
    master_item_name: str | None = None
    line_item_id: uuid.UUID | None = None
    alert_type: str
    message: str
    old_avg_price: Decimal | None = None
    new_price: Decimal | None = None
    pct_change: float | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Supplier ───────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1)
    tax_id: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    payment_terms_days: int = 30
    notes: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    tax_id: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    payment_terms_days: int | None = None
    notes: str | None = None
    is_active: bool | None = None


class SupplierOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    tax_id: str | None
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    payment_terms_days: int
    notes: str | None
    is_active: bool
    created_at: datetime
    invoice_count: int = 0
    total_spend: Decimal = Decimal("0")

    model_config = {"from_attributes": True}


class SupplierListOut(BaseModel):
    id: uuid.UUID
    name: str
    contact_name: str | None
    contact_phone: str | None
    payment_terms_days: int
    is_active: bool
    invoice_count: int = 0
    total_spend: Decimal = Decimal("0")

    model_config = {"from_attributes": True}


# ── Negotiated Price ───────────────────────────────────────────────

class NegotiatedPriceCreate(BaseModel):
    master_item_id: uuid.UUID
    price: Decimal = Field(..., gt=0)
    effective_from: date | None = None
    effective_until: date | None = None


class NegotiatedPriceOut(BaseModel):
    id: uuid.UUID
    supplier_id: uuid.UUID
    master_item_id: uuid.UUID
    master_item_name: str | None = None
    price: Decimal
    effective_from: date | None
    effective_until: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Payment ────────────────────────────────────────────────────────

class PaymentUpdate(BaseModel):
    payment_status: str = Field(..., pattern="^(unpaid|partial|paid|overdue)$")
    payment_method: str | None = None
    payment_reference: str | None = None
    paid_at: datetime | None = None


class AgingBucket(BaseModel):
    bucket: str
    count: int
    total: Decimal


class AgingReport(BaseModel):
    buckets: list[AgingBucket]
    total_unpaid: Decimal
    total_overdue: Decimal
    total_paid_last_30d: Decimal


# ── Branch ─────────────────────────────────────────────────────────

class BranchCreate(BaseModel):
    name: str = Field(..., min_length=1)
    address: str | None = None
    phone: str | None = None


class BranchUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class BranchOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    address: str | None
    phone: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Daily Sales ────────────────────────────────────────────────────

class DailySalesCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    date: date
    total_revenue: Decimal = Field(..., gt=0)
    transaction_count: int | None = None
    notes: str | None = None


class DailySalesOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    branch_id: uuid.UUID | None
    branch_name: str | None = None
    date: date
    total_revenue: Decimal
    transaction_count: int | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Margin ─────────────────────────────────────────────────────────

class MarginDay(BaseModel):
    date: date
    revenue: Decimal
    cost: Decimal
    margin: Decimal
    margin_pct: float


class MarginSummary(BaseModel):
    period_revenue: Decimal
    period_cost: Decimal
    period_margin: Decimal
    period_margin_pct: float
    food_cost_target_pct: float
    daily: list[MarginDay]
    by_branch: list[dict] = []


# ── Notification Preferences ──────────────────────────────────────

class NotificationPrefUpdate(BaseModel):
    notification_email: str | None = None
    email_alerts: bool | None = None
    email_daily_summary: bool | None = None
    email_weekly_summary: bool | None = None


class NotificationPrefOut(BaseModel):
    notification_email: str | None = None
    email_alerts: bool
    email_daily_summary: bool
    email_weekly_summary: bool

    model_config = {"from_attributes": True}


# ── Onboarding ────────────────────────────────────────────────────

class OnboardingUpdate(BaseModel):
    organization_name: str | None = None
    food_cost_target_pct: float | None = None
    alert_threshold_pct: float | None = None
    branches: list[str] = []
    onboarding_completed: bool = True
