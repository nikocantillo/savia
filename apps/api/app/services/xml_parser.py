"""
XML parser for invoices.

Supports:
  1. DIAN UBL 2.1 (Colombian electronic invoices)
  2. Generic/custom XML formats (any structure)

For generic XML, we recursively search for common field names
in any language (Spanish/English) to extract invoice data.

Returns the same InvoiceExtracted schema used by the LLM pipeline,
so XML invoices skip OCR + LLM entirely.
"""
import logging
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.schemas import InvoiceExtracted, LineItemExtracted

logger = logging.getLogger(__name__)

NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "sts": "dian:gov:co:facturaelectronica:Structures-2-1",
}


def _safe_decimal(val: str | None) -> Decimal | None:
    if not val:
        return None
    try:
        return Decimal(val.strip().replace(",", "").replace("$", "").replace(" ", ""))
    except (InvalidOperation, ValueError):
        return None


def _tag(element: ET.Element) -> str:
    """Get local tag name without namespace."""
    t = element.tag
    return t.split("}")[-1] if "}" in t else t


def _text(element: ET.Element | None) -> str | None:
    if element is not None and element.text:
        return element.text.strip()
    return None


def _find_text_ns(element: ET.Element, xpath: str) -> str | None:
    node = element.find(xpath, NS)
    return _text(node)


def _find_all_ns(element: ET.Element, xpath: str) -> list[ET.Element]:
    return element.findall(xpath, NS)


# ═══════════════════════════════════════════════════════════════════
# Public interface
# ═══════════════════════════════════════════════════════════════════

def parse_xml_invoice(file_path: str) -> InvoiceExtracted | None:
    """Parse an XML invoice. Tries UBL first, then generic fallback."""
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
    except ET.ParseError as e:
        logger.error("XML parse error: %s", e)
        return None

    tag = _tag(root)
    logger.info("XML root element: %s", tag)

    result = _try_ubl(root)
    if result and (result.supplier_name or result.line_items):
        logger.info("UBL parse succeeded")
        return result

    logger.info("UBL parse found nothing, trying generic XML parser")
    result = _try_generic(root)
    if result:
        logger.info(
            "Generic XML parsed: supplier=%s, date=%s, number=%s, total=%s, items=%d",
            result.supplier_name, result.invoice_date, result.invoice_number,
            result.total, len(result.line_items),
        )
    return result


def is_xml_invoice(file_path: str) -> bool:
    try:
        path = Path(file_path)
        if not path.exists():
            return False
        header = path.read_bytes()[:2048]
        return b"<?xml" in header or b"<Invoice" in header or b"<factura" in header.lower()
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════════════
# UBL 2.1 / DIAN parser
# ═══════════════════════════════════════════════════════════════════

def _try_ubl(root: ET.Element) -> InvoiceExtracted | None:
    supplier_paths = [
        "cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name",
        "cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName",
    ]
    supplier = None
    for p in supplier_paths:
        supplier = _find_text_ns(root, p)
        if supplier:
            break

    date = _find_text_ns(root, "cbc:IssueDate")
    number = _find_text_ns(root, "cbc:ID")
    currency = _find_text_ns(root, "cbc:DocumentCurrencyCode")

    total = None
    for p in ["cac:LegalMonetaryTotal/cbc:PayableAmount", "cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount"]:
        val = _find_text_ns(root, p)
        if val:
            total = _safe_decimal(val)
            break

    items: list[LineItemExtracted] = []
    for line_path in ["cac:InvoiceLine", "cac:CreditNoteLine", "cac:DebitNoteLine"]:
        lines = _find_all_ns(root, line_path)
        if lines:
            for line in lines:
                desc = _find_text_ns(line, "cac:Item/cbc:Description") or _find_text_ns(line, "cac:Item/cbc:Name")
                if not desc:
                    continue
                qty = _safe_decimal(_find_text_ns(line, "cbc:InvoicedQuantity") or _find_text_ns(line, "cbc:CreditedQuantity"))
                price = _safe_decimal(_find_text_ns(line, "cac:Price/cbc:PriceAmount"))
                line_total = _safe_decimal(_find_text_ns(line, "cbc:LineExtensionAmount"))
                items.append(LineItemExtracted(raw_description=desc, quantity=qty, unit=None, unit_price=price, total_price=line_total))
            break

    return InvoiceExtracted(
        supplier_name=supplier,
        invoice_date=date,
        invoice_number=number,
        currency=(currency or "COP").upper() if currency else "COP",
        total=total,
        line_items=items,
    )


# ═══════════════════════════════════════════════════════════════════
# Generic XML parser — searches by tag name patterns
# ═══════════════════════════════════════════════════════════════════

SUPPLIER_TAGS = {"proveedor", "supplier", "emisor", "vendedor", "restaurante", "empresa", "negocio", "comercio"}
NAME_TAGS = {"nombre", "name", "razon_social", "razonsocial", "registrationname"}
DATE_TAGS = {"fecha", "date", "fechaemision", "fechafactura", "issuedate", "fecha_emision"}
NUMBER_TAGS = {"numero", "number", "facturanumero", "nro", "consecutivo", "id", "folio", "numerofactura"}
CURRENCY_TAGS = {"moneda", "currency", "divisa"}
TOTAL_TAGS = {"total", "totalfactura", "totalpagar", "montototal", "grandtotal", "payableamount", "totalgeneral"}

ITEM_CONTAINER_TAGS = {"items", "item", "lineas", "linea", "detalle", "detalles", "productos", "producto", "conceptos", "concepto", "invoiceline"}
DESC_TAGS = {"descripcion", "description", "nombre", "name", "concepto", "producto", "servicio", "detalle"}
QTY_TAGS = {"cantidad", "quantity", "qty", "unidades", "invoicedquantity"}
UNIT_PRICE_TAGS = {"valorunitario", "preciounitario", "unitprice", "precio", "vlrunitario", "vu"}
LINE_TOTAL_TAGS = {"total", "subtotal", "linetotal", "lineextensiontotal", "valor", "monto", "importe"}
UNIT_TAGS = {"unidad", "unit", "um", "uom", "medida"}


def _try_generic(root: ET.Element) -> InvoiceExtracted | None:
    """Walk the entire XML tree and extract data by matching tag names."""
    all_elements = list(root.iter())
    tag_map: dict[str, list[ET.Element]] = {}
    for el in all_elements:
        key = _tag(el).lower().replace("_", "").replace("-", "")
        tag_map.setdefault(key, []).append(el)

    supplier_name = _find_by_tags(tag_map, SUPPLIER_TAGS, NAME_TAGS) or _find_by_tags_direct(tag_map, SUPPLIER_TAGS)
    invoice_date = _find_by_tags_direct(tag_map, DATE_TAGS)
    invoice_number = _find_by_tags_direct(tag_map, NUMBER_TAGS)
    currency = _find_by_tags_direct(tag_map, CURRENCY_TAGS)
    total = _safe_decimal(_find_by_tags_direct(tag_map, TOTAL_TAGS))

    line_items = _extract_generic_items(root)

    if not supplier_name and not line_items and total is None:
        return None

    return InvoiceExtracted(
        supplier_name=supplier_name,
        invoice_date=invoice_date,
        invoice_number=invoice_number,
        currency=(currency or "COP").upper(),
        total=total,
        line_items=line_items,
    )


def _find_by_tags(tag_map: dict, parent_tags: set, child_tags: set) -> str | None:
    """Find text in a child tag within a parent tag."""
    for pt in parent_tags:
        for el in tag_map.get(pt, []):
            for child in el:
                child_key = _tag(child).lower().replace("_", "").replace("-", "")
                if child_key in child_tags and child.text and child.text.strip():
                    return child.text.strip()
    return None


def _find_by_tags_direct(tag_map: dict, tags: set) -> str | None:
    """Find the first element whose tag matches any in the set."""
    for t in tags:
        for el in tag_map.get(t, []):
            if el.text and el.text.strip():
                return el.text.strip()
    return None


def _extract_generic_items(root: ET.Element) -> list[LineItemExtracted]:
    """Find item containers and extract line items."""
    items: list[LineItemExtracted] = []

    candidates = _find_item_containers(root)
    if not candidates:
        return items

    for container in candidates:
        desc = _find_child_text(container, DESC_TAGS)
        if not desc:
            continue
        qty = _safe_decimal(_find_child_text(container, QTY_TAGS))
        unit = _find_child_text(container, UNIT_TAGS)
        unit_price = _safe_decimal(_find_child_text(container, UNIT_PRICE_TAGS))
        line_total = _safe_decimal(_find_child_text(container, LINE_TOTAL_TAGS))

        items.append(LineItemExtracted(
            raw_description=desc,
            quantity=qty,
            unit=unit,
            unit_price=unit_price,
            total_price=line_total,
        ))

    return items


def _find_item_containers(root: ET.Element) -> list[ET.Element]:
    """Find elements that look like individual line items."""
    for el in root.iter():
        tag = _tag(el).lower().replace("_", "").replace("-", "")
        if tag in {"items", "lineas", "detalles", "productos", "conceptos"}:
            children = list(el)
            if children and len(children) >= 1:
                first_child_tag = _tag(children[0]).lower()
                if _has_child_matching(children[0], DESC_TAGS):
                    return children

    for el in root.iter():
        tag = _tag(el).lower().replace("_", "").replace("-", "")
        if tag in {"item", "linea", "detalle", "producto", "concepto", "invoiceline"}:
            if _has_child_matching(el, DESC_TAGS):
                siblings = []
                parent = _find_parent(root, el)
                if parent is not None:
                    for child in parent:
                        if _tag(child).lower() == _tag(el).lower():
                            siblings.append(child)
                    return siblings if siblings else [el]
                return [el]

    return []


def _has_child_matching(el: ET.Element, tags: set) -> bool:
    for child in el:
        if _tag(child).lower().replace("_", "").replace("-", "") in tags:
            return True
    return False


def _find_child_text(el: ET.Element, tags: set) -> str | None:
    for child in el:
        key = _tag(child).lower().replace("_", "").replace("-", "")
        if key in tags and child.text and child.text.strip():
            return child.text.strip()
    return None


def _find_parent(root: ET.Element, target: ET.Element) -> ET.Element | None:
    for el in root.iter():
        for child in el:
            if child is target:
                return el
    return None
