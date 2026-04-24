"""Add suppliers, negotiated prices, payment tracking, and smart alerts

Revision ID: 002
Revises: 001
Create Date: 2026-03-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Suppliers ────────────────────────────────────────────────────
    op.create_table(
        "suppliers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("tax_id", sa.String(50)),
        sa.Column("contact_name", sa.String(255)),
        sa.Column("contact_email", sa.String(255)),
        sa.Column("contact_phone", sa.String(50)),
        sa.Column("payment_terms_days", sa.Integer(), server_default="30"),
        sa.Column("notes", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_supplier_org_name"),
    )
    op.create_index("ix_suppliers_org_id", "suppliers", ["organization_id"])

    # ── Negotiated Prices ────────────────────────────────────────────
    op.create_table(
        "negotiated_prices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("supplier_id", UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("master_item_id", UUID(as_uuid=True), sa.ForeignKey("master_items.id"), nullable=False),
        sa.Column("price", sa.Numeric(12, 4), nullable=False),
        sa.Column("effective_from", sa.Date()),
        sa.Column("effective_until", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("supplier_id", "master_item_id", name="uq_negotiated_supplier_item"),
    )

    # ── Invoice: add supplier_id FK + payment fields ─────────────────
    op.add_column("invoices", sa.Column("supplier_id", UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=True))
    op.add_column("invoices", sa.Column("payment_status", sa.String(20), server_default="unpaid"))
    op.add_column("invoices", sa.Column("payment_due_date", sa.Date()))
    op.add_column("invoices", sa.Column("paid_at", sa.DateTime(timezone=True)))
    op.add_column("invoices", sa.Column("payment_method", sa.String(50)))
    op.add_column("invoices", sa.Column("payment_reference", sa.String(255)))
    op.create_index("ix_invoices_payment_status", "invoices", ["payment_status"])

    # ── Alerts: make master_item_id nullable (for new_supplier alerts) ──
    op.alter_column("alerts", "master_item_id", nullable=True)


def downgrade() -> None:
    op.alter_column("alerts", "master_item_id", nullable=False)
    op.drop_index("ix_invoices_payment_status", table_name="invoices")
    op.drop_column("invoices", "payment_reference")
    op.drop_column("invoices", "payment_method")
    op.drop_column("invoices", "paid_at")
    op.drop_column("invoices", "payment_due_date")
    op.drop_column("invoices", "payment_status")
    op.drop_column("invoices", "supplier_id")
    op.drop_table("negotiated_prices")
    op.drop_index("ix_suppliers_org_id", table_name="suppliers")
    op.drop_table("suppliers")
