"""
Celery task: process an uploaded invoice.
"""
import logging
import uuid
from pathlib import Path
from datetime import datetime, timedelta

import redis
from sqlalchemy import func as sql_func

from app.tasks.celery_app import celery_app
from app.config import get_settings
from app.database import SessionLocal
from app.models import Invoice, LineItem, MasterItem, Supplier
from app.services.extraction import extract_text_from_file
from app.services.llm_placeholder import llm_extract_to_json
from app.services.normalization import normalize_text, find_or_create_master_item, reclassify_uncategorized

logger = logging.getLogger(__name__)


def _clean_text(text: str | None) -> str:
    """Remove NUL bytes and other problematic chars that Postgres rejects."""
    if not text:
        return ""
    return text.replace("\x00", "").strip()


def _safe_str(value: str | None, max_len: int = 500) -> str | None:
    """Clean and truncate a string for DB storage."""
    if not value:
        return value
    return _clean_text(value)[:max_len]


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def process_invoice_upload(self, invoice_id: str):
    """
    Full extraction pipeline:
    1. Extract raw text (PDF text or OCR)
    2. LLM → structured JSON
    3. Validate & persist line items
    4. Fuzzy-match to master items
    """
    db = SessionLocal()
    try:
        invoice = db.get(Invoice, uuid.UUID(invoice_id))
        if not invoice:
            logger.error("Invoice %s not found", invoice_id)
            return

        invoice.status = "processing"
        db.commit()

        # ── Step 0: Ensure file exists (retrieve from Redis if needed) ──
        file_path = invoice.file_path
        if file_path and not Path(file_path).exists():
            logger.info("File not on disk, retrieving from Redis...")
            try:
                settings = get_settings()
                r = redis.from_url(settings.redis_url)
                file_bytes = r.get(f"invoice_file:{invoice_id}")
                if file_bytes:
                    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
                    with open(file_path, "wb") as f:
                        f.write(file_bytes)
                    r.delete(f"invoice_file:{invoice_id}")
                    logger.info("File restored from Redis (%d bytes)", len(file_bytes))
                else:
                    logger.warning("File not found in Redis either")
            except Exception as e:
                logger.warning("Could not retrieve file from Redis: %s", e)

        # ── Step 1: Extract text ────────────────────────────────────
        logger.info("Extracting text from %s (%s)", invoice.file_path, invoice.file_type)
        raw_text = extract_text_from_file(invoice.file_path, invoice.file_type)
        raw_text = _clean_text(raw_text)
        invoice.raw_text = raw_text[:50000]  # Cap storage at 50k chars

        logger.info("Extracted %d chars of text", len(raw_text))

        # ── Step 2: Structured extraction via LLM ───────────────────
        from app.config import get_settings
        settings = get_settings()
        logger.info("Running LLM extraction (provider: %s)", settings.llm_provider)
        extracted = llm_extract_to_json(raw_text)

        # ── Step 3: Update invoice fields ───────────────────────────
        invoice.supplier_name = _safe_str(extracted.supplier_name, 255)
        if extracted.invoice_date:
            try:
                invoice.invoice_date = datetime.strptime(
                    extracted.invoice_date, "%Y-%m-%d"
                ).date()
            except ValueError:
                # Try other common formats
                for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
                    try:
                        invoice.invoice_date = datetime.strptime(
                            extracted.invoice_date, fmt
                        ).date()
                        break
                    except ValueError:
                        continue
        invoice.invoice_number = _safe_str(extracted.invoice_number, 100)
        invoice.currency = extracted.currency or "USD"
        invoice.total = extracted.total

        # ── Step 3b: Link supplier + compute payment due date ─────
        if invoice.supplier_name:
            supplier = (
                db.query(Supplier)
                .filter(
                    Supplier.organization_id == invoice.organization_id,
                    sql_func.lower(Supplier.name) == invoice.supplier_name.strip().lower(),
                )
                .first()
            )
            if supplier:
                invoice.supplier_id = supplier.id
                payment_terms = supplier.payment_terms_days or 30
            else:
                payment_terms = 30
        else:
            payment_terms = 30

        if invoice.invoice_date and not invoice.payment_due_date:
            invoice.payment_due_date = invoice.invoice_date + timedelta(days=payment_terms)

        logger.info(
            "Invoice extracted: supplier=%s, date=%s, number=%s, total=%s, items=%d",
            invoice.supplier_name, invoice.invoice_date, invoice.invoice_number,
            invoice.total, len(extracted.line_items),
        )

        # ── Step 4: Create line items + fuzzy match ─────────────────
        master_items = (
            db.query(MasterItem)
            .filter(MasterItem.organization_id == invoice.organization_id)
            .all()
        )

        for item_data in extracted.line_items:
            raw_desc = _safe_str(item_data.raw_description, 500) or "Unknown item"
            normalized = normalize_text(raw_desc)

            # Find or create master item
            master_item = find_or_create_master_item(
                db=db,
                organization_id=invoice.organization_id,
                description=raw_desc,
                master_items=master_items,
            )
            # Refresh master_items list
            if master_item not in master_items:
                master_items.append(master_item)

            line_item = LineItem(
                invoice_id=invoice.id,
                master_item_id=master_item.id,
                raw_description=raw_desc,
                normalized_description=normalized,
                quantity=item_data.quantity,
                unit=_safe_str(item_data.unit, 50),
                unit_price=item_data.unit_price,
                total_price=item_data.total_price,
            )
            db.add(line_item)

        # ── Step 5: LLM reclassification for "Otros" items ────────────
        new_items = [mi for mi in master_items if mi.category == "Otros"]
        if new_items and settings.llm_provider == "openai" and settings.openai_api_key:
            try:
                count = reclassify_uncategorized(db, new_items)
                if count > 0:
                    logger.info("Reclassified %d items from 'Otros' using LLM", count)
            except Exception as e:
                logger.warning("LLM reclassification failed (non-fatal): %s", e)

        invoice.status = "completed"
        db.commit()
        logger.info("✅ Invoice %s processed successfully (%d line items)",
                     invoice_id, len(extracted.line_items))

    except Exception as exc:
        db.rollback()
        logger.exception("❌ Failed to process invoice %s", invoice_id)
        # Update status to failed
        try:
            invoice = db.get(Invoice, uuid.UUID(invoice_id))
            if invoice:
                invoice.status = "failed"
                invoice.error_message = _clean_text(str(exc))[:500]
                db.commit()
        except Exception:
            pass
        raise self.retry(exc=exc)
    finally:
        db.close()
