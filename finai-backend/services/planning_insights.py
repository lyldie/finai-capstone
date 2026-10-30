"""Pure deterministic planning insight rules and AI numeric-claim checks."""
import re
from datetime import date, datetime


_NUMBER = re.compile(r"(?<![A-Za-z0-9])[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?")


def evidence_numbers(value) -> set[float]:
    if isinstance(value, bool) or value is None:
        return set()
    if isinstance(value, (int, float)):
        return {float(value)}
    if isinstance(value, dict):
        ignored = {"id", "_id", "category_id", "budget_id", "goal_id", "evidence_id"}
        return set().union(*(evidence_numbers(child) for key, child in value.items() if key not in ignored)) if value else set()
    if isinstance(value, (list, tuple)):
        return set().union(*(evidence_numbers(child) for child in value)) if value else set()
    return set()


def numeric_claims_supported(item: dict, evidence: dict) -> bool:
    allowed = evidence_numbers(evidence)
    fields = [item.get("title"), item.get("message"), item.get("context_question")]
    actions = item.get("actions")
    if isinstance(actions, list):
        fields.extend(actions[:2])
    for field in fields:
        if not isinstance(field, str):
            continue
        for token in _NUMBER.findall(field):
            try:
                number = float(token.rstrip("%").replace(",", ""))
            except ValueError:
                return False
            if not any(abs(number - candidate) < 0.011 for candidate in allowed):
                return False
    return True


def validate_ai_recommendations(proposed, evidence_catalog: dict, limit: int = 3) -> list[dict]:
    """Filter and normalize model recommendations against deterministic evidence."""
    if not isinstance(proposed, list):
        return []
    validated = []
    seen_ids = set()
    for item in proposed[:limit]:
        if not isinstance(item, dict):
            continue
        evidence_id = item.get("evidence_id")
        source = evidence_catalog.get(evidence_id)
        if not source or evidence_id in seen_ids:
            continue
        if not numeric_claims_supported(item, source.get("evidence", {})):
            continue
        if not all(isinstance(item.get(key), str) and item[key].strip() for key in ("title", "message")):
            continue
        actions = item.get("actions")
        if not isinstance(actions, list) or not actions or not all(
            isinstance(action, str) and action.strip() for action in actions[:2]
        ):
            continue
        validated.append({
            "kind": source["kind"],
            "priority": item.get("priority") if item.get("priority") in {"high", "medium", "goal"} else "medium",
            "title": item["title"].strip()[:72],
            "message": item["message"].strip()[:120],
            "action": " ".join(action.strip()[:100] for action in actions[:2]),
            "actions": [action.strip()[:100] for action in actions[:2]],
            "context_question": item.get("context_question", "")[:120]
            if isinstance(item.get("context_question"), str) else "",
            "how_calculated": source.get("how_calculated", "")[:200]
            if isinstance(source.get("how_calculated"), str) else "",
            "evidence": source["evidence"],
        })
        seen_ids.add(evidence_id)
    return validated


def overview_claims_supported(overview: str, evidence_catalog: dict) -> bool:
    evidence = [source.get("evidence", {}) for source in evidence_catalog.values() if isinstance(source, dict)]
    return numeric_claims_supported({"message": overview}, evidence)


def budget_insight(forecast: dict) -> dict | None:
    """Return an in-period budget alert/watch based on its existing projection."""
    limit = float(forecast.get("limit", 0) or 0)
    usage = float(forecast.get("percentage_used", 0) or 0)
    over = bool(forecast.get("forecast_over_limit"))
    if over:
        return {
            "kind": "budget_risk", "priority": "high",
            "title": f"{forecast.get('category', 'Category')} may exceed its limit",
            "message": f"Projected to exceed {forecast.get('period', 'budget')} limit · {forecast.get('confidence', 'low')} confidence.",
            "evidence": forecast,
            "action": f"About PHP {float(forecast.get('daily_remaining_allowance', 0) or 0):.2f} remains per day for the rest of this period if you want to stay within the limit.",
            "how_calculated": forecast.get("how_calculated", ""),
        }
    if usage >= 70:
        spent = float(forecast.get("spent", 0) or 0)
        return {
            "kind": "budget_watch", "priority": "medium",
            "title": f"Keep an eye on {forecast.get('category', 'Category')}",
            "message": f"{usage:.0f}% used · ₱{float(forecast.get('daily_remaining_allowance', 0) or 0):,.0f}/day remaining allowance.",
            "evidence": forecast,
            "action": f"About PHP {float(forecast.get('daily_remaining_allowance', 0) or 0):.2f} remains per day for the rest of this period.",
            "how_calculated": f"₱{spent:,.0f} of ₱{limit:,.0f} = {usage:.0f}%. ₱{max(limit-spent, 0):,.0f} left / {forecast.get('days_remaining', 0)} days",
        }
    return None


def spending_pattern_insight(pattern: dict) -> dict:
    return {
        "kind": "spending_pattern", "priority": "medium",
        "title": f"{pattern['category']} spending is above its recent pattern",
        "message": (f"Recorded spending so far this month is {pattern['change_percent']:.0f}% above "
                    f"the average of {pattern['comparison_month_count']} prior same-date periods. "
                    "This comparison does not explain why it changed."),
        "evidence": pattern,
        "action": "Review the transactions in this category and decide whether any change fits your plans.",
    }


def seasonal_insight(pattern: dict) -> dict:
    return {
        "kind": "seasonal_pattern", "priority": "medium",
        "title": f"{pattern['category']} is seasonal in {pattern['month']}",
        "message": (f"Recorded {pattern['month']} spending in {pattern['comparison_year']} was "
                    f"{pattern['difference_pct']:.1f}% above that year's monthly average."),
        "evidence": pattern,
        "how_calculated": (f"{pattern['month']} {pattern['comparison_year']}: PHP {pattern['same_month_spending']:,.2f}; "
                           f"12-month average: PHP {pattern['annual_monthly_average']:,.2f}."),
        "action": "Use last year's pattern as a heads-up and check whether similar costs are expected this month.",
    }


def seasonal_history_eligible(account_created_at, category_created_at, comparison_year: int) -> bool:
    """Require complete prior-calendar-year coverage for the account and category."""
    year_start = date(comparison_year, 1, 1)

    def as_date(value):
        try:
            if isinstance(value, datetime):
                return value.date()
            if isinstance(value, date):
                return value
            return date.fromisoformat(str(value)[:10])
        except (TypeError, ValueError):
            return None

    account_start = as_date(account_created_at)
    category_start = as_date(category_created_at)
    return account_start is not None and category_start is not None and account_start <= year_start and category_start <= year_start


def goal_insight(goal: dict, monthly_baseline: float) -> dict | None:
    if float(goal.get("remaining", 0) or 0) <= 0:
        return None
    if goal.get("target_date_passed") or goal.get("target_due_today"):
        return {
            "kind": "goal_review", "priority": "medium",
            "title": f"Review the target date for {goal['target']}",
            "message": f"{goal['remaining']:.2f} remains and the target date has arrived or passed.",
            "evidence": goal,
            "action": "Consider choosing a later target date or revising the target amount.",
        }
    needed = goal.get("suggested_monthly_saving")
    if needed is None:
        return None
    exceeds = monthly_baseline > 0 and float(needed) > monthly_baseline
    item = {
        "kind": "goal_plan", "priority": "medium" if exceeds else "goal",
        "title": f"Plan savings for {goal['target']}",
        "message": f"₱{float(needed):,.0f}/mo needed to reach goal by target date.",
        "evidence": goal,
        "action": ("That monthly pace is above your reported baseline. Consider a later date or lower target; actual affordability also depends on expenses not recorded here."
                   if exceeds else "Compare this monthly amount with your budget before committing to it."),
    }
    if goal.get("days_to_target") is not None:
        item["how_calculated"] = (f"PHP {goal['remaining']:,.2f} remaining / {goal['days_to_target']} days "
                                  f"x 30.4375 = PHP {float(needed):,.2f}/month")
    return item


def cash_flow_insight(current_month: dict) -> dict | None:
    if float(current_month.get("income", 0) or 0) <= 0 or float(current_month.get("net", 0) or 0) >= 0:
        return None
    income, expense, net = (float(current_month.get(key, 0) or 0) for key in ("income", "expense", "net"))
    return {
        "kind": "cash_flow", "priority": "medium",
        "title": "Recorded spending is above recorded income this month",
        "message": "Recorded expenses exceed income this month.", "evidence": current_month,
        "action": "Review upcoming expenses and whether your current savings targets still fit this month's cash flow.",
        "how_calculated": f"₱{income:,.0f} income - ₱{expense:,.0f} expenses = ₱{net:,.0f} net",
    }


def long_term_cash_flow_insight(outlook: dict) -> dict | None:
    if not outlook.get("available") or float(outlook.get("average_monthly_recorded_net_cash_flow", 0) or 0) >= 0:
        return None
    return {
        "kind": "long_term_cash_flow", "priority": "medium",
        "title": "Review the longer-term cash-flow pattern",
        "message": "Across months with recorded activity, expenses have averaged above recorded income. Missing records may affect this comparison.",
        "evidence": outlook,
        "action": "Review recurring and flexible expenses, then choose one category where a change would feel realistic.",
    }


def sma_category_insight(category: str, forecast: dict) -> dict | None:
    limit, usage = forecast.get("limit"), forecast.get("limit_usage_pct")
    if limit is not None and (float(forecast.get("forecast", 0) or 0) > float(limit) or
                              (usage is not None and float(usage) >= 90)):
        return {
            "kind": "sma_limit_risk", "priority": "high" if forecast["forecast"] > limit else "medium",
            "title": f"Review the {category} forecast",
            "message": "Its completed-month average is near or above the saved limit.",
            "evidence": {"category": category, **forecast},
            "action": "Compare this estimate with your recorded transactions and current limit.",
            "how_calculated": f"SMA {forecast['forecast']:.2f} vs limit {limit:.2f} ({usage:.1f}% of limit).",
        }
    trend = forecast.get("trend_pct")
    if trend is not None and float(trend) > 15 and forecast.get("confidence") != "low":
        return {
            "kind": "sma_trend", "priority": "medium", "title": f"{category} is trending up",
            "message": "The recent completed-month average is higher than the previous window.",
            "evidence": {"category": category, **forecast},
            "action": "Review recent transactions to see whether this change fits your plans.",
            "how_calculated": f"SMA trend is +{float(trend):.1f}% versus the prior 3 completed months.",
        }
    return None


def upcoming_bill_insight(bill: dict) -> dict:
    return {
        "kind": "upcoming_bill", "priority": "medium",
        "title": f"{bill['name']} is due soon",
        "message": f"{bill['category']} · due {bill['due_date']} · PHP {bill['amount']:.2f}.",
        "evidence": bill,
        "action": "Check the due date and mark the reminder paid after you pay it.",
    }


def on_track_summary(tracked: list[dict]) -> dict | None:
    on_track = [item for item in tracked if item.get("projected_period_end_spend", 0) <= item.get("limit", 0)]
    if len(tracked) < 2 or len(on_track) < 2:
        return None
    return {
        "kind": "budgets_on_track", "on_track_count": len(on_track), "tracked_budget_count": len(tracked),
        "message": ("Recorded spending is currently projected to stay within the limit for "
                    f"{len(on_track)} of {len(tracked)} active budget limits with spending logged."),
        "basis": "Based on current-period pace and recent recorded spending with enough history to estimate; forecasts can change.",
    }
