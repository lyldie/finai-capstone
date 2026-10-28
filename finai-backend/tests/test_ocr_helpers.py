import os
import sys
import unittest

# Importing backend modules creates a lazy Mongo client. Point it at a local,
# non-production address so test discovery can never use a developer's .env DB.
os.environ["MONGO_URL"] = "mongodb://127.0.0.1:27017/finai_test"
os.environ["GEMINI_API_KEY"] = ""

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import extract_total_amount, pick_merchant_line, reconcile_receipt_fields, select_best_receipt_result


class OCRHelperTests(unittest.TestCase):
    def test_extract_total_amount_prefers_the_real_total_line(self):
        texts = ["TOTAL", "1,234.50", "VAT 12.00"]
        self.assertEqual(extract_total_amount(texts), 1234.5)

    def test_extract_total_amount_recovers_split_cents(self):
        self.assertEqual(extract_total_amount(["TOTAL", "689", "75"]), 689.75)

    def test_select_best_receipt_result_prefers_gemini_when_local_is_fallback(self):
        local_result = {"amount": "0.00", "amount_is_fallback": True}
        gemini_result = {"amount": "689.75", "amount_is_fallback": False}
        best_result, engine = select_best_receipt_result(local_result, gemini_result, "TOTAL")
        self.assertEqual(engine, "Gemini")
        self.assertEqual(best_result["amount"], "689.75")

    def test_select_best_receipt_result_prefers_gemini_when_local_amount_is_rounded_and_date_missing(self):
        local_result = {"amount": "689.00", "amount_is_fallback": False, "date": "", "date_is_fallback": True}
        gemini_result = {"amount": "689.75", "amount_is_fallback": False, "date": "2024-08-05", "date_is_fallback": False}
        best_result, engine = select_best_receipt_result(local_result, gemini_result, "TOTAL")
        self.assertEqual(engine, "Gemini")
        self.assertEqual(best_result["amount"], "689.75")

    def test_pick_merchant_line_prefers_header_name_over_generic_label(self):
        merchant, is_fallback = pick_merchant_line(["Cafe", "Savemore Market", "Receipt"])
        self.assertEqual(merchant, "Savemore Market")
        self.assertFalse(is_fallback)

    def test_reconcile_suggests_gemini_total_when_engines_disagree(self):
        result = reconcile_receipt_fields(
            {"amount": "125.01", "merchant": "Puregold", "date": "2026-08-03"},
            {"amount": "3110.70", "merchant": "Puregold Price Club, Inc.", "date": "2026-08-03"},
            ["Groceries"],
        )
        self.assertEqual(result["amount"], "3110.70")
        self.assertEqual(result["fields"]["amount"]["status"], "needs_review")
        self.assertIn("amount", result["needs_review"])
