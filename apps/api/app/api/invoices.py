"""
Invoice endpoints: upload, list, detail, delete.
"""
import os
import shutil
import uuid
from pathlib import Path

import redis
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.database import get_db
from app.api.deps import get_current_user
from app.models import User, Invoice, LineItem, Alert
from app.schemas import InvoiceOut, InvoiceListOut, LineItemOut

router = APIRouter(prefix="/invoices", tags=["invoices"])
settings = get_settings()

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "bmp", "webp", "xml"}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB


def _file_ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _safe_filename(filename: str | None, ext: str) -> str:
    """Return a filesystem-safe name, ignoring any client-supplied path components."""
    if not filename:
        return f"invoice.{ext}"
    basename = Path(filename).name
    safe = "".join(c for c in basename if c.isalnum() or c in "._- ")
    return safe[:200] if safe else f"invoice.{ext}"


@router.post("/upload", response_model=InvoiceListOut, status_code=201)
def upload_invoice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ext = _file_ext(file.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    # Read file with size limit
    contents = file.file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024*1024)} MB")

    # Save file with sanitized name
    invoice_id = uuid.uuid4()
    org_dir = Path(settings.upload_dir) / str(current_user.organization_id)
    inv_dir = org_dir / str(invoice_id)
    inv_dir.mkdir(parents=True, exist_ok=True)

    file_path = inv_dir / _safe_filename(file.filename, ext)
    with open(file_path, "wb") as f:
        f.write(contents)

    # Create invoice record
    invoice = Invoice(
        id=invoice_id,
        organization_id=current_user.organization_id,
        uploaded_by_id=current_user.id,
        file_path=str(file_path),
        file_type=ext,
        status="pending",
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # Store file in Redis so Celery worker can access it
    try:
        r = redis.from_url(settings.redis_url)
        r.setex(f"invoice_file:{invoice.id}", 3600, contents)  # expires in 1 hour
    except Exception:
        pass  # local dev with shared volume doesn't need this

    # Queue Celery task
    from app.tasks.invoice_tasks import process_invoice_upload
    process_invoice_upload.delay(str(invoice.id))

    return invoice


@router.get("", response_model=list[InvoiceListOut])
def list_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 50,
):
    invoices = (
        db.query(Invoice)
        .filter(Invoice.organization_id == current_user.organization_id)
        .order_by(Invoice.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return invoices


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.line_items).joinedload(LineItem.master_item))
        .filter(
            Invoice.id == invoice_id,
            Invoice.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    # Build response with master_item_name
    line_items_out = []
    for li in invoice.line_items:
        li_dict = LineItemOut.model_validate(li)
        if li.master_item:
            li_dict.master_item_name = li.master_item.name
        line_items_out.append(li_dict)

    inv_out = InvoiceOut.model_validate(invoice)
    inv_out.line_items = line_items_out
    return inv_out


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_id,
            Invoice.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    # Delete alerts that reference line items from this invoice
    line_item_ids = [li.id for li in invoice.line_items]
    if line_item_ids:
        db.query(Alert).filter(Alert.line_item_id.in_(line_item_ids)).delete(
            synchronize_session=False
        )

    # Delete uploaded file from disk
    if invoice.file_path:
        file_path = Path(invoice.file_path)
        # Delete the invoice directory (contains the file)
        inv_dir = file_path.parent
        if inv_dir.exists():
            shutil.rmtree(inv_dir, ignore_errors=True)

    # Delete invoice (cascade deletes line_items)
    db.delete(invoice)
    db.commit()

    return None
