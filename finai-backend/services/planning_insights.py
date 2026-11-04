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
    finding = item.get("finding") if isinstance(item.get("finding"), dict) else {}
    next_step = item.get("nextStep") if isinstance(item.get("nextStep"), dict) else {}
    fields = [item.get("title"), item.get("message"), item.get("context_question"),
              finding.get("headline"), item.get("why"), next_step.get("label")]
    if finding.get("key_number") is not None:
        fields.append(finding.get("key_number"))
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


def _insight_number(kind: str, evidence: dict) -> dict | None:
    """Choose a verified, useful amount for the compact insight headline."""
    candidates = {
        "category_forecast": ("Forecast", (evidence.get("monthly") or {}).get("forecast"), "PHP/month"),
        "budget_risk": ("Projected spend", evidence.get("projected_period_end_spend"), "PHP"),
        "budget_watch": ("Spent so far", evidence.get("spent"), "PHP"),
        "sma_limit_risk": ("Next-month estimate", evidence.get("forecast"), "PHP"),
        "sma_trend": ("Recent change", evidence.get("trend_pct"), "%"),
        "spending_pattern": ("Above usual", evidence.get("change_percent"), "%"),
        "seasonal_pattern": ("Above average", evidence.get("difference_pct"), "%"),
        "goal_plan": ("Monthly pace", evidence.get("suggested_monthly_saving"), "PHP/month"),
        "goal_review": ("Still needed", evidence.get("remaining"), "PHP"),
        "cash_flow": ("Net this month", evidence.get("net"), "PHP"),
        "long_term_cash_flow": ("Average monthly net", evidence.get("average_monthly_recorded_net_cash_flow"), "PHP/month"),
        "upcoming_bill": ("Due amount", evidence.get("amount"), "PHP"),
        "income_stability": ("Monthly income", evidence.get("forecast"), "PHP/month"),
        "income_capacity": ("Spare capacity", evidence.get("spare_capacity"), "PHP/month"),
        "income_goal_funding": ("Goal pace", evidence.get("suggested_monthly_saving"), "PHP/month"),
        "income_cushion": ("Wallet cushion", evidence.get("cushion_months"), "months"),
        "weekly_briefing": ("Change vs 4-week average", evidence.get("change_percent"), "%"),
    }
    label, value, unit = candidates.get(kind, ("", None, ""))
    if value is None:
        return None
    return {"label": label, "value": round(float(value), 2), "unit": unit}


def _evidence_window(kind: str, evidence: dict) -> tuple[list, str | None]:
    window = evidence.get("window")
    if not isinstance(window, list):
        forecast = evidence.get("monthly") or evidence.get("weekly") or {}
        window = forecast.get("window") if isinstance(forecast, dict) else None
    if not isinstance(window, list):
        window = evidence.get("comparison_periods")
    if not isinstance(window, list):
        window = evidence.get("periods")
    labels = []
    for item in window or []:
        if isinstance(item, dict):
            labels.append(str(item.get("label") or item.get("start") or "")[:40])
        else:
            labels.append(str(item)[:40])
    comparison = evidence.get("comparison_period")
    forecast = evidence.get("monthly") or evidence.get("weekly") or evidence
    if not comparison and kind == "category_forecast" and forecast.get("trend_pct") is not None:
        comparison = "previous 3 completed months"
    if not comparison and kind in {"sma_trend", "sma_limit_risk", "income_stability", "income_capacity"}:
        comparison = "previous matching periods" if evidence.get("trend_pct") is not None else None
    return labels, comparison


def normalize_rule_insight(item: dict) -> dict:
    """Convert deterministic rule output to the single public Insight contract."""
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    kind = str(item.get("kind") or "planning")
    window, comparison = _evidence_window(kind, evidence)
    key_number = _insight_number(kind, evidence)
    action_label = item.get("action")
    action_type = "ask_finn" if not action_label else "review_plan_with_finn"
    cta_labels = {
        "budget_risk": "Review this budget", "budget_watch": "Review this budget",
        "sma_limit_risk": "Review forecast and limit", "sma_trend": "Review recent transactions",
        "spending_pattern": "Review recent transactions", "seasonal_pattern": "Plan for this month",
        "goal_plan": "Review goal pace", "goal_review": "Review goal plan",
        "cash_flow": "Review this month's plan", "long_term_cash_flow": "Review cash flow",
        "upcoming_bill": "Check bill reminder", "income_stability": "Review income estimate",
        "income_capacity": "Check bills before planning", "income_goal_funding": "Review goal pace",
        "weekly_briefing": "Review this week's spending",
    }
    button_label = cta_labels.get(kind, str(action_label or "Ask Finn"))
    return {
        "id": str(item.get("id") or kind),
        "topic": "income" if kind.startswith("income_") else "goals" if kind.startswith("goal") else "spending",
        "finding": {"headline": str(item.get("title") or "Planning note")[:72], "key_number": key_number},
        "evidence": {
            "values": evidence,
            "window": window,
            "comparison_period": comparison,
            "how_calculated": str(item.get("how_calculated") or "")[:240] or None,
        },
        "why": str(item.get("message") or "Based on recorded activity.")[:180],
        "nextStep": ({
            "action_type": action_type,
            "label": button_label[:52],
            "params": {"kind": kind, "detail": str(action_label)[:180] if action_label else "", "topic": "income" if kind.startswith("income_") else "goals" if kind.startswith("goal") else "spending"},
            "preview": item.get("preview") if isinstance(item.get("preview"), dict) else None,
        }),
        "confidence": str(evidence.get("confidence") or "medium"),
        "insufficientData": False,
        "source": "rules",
        "priority": item.get("priority") if item.get("priority") in {"high", "medium", "goal"} else "medium",
    }


def validate_ai_recommendations(proposed, evidence_catalog: dict) -> list[dict]:
    """Filter model insights against evidence and return the shared Insight contract."""
    if not isinstance(proposed, list):
        return []
    validated = []
    seen_ids = set()
    # Each evidence ID can produce at most one result, so the evidence catalog
    # itself bounds accepted output without an arbitrary recommendation count.
    for item in proposed:
        if not isinstance(item, dict):
            continue
        evidence_id = item.get("evidence_id")
        source = evidence_catalog.get(evidence_id)
        if not source or evidence_id in seen_ids:
            continue
        source_evidence = source.get("evidence", {})
        if not numeric_claims_supported(item, source_evidence):
            continue
        finding = item.get("finding") if isinstance(item.get("finding"), dict) else {}
        headline = finding.get("headline") or item.get("title")
        why = item.get("why") or item.get("message")
        if not isinstance(headline, str) or not headline.strip() or not isinstance(why, str) or not why.strip():
            continue
        # Category estimates need a complete moving-average window. Never let an
        # LLM turn sparse data into a confident finding.
        if source["kind"] == "category_forecast":
            forecast = source_evidence.get("monthly", {})
            if int(forecast.get("period_count", 0) or 0) < 3 or forecast.get("confidence") == "low":
                continue
        if source["kind"] in {"budget_risk", "budget_watch"}:
            if source_evidence.get("confidence") == "low" and float(source_evidence.get("spent", 0) or 0) < float(source_evidence.get("limit", 0) or 0):
                continue
        action = item.get("nextStep") if isinstance(item.get("nextStep"), dict) else None
        label = action.get("label") if action else None
        if not label:
            actions = item.get("actions")
            if isinstance(actions, list) and actions and isinstance(actions[0], str):
                label = actions[0]
        numeric = finding.get("key_number")
        verified_number = _insight_number(source["kind"], source_evidence)
        if verified_number:
            numeric = verified_number
        else:
            # Keep cards evidence-led; models cannot invent a headline metric.
            continue
        window, comparison = _evidence_window(source["kind"], source_evidence)
        topic = "income" if source["kind"].startswith("income_") or (
            source["kind"] == "category_forecast" and source_evidence.get("type") == "income"
        ) else "goals" if source["kind"].startswith("goal") else "spending"
        values = source.get("preview") if isinstance(source.get("preview"), dict) else None
        validated.append({
            "id": evidence_id,
            "topic": topic,
            "finding": {"headline": headline.strip()[:72], "key_number": numeric},
            "evidence": {"values": source_evidence, "window": window, "comparison_period": comparison,
                         "how_calculated": (source.get("how_calculated") or "")[:240] or None},
            "why": why.strip()[:180],
            "nextStep": ({"action_type": "review_plan_with_finn", "label": str(label)[:52],
                          "params": {"kind": source["kind"], "evidence_id": evidence_id}, "preview": values}
                         if label else None),
            "confidence": str(source_evidence.get("confidence") or (source_evidence.get("monthly") or {}).get("confidence") or "medium"),
            "insufficientData": False,
            "source": "ai",
            "priority": item.get("priority") if item.get("priority") in {"high", "medium", "goal"} else "medium",
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
    over = bool(forecast.get("forecast_over_limit")) and (
        forecast.get("confidence") != "low"
        or float(forecast.get("spent", 0) or 0) >= limit
    )
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
    # Do not surface forecast claims without the full three-month SMA window.
    if int(forecast.get("period_count", 0) or 0) < 3:
        return None
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


def income_stability_insight(category: str, forecast: dict) -> dict | None:
    """Surface an income stability note only with a complete, steady window."""
    if int(forecast.get("period_count", 0) or 0) < 3 or float(forecast.get("forecast", 0) or 0) <= 0:
        return None
    if forecast.get("confidence") != "high":
        return None
    periods = forecast.get("periods") or []
    window = [float(item.get("actual", 0) or 0) for item in periods[-3:]]
    if len(window) < 3 or not any(window):
        return None
    return {
        "kind": "income_stability", "priority": "medium",
        "title": f"{category} income has been steady",
        "message": "Recorded income stayed within a relatively narrow range across the last three completed months.",
        "evidence": {"category": category, **forecast},
        "action": "Use this estimate as a guide; confirm expected income before committing it to plans.",
        "how_calculated": "Stability is based on variation across the last three completed monthly totals.",
    }


def income_capacity_insight(monthly_income: float, monthly_expenses: float, period_count: int) -> dict | None:
    """Describe positive recorded forecast net as possible capacity, not guaranteed savings."""
    spare = round(float(monthly_income) - float(monthly_expenses), 2)
    if period_count < 3 or spare <= 0:
        return None
    evidence = {"forecast": round(float(monthly_income), 2), "monthly_expenses": round(float(monthly_expenses), 2),
                "spare_capacity": spare, "period_count": period_count, "confidence": "medium",
                "window": ["last 3 completed months"]}
    return {
        "kind": "income_capacity", "priority": "goal",
        "title": "There may be room in your monthly plan",
        "message": "Projected income is above projected expenses; this is an estimate, not guaranteed extra cash.",
        "evidence": evidence,
        "action": "Check upcoming bills and essentials before assigning any of this amount to a goal.",
        "how_calculated": f"PHP {monthly_income:,.2f} projected income - PHP {monthly_expenses:,.2f} projected expenses = PHP {spare:,.2f} estimated monthly difference.",
    }


def income_goal_funding_insight(goal: dict, spare_capacity: float) -> dict | None:
    needed = float(goal.get("suggested_monthly_saving", 0) or 0)
    if needed <= 0 or spare_capacity < needed or int(goal.get("days_to_target") or 0) <= 0:
        return None
    evidence = {**goal, "spare_capacity": round(spare_capacity, 2), "confidence": "medium",
                "comparison_period": "monthly income forecast minus monthly expense forecast"}
    return {
        "kind": "income_goal_funding", "priority": "goal",
        "title": f"Your forecast may support {goal.get('target', 'a goal')}",
        "message": "The estimated monthly difference is enough for the goal's suggested pace; check bills and essentials first.",
        "evidence": evidence,
        "preview": {"label": "Estimated monthly difference after this goal pace", "amount": round(spare_capacity - needed, 2)},
        "action": "Review your upcoming costs before committing to this monthly goal pace.",
        "how_calculated": f"PHP {spare_capacity:,.2f} estimated monthly difference compared with PHP {needed:,.2f} needed for the goal.",
    }


def income_cushion_insight(wallet_balance: float, monthly_expenses: float) -> dict | None:
    """Compare recorded current wallet balances with forecast monthly expenses."""
    if wallet_balance <= 0 or monthly_expenses <= 0:
        return None
    months = round(wallet_balance / monthly_expenses, 1)
    evidence = {"wallet_balance": round(wallet_balance, 2), "monthly_expenses": round(monthly_expenses, 2),
                "cushion_months": months, "confidence": "medium",
                "window": ["current wallet balances", "next-month expense estimate"],
                "comparison_period": "current account balances divided by estimated monthly expenses"}
    return {
        "kind": "income_cushion", "priority": "medium",
        "title": "Your wallets cover part of a spending cushion",
        "message": f"Recorded wallet balances equal about {months:g} months of estimated expenses; this is a snapshot, and some money may already be earmarked.",
        "evidence": evidence,
        "action": "Check upcoming costs and earmarked money before treating this as available cushion.",
        "how_calculated": f"PHP {wallet_balance:,.2f} current wallet balance / PHP {monthly_expenses:,.2f} estimated monthly expenses = {months:g} months.",
    }


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
