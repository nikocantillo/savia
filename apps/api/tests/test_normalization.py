"""
Unit tests for text normalization.
"""
import pytest
from app.services.normalization import normalize_text


class TestNormalizeText:
    def test_lowercase(self):
        assert normalize_text("Chicken BREAST") == "chicken breast"

    def test_remove_punctuation(self):
        assert normalize_text("olive-oil, extra virgin!") == "olive oil extra virgin"

    def test_collapse_whitespace(self):
        assert normalize_text("  basmati   rice   25kg  ") == "basmati rice 25kg"

    def test_combined(self):
        result = normalize_text("  Organic Chicken-Breast (5kg)  ")
        assert result == "organic chicken breast 5kg"

    def test_empty_string(self):
        assert normalize_text("") == ""

    def test_numbers_preserved(self):
        assert normalize_text("Rice 25kg #1") == "rice 25kg 1"
