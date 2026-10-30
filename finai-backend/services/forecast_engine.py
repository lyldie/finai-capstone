"""Pure SMA forecasting primitives. Values enter and leave as pesos; arithmetic uses centavos."""
from math import sqrt
from typing import Iterable


def forecast_category(series: Iterable[float], period_count: int, method: str = "sma") -> dict:
    """Forecast one category from chronological completed-period totals.

    ``series`` must include zero periods for dates when the category existed but
    had no recorded transactions. Periods before category creation are omitted.
    """
    if method != "sma":
        raise ValueError("Only the SMA forecast method is currently supported.")
    if period_count < 1:
        raise ValueError("period_count must be positive")
    cents = [int(round(float(value) * 100)) for value in series]
    window = cents[-period_count:]
    count = len(window)
    mean_cents = sum(window) / count if count else 0.0
    variance = sum((value - mean_cents) ** 2 for value in window) / (count - 1) if count >= 2 else None
    sd_cents = sqrt(variance) if variance is not None else None
    cv = sd_cents / mean_cents if sd_cents is not None and mean_cents > 0 else None
    if count < period_count or mean_cents == 0 or cv is None or cv > 0.5:
        confidence = "low"
    elif cv < 0.25:
        confidence = "high"
    else:
        confidence = "medium"

    trend = None
    if len(cents) >= 2 * period_count:
        previous = cents[-2 * period_count:-period_count]
        previous_mean = sum(previous) / period_count
        if previous_mean > 0:
            trend = (mean_cents - previous_mean) / previous_mean

    forecast = mean_cents / 100
    deviation = (sd_cents or 0.0) / 100
    low_range = max(0.0, forecast - deviation) if confidence != "low" and sd_cents is not None else None
    high_range = forecast + deviation if confidence != "low" and sd_cents is not None else None
    return {
        "forecast": round(forecast, 2),
        "sd": round(deviation, 2) if sd_cents is not None else None,
        "range_low": round(low_range, 2) if low_range is not None else None,
        "range_high": round(high_range, 2) if high_range is not None else None,
        "trend_pct": round(trend * 100, 2) if trend is not None else None,
        "confidence": confidence,
        "period_count": count,
        "window": [round(value / 100, 2) for value in window],
        "method": "sma",
    }


def limit_usage_pct(forecast: float, limit: float | None) -> float | None:
    if limit is None or limit <= 0:
        return None
    return round(float(forecast) / float(limit) * 100, 2)


def net_forecast(income_forecasts: Iterable[float], expense_forecasts: Iterable[float]) -> float:
    """Sum rounded category forecasts so chart totals match the displayed categories."""
    income_cents = sum(int(round(float(amount) * 100)) for amount in income_forecasts)
    expense_cents = sum(int(round(float(amount) * 100)) for amount in expense_forecasts)
    return round((income_cents - expense_cents) / 100, 2)


def scheduled_forecast(amount: float, periods: int = 1) -> dict:
    """A fixed recurring item uses its configured amount, with no statistical range."""
    cents = int(round(float(amount) * 100))
    return {"forecast": round(cents / 100, 2), "periods": [round(cents / 100, 2)] * max(periods, 0), "range_low": None, "range_high": None, "trend_label": "Flat", "confidence": "scheduled"}


def what_if_spend_less(monthly_reduction: float, months: int = 3) -> dict:
    """Deterministic flat scenario; no trend or compounding is applied."""
    cents_per_month = int(round(float(monthly_reduction) * 100))
    return {
        "monthly_reduction": round(cents_per_month / 100, 2),
        "months": max(int(months), 0),
        "net_forecast_change": round(cents_per_month * max(int(months), 0) / 100, 2),
        "method": "monthly reduction × months",
    }


def seasonal_comparison(monthly_amounts: Iterable[float], comparison_month_index: int) -> dict | None:
    """Compare one calendar month with a full prior-year monthly average.

    Callers must supply all 12 completed months, with zeroes for months the
    category existed but had no recorded transactions.
    """
    values = [int(round(float(value) * 100)) for value in monthly_amounts]
    if len(values) != 12 or not 0 <= comparison_month_index < 12:
        return None
    average = sum(values) / 12
    same_month = values[comparison_month_index]
    if average <= 0 or same_month <= average:
        return None
    difference = same_month - average
    return {
        "same_month_spending": round(same_month / 100, 2),
        "annual_monthly_average": round(average / 100, 2),
        "difference": round(difference / 100, 2),
        "difference_pct": round(difference / average * 100, 1),
        "monthly_values": [round(value / 100, 2) for value in values],
    }


def goal_acceleration(remaining: float, current_monthly_contribution: float, additional_monthly_contribution: float) -> dict:
    """Estimate goal timing from the recorded contribution pace plus a scenario."""
    remaining_cents = max(int(round(float(remaining) * 100)), 0)
    current_cents = max(int(round(float(current_monthly_contribution) * 100)), 0)
    added_cents = max(int(round(float(additional_monthly_contribution) * 100)), 0)
    accelerated_cents = current_cents + added_cents
    baseline_months = remaining_cents / current_cents if current_cents > 0 else None
    accelerated_months = remaining_cents / accelerated_cents if accelerated_cents > 0 else None
    days_saved = round((baseline_months - accelerated_months) * 30.4375) if baseline_months is not None and accelerated_months is not None else None
    return {
        "remaining": round(remaining_cents / 100, 2),
        "current_monthly_contribution": round(current_cents / 100, 2),
        "additional_monthly_contribution": round(added_cents / 100, 2),
        "new_monthly_contribution": round(accelerated_cents / 100, 2),
        "months_at_current_pace": round(baseline_months, 2) if baseline_months is not None else None,
        "months_with_additional_contribution": round(accelerated_months, 2) if accelerated_months is not None else None,
        "days_saved": days_saved,
        "method": "remaining goal amount / monthly contribution pace; 30.4375 days per month",
    }


def compute_safe_to_spend(
    *, variable_budget_remaining: Iterable[float], has_variable_budgets: bool,
    unpaid_bills: float, goal_contributions: float, spent_so_far: float,
    expected_income: float, days_remaining_in_month: int, days_remaining_in_week: int,
) -> dict:
    """Documented advisory estimate; it does not represent wallet/account balance."""
    bills_cents = max(int(round(unpaid_bills * 100)), 0)
    goals_cents = max(int(round(goal_contributions * 100)), 0)
    if has_variable_budgets:
        available_cents = sum(max(int(round(float(value) * 100)), 0) for value in variable_budget_remaining) - bills_cents - goals_cents
        basis = "remaining flexible monthly limits"
    else:
        available_cents = int(round(expected_income * 100)) - bills_cents - goals_cents - int(round(spent_so_far * 100))
        basis = "expected income after recorded spending"
    days_month = max(int(days_remaining_in_month), 1)
    days_week = max(int(days_remaining_in_week), 1)
    per_day_cents = max(available_cents, 0) / days_month
    return {
        "safe_today": round(per_day_cents / 100, 2),
        "safe_this_week": round(per_day_cents * days_week / 100, 2),
        "available_before_daily": round(available_cents / 100, 2),
        "days_remaining_in_month": days_month,
        "basis": basis,
        "unpaid_fixed_bills": round(bills_cents / 100, 2),
        "goal_contributions_due": round(goals_cents / 100, 2),
        "reason": "Recorded limits, unpaid bills, and goal contributions leave no available amount under this estimate." if available_cents <= 0 else None,
        "formula": "max(0, available variable monthly limits - unpaid fixed bills due this month - goal contributions due this month) / days remaining in month; without variable limits, use expected income - unpaid bills - goals - recorded spending.",
    }
