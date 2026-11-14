import { PlanningData } from '../types/planning';

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Compact numeric slice of the already-loaded Plan Ahead response for Finn. */
export function buildPlanAheadChatContext(data: PlanningData, focusCategory?: string) {
  const categoryRows = [...(data.category_forecasts || [])];
  const focused = focusCategory
    ? categoryRows.find((item) => item.category.toLocaleLowerCase() === focusCategory.toLocaleLowerCase())
    : undefined;
  const byMonthlyEstimate = (left: (typeof categoryRows)[number], right: (typeof categoryRows)[number]) =>
    (Number(right.monthly?.forecast) || 0) - (Number(left.monthly?.forecast) || 0);
  const selectedCategories = [
    ...categoryRows.filter((item) => item.type === 'expense').sort(byMonthlyEstimate).slice(0, 8),
    ...categoryRows.filter((item) => item.type === 'income').sort(byMonthlyEstimate).slice(0, 4),
  ];
  const categories = [
    ...(focused ? [focused] : []),
    ...selectedCategories.filter((item) => item !== focused),
  ]
    .slice(0, 12).map((item) => {
    const compactPeriod = (period: typeof item.monthly) => ({
      forecast: finiteNumber(period?.forecast),
      range_low: finiteNumber(period?.range_low),
      range_high: finiteNumber(period?.range_high),
      trend_pct: finiteNumber(period?.trend_pct),
      limit: finiteNumber(period?.limit),
      limit_usage_pct: finiteNumber(period?.limit_usage_pct),
      period_count: finiteNumber(period?.period_count),
      periods: (period?.periods || []).slice(-(period?.window?.length || 4)).map((point) => ({
        label: String(point.label || '').slice(0, 24),
        actual: finiteNumber(point.actual),
      })),
    });
    return {
      category: String(item.category || 'Category').slice(0, 80),
      type: item.type,
      monthly: compactPeriod(item.monthly),
      weekly: compactPeriod(item.weekly),
    };
  });

  const budgetRows = Array.isArray(data.budget_forecasts) ? data.budget_forecasts as any[] : [];
  const budgets = budgetRows.slice(0, 10).map((item: any) => ({
    category: String(item.category || 'Category').slice(0, 80),
    period: String(item.period || 'budget').slice(0, 20),
    limit: finiteNumber(item.limit),
    spent: finiteNumber(item.spent),
    projected_period_end_spend: finiteNumber(item.projected_period_end_spend),
    forecast_over_limit: Boolean(item.forecast_over_limit),
    percentage_used: finiteNumber(item.percentage_used),
    days_remaining: finiteNumber(item.days_remaining),
    daily_remaining_allowance: finiteNumber(item.daily_remaining_allowance),
  }));

  const goals = (data.goal_plans || []).slice(0, 8).map((item) => ({
    target: String(item.target || 'Savings goal').slice(0, 80),
    remaining: finiteNumber(item.remaining),
    days_to_target: finiteNumber(item.days_to_target),
    suggested_monthly_saving: finiteNumber(item.suggested_monthly_saving),
    monthly_contribution_pace: finiteNumber(item.monthly_contribution_pace),
  }));
  const upcomingBills = (data.upcoming_bills || []).slice(0, 5).map((item) => ({
    name: String(item.name || 'Scheduled bill').slice(0, 80),
    category: '',
    due_date: String(item.due_date || '').slice(0, 10),
    amount: finiteNumber(item.amount),
    forecast: null,
  }));
  const fixedBillForecasts = (data.fixed_bill_forecasts || []).slice(0, 5).map((item) => ({
    name: String(item.name || 'Scheduled bill').slice(0, 80),
    category: String(item.category || '').slice(0, 80),
    due_date: '',
    amount: null,
    forecast: finiteNumber(item.forecast),
  }));

  const longTerm = data.long_term_outlook as any;
  const scenarios = longTerm?.scenarios || {};
  const monthlyNetForecast = finiteNumber(data.monthly_net_forecast);
  const summary = typeof data.summary === 'string' ? data.summary.slice(0, 500) : '';
  const priority = { high: 0, medium: 1, goal: 2 } as Record<string, number>;
  const recommendations = [...(data.recommendations || [])]
    .sort((left, right) => (priority[left.priority] ?? 3) - (priority[right.priority] ?? 3))
    .slice(0, 6)
    .map((item) => {
      const values = item.evidence?.values || {};
      const evidence = Object.entries(values)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
        .slice(0, 6)
        .map(([label, value]) => ({ label: label.replace(/_/g, ' ').slice(0, 40), value }));
      return {
        topic: item.topic,
        headline: String(item.finding?.headline || '').slice(0, 180),
        why: String(item.why || '').slice(0, 280),
        next_step: String(item.nextStep?.label || '').slice(0, 120),
        metric_label: String(item.finding?.key_number?.label || '').slice(0, 60),
        metric_value: finiteNumber(item.finding?.key_number?.value),
        evidence,
      };
    });
  return {
    as_of_date: String(data.metrics?.as_of_date || '').slice(0, 10),
    summary,
    reported_monthly_baseline: finiteNumber(data.metrics?.reported_monthly_baseline),
    monthly_net_forecast: monthlyNetForecast,
    long_term_outlook: {
      available: Boolean(longTerm?.available),
      horizon_months: finiteNumber(longTerm?.horizon_months),
      observed_completed_months: finiteNumber(longTerm?.observed_completed_months),
      average_monthly_recorded_income: finiteNumber(longTerm?.average_monthly_recorded_income),
      average_monthly_recorded_expenses: finiteNumber(longTerm?.average_monthly_recorded_expenses),
      average_monthly_recorded_net_cash_flow: finiteNumber(longTerm?.average_monthly_recorded_net_cash_flow),
      cautious_12_month_net_change: finiteNumber(scenarios.cautious_12_month_net_change),
      typical_12_month_net_change: finiteNumber(scenarios.typical_12_month_net_change),
      strong_12_month_net_change: finiteNumber(scenarios.strong_12_month_net_change),
    },
    health_score: finiteNumber(data.health_score?.score),
    safe_to_spend: {
      safe_today: finiteNumber(data.safe_to_spend?.safe_today),
      safe_this_week: finiteNumber(data.safe_to_spend?.safe_this_week),
    },
    category_forecasts: categories,
    budget_forecasts: budgets,
    goal_plans: goals,
    recommendations,
    upcoming_bills: upcomingBills,
    fixed_bill_forecasts: fixedBillForecasts,
  };
}

export const planAheadChatStorageKey = (userId: string) => `@chat_plan_ahead_${userId}`;
