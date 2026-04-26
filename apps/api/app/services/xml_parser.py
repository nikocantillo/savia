"""
XML parser for Colombian electronic invoices (DIAN - UBL 2.1).

Supports:
  - Factura Electrónica de Venta (standard DIAN XML)
  - Nota Crédito / Nota Débito
  - Generic UBL 2.1 invoices

Returns the same InvoiceExtracted schema used by the LLM pipeline,
so XML invoices skip OCR + LLM entirely.
"""
import logging
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.schemas import InvoiceExtracted, LineItemExtracted

logger = logging.getLogger(__name__)

# UBL 2.1 / DIAN namespaces
NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "fe": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "cn": "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
    "dn": "urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2",
    "ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "sts": "dian:gov:co:facturaelectronica:Structures-2-1",
    "ds": "http://www.w3.org/2000/09/xmldsig#",
}


def _safe_decimal(val: str | None) -> Decimal | None:
    if not val:
        return None
    try:
        return Decimal(val.strip().replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def _find_text(element: ET.Element, xpath: str) -> str | None:
    """Find text at xpath, trying with and without namespaces."""
    node = element.find(xpath, NS)
    if node is not None and node.text:
        return node.text.strip()
    return None


def _find_all(element: ET.Element, xpath: str) -> list[ET.Element]:
    return element.findall(xpath, NS)


def parse_xml_invoice(file_path: str) -> InvoiceExtracted | None:
    """
    Parse a DIAN UBL 2.1 XML invoice and return structured data.
    Returns None if the XML cannot be parsed.
    """
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
    except ET.ParseError as e:
        logger.error("XML parse error: %s", e)
        return None

    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    logger.info("XML root element: %s", tag)

    supplier_name = _extract_supplier(root)
    invoice_date = _extract_date(root)
    invoice_number = _extract_number(root)
    currency = _extract_currency(root)
    total = _extract_total(root)
    line_items = _extract_line_items(root)

    result = InvoiceExtracted(
        supplier_name=supplier_name,
        invoice_date=invoice_date,
        invoice_number=invoice_number,
        currency=currency or "COP",
        total=total,
        line_items=line_items,
    )

    logger.info(
        "XML parsed: supplier=%s, date=%s, number=%s, total=%s, items=%d",
        result.supplier_name, result.invoice_date, result.invoice_number,
        result.total, len(result.line_items),
    )
    return result


def _extract_supplier(root: ET.Element) -> str | None:
    """Extract supplier name from AccountingSupplierParty."""
    paths = [
        "cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name",
        "cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName",
        "cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:RegistrationName",
    ]
    for path in paths:
        name = _find_text(root, path)
        if name:
            return name
    return None


def _extract_date(root: ET.Element) -> str | None:
    """Extract invoice date in YYYY-MM-DD format."""
    return _find_text(root, "cbc:IssueDate")


def _extract_number(root: ET.Element) -> str | None:
    """Extract invoice number (DIAN prefix + number)."""
    prefix = _find_text(root, "ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sts:DianExtensions/sts:InvoiceControl/sts:AuthorizedInvoices/sts:Prefix")
    number = _find_text(root, "cbc:ID")

    if prefix and number and not number.startswith(prefix):
        return f"{prefix}{number}"
    return number


def _extract_currency(root: ET.Element) -> str | None:
    """Extract currency code from DocumentCurrencyCode or line amounts."""
    currency = _find_text(root, "cbc:DocumentCurrencyCode")
    if currency:
        return currency.upper()

    amount_el = root.find("cac:LegalMonetaryTotal/cbc:PayableAmount", NS)
    if amount_el is not None:
        return amount_el.get("currencyID", "COP").upper()
    return None


def _extract_total(root: ET.Element) -> Decimal | None:
    """Extract total payable amount."""
    paths = [
        "cac:LegalMonetaryTotal/cbc:PayableAmount",
        "cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount",
        "cac:RequestedMonetaryTotal/cbc:PayableAmount",
    ]
    for path in paths:
        val = _find_text(root, path)
        if val:
            return _safe_decimal(val)
    return None


def _extract_line_items(root: ET.Element) -> list[LineItemExtracted]:
    """Extract all InvoiceLine / CreditNoteLine / DebitNoteLine items."""
    items: list[LineItemExtracted] = []

    line_paths = [
        "cac:InvoiceLine",
        "cac:CreditNoteLine",
        "cac:DebitNoteLine",
    ]

    for path in line_paths:
        lines = _find_all(root, path)
        if lines:
            for line in lines:
                item = _parse_line(line)
                if item:
                    items.append(item)
            break

    return items


def _parse_line(line: ET.Element) -> LineItemExtracted | None:
    """Parse a single InvoiceLine element."""
    description = (
        _find_text(line, "cac:Item/cbc:Description")
        or _find_text(line, "cac:Item/cbc:Name")
        or _find_text(line, "cbc:Note")
    )
    if not description:
        return None

    quantity_text = _find_text(line, "cbc:InvoicedQuantity") or _find_text(line, "cbc:CreditedQuantity") or _find_text(line, "cbc:DebitedQuantity")
    quantity = _safe_decimal(quantity_text)

    unit = None
    qty_el = (
        line.find("cbc:InvoicedQuantity", NS)
        or line.find("cbc:CreditedQuantity", NS)
        or line.find("cbc:DebitedQuantity", NS)
    )
    if qty_el is not None:
        unit = qty_el.get("unitCode")

    unit_price = _safe_decimal(
        _find_text(line, "cac:Price/cbc:PriceAmount")
    )

    total_price = _safe_decimal(
        _find_text(line, "cbc:LineExtensionAmount")
    )

    return LineItemExtracted(
        raw_description=description,
        quantity=quantity,
        unit=unit,
        unit_price=unit_price,
        total_price=total_price,
    )


def is_xml_invoice(file_path: str) -> bool:
    """Quick check if a file looks like a valid XML invoice."""
    try:
        path = Path(file_path)
        if not path.exists():
            return False
        header = path.read_bytes()[:2048]
        return b"<?xml" in header or b"<Invoice" in header or b"<CreditNote" in header or b"<DebitNote" in header
    except Exception:
        return False
