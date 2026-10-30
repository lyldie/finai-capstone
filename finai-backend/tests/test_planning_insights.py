import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from services.planning_insights import (
    budget_insight, cash_flow_insight, evidence_numbers, goal_insight,
    long_term_cash_flow_insight, numeric_claims_supported, on_track_summary,
    seasonal_insight, sma_category_insight, spending_pattern_insight,
    upcoming_bill_insight, validate_ai_recommendations, seasonal_history_eligible,
    overview_claims_supported,
)


class PlanningInsightRuleTests(unittest.TestCase):
    def test_budget_risk_and_watch_thresholds(self):
        risk = budget_insight({"category": "Rent", "period": "monthly", "confidence": "high",
                               "forecast_over_limit": True, "percentage_used": 101,
                               "daily_remaining_allowance": 10, "how_calculated": "formula"})
        self.assertEqual(risk["kind"], "budget_risk")
        self.assertEqual(risk["priority"], "high")
        watch = budget_insight({"category": "Food", "period": "monthly", "percentage_used": 70,
                                "spent": 700, "limit": 1000, "days_remaining": 3,
                                "daily_remaining_allowance": 100})
        self.assertEqual(watch["kind"], "budget_watch")
        self.assertIsNone(budget_insight({"percentage_used": 69.9, "forecast_over_limit": False}))

    def test_spending_pattern_and_seasonal_rule_cards_keep_evidence(self):
        pattern = {"category": "Food", "change_percent": 20, "comparison_month_count": 3}
        self.assertEqual(spending_pattern_insight(pattern)["evidence"], pattern)
        seasonal = {"category": "Travel", "month": "December", "comparison_year": 2025,
                    "difference_pct": 25.0, "same_month_spending": 5000,
                    "annual_monthly_average": 4000}
        self.assertEqual(seasonal_insight(seasonal)["kind"], "seasonal_pattern")
        self.assertIn("12-month average", seasonal_insight(seasonal)["how_calculated"])
        self.assertTrue(seasonal_history_eligible("2024-01-01", "2024-03-01", 2025))
        self.assertFalse(seasonal_history_eligible("2025-01-02", "2024-03-01", 2025))
        self.assertFalse(seasonal_history_eligible("2024-01-01", "2025-01-02", 2025))

    def test_goal_rules_cover_due_review_plan_and_completed_goal(self):
        goal = {"target": "Trip", "remaining": 1000, "suggested_monthly_saving": 500,
                "days_to_target": 60, "target_date_passed": False, "target_due_today": False}
        self.assertEqual(goal_insight(goal, 10000)["kind"], "goal_plan")
        self.assertEqual(goal_insight(goal, 100)["priority"], "medium")
        overdue = {**goal, "target_date_passed": True}
        self.assertEqual(goal_insight(overdue, 10000)["kind"], "goal_review")
        self.assertIsNone(goal_insight({**goal, "remaining": 0}, 10000))
        self.assertIsNone(goal_insight({**goal, "suggested_monthly_saving": None}, 10000))

    def test_cash_flow_rules_require_negative_observed_flow(self):
        self.assertIsNone(cash_flow_insight({"income": 0, "net": -10}))
        self.assertIsNotNone(cash_flow_insight({"income": 100, "expense": 120, "net": -20}))
        self.assertIsNone(long_term_cash_flow_insight({"available": False, "average_monthly_recorded_net_cash_flow": -1}))
        self.assertIsNotNone(long_term_cash_flow_insight({"available": True, "average_monthly_recorded_net_cash_flow": -1}))

    def test_sma_limit_risk_takes_priority_over_trend(self):
        forecast = {"forecast": 110, "limit": 100, "limit_usage_pct": 110, "trend_pct": 30,
                    "confidence": "high", "period_count": 3}
        insight = sma_category_insight("Food", forecast)
        self.assertEqual(insight["kind"], "sma_limit_risk")
        self.assertEqual(sma_category_insight("Food", {**forecast, "limit": None})["kind"], "sma_trend")
        self.assertIsNone(sma_category_insight("Food", {**forecast, "trend_pct": 30, "confidence": "low", "limit": None}))

    def test_upcoming_bill_and_on_track_summary_thresholds(self):
        bill = {"name": "Internet", "category": "Utilities", "due_date": "2026-11-02", "amount": 1200}
        self.assertEqual(upcoming_bill_insight(bill)["kind"], "upcoming_bill")
        two = [{"projected_period_end_spend": 80, "limit": 100}, {"projected_period_end_spend": 90, "limit": 100}]
        self.assertEqual(on_track_summary(two)["on_track_count"], 2)
        summary = on_track_summary([*two, {"projected_period_end_spend": 200, "limit": 100}])
        self.assertEqual(summary["tracked_budget_count"], 3)
        self.assertEqual(summary["on_track_count"], 2)
        self.assertIsNone(on_track_summary([two[0], {"projected_period_end_spend": 200, "limit": 100}]))

    def test_ai_numeric_claim_validation_uses_cited_evidence(self):
        evidence = {"forecast": 5333.33, "trend_pct": 5.96, "goal_id": "000000000000000000000001"}
        self.assertEqual(evidence_numbers(evidence), {5333.33, 5.96})
        supported = {"title": "Forecast is ₱5,333.33", "message": "Trend is 5.96%"}
        unsupported = {"title": "Forecast is ₱5,400", "message": "Trend is 5.96%"}
        self.assertTrue(numeric_claims_supported(supported, evidence))
        self.assertFalse(numeric_claims_supported(unsupported, evidence))
        self.assertFalse(numeric_claims_supported({"actions": ["Save ₱500 extra"]}, evidence))
        catalog = {"forecast": {"evidence": evidence}}
        self.assertTrue(overview_claims_supported("The estimate is 5,333.33.", catalog))
        self.assertFalse(overview_claims_supported("You will save 500 pesos.", catalog))

    def test_ai_response_rejects_unknown_duplicate_bad_and_unsupported_items(self):
        catalog = {"forecast": {"kind": "sma_trend", "evidence": {"forecast": 100, "trend_pct": 20},
                                  "how_calculated": "Deterministic SMA."}}
        valid = {"evidence_id": "forecast", "priority": "high", "title": "Trend is 20%",
                 "message": "Forecast is 100", "actions": ["Review these records."]}
        result = validate_ai_recommendations([
            {**valid, "evidence_id": "unknown"},
            valid,
            valid,
            {**valid, "message": "Forecast is 1000"},
            {"evidence_id": "forecast", "title": "Missing message", "actions": ["Review."]},
        ], catalog)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["kind"], "sma_trend")
        self.assertEqual(result[0]["priority"], "high")
        self.assertEqual(result[0]["how_calculated"], "Deterministic SMA.")


if __name__ == "__main__":
    unittest.main()
