/** Shared budget-status palette for the dashboard, Insights, and alerts. */
export const BUDGET_STATUS_COLORS = {
  onTrack: '#16845B',
  watch: '#D6A514', // yellow: 70–89%
  highUse: '#E87925', // orange: 90–99%
  nearLimit: '#D94C43', // red: exactly 100%
  overBudget: '#B42318', // darker red: above 100%
} as const;

export const BUDGET_STATUS_TINTS = {
  onTrack: '#ECFDF3',
  watch: '#FFF9E6',
  highUse: '#FFF3E8',
  nearLimit: '#FFF0EF',
  overBudget: '#FEF3F2',
} as const;

export function getBudgetStatusColor(percentage: number): string {
  const value = Number(percentage) || 0;
  if (value > 100) return BUDGET_STATUS_COLORS.overBudget;
  if (value >= 100) return BUDGET_STATUS_COLORS.nearLimit;
  if (value >= 90) return BUDGET_STATUS_COLORS.highUse;
  if (value >= 70) return BUDGET_STATUS_COLORS.watch;
  return BUDGET_STATUS_COLORS.onTrack;
}

export function getBudgetStatusTint(percentage: number): string {
  const value = Number(percentage) || 0;
  if (value > 100) return BUDGET_STATUS_TINTS.overBudget;
  if (value >= 100) return BUDGET_STATUS_TINTS.nearLimit;
  if (value >= 90) return BUDGET_STATUS_TINTS.highUse;
  if (value >= 70) return BUDGET_STATUS_TINTS.watch;
  return BUDGET_STATUS_TINTS.onTrack;
}

/** Darker matching shades for small text and icons on tinted notification cards. */
export function getBudgetStatusTextColor(percentage: number): string {
  const value = Number(percentage) || 0;
  if (value > 100) return '#B42318';
  if (value >= 100) return '#B42318';
  if (value >= 90) return '#B45309';
  if (value >= 70) return '#856400';
  return '#047857';
}
