export type ForecastConfidence = 'low' | 'medium' | 'high' | 'scheduled';
export type ForecastPeriod = {
  label: string;
  actual: number;
  transaction_count?: number;
};

export type CategoryPeriodForecast = {
  forecast: number;
  sd?: number | null;
  range_low?: number | null;
  range_high?: number | null;
  trend_pct?: number | null;
  confidence: ForecastConfidence;
  period_count: number;
  window: number[];
  method?: 'sma';
  limit?: number | null;
  limit_usage_pct?: number | null;
  periods: ForecastPeriod[];
};

export type CategoryDrivers = {
  average_transactions_per_period: number;
  average_transaction_amount: number | null;
  largest_recorded_day: { date: string; amount: number } | null;
};

export type CategoryForecast = {
  category_id: string;
  category: string;
  type: 'income' | 'expense';
  monthly: CategoryPeriodForecast;
  weekly: CategoryPeriodForecast;
  drivers: CategoryDrivers;
};

export type PlanningRecommendation = {
  kind: string;
  priority: 'high' | 'medium' | 'goal' | string;
  title: string;
  message: string;
  action?: string;
  actions?: string[];
  context_question?: string;
  how_calculated?: string;
  evidence?: Record<string, any>;
};

export type GoalPlan = {
  goal_id: string;
  target: string;
  remaining: number;
  days_to_target?: number | null;
  suggested_monthly_saving?: number | null;
  monthly_contribution_pace?: number;
};

export type PlanningData = {
  metrics?: { as_of_date?: string };
  recommendation_source?: 'ai' | 'rule_based' | string;
  monthly_net_forecast: number;
  category_forecasts: CategoryForecast[];
  recommendations: PlanningRecommendation[];
  goal_plans: GoalPlan[];
  safe_to_spend?: { safe_today?: number; safe_this_week?: number; reason?: string };
  upcoming_bills?: Array<{ id?: string; name: string; due_date: string; amount: number }>;
  fixed_bill_forecasts?: Array<{ id: string; name: string; category: string; forecast: number }>;
  health_score?: { score?: number | null };
  monthly_net?: number;
  [key: string]: unknown;
};
