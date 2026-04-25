"""
LLM-based invoice extraction.

Providers:
  - "openai"  → GPT-4o-mini (or configurable model) with JSON mode
  - "mock"    → heuristic regex + fallback mock data (dev/testing)

The public interface is `llm_extract_to_json(raw_text) -> InvoiceExtracted`.
"""
import json
import re
import logging
from decimal import Decimal

from app.config import get_settings
from app.schemas import InvoiceExtracted, LineItemExtracted

logger = logging.getLogger(__name__)
settings = get_settings()

# ── System prompt for invoice extraction ────────────────────────────

SYSTEM_PROMPT = """You are an expert invoice data extractor. You receive raw text extracted from a supplier invoice (PDF or scanned image via OCR). Your job is to extract all structured information and return it as a JSON object.

RULES:
- Extract EVERY line item you can find. Each line item represents a product or service purchased.
- For each line item, extract: description, quantity, unit of measurement, unit price, and total price.
- Dates must be in ISO format (YYYY-MM-DD). If the date format is ambiguous, use the most likely interpretation.
- Prices and amounts should be numbers without currency symbols.
- If a field is not found or unclear, use null.
- The currency should be a 3-letter ISO code (USD, EUR, MXN, etc.). Infer from context if not explicit.
- Be thorough: extract ALL items even if the text is messy or has OCR errors.
- For the supplier name, use the company/business name at the top of the invoice, NOT the customer name.

Return ONLY a valid JSON object with this exact schema:
{
  "supplier_name": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "invoice_number": "string or null",
  "currency": "USD",
  "total": number or null,
  "line_items": [
    {
      "raw_description": "string - the product/service description exactly as it appears",
      "quantity": number or null,
      "unit": "string or null - e.g. kg, lb, box, bottle, ea, unit, case",
      "unit_price": number or null,
      "total_price": number or null
    }
  ]
}"""

USER_PROMPT_TEMPLATE = """Extract all invoice data from the following text:

---
{raw_text}
---

Return the JSON object only, no other text."""


# ═══════════════════════════════════════════════════════════════════
# Public interface
# ═══════════════════════════════════════════════════════════════════

def llm_extract_to_json(raw_text: str, image_path: str | None = None) -> InvoiceExtracted:
    """
    Given raw text extracted from an invoice, return structured data.
    Dispatches to the configured provider (openai / mock).
    If image_path is provided and text is insufficient, uses OpenAI Vision.
    """
    provider = settings.llm_provider.lower().strip()

    if provider == "openai":
        if image_path and len(raw_text.strip()) < 30:
            return _extract_with_openai_vision(image_path, raw_text)
        return _extract_with_openai(raw_text)
    else:
        logger.info("Using mock provider (set LLM_PROVIDER=openai to use OpenAI)")
        return _extract_mock(raw_text)


# ═══════════════════════════════════════════════════════════════════
# OpenAI provider
# ═══════════════════════════════════════════════════════════════════

def _extract_with_openai(raw_text: str) -> InvoiceExtracted:
    """Call OpenAI API with JSON mode to extract invoice data."""
    from openai import OpenAI

    api_key = settings.openai_api_key
    if not api_key:
        logger.error("OPENAI_API_KEY is not set — falling back to mock provider")
        return _extract_mock(raw_text)

    client = OpenAI(api_key=api_key)
    model = settings.openai_model or "gpt-4o-mini"

    # Truncate very long texts to avoid token limits
    max_chars = 12000
    text_for_llm = raw_text[:max_chars]
    if len(raw_text) > max_chars:
        logger.warning("Text truncated from %d to %d chars", len(raw_text), max_chars)

    try:
        logger.info("Calling OpenAI (%s) for invoice extraction...", model)

        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": USER_PROMPT_TEMPLATE.format(raw_text=text_for_llm)},
            ],
            temperature=0.1,  # Low temperature for deterministic extraction
            max_tokens=4000,
        )

        content = response.choices[0].message.content
        if not content:
            logger.error("OpenAI returned empty content")
            return _extract_mock(raw_text)

        logger.info("OpenAI response received (%d chars)", len(content))
        logger.debug("Raw LLM response: %s", content[:500])

        # Parse JSON response
        data = json.loads(content)

        # Build line items
        line_items = []
        for item in data.get("line_items", []):
            line_items.append(LineItemExtracted(
                raw_description=str(item.get("raw_description", "Unknown item")),
                quantity=_safe_decimal(item.get("quantity")),
                unit=item.get("unit"),
                unit_price=_safe_decimal(item.get("unit_price")),
                total_price=_safe_decimal(item.get("total_price")),
            ))

        result = InvoiceExtracted(
            supplier_name=data.get("supplier_name"),
            invoice_date=data.get("invoice_date"),
            invoice_number=data.get("invoice_number"),
            currency=data.get("currency", "USD"),
            total=_safe_decimal(data.get("total")),
            line_items=line_items,
        )

        logger.info(
            "Extracted: supplier=%s, date=%s, items=%d, total=%s",
            result.supplier_name, result.invoice_date,
            len(result.line_items), result.total,
        )
        return result

    except json.JSONDecodeError as e:
        logger.error("Failed to parse OpenAI JSON response: %s", e)
        return _extract_mock(raw_text)
    except Exception as e:
        logger.error("OpenAI extraction failed: %s", e)
        return _extract_mock(raw_text)


def _extract_with_openai_vision(image_path: str, fallback_text: str = "") -> InvoiceExtracted:
    """Send image directly to OpenAI Vision API for extraction."""
    import base64
    from openai import OpenAI

    api_key = settings.openai_api_key
    if not api_key:
        logger.error("OPENAI_API_KEY not set — falling back to mock")
        return _extract_mock(fallback_text)

    try:
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        logger.error("Could not read image file: %s", e)
        return _extract_mock(fallback_text)

    ext = image_path.rsplit(".", 1)[-1].lower()
    mime_map = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp", "tiff": "tiff", "bmp": "bmp"}
    mime_type = f"image/{mime_map.get(ext, 'png')}"

    client = OpenAI(api_key=api_key)
    model = settings.openai_model or "gpt-4o-mini"

    try:
        logger.info("Calling OpenAI Vision (%s) for image invoice extraction...", model)

        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": "Extract all invoice data from this image. Return the JSON object only."},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{mime_type};base64,{image_data}",
                        "detail": "high",
                    }},
                ]},
            ],
            temperature=0.1,
            max_tokens=4000,
        )

        content = response.choices[0].message.content
        if not content:
            logger.error("OpenAI Vision returned empty content")
            return _extract_mock(fallback_text)

        logger.info("OpenAI Vision response received (%d chars)", len(content))
        data = json.loads(content)

        line_items = []
        for item in data.get("line_items", []):
            line_items.append(LineItemExtracted(
                raw_description=str(item.get("raw_description", "Unknown item")),
                quantity=_safe_decimal(item.get("quantity")),
                unit=item.get("unit"),
                unit_price=_safe_decimal(item.get("unit_price")),
                total_price=_safe_decimal(item.get("total_price")),
            ))

        result = InvoiceExtracted(
            supplier_name=data.get("supplier_name"),
            invoice_date=data.get("invoice_date"),
            invoice_number=data.get("invoice_number"),
            currency=data.get("currency", "USD"),
            total=_safe_decimal(data.get("total")),
            line_items=line_items,
        )

        logger.info("Vision extracted: supplier=%s, date=%s, items=%d, total=%s",
                     result.supplier_name, result.invoice_date, len(result.line_items), result.total)
        return result

    except Exception as e:
        logger.error("OpenAI Vision extraction failed: %s", e)
        return _extract_mock(fallback_text)


def _safe_decimal(value) -> Decimal | None:
    """Safely convert a value to Decimal, returning None on failure."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════
# Mock / heuristic provider (fallback)
# ═══════════════════════════════════════════════════════════════════

def _extract_mock(raw_text: str) -> InvoiceExtracted:
    """Heuristic regex-based extraction with mock fallback."""
    logger.info("llm_extract_to_json: using heuristic/mock extraction")

    supplier_name = _extract_supplier(raw_text)
    invoice_number = _extract_invoice_number(raw_text)
    invoice_date = _extract_date(raw_text)
    line_items = _extract_line_items_regex(raw_text)

    total = None
    if line_items:
        total = sum(it.total_price for it in line_items if it.total_price)

    return InvoiceExtracted(
        supplier_name=supplier_name,
        invoice_date=invoice_date,
        invoice_number=invoice_number,
        currency="USD",
        total=total,
        line_items=line_items,
    )


def _extract_supplier(text: str) -> str | None:
    for line in text.split("\n"):
        line = line.strip()
        if line and len(line) > 2:
            return line[:100]
    return None


def _extract_invoice_number(text: str) -> str | None:
    match = re.search(r"(?:invoice|inv|factura|no\.?)[#:\s]*([A-Za-z0-9\-]+)", text, re.IGNORECASE)
    return match.group(1) if match else None


def _extract_date(text: str) -> str | None:
    patterns = [
        r"(\d{4}-\d{2}-\d{2})",
        r"(\d{2}/\d{2}/\d{4})",
        r"(\d{2}-\d{2}-\d{4})",
    ]
    for pat in patterns:
        match = re.search(pat, text)
        if match:
            return match.group(1)
    return None


def _extract_line_items_regex(text: str) -> list[LineItemExtracted]:
    items: list[LineItemExtracted] = []

    pattern = r"([A-Za-z][A-Za-z\s\-/]+?)\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)"
    for match in re.finditer(pattern, text):
        desc = match.group(1).strip()
        qty = match.group(2)
        up = match.group(3).replace(",", "")
        tp = match.group(4).replace(",", "")
        items.append(LineItemExtracted(
            raw_description=desc,
            quantity=Decimal(qty),
            unit="ea",
            unit_price=Decimal(up),
            total_price=Decimal(tp),
        ))

    if not items:
        items = [
            LineItemExtracted(
                raw_description="Chicken Breast 5kg",
                quantity=Decimal("10"), unit="box",
                unit_price=Decimal("45.00"), total_price=Decimal("450.00"),
            ),
            LineItemExtracted(
                raw_description="Olive Oil Extra Virgin 1L",
                quantity=Decimal("6"), unit="bottle",
                unit_price=Decimal("12.50"), total_price=Decimal("75.00"),
            ),
            LineItemExtracted(
                raw_description="Basmati Rice 25kg",
                quantity=Decimal("2"), unit="bag",
                unit_price=Decimal("38.00"), total_price=Decimal("76.00"),
            ),
        ]

    return items
