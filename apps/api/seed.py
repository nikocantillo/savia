"""
Seed script: creates sample data for development.
Run: python seed.py
"""
import uuid
import sys
import logging
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def seed():
    from app.database import SessionLocal, engine, Base
    from app.models import (
        Organization, User, Invoice, MasterItem, LineItem, Alert,
        Supplier, NegotiatedPrice, Branch, DailySales, NotificationPreference,
    )
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    db = SessionLocal()

    # Check if already seeded
    if db.query(User).first():
        logger.info("Database already seeded – skipping.")
        db.close()
        return

    logger.info("🌱 Seeding database...")

    # ── Organization ────────────────────────────────────────────────
    org = Organization(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        name="Demo Restaurant Group",
        alert_threshold_pct=10.0,
        food_cost_target_pct=30.0,
        onboarding_completed=True,
    )
    db.add(org)

    # ── User ────────────────────────────────────────────────────────
    user = User(
        id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        email="demo@supplypulse.dev",
        password_hash=pwd_context.hash("demo1234"),
        full_name="Demo User",
        organization_id=org.id,
    )
    db.add(user)

    # ── Notification Preferences ────────────────────────────────────
    db.add(NotificationPreference(
        user_id=user.id,
        email_alerts=True,
        email_daily_summary=False,
        email_weekly_summary=True,
    ))

    # ── Branches ─────────────────────────────────────────────────────
    branch_central = Branch(
        organization_id=org.id,
        name="Sede Central",
        address="Av. Providencia 1234, Santiago",
        phone="+56 2 2345 6789",
    )
    branch_norte = Branch(
        organization_id=org.id,
        name="Sucursal Norte",
        address="Av. Vitacura 5678, Las Condes",
        phone="+56 2 9876 5432",
    )
    db.add(branch_central)
    db.add(branch_norte)
    db.flush()

    now = datetime.now(timezone.utc)

    # ── Daily Sales (last 30 days) ───────────────────────────────────
    import random
    random.seed(42)
    for days_ago in range(30, 0, -1):
        sale_date = (now - timedelta(days=days_ago)).date()
        if sale_date.weekday() == 6:  # skip Sundays
            continue
        for branch in [branch_central, branch_norte]:
            base = Decimal("3500") if branch == branch_central else Decimal("2200")
            variance = Decimal(str(random.randint(-500, 500)))
            db.add(DailySales(
                organization_id=org.id,
                branch_id=branch.id,
                date=sale_date,
                total_revenue=base + variance,
                transaction_count=random.randint(80, 200),
            ))

    # ── Master Items ────────────────────────────────────────────────
    master_items_data = [
        ("Chicken Breast 5kg", "Protein"),
        ("Olive Oil Extra Virgin 1L", "Oils & Condiments"),
        ("Basmati Rice 25kg", "Grains"),
        ("Atlantic Salmon Fillet 1kg", "Seafood"),
        ("Roma Tomatoes 5kg", "Produce"),
        ("Mozzarella Cheese 2kg", "Dairy"),
        ("All Purpose Flour 25kg", "Grains"),
        ("Heavy Cream 1L", "Dairy"),
    ]
    master_items = {}
    for name, category in master_items_data:
        mi = MasterItem(
            organization_id=org.id,
            name=name,
            category=category,
        )
        db.add(mi)
        db.flush()
        master_items[name] = mi

    # ── Suppliers ──────────────────────────────────────────────────
    supplier_fresh = Supplier(
        organization_id=org.id,
        name="FreshFoods Co.",
        tax_id="76.123.456-7",
        contact_name="Carlos Méndez",
        contact_email="carlos@freshfoods.cl",
        contact_phone="+56 9 1234 5678",
        payment_terms_days=30,
        notes="Proveedor principal de proteínas y verduras",
    )
    supplier_metro = Supplier(
        organization_id=org.id,
        name="Metro Wholesale",
        tax_id="77.654.321-K",
        contact_name="Ana Torres",
        contact_email="ventas@metrowholesale.cl",
        contact_phone="+56 9 8765 4321",
        payment_terms_days=45,
        notes="Mayorista de lácteos y abarrotes",
    )
    db.add(supplier_fresh)
    db.add(supplier_metro)
    db.flush()

    # ── Negotiated Prices ────────────────────────────────────────
    negotiated = [
        (supplier_fresh.id, "Chicken Breast 5kg", Decimal("43.00")),
        (supplier_fresh.id, "Olive Oil Extra Virgin 1L", Decimal("12.00")),
        (supplier_fresh.id, "Roma Tomatoes 5kg", Decimal("19.00")),
        (supplier_metro.id, "Atlantic Salmon Fillet 1kg", Decimal("29.00")),
        (supplier_metro.id, "Mozzarella Cheese 2kg", Decimal("22.50")),
        (supplier_metro.id, "Heavy Cream 1L", Decimal("5.80")),
    ]
    for sid, item_name, price in negotiated:
        mi = master_items[item_name]
        np = NegotiatedPrice(
            supplier_id=sid,
            master_item_id=mi.id,
            price=price,
            effective_from=date.today() - timedelta(days=90),
        )
        db.add(np)

    # ── Invoices + Line Items (3 invoices, spread over 60 days) ─────
    suppliers_info = [
        ("FreshFoods Co.", "INV-2025-001", supplier_fresh.id),
        ("Metro Wholesale", "INV-2025-002", supplier_metro.id),
        ("FreshFoods Co.", "INV-2025-003", supplier_fresh.id),
    ]

    invoice_data = [
        {
            "supplier": suppliers_info[0],
            "date": (now - timedelta(days=45)).date(),
            "items": [
                ("Chicken Breast 5kg", 10, "box", Decimal("42.00"), Decimal("420.00")),
                ("Olive Oil Extra Virgin 1L", 6, "bottle", Decimal("11.50"), Decimal("69.00")),
                ("Basmati Rice 25kg", 2, "bag", Decimal("35.00"), Decimal("70.00")),
                ("Roma Tomatoes 5kg", 4, "box", Decimal("18.00"), Decimal("72.00")),
            ],
        },
        {
            "supplier": suppliers_info[1],
            "date": (now - timedelta(days=20)).date(),
            "items": [
                ("Atlantic Salmon Fillet 1kg", 8, "kg", Decimal("28.00"), Decimal("224.00")),
                ("Mozzarella Cheese 2kg", 5, "block", Decimal("22.00"), Decimal("110.00")),
                ("All Purpose Flour 25kg", 3, "bag", Decimal("19.00"), Decimal("57.00")),
                ("Heavy Cream 1L", 12, "carton", Decimal("5.50"), Decimal("66.00")),
            ],
        },
        {
            "supplier": suppliers_info[2],
            "date": (now - timedelta(days=3)).date(),
            "items": [
                ("Chicken Breast 5kg", 12, "box", Decimal("48.00"), Decimal("576.00")),
                ("Olive Oil Extra Virgin 1L", 8, "bottle", Decimal("13.50"), Decimal("108.00")),
                ("Basmati Rice 25kg", 3, "bag", Decimal("37.00"), Decimal("111.00")),
                ("Atlantic Salmon Fillet 1kg", 6, "kg", Decimal("32.00"), Decimal("192.00")),
                ("Roma Tomatoes 5kg", 5, "box", Decimal("21.00"), Decimal("105.00")),
            ],
        },
    ]

    for inv_info in invoice_data:
        supplier_name, inv_number, sup_id = inv_info["supplier"]
        total = sum(item[4] for item in inv_info["items"])
        inv_date = inv_info["date"]
        invoice = Invoice(
            organization_id=org.id,
            uploaded_by_id=user.id,
            supplier_id=sup_id,
            supplier_name=supplier_name,
            invoice_date=inv_date,
            invoice_number=inv_number,
            currency="COP",
            total=total,
            file_path="/app/uploads/seed/sample.pdf",
            file_type="pdf",
            status="completed",
            payment_status="paid" if inv_date < (now - timedelta(days=30)).date() else "unpaid",
            payment_due_date=inv_date + timedelta(days=30),
        )
        db.add(invoice)
        db.flush()

        for item_name, qty, unit, up, tp in inv_info["items"]:
            mi = master_items[item_name]
            li = LineItem(
                invoice_id=invoice.id,
                master_item_id=mi.id,
                raw_description=item_name,
                normalized_description=item_name.lower(),
                quantity=qty,
                unit=unit,
                unit_price=up,
                total_price=tp,
            )
            db.add(li)

    # ── Sample Alerts (multiple types) ─────────────────────────────
    db.add(Alert(
        organization_id=org.id,
        master_item_id=master_items["Chicken Breast 5kg"].id,
        alert_type="price_increase",
        message="El precio de 'Chicken Breast 5kg' aumentó 14.3% (promedio $42.00 → $48.00)",
        old_avg_price=Decimal("42.00"),
        new_price=Decimal("48.00"),
        pct_change=14.3,
    ))
    db.add(Alert(
        organization_id=org.id,
        master_item_id=master_items["Olive Oil Extra Virgin 1L"].id,
        alert_type="negotiated_price_exceeded",
        message="'Olive Oil Extra Virgin 1L' de FreshFoods Co. a $13.50 excede el precio pactado de $12.00 (+12.5%)",
        old_avg_price=Decimal("12.00"),
        new_price=Decimal("13.50"),
        pct_change=12.5,
    ))
    db.add(Alert(
        organization_id=org.id,
        master_item_id=None,
        alert_type="new_supplier",
        message="Nuevo proveedor detectado: 'Pacific Seafoods'. No está registrado en tu directorio de proveedores.",
    ))
    db.add(Alert(
        organization_id=org.id,
        master_item_id=master_items["Roma Tomatoes 5kg"].id,
        alert_type="unusual_volume",
        message="Volumen inusual: la compra de 'Roma Tomatoes 5kg' aumentó 75% en los últimos 7 días vs. promedio anterior",
        pct_change=75.0,
    ))

    db.commit()
    db.close()
    logger.info("✅ Seed complete!")


if __name__ == "__main__":
    seed()
