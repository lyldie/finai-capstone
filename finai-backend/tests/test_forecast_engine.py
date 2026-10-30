import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from services.forecast_engine import compute_safe_to_spend, forecast_category, goal_acceleration, limit_usage_pct, net_forecast, scheduled_forecast, seasonal_comparison, what_if_spend_less


class ForecastEngineTests(unittest.TestCase):
    def test_documented_sma_sample_sd_range_and_trend(self):
        result = forecast_category([4900, 5000, 5200, 5100, 5300, 5600], 3)
        self.assertEqual(result["forecast"], 5333.33)
        self.assertEqual(result["sd"], 251.66)
        self.assertEqual(result["range_low"], 5081.67)
        self.assertEqual(result["range_high"], 5584.99)
        self.assertEqual(result["trend_pct"], 5.96)
        self.assertEqual(result["confidence"], "high")
        self.assertEqual(limit_usage_pct(result["forecast"], 6000), 88.89)

    def test_low_data_hides_range_and_trend(self):
        result = forecast_category([500, 700], 3)
        self.assertEqual(result["confidence"], "low")
        self.assertIsNone(result["range_low"])
        self.assertIsNone(result["trend_pct"])

    def test_zero_period_is_counted_and_all_zero_is_low_confidence(self):
        result = forecast_category([100, 0, 200], 3)
        self.assertEqual(result["window"], [100, 0, 200])
        self.assertEqual(result["forecast"], 100)
        self.assertEqual(forecast_category([0, 0, 0], 3)["confidence"], "low")

    def test_trend_null_when_previous_mean_is_zero(self):
        result = forecast_category([0, 0, 0, 100, 100, 100], 3)
        self.assertIsNone(result["trend_pct"])

    def test_fixed_item_is_flat_and_has_no_range(self):
        result = scheduled_forecast(1200.25, 3)
        self.assertEqual(result["periods"], [1200.25] * 3)
        self.assertEqual(result["trend_label"], "Flat")
        self.assertIsNone(result["range_low"])

    def test_category_sum_equals_net_forecast_and_budget_limit_usage(self):
        self.assertEqual(net_forecast([5333.33, 1000], [2000.01]), 4333.32)
        self.assertIsNone(limit_usage_pct(10, None))

    def test_safe_to_spend_deducts_bills_and_goals_and_never_goes_negative(self):
        result = compute_safe_to_spend(
            variable_budget_remaining=[1000, 500], has_variable_budgets=True,
            unpaid_bills=300, goal_contributions=200, spent_so_far=0,
            expected_income=0, days_remaining_in_month=10, days_remaining_in_week=5,
        )
        self.assertEqual(result["safe_today"], 100)
        self.assertEqual(result["safe_this_week"], 500)
        exhausted = compute_safe_to_spend(
            variable_budget_remaining=[100], has_variable_budgets=True,
            unpaid_bills=200, goal_contributions=0, spent_so_far=0,
            expected_income=0, days_remaining_in_month=10, days_remaining_in_week=5,
        )
        self.assertEqual(exhausted["safe_today"], 0)
        self.assertIsNotNone(exhausted["reason"])

    def test_safe_to_spend_income_fallback(self):
        result = compute_safe_to_spend(
            variable_budget_remaining=[], has_variable_budgets=False,
            unpaid_bills=100, goal_contributions=50, spent_so_far=250,
            expected_income=1000, days_remaining_in_month=10, days_remaining_in_week=5,
        )
        self.assertEqual(result["available_before_daily"], 600)
        self.assertEqual(result["safe_this_week"], 300)

    def test_what_if_uses_flat_three_month_projection(self):
        self.assertEqual(what_if_spend_less(250.25, 3)["net_forecast_change"], 750.75)

    def test_seasonal_comparison_requires_full_year_and_above_average_month(self):
        self.assertIsNone(seasonal_comparison([100] * 11, 0))
        self.assertIsNone(seasonal_comparison([100] * 12, 0))
        result = seasonal_comparison([200] + [100] * 11, 0)
        self.assertEqual(result["same_month_spending"], 200)
        self.assertEqual(result["annual_monthly_average"], 108.33)
        self.assertEqual(result["difference_pct"], 84.6)

    def test_goal_acceleration_reports_scenario_and_no_baseline_days_saved(self):
        result = goal_acceleration(6000, 1000, 500)
        self.assertEqual(result["months_at_current_pace"], 6)
        self.assertEqual(result["months_with_additional_contribution"], 4)
        self.assertEqual(result["days_saved"], 61)
        no_baseline = goal_acceleration(6000, 0, 500)
        self.assertIsNone(no_baseline["months_at_current_pace"])
        self.assertIsNone(no_baseline["days_saved"])


if __name__ == "__main__":
    unittest.main()
