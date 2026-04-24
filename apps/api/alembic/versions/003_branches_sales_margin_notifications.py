"""Add branches, daily sales, notifications, margin fields

Revision ID: 003
Revises: 002
Create Date: 2026-03-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Organization: new fields ─────────────────────────────────────
    op.add_column("organizations", sa.Column("food_cost_target_pct", sa.Float(), server_default="30.0"))
    op.add_column("organizations", sa.Column("onboarding_completed", sa.Boolean(), server_default="false"))

    # ── Branches ─────────────────────────────────────────────────────
    op.create_table(
        "branches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500)),
        sa.Column("phone", sa.String(50)),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_branch_org_name"),
    )
    op.create_index("ix_branches_org_id", "branches", ["organization_id"])

    # ── Invoice: add branch_id ───────────────────────────────────────
    op.add_column("invoices", sa.Column("branch_id", UUID(as_uuid=True), sa.ForeignKey("branches.id"), nullable=True))

    # ── Daily Sales ──────────────────────────────────────────────────
    op.create_table(
        "daily_sales",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("branch_id", UUID(as_uuid=True), sa.ForeignKey("branches.id"), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("total_revenue", sa.Numeric(12, 2), nullable=False),
        sa.Column("transaction_count", sa.Integer()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "branch_id", "date", name="uq_daily_sales_org_branch_date"),
    )
    op.create_index("ix_daily_sales_org_date", "daily_sales", ["organization_id", "date"])

    # ── Notification Preferences ─────────────────────────────────────
    op.create_table(
        "notification_preferences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("notification_email", sa.String(255), nullable=True),
        sa.Column("email_alerts", sa.Boolean(), server_default="true"),
        sa.Column("email_daily_summary", sa.Boolean(), server_default="false"),
        sa.Column("email_weekly_summary", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Notification Logs ────────────────────────────────────────────
    op.create_table(
        "notification_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("status", sa.String(20), server_default="sent"),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("notification_logs")
    op.drop_table("notification_preferences")
    op.drop_index("ix_daily_sales_org_date", table_name="daily_sales")
    op.drop_table("daily_sales")
    op.drop_column("invoices", "branch_id")
    op.drop_index("ix_branches_org_id", table_name="branches")
    op.drop_table("branches")
    op.drop_column("organizations", "onboarding_completed")
    op.drop_column("organizations", "food_cost_target_pct")
