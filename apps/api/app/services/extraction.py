"""
Invoice text extraction: PDF text parsing and OCR.
"""
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_text_from_file(file_path: str, file_type: str) -> str:
    """
    Extract raw text from an uploaded invoice file.
    - PDF with selectable text → pdfplumber
    - Scanned PDF / image → pytesseract OCR
    """
    file_type = file_type.lower()

    if file_type == "pdf":
        text = _extract_pdf_text(file_path)
        if text and len(text.strip()) > 20:
            logger.info("PDF has selectable text (%d chars)", len(text))
            return text
        # Fall through to OCR if PDF has no selectable text
        logger.info("PDF has no selectable text, falling back to OCR")
        return _ocr_pdf(file_path)

    if file_type in ("png", "jpg", "jpeg", "tiff", "bmp", "webp"):
        return _ocr_image(file_path)

    if file_type == "xml":
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            logger.error("XML read failed: %s", e)
            return ""

    raise ValueError(f"Unsupported file type: {file_type}")


def _extract_pdf_text(file_path: str) -> str:
    """Use pdfplumber to extract text from a PDF."""
    try:
        import pdfplumber

        text_parts: list[str] = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts)
    except Exception as e:
        logger.error("pdfplumber extraction failed: %s", e)
        return ""


def _ocr_image(file_path: str) -> str:
    """Use pytesseract to OCR an image file."""
    try:
        from PIL import Image
        import pytesseract

        image = Image.open(file_path)
        text = pytesseract.image_to_string(image)
        logger.info("OCR extracted %d chars from image", len(text))
        return text
    except Exception as e:
        logger.error("OCR failed: %s", e)
        return ""


def _ocr_pdf(file_path: str) -> str:
    """Convert PDF pages to images, then OCR each page."""
    try:
        import pdfplumber
        from PIL import Image
        import pytesseract
        import io

        text_parts: list[str] = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                # Convert page to image
                img = page.to_image(resolution=300)
                # pytesseract on the PIL image
                page_text = pytesseract.image_to_string(img.original)
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts)
    except Exception as e:
        logger.error("OCR-PDF failed: %s", e)
        return ""
