"""
Text normalization and fuzzy matching for mapping line items to master items.
"""
import re
import logging
from thefuzz import fuzz
from sqlalchemy.orm import Session

from app.models import MasterItem

logger = logging.getLogger(__name__)

# Minimum fuzzy match score (0-100) to consider a match
MATCH_THRESHOLD = 70


def normalize_text(text: str) -> str:
    """
    Normalize a product description:
    - lowercase
    - remove punctuation
    - collapse whitespace
    - strip leading/trailing whitespace
    """
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def find_best_match(
    description: str,
    master_items: list[MasterItem],
    threshold: int = MATCH_THRESHOLD,
) -> MasterItem | None:
    """
    Find the best fuzzy match for `description` among existing master items.
    Returns the best match if score >= threshold, else None.
    """
    if not master_items:
        return None

    normalized = normalize_text(description)
    best_score = 0
    best_item: MasterItem | None = None

    for item in master_items:
        item_norm = normalize_text(item.name)
        # Use token_sort_ratio for order-independent matching
        score = fuzz.token_sort_ratio(normalized, item_norm)
        if score > best_score:
            best_score = score
            best_item = item

    if best_score >= threshold:
        logger.info(
            "Matched '%s' → '%s' (score=%d)",
            description, best_item.name if best_item else "?", best_score,
        )
        return best_item

    logger.info("No match for '%s' (best=%d)", description, best_score)
    return None


def find_or_create_master_item(
    db: Session,
    organization_id,
    description: str,
    master_items: list[MasterItem],
) -> MasterItem:
    """
    Try to match description to an existing master item.
    If no match, create a new one with keyword-based category classification.
    Items classified as "Otros" get reclassified by LLM in a batch step later.
    """
    match = find_best_match(description, master_items)
    if match:
        return match

    from app.services.classifier import classify_item

    normalized = normalize_text(description)
    name = normalized.title()
    category = classify_item(description)

    new_item = MasterItem(
        organization_id=organization_id,
        name=name,
        category=category,
    )
    db.add(new_item)
    db.flush()
    return new_item


def reclassify_uncategorized(db: Session, items: list[MasterItem]) -> int:
    """
    Take master items classified as 'Otros' and try to reclassify them
    using the LLM classifier. Returns the number of items reclassified.
    """
    uncategorized = [mi for mi in items if mi.category == "Otros"]
    if not uncategorized:
        return 0

    from app.services.classifier import classify_with_llm

    descriptions = [mi.name for mi in uncategorized]
    new_categories = classify_with_llm(descriptions)

    reclassified = 0
    for mi, new_cat in zip(uncategorized, new_categories):
        if new_cat != "Otros" and new_cat != mi.category:
            logger.info("Reclassified '%s': Otros → %s", mi.name, new_cat)
            mi.category = new_cat
            reclassified += 1

    if reclassified > 0:
        db.flush()

    return reclassified
