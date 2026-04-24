"""
Unit tests for fuzzy matching.
"""
import uuid
import pytest
from unittest.mock import MagicMock
from app.services.normalization import find_best_match
from app.models import MasterItem


def _make_master_item(name: str) -> MasterItem:
    """Helper to create a mock MasterItem."""
    item = MagicMock(spec=MasterItem)
    item.name = name
    item.id = uuid.uuid4()
    return item


class TestFuzzyMatching:
    def test_exact_match(self):
        items = [_make_master_item("Chicken Breast 5kg")]
        result = find_best_match("Chicken Breast 5kg", items)
        assert result is not None
        assert result.name == "Chicken Breast 5kg"

    def test_case_insensitive(self):
        items = [_make_master_item("Olive Oil Extra Virgin")]
        result = find_best_match("olive oil extra virgin", items)
        assert result is not None
        assert result.name == "Olive Oil Extra Virgin"

    def test_reordered_words(self):
        items = [_make_master_item("Extra Virgin Olive Oil 1L")]
        result = find_best_match("Olive Oil Extra Virgin 1L", items)
        assert result is not None

    def test_no_match_below_threshold(self):
        items = [_make_master_item("Chicken Breast 5kg")]
        result = find_best_match("Printer Paper A4", items)
        assert result is None

    def test_empty_master_items(self):
        result = find_best_match("Anything", [])
        assert result is None

    def test_partial_match(self):
        items = [
            _make_master_item("Basmati Rice 25kg"),
            _make_master_item("Jasmine Rice 10kg"),
        ]
        result = find_best_match("Basmati Rice 25 kg", items)
        assert result is not None
        assert "Basmati" in result.name

    def test_best_of_multiple(self):
        items = [
            _make_master_item("Chicken Breast 5kg"),
            _make_master_item("Chicken Thigh 5kg"),
            _make_master_item("Beef Steak 1kg"),
        ]
        result = find_best_match("chicken breast boneless 5kg", items)
        assert result is not None
        assert "Breast" in result.name
