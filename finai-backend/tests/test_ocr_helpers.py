import os
import sys
import types

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Stub heavy optional dependencies so the OCR helpers can be imported in a lightweight test.
easyocr_stub = types.SimpleNamespace(Reader=lambda *args, **kwargs: None)
sys.modules.setdefault("easyocr", easyocr_stub)

from main import extract_total_amount, pick_merchant_line, select_best_receipt_result


def test_extract_total_amount_prefers_the_real_total_line():
    texts = [
        "TOTAL",
        "VAT 12.00",
        "1,234.50",
    ]

    assert extract_total_amount(texts) == 1234.5


def test_extract_total_amount_recovers_split_cents():
    texts = [   
        "TOTAL",
        "689",
        "75",
    ]

    assert extract_total_amount(texts) == 689.75


def test_select_best_receipt_result_prefers_gemini_when_local_is_fallback():
    local_result = {"amount": "0.00", "amount_is_fallback": True}
    gemini_result = {"amount": "689.75", "amount_is_fallback": False}

    best_result, engine = select_best_receipt_result(local_result, gemini_result, "TOTAL")

    assert engine == "Gemini"
    assert best_result["amount"] == "689.75"


def test_select_best_receipt_result_prefers_gemini_when_local_amount_is_rounded_and_date_missing():
    local_result = {"amount": "689.00", "amount_is_fallback": False, "date": "", "date_is_fallback": True}
    gemini_result = {"amount": "689.75", "amount_is_fallback": False, "date": "2024-08-05", "date_is_fallback": False}

    best_result, engine = select_best_receipt_result(local_result, gemini_result, "TOTAL")

    assert engine == "Gemini"
    assert best_result["amount"] == "689.75"


def test_pick_merchant_line_prefers_header_name_over_generic_label():
    merchant, is_fallback = pick_merchant_line(["Cafe", "Savemore Market", "Receipt"])

    assert merchant == "Savemore Market"
    assert is_fallback is False
