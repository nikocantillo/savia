"""Initial schema

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Organizations ───────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("alert_threshold_pct", sa.Float(), server_default="10.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Users ───────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Invoices ────────────────────────────────────────────────────
    op.create_table(
        "invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("uploaded_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("supplier_name", sa.String(255)),
        sa.Column("invoice_date", sa.Date()),
        sa.Column("invoice_number", sa.String(100)),
        sa.Column("currency", sa.String(10), server_default="USD"),
        sa.Column("total", sa.Numeric(12, 2)),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(20)),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("raw_text", sa.Text()),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Master Items ────────────────────────────────────────────────
    op.create_table(
        "master_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_master_item_org_name"),
    )

    # ── Line Items ──────────────────────────────────────────────────
    op.create_table(
        "line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id"), nullable=False),
        sa.Column("master_item_id", UUID(as_uuid=True), sa.ForeignKey("master_items.id"), nullable=True),
        sa.Column("raw_description", sa.String(500), nullable=False),
        sa.Column("normalized_description", sa.String(500)),
        sa.Column("quantity", sa.Numeric(10, 3)),
        sa.Column("unit", sa.String(50)),
        sa.Column("unit_price", sa.Numeric(12, 4)),
        sa.Column("total_price", sa.Numeric(12, 2)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Alerts ──────────────────────────────────────────────────────
    op.create_table(
        "alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("master_item_id", UUID(as_uuid=True), sa.ForeignKey("master_items.id"), nullable=False),
        sa.Column("line_item_id", UUID(as_uuid=True), sa.ForeignKey("line_items.id"), nullable=True),
        sa.Column("alert_type", sa.String(50), server_default="price_increase"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("old_avg_price", sa.Numeric(12, 4)),
        sa.Column("new_price", sa.Numeric(12, 4)),
        sa.Column("pct_change", sa.Float()),
        sa.Column("is_read", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Indexes for common queries
    op.create_index("ix_invoices_org_id", "invoices", ["organization_id"])
    op.create_index("ix_invoices_status", "invoices", ["status"])
    op.create_index("ix_line_items_invoice_id", "line_items", ["invoice_id"])
    op.create_index("ix_line_items_master_item_id", "line_items", ["master_item_id"])
    op.create_index("ix_alerts_org_id", "alerts", ["organization_id"])


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("line_items")
    op.drop_table("master_items")
    op.drop_table("invoices")
    op.drop_table("users")
    op.drop_table("organizations")
