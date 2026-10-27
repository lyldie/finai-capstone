import React, { useState } from 'react';
import { ActivityIndicator, Image, LayoutAnimation, Modal, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const TRACK = '#ECE7DD';
const RED = '#D94C43';
const AMBER = '#A56300';
const AMBER_BG = '#FFF8EC';
const RED_BG = '#FFF1F0';
const BLUE = '#2B6CB0';
const GREEN_BG = '#EAF4EF';
const WHITE = '#FFFFFF';
const BODY = '#47645D';

type Recommendation = {
  kind: string;
  priority: string;
  title: string;
  message: string;
  action: string;
  actions?: string[];
  context_question?: string;
  how_calculated?: string;
  evidence?: Record<string, any>;
};

type HealthScore = {
  available: boolean;
  score: number | null;
  label: string;
  color: 'green' | 'teal' | 'amber' | 'red';
  breakdown: {
    budget: 'good' | 'watch' | 'alert' | 'none';
    goals: 'good' | 'watch' | 'alert' | 'none';
    cash_flow: 'good' | 'watch' | 'alert' | 'none';
  };
};

type BudgetDailyAllowance = {
  amount: number;
  based_on: string;
  period: string;
} | null;

type PlanningData = {
  summary: string;
  summary_source: 'ai' | 'rule_based' | string;
  recommendation_source?: 'ai' | 'rule_based' | string;
  analysis_provider?: 'gemini' | 'groq' | null;
  health_score?: HealthScore;
  budget_daily_allowance?: BudgetDailyAllowance;
  metrics: {
    as_of_date: string;
    days_with_records: number;
    history_truncated: boolean;
    active_budget_count?: number;
    active_goal_count?: number;
    period_analytics?: Record<string, { income: number; expense: number; net: number; start: string; end: string }>;
    period_series?: Record<string, { label: string; income: number; expense: number }[]>;
  };
  recommendations: Recommendation[];
  positive_reinforcement?: {
    kind: string;
    on_track_count: number;
    tracked_budget_count: number;
    as_of_date: string;
    message: string;
    basis: string;
  } | null;
  budget_forecasts?: { category: string; period: string; spent: number; limit: number; projected_period_end_spend: number; forecast_over_limit: boolean; percentage_used: number; days_remaining: number; daily_remaining_allowance: number; confidence: string }[];
  goal_plans?: { target: string; saved: number; goal: number; remaining: number; days_to_target?: number | null; suggested_monthly_saving?: number | null }[];
  data_note: string;
  long_term_outlook?: {
    available: boolean;
    horizon_months: number;
    observed_completed_months: number;
    confidence: string;
    average_monthly_recorded_income: number;
    average_monthly_recorded_expenses: number;
    average_monthly_recorded_net_cash_flow: number;
    scenarios?: {
      cautious_12_month_net_change: number;
      typical_12_month_net_change: number;
      strong_12_month_net_change: number;
    } | null;
  };
};

type Props = {
  data: PlanningData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onAskFinAI: (topic: 'general' | 'budget' | 'goals', prompt: string) => void;
  onReviewBudget: (budget: { id: string; category_id: string; category: string; period: string }) => void;
  onViewInsights: () => void;
};

const peso = (value: unknown) => `₱${(Number(value) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const signedPeso = (value: unknown) => {
  const amount = Number(value) || 0;
  return `${amount < 0 ? '−' : '+'}${peso(Math.abs(amount))}`;
};

/** Smooth expand/collapse for the progressive-disclosure sections. */
const animateLayout = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

/** Lower number = shown first. Alerts on top, then watch items, goals, then everything else. */
function severityRank(item: Recommendation): number {
  if (item.priority === 'high' || item.kind === 'budget_risk') return 0;
  if (item.kind === 'budget_watch') return 1;
  if (item.kind.startsWith('goal_')) return 2;
  return 3;
}

/** Only alerts get a tinted card; everything else stays white so red keeps its meaning. */
function urgencyStyle(item: Recommendation): { border: string; bg: string; badge: string; badgeText: string; badgeColor: string } {
  if (item.priority === 'high' || item.kind === 'budget_risk') {
    return { border: RED, bg: RED_BG, badge: 'Alert', badgeText: RED, badgeColor: 'rgba(217,76,67,0.12)' };
  }
  if (item.kind === 'budget_watch') {
    return { border: GOLD, bg: WHITE, badge: 'Watch', badgeText: AMBER, badgeColor: 'rgba(237,178,50,0.18)' };
  }
  if (item.kind.startsWith('goal_')) {
    return { border: TEAL, bg: WHITE, badge: 'Goal', badgeText: TEAL, badgeColor: 'rgba(61,125,108,0.12)' };
  }
  return { border: BLUE, bg: WHITE, badge: 'Plan', badgeText: BLUE, badgeColor: 'rgba(43,108,176,0.10)' };
}

function evidenceFor(item: Recommendation) {
  const evidence = item.evidence || {};
  if (item.kind.startsWith('budget_')) {
    return [
      { label: 'Spent', value: peso(evidence.spent) },
      { label: 'Limit', value: peso(evidence.limit) },
      { label: 'Forecast', value: peso(evidence.projected_period_end_spend) },
      { label: 'Days left', value: String(evidence.days_remaining ?? 0) },
    ];
  }
  if (item.kind.startsWith('goal_')) {
    return [
      { label: 'Saved', value: peso(evidence.saved) },
      { label: 'Target', value: peso(evidence.goal) },
      { label: 'Still needed', value: peso(evidence.remaining) },
      ...(evidence.days_to_target != null ? [{ label: 'Days left', value: String(evidence.days_to_target) }] : []),
    ];
  }
  if (item.kind === 'cash_flow') {
    return [
      { label: 'Recorded income', value: peso(evidence.income) },
      { label: 'Recorded expenses', value: peso(evidence.expense) },
      { label: 'Net so far', value: peso(evidence.net) },
    ];
  }
  if (item.kind === 'long_term_cash_flow') {
    return [
      { label: 'Months with records', value: String(evidence.observed_completed_months ?? 0) },
      { label: 'Avg monthly income', value: peso(evidence.average_monthly_recorded_income) },
      { label: 'Avg monthly expenses', value: peso(evidence.average_monthly_recorded_expenses) },
      { label: 'Avg monthly net', value: signedPeso(evidence.average_monthly_recorded_net_cash_flow) },
    ];
  }
  if (item.kind === 'spending_pattern') {
    const change = evidence.change_percent;
    return [
      { label: 'Category', value: String(evidence.category || 'Spending') },
      { label: 'This month', value: peso(evidence.current_period_spending) },
      ...(Array.isArray(evidence.comparison_periods) ? evidence.comparison_periods.map((period: any) => ({
        label: period.label,
        value: peso(period.amount),
      })) : [{ label: 'Prior period', value: peso(evidence.previous_period_to_same_day_spending) }]),
      ...(evidence.average_previous_spending != null ? [{ label: 'Prior average', value: peso(evidence.average_previous_spending) }] : []),
      { label: 'Change', value: change == null ? 'No prior comparison' : `${Number(change) > 0 ? '+' : ''}${change}%` },
    ];
  }
  return [];
}

function iconFor(kind: string): keyof typeof Ionicons.glyphMap {
  if (kind.startsWith('budget_')) return 'wallet-outline';
  if (kind.startsWith('goal_')) return 'flag-outline';
  if (kind === 'long_term_cash_flow') return 'trending-down-outline';
  return 'git-compare-outline';
}

function healthColorValue(color: string): string {
  if (color === 'green') return TEAL;
  if (color === 'teal') return TEAL;
  if (color === 'amber') return AMBER;
  return RED;
}

function healthTint(color: string): string {
  if (color === 'green' || color === 'teal') return 'rgba(61,125,108,0.12)';
  if (color === 'amber') return 'rgba(237,178,50,0.18)';
  return 'rgba(217,76,67,0.12)';
}

function indicatorDot(status: string) {
  if (status === 'alert') return { color: RED, icon: 'close-circle' as const, bg: 'rgba(217,76,67,0.10)', text: RED };
  if (status === 'watch') return { color: GOLD, icon: 'warning' as const, bg: 'rgba(237,178,50,0.16)', text: AMBER };
  if (status === 'none') return { color: SAGE, icon: 'remove-circle-outline' as const, bg: CREAM, text: SAGE };
  return { color: TEAL, icon: 'checkmark-circle' as const, bg: GREEN_BG, text: DEEP_GREEN };
}

const statusWord = (status: string) => (status === 'alert' ? 'needs attention' : status === 'watch' ? 'worth watching' : status === 'none' ? 'no data yet' : 'on track');

export default function PlanningInsightsPanel({ data, loading, error, onRefresh, onAskFinAI, onReviewBudget, onViewInsights }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [explaining, setExplaining] = useState<Recommendation | null>(null);
  const [showPlanTopics, setShowPlanTopics] = useState(false);

  // Progressive disclosure state
  const [showNotes, setShowNotes] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [showOutlook, setShowOutlook] = useState(false);
  const [showLongTerm, setShowLongTerm] = useState(false);
  // Per-card override. Cards not in this map use the default: only the first (most severe) card starts open.
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const periodLabels = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' } as const;
  const periodRangeLabels = { day: 'Today', week: 'This calendar week', month: 'This month', year: 'Year to date' } as const;
  const selectedTotals = data?.metrics?.period_analytics?.[selectedPeriod];
  const chartPoints = data?.metrics?.period_series?.[selectedPeriod] || [];
  const chartMax = Math.max(1, ...chartPoints.flatMap((point) => [Number(point.income) || 0, Number(point.expense) || 0]));
  const hasPeriodActivity = Number(selectedTotals?.income || 0) > 0 || Number(selectedTotals?.expense || 0) > 0;
  const canShowTrend = !!selectedTotals && selectedPeriod !== 'day' && chartPoints.length > 0 && hasPeriodActivity;
  const budgetPeriod = { day: 'daily', week: 'weekly', month: 'monthly', year: 'annual' }[selectedPeriod];
  const periodBudgets = (data?.budget_forecasts || []).filter((item) => item.period === budgetPeriod);
  const overBudgetCount = periodBudgets.filter((b) => b.forecast_over_limit).length;
  const recommendationTopic = (item: Recommendation) => item.kind.startsWith('goal_') ? 'goals' as const : item.kind.startsWith('budget_') || item.kind === 'spending_pattern' ? 'budget' as const : 'general' as const;

  // Goal pace and progress are already shown together in the goal cards below.
  // Keep explicit date-review warnings in the action list, but avoid a second
  // copy of the same monthly saving suggestion above the goal card.
  const sortedRecommendations = (data?.recommendations || [])
    .filter((item) => !(item.kind === 'goal_plan' && data?.goal_plans?.length))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => severityRank(a.item) - severityRank(b.item) || a.index - b.index)
    .map((entry) => entry.item);
  const priorityCount = sortedRecommendations.filter((item) => item.priority === 'high' || item.kind === 'budget_risk').length;
  const longTermScenarios = data?.long_term_outlook?.scenarios;
  const scenarioValues = longTermScenarios ? [
    Number(longTermScenarios.cautious_12_month_net_change) || 0,
    Number(longTermScenarios.typical_12_month_net_change) || 0,
    Number(longTermScenarios.strong_12_month_net_change) || 0,
  ] : [];
  const scenarioSpread = scenarioValues.length ? Math.max(...scenarioValues) - Math.min(...scenarioValues) : 0;
  const scenarioScale = Math.max(...scenarioValues.map((value) => Math.abs(value)), 0);
  const scenariosAreSimilar = scenarioValues.length === 3 && scenarioSpread <= Math.max(100, scenarioScale * 0.01);

  const toggleCard = (key: string, currentlyOpen: boolean) => {
    animateLayout();
    setExpandedCards((prev) => ({ ...prev, [key]: !currentlyOpen }));
  };

  const discussRecommendation = (item: Recommendation) => {
    const facts = evidenceFor(item).map((fact) => `${fact.label}: ${fact.value}`).join('; ');
    const prompt = `Please explain this Plan Ahead finding: ${item.title}. ${item.message}${facts ? ` Recorded figures: ${facts}.` : ''}${item.action ? ` Possible next step: ${item.action}.` : ''} Help me understand what it means and what I may want to consider.`.slice(0, 950);
    setExplaining(null);
    onAskFinAI(recommendationTopic(item), prompt);
  };

  const discussPlan = (topic: 'general' | 'budget' | 'goals') => {
    const relevant = (data?.recommendations || []).filter((item) => topic === 'general' || recommendationTopic(item) === topic).slice(0, topic === 'general' ? 3 : 2);
    const findings = relevant.map((item) => {
      const facts = evidenceFor(item).map((fact) => `${fact.label}: ${fact.value}`).join(', ');
      return `${item.title}: ${item.message}${facts ? ` (${facts})` : ''}`;
    }).join(' | ');
    const focus = topic === 'budget' ? 'budgets and spending' : topic === 'goals' ? 'savings goals' : 'my overall financial plan';
    const prompt = `Help me understand ${focus} using my latest Plan Ahead results. Summary: ${data?.summary || 'No summary is available.'}${findings ? ` Findings: ${findings}.` : ''} Explain what the recorded data supports, note uncertainty, and suggest one practical option if appropriate.`.slice(0, 950);
    setShowPlanTopics(false);
    onAskFinAI(topic, prompt);
  };

  const health = data?.health_score;
  const hasHealth = !!health?.available && health.score != null;
  const dailyAllowance = data?.budget_daily_allowance;
  const sheetActions = explaining?.actions?.length ? explaining.actions : explaining?.action ? [explaining.action] : [];
  const hasGoalPlans = !!data?.goal_plans?.length;

  return (
    <View style={styles.container}>
      {/* ── Slim top bar ── */}
      <View style={styles.topRow}>
        <View style={styles.topCopy}>
          <Text style={styles.topTitle}>FinAI Planning Advisor</Text>
          <Text style={styles.topMeta} numberOfLines={1}>
            {data?.metrics?.as_of_date ? `Recorded activity as of ${data.metrics.as_of_date}` : 'Checks your spending, budgets, and goals'}
          </Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh your planning analysis" accessibilityState={{ busy: loading, disabled: loading }} onPress={onRefresh} style={styles.refreshButton} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color={TEAL} /> : <Ionicons name="refresh-outline" size={18} color={TEAL} />}
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.stateTitle}>Reviewing your recent activity…</Text>
          <Text style={styles.stateCopy}>Checking your recorded data, then trying AI services. If they’re unavailable, FinAI will still show a data-based plan.</Text>
        </View>
      ) : error && !data ? (
        <View style={styles.stateCard}>
          <Ionicons name="cloud-offline-outline" size={32} color={AMBER} />
          <Text style={styles.stateTitle}>Couldn't load your planning analysis</Text>
          <Text style={styles.stateCopy}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Try loading the analysis again"><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
        </View>
      ) : data ? (
        <>
          {/* ── Hero: health score + safe to spend ── */}
          {(hasHealth || dailyAllowance) && (
            <View style={styles.summaryCard}>
              {hasHealth && health && (
                <>
                  <View style={styles.healthHeader}>
                    <Text style={styles.healthEyebrow}>Financial health</Text>
                    <View style={[styles.healthChip, { backgroundColor: healthTint(health.color) }]}>
                      <Text style={[styles.healthChipText, { color: healthColorValue(health.color) }]}>{health.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.healthScore, { color: healthColorValue(health.color) }]}>{health.score}<Text style={styles.healthScoreOf}>/100</Text></Text>
                  <View style={styles.healthBarTrack}>
                    <View style={[styles.healthBarFill, { width: `${Math.max(0, Math.min(health.score as number, 100))}%`, backgroundColor: healthColorValue(health.color) }]} />
                  </View>
                  <View style={styles.indicatorRow}>
                    {([
                      ['Budget', health.breakdown.budget],
                      ['Goals', health.breakdown.goals],
                      ['Cash flow', health.breakdown.cash_flow],
                    ] as const).map(([label, status]) => {
                      const dot = indicatorDot(status);
                      return (
                        <View key={label} style={[styles.indicatorPill, { backgroundColor: dot.bg }]} accessible accessibilityLabel={`${label}: ${statusWord(status)}`}>
                          <Ionicons name={dot.icon} size={13} color={dot.color} />
                          <Text style={[styles.indicatorLabel, { color: dot.text }]}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {!!dailyAllowance && (
                <View style={[styles.safeRow, hasHealth && styles.safeRowSpaced]}>
                  <View style={styles.safeIcon}><Ionicons name="shield-checkmark-outline" size={19} color={TEAL} /></View>
                  <View style={styles.safeCopy}>
                    <Text style={styles.safeLabel}>Safe to spend today</Text>
                    <Text style={styles.safeBasis} numberOfLines={1}>{dailyAllowance.based_on} {dailyAllowance.period} budget</Text>
                  </View>
                  <Text style={styles.safeAmount}>{peso(dailyAllowance.amount)}</Text>
                </View>
              )}

              {/* Fine print lives behind one tap */}
              <TouchableOpacity
                style={styles.notesToggle}
                onPress={() => { animateLayout(); setShowNotes((v) => !v); }}
                accessibilityRole="button"
                accessibilityLabel={showNotes ? 'Hide notes about these numbers' : 'Show notes about these numbers'}
                accessibilityState={{ expanded: showNotes }}
              >
                <Ionicons name="information-circle-outline" size={15} color={SAGE} />
                <Text style={styles.notesToggleText}>{showNotes ? 'Hide notes' : 'About these numbers'}</Text>
                <Ionicons name={showNotes ? 'chevron-up' : 'chevron-down'} size={14} color={SAGE} />
              </TouchableOpacity>
              {showNotes && (
                <View style={styles.notesBlock}>
                  {hasHealth && <Text style={styles.notesText}>Health score is based on recorded data in at least two areas. It isn’t a full financial assessment.</Text>}
                  {!!dailyAllowance && <Text style={styles.notesText}>The daily allowance covers that budget only. Bills and unrecorded expenses aren’t included.</Text>}
                  {!!data.positive_reinforcement?.basis && <Text style={styles.notesText}>{data.positive_reinforcement.basis}</Text>}
                </View>
              )}
            </View>
          )}

          {/* ── Positive reinforcement: one compact line ── */}
          {!!data.positive_reinforcement && (
            <View style={styles.momentumCard} accessible accessibilityLabel={`${data.positive_reinforcement.message} ${data.positive_reinforcement.on_track_count} of ${data.positive_reinforcement.tracked_budget_count} budgets on track`}>
              <Ionicons name="sparkles" size={17} color={TEAL} />
              <Text style={styles.momentumMessage} numberOfLines={2}>{data.positive_reinforcement.message}</Text>
              <View style={styles.momentumCount}>
                <Text style={styles.momentumCountValue}>{data.positive_reinforcement.on_track_count}/{data.positive_reinforcement.tracked_budget_count}</Text>
                <Text style={styles.momentumCountLabel}>on track</Text>
              </View>
            </View>
          )}

          {/* ── Recommendations first: this is what needs action ── */}
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Your plan</Text>
              <Text style={styles.sectionSubtitle}>
                {!sortedRecommendations.length
                  ? 'No new recommendations'
                  : priorityCount > 0
                    ? `${priorityCount} need attention · ${sortedRecommendations.length} insights`
                    : `${sortedRecommendations.length} insights · no urgent items`}
              </Text>
            </View>
            <View style={styles.countBadge} accessible accessibilityLabel={`${sortedRecommendations.length} recommendations`}><Text style={styles.countText}>{sortedRecommendations.length}</Text></View>
          </View>

          {!sortedRecommendations.length ? (
            <View style={styles.stateCard}>
              {data.metrics?.days_with_records === 0 && !data.metrics?.active_budget_count && !data.metrics?.active_goal_count ? (
                <View style={styles.emptyIcon}><Ionicons name="add-circle-outline" size={30} color={TEAL} /></View>
              ) : (
                <View style={styles.emptyIcon}><Ionicons name="checkmark-circle-outline" size={30} color={TEAL} /></View>
              )}
              <Text style={styles.stateTitle}>
                {data.metrics?.days_with_records === 0 && !data.metrics?.active_budget_count && !data.metrics?.active_goal_count
                  ? 'Add data to start planning'
                  : 'No flags right now 👍'}
              </Text>
              <Text style={styles.stateCopy}>
                {data.metrics?.days_with_records === 0 && !data.metrics?.active_budget_count && !data.metrics?.active_goal_count
                  ? 'Record transactions, set a budget, or create a savings goal to start getting insights.'
                  : 'No issues found in your current data. Keep recording transactions and check back as your situation changes.'}
              </Text>
            </View>
          ) : sortedRecommendations.map((item, index) => {
            // A category can produce separate monthly and annual findings with the
            // same kind/title. Include its budget ID so React and disclosure state
            // treat those findings as distinct cards.
            const identity = item.kind.startsWith('budget_')
              ? String(item.evidence?.budget_id || `${item.evidence?.period || 'budget'}-${index}`)
              : String(item.evidence?.goal_id || item.evidence?.target || index);
            const cardKey = `${item.kind}-${identity}-${item.title}`;
            const period = String(item.evidence?.period || '');
            const categoryName = String(item.evidence?.category || 'Budget');
            const periodName = period ? `${period[0].toUpperCase()}${period.slice(1)}` : 'current';
            const displayTitle = item.kind === 'budget_risk'
              ? `${categoryName} may exceed ${periodName.toLowerCase()} limit`
              : item.kind.startsWith('budget_') && period
                ? `${item.title} · ${periodName}`
                : item.title;
            const isOpen = cardKey in expandedCards ? expandedCards[cardKey] : index === 0;
            const facts = evidenceFor(item);
            // Goal figures already live in "Goal progress" below, so the card skips the grid (the explain sheet still has it).
            const showFacts = facts.length > 0 && !(item.kind.startsWith('goal_') && hasGoalPlans);
            const usedPercent = Number(item.evidence?.percentage_used) || 0;
            const confidence = item.evidence?.confidence;
            const colors = urgencyStyle(item);
            const allActions = (item.actions?.length ? item.actions : item.action ? [item.action] : []).slice(0, 2);
            const keyAction = allActions[0];
            const moreActions = allActions.slice(1);
            const questionButtons = item.context_question?.includes('|')
              ? item.context_question.split('|').map(s => s.trim()).filter(Boolean)
              : item.context_question ? [item.context_question] : [];

            return (
              <View key={cardKey} style={[styles.recommendationCard, { borderLeftColor: colors.border, backgroundColor: colors.bg }]}>
                {/* Always visible: title, status, short summary, progress, one key action */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => toggleCard(cardKey, isOpen)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${colors.badge}: ${displayTitle}. ${isOpen ? 'Collapse' : 'Expand'} details`}
                >
                  <View style={styles.recommendationHeader}>
                    <View style={[styles.recommendationIcon, { backgroundColor: `${colors.border}1A` }]}>
                      <Ionicons name={iconFor(item.kind)} size={19} color={colors.border} />
                    </View>
                    <View style={styles.recommendationHeading}>
                      <Text style={styles.recommendationTitle}>{displayTitle}</Text>
                    </View>
                    <View style={[styles.priorityBadge, { backgroundColor: colors.badgeColor }]}>
                      <Text style={[styles.priorityText, { color: colors.badgeText }]}>{colors.badge}</Text>
                    </View>
                  </View>

                  {!!item.message && (
                    <Text style={styles.recommendationMessage} numberOfLines={isOpen ? undefined : 2}>{item.message}</Text>
                  )}

                  {item.kind.startsWith('budget_') && (
                    <View style={styles.budgetProgressWrap}>
                      <View style={styles.budgetProgressTrack}>
                        <View style={[styles.budgetProgressFill, { width: `${Math.min(usedPercent, 100)}%`, backgroundColor: colors.border }]} />
                        {!!item.evidence?.projected_period_end_spend && !!item.evidence?.limit && (
                          <View style={[styles.budgetProjectedTick, {
                            left: `${Math.min((item.evidence.projected_period_end_spend / item.evidence.limit) * 100, 100)}%`,
                          }]} />
                        )}
                      </View>
                      <View style={styles.budgetProgressMeta}>
                        <Text style={[styles.confidenceText, { color: colors.badgeText }]}>{usedPercent.toFixed(0)}% used</Text>
                        <Text style={styles.confidenceText}>{item.evidence?.days_remaining ?? 0} days left</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>

                {/* One key action, visible even when collapsed */}
                {!!keyAction && (
                  <View style={styles.keyAction}>
                    <Ionicons name="bulb-outline" size={15} color={colors.border} />
                    <Text style={styles.keyActionText} numberOfLines={isOpen ? undefined : 2}>{keyAction}</Text>
                  </View>
                )}

                {/* Revealed on tap */}
                {isOpen && (
                  <View style={styles.cardDetails}>
                    {moreActions.length > 0 && (
                      <View style={styles.suggestionList}>
                        {moreActions.map((action, ai) => (
                          <View key={`action-${ai}`} style={styles.suggestionRow}>
                            <Ionicons name="bulb-outline" size={14} color={colors.border} />
                            <Text style={styles.suggestionText}>{action}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {item.kind.startsWith('budget_') && (
                      <Text style={styles.confidenceLine}>Forecast confidence: {confidence || 'low'}</Text>
                    )}

                    {showFacts && (
                      <View style={styles.evidenceGrid}>
                        {facts.map((fact) => (
                          <View key={fact.label} style={styles.evidenceCell}>
                            <Text style={styles.evidenceLabel}>{fact.label}</Text>
                            <Text style={styles.evidenceValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{fact.value}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {questionButtons.length > 0 && (
                      <View style={styles.questionButtonRow}>
                        {questionButtons.map((q, qi) => (
                          <TouchableOpacity
                            key={`q-${qi}`}
                            style={styles.questionButton}
                            onPress={() => discussRecommendation({ ...item, action: q })}
                            accessibilityRole="button"
                            accessibilityLabel={`Ask Finn: ${q}`}
                          >
                            <Text style={styles.questionButtonText}>{q}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.recommendationActions}>
                      {item.kind.startsWith('budget_') && !!item.evidence?.budget_id && (
                        <TouchableOpacity
                          style={styles.reviewBudgetButton}
                          onPress={() => onReviewBudget({
                            id: String(item.evidence?.budget_id),
                            category_id: String(item.evidence?.category_id || ''),
                            category: String(item.evidence?.category || ''),
                            period: String(item.evidence?.period || ''),
                          })}
                          accessibilityRole="button"
                          accessibilityLabel={`Review ${item.evidence?.category || ''} budget`}
                        >
                          <Ionicons name="create-outline" size={16} color={TEAL} />
                          <Text style={styles.reviewBudgetText}>Review budget</Text>
                        </TouchableOpacity>
                      )}
                      {item.kind === 'spending_pattern' && (
                        <TouchableOpacity style={styles.reviewBudgetButton} onPress={onViewInsights} accessibilityRole="button" accessibilityLabel="Review spending in Insights">
                          <Ionicons name="search-outline" size={16} color={TEAL} />
                          <Text style={styles.reviewBudgetText}>Review spending</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.explainButton} onPress={() => setExplaining(item)} accessibilityRole="button" accessibilityLabel={`How we calculated ${item.title}`}>
                        <Ionicons name="calculator-outline" size={17} color={TEAL} />
                        <Text style={styles.explainButtonText}>How we calculated this</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.cardToggle}
                  onPress={() => toggleCard(cardKey, isOpen)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isOpen ? 'Show less' : 'See details'} for ${item.title}`}
                  accessibilityState={{ expanded: isOpen }}
                >
                  <Text style={styles.cardToggleText}>{isOpen ? 'Show less' : 'See details'}</Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={TEAL} />
                </TouchableOpacity>
              </View>
            );
          })}

          {/* ── Goal progress: compact rows; tap a goal for the full breakdown ── */}
          {hasGoalPlans && (
            <>
              <View style={[styles.sectionHeading, { marginTop: 10 }]}>
                <View>
                  <Text style={styles.sectionTitle}>Goal progress</Text>
                  <Text style={styles.sectionSubtitle}>Tap a goal to see how the pace is worked out</Text>
                </View>
              </View>
              {data.goal_plans!.map((goal, index) => {
                const progress = goal.goal > 0 ? Math.min(100, Math.max(0, (goal.saved / goal.goal) * 100)) : 0;
                const isLagging = goal.suggested_monthly_saving != null && goal.suggested_monthly_saving > 0;
                const goalRecommendation: Recommendation = {
                  kind: 'goal_plan', priority: 'goal', title: goal.target,
                  message: `${peso(goal.saved)} saved of ${peso(goal.goal)} · ${peso(goal.remaining)} to go.`,
                  action: goal.suggested_monthly_saving != null ? `A suggested pace is ${peso(goal.suggested_monthly_saving)} per month; check it fits your budget.` : 'Review the target date and choose a contribution pace that fits your budget.',
                  how_calculated: goal.suggested_monthly_saving != null && goal.days_to_target != null
                    ? `₱${goal.remaining.toLocaleString('en-PH', { maximumFractionDigits: 0 })} remaining ÷ ${goal.days_to_target} days × 30.4375 = ₱${goal.suggested_monthly_saving.toLocaleString('en-PH', { maximumFractionDigits: 0 })}/mo`
                    : undefined,
                  evidence: { saved: goal.saved, goal: goal.goal, remaining: goal.remaining, days_to_target: goal.days_to_target },
                };
                return (
                  <TouchableOpacity
                    key={`${goal.target}-${index}`}
                    style={styles.goalCard}
                    activeOpacity={0.85}
                    onPress={() => setExplaining(goalRecommendation)}
                    accessibilityRole="button"
                    accessibilityLabel={`${goal.target}, ${progress.toFixed(0)} percent saved. Open how we calculated this`}
                  >
                    <View style={styles.goalTopRow}>
                      <View style={styles.goalIcon}><Ionicons name="flag-outline" size={18} color={TEAL} /></View>
                      <View style={styles.goalCopy}>
                        <Text style={styles.goalTitle} numberOfLines={1}>{goal.target}</Text>
                        <Text style={styles.goalAmount}>{peso(goal.saved)} of {peso(goal.goal)}</Text>
                      </View>
                      <View style={styles.goalMetaRight}>
                        <Text style={styles.goalPercent}>{progress.toFixed(0)}%</Text>
                        {goal.days_to_target != null && (
                          <Text style={styles.goalDaysLeft}>{goal.days_to_target}d left</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${progress}%` }]} /></View>
                    <View style={styles.goalBottomRow}>
                      {goal.suggested_monthly_saving != null ? (
                        <View style={[styles.goalPacePill, { backgroundColor: isLagging ? AMBER_BG : GREEN_BG }]}>
                          <Ionicons name="trending-up-outline" size={13} color={isLagging ? AMBER : TEAL} />
                          <Text style={[styles.goalPaceText, { color: isLagging ? AMBER : TEAL }]}>Need {peso(goal.suggested_monthly_saving)}/mo</Text>
                        </View>
                      ) : <View />}
                      <View style={styles.goalDetailsHint}>
                        <Text style={styles.goalDetailsText}>Details</Text>
                        <Ionicons name="chevron-forward" size={14} color={TEAL} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* ── Your numbers (supporting detail, below the actions) ── */}
          <View style={styles.periodCard}>
            <View style={styles.periodHeader}>
              <View>
                <Text style={styles.periodTitle}>Your numbers</Text>
                <Text style={styles.periodCaption}>{periodRangeLabels[selectedPeriod]} · recorded activity</Text>
              </View>
            </View>
            <View style={styles.periodSelector}>
              {(Object.keys(periodLabels) as (keyof typeof periodLabels)[]).map((period) => (
                <TouchableOpacity key={period} onPress={() => setSelectedPeriod(period)} style={[styles.periodOption, selectedPeriod === period && styles.periodOptionActive]} accessibilityRole="button" accessibilityLabel={`Show ${periodLabels[period].toLowerCase()} totals`} accessibilityState={{ selected: selectedPeriod === period }}>
                  <Text style={[styles.periodOptionText, selectedPeriod === period && styles.periodOptionTextActive]}>{periodLabels[period]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedTotals ? <View style={styles.periodMetrics}>
              {[
                { label: 'Income', value: selectedTotals?.income, color: TEAL },
                { label: 'Expenses', value: selectedTotals?.expense, color: RED },
                { label: 'Net', value: selectedTotals?.net, color: Number(selectedTotals?.net || 0) < 0 ? RED : DEEP_GREEN },
              ].map((metric) => (
                <View key={metric.label} style={styles.periodMetric}>
                  <Text style={styles.periodMetricLabel}>{metric.label}</Text>
                  <Text style={[styles.periodMetricValue, { color: metric.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{peso(metric.value)}</Text>
                </View>
              ))}
            </View> : <Text style={styles.periodHint}>Period totals are unavailable. Refresh to load current figures.</Text>}

            {/* Chart is optional detail: one tap to open */}
            {canShowTrend ? (
              <>
                <TouchableOpacity
                  style={styles.inlineToggle}
                  onPress={() => { animateLayout(); setShowTrend((v) => !v); }}
                  accessibilityRole="button"
                  accessibilityLabel={showTrend ? 'Hide income and expense trend' : 'Show income and expense trend'}
                  accessibilityState={{ expanded: showTrend }}
                >
                  <Ionicons name="bar-chart-outline" size={15} color={TEAL} />
                  <Text style={styles.inlineToggleText}>{showTrend ? 'Hide trend' : 'Show trend'}</Text>
                  <Ionicons name={showTrend ? 'chevron-up' : 'chevron-down'} size={14} color={TEAL} />
                </TouchableOpacity>
                {showTrend && (
                  <>
                    <View style={styles.chartArea}>
                      {chartPoints.map((point, index) => (
                        <View key={`${point.label}-${index}`} style={styles.chartColumn}>
                          <View style={styles.chartBars}>
                            <View style={[styles.chartBar, { height: `${point.income > 0 ? Math.max(3, (Number(point.income || 0) / chartMax) * 100) : 0}%`, backgroundColor: TEAL }]} />
                            <View style={[styles.chartBar, { height: `${point.expense > 0 ? Math.max(3, (Number(point.expense || 0) / chartMax) * 100) : 0}%`, backgroundColor: RED }]} />
                          </View>
                          <Text style={styles.chartLabel} numberOfLines={1}>{point.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.chartLegend}>
                      <Text style={styles.chartLegendItem}><Text style={{ color: TEAL }}>●</Text> Income</Text>
                      <Text style={styles.chartLegendItem}><Text style={{ color: RED }}>●</Text> Expenses</Text>
                    </View>
                  </>
                )}
              </>
            ) : selectedTotals && selectedPeriod !== 'day' && !hasPeriodActivity ? (
              <Text style={styles.periodHint}>No transactions recorded this {periodLabels[selectedPeriod].toLowerCase()} yet.</Text>
            ) : null}

            {/* Budget outlook: collapsed, with a one-glance status in the toggle */}
            {periodBudgets.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.inlineToggle}
                  onPress={() => { animateLayout(); setShowOutlook((v) => !v); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${showOutlook ? 'Hide' : 'Show'} ${periodLabels[selectedPeriod].toLowerCase()} budget outlook. ${periodBudgets.length} budgets, ${overBudgetCount} forecast over limit`}
                  accessibilityState={{ expanded: showOutlook }}
                >
                  <Ionicons name="wallet-outline" size={15} color={TEAL} />
                  <Text style={styles.inlineToggleText}>
                    {showOutlook ? 'Hide budget outlook' : `Budget outlook (${periodBudgets.length})`}
                  </Text>
                  {!showOutlook && overBudgetCount > 0 && (
                    <View style={styles.miniAlert}><Text style={styles.miniAlertText}>{overBudgetCount} over</Text></View>
                  )}
                  <Ionicons name={showOutlook ? 'chevron-up' : 'chevron-down'} size={14} color={TEAL} />
                </TouchableOpacity>
                {showOutlook && (
                  <View style={styles.periodBudgetBlock}>
                    {periodBudgets.map((budget, index) => {
                      const pct = Math.min(budget.percentage_used, 100);
                      const isOver = budget.forecast_over_limit;
                      return (
                        <View key={`${budget.category}-${index}`} style={styles.outlookRow}>
                          <View style={styles.outlookTop}>
                            <Text style={styles.outlookName} numberOfLines={1}>{budget.category}</Text>
                            <Text style={styles.outlookMeta}>{peso(budget.spent)} / {peso(budget.limit)} · {pct.toFixed(0)}%</Text>
                            <Ionicons name={isOver ? 'warning' : 'checkmark-circle'} size={15} color={isOver ? RED : TEAL} />
                          </View>
                          <View style={styles.budgetMiniTrack}>
                            <View style={[styles.budgetMiniFill, { width: `${pct}%`, backgroundColor: isOver ? RED : pct >= 70 ? GOLD : TEAL }]} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {data.metrics?.history_truncated && (
              <Text style={styles.coverageNote}>Some older records may be omitted from these totals and comparisons.</Text>
            )}
            <TouchableOpacity style={styles.insightsLink} onPress={onViewInsights} accessibilityRole="button" accessibilityLabel="Explore detailed Insights">
              <Text style={styles.insightsLinkText}>Explore detailed Insights</Text>
              <Ionicons name="arrow-forward" size={16} color={TEAL} />
            </TouchableOpacity>
          </View>

          {/* ── Long-term outlook: collapsed row, opens on tap ── */}
          {data.long_term_outlook?.available && data.long_term_outlook.scenarios && (
            <View style={styles.longTermCard}>
              <TouchableOpacity
                style={styles.longTermHeader}
                onPress={() => { animateLayout(); setShowLongTerm((v) => !v); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`12-month cash-flow scenarios. ${showLongTerm ? 'Collapse' : 'Expand'}`}
                accessibilityState={{ expanded: showLongTerm }}
              >
                <View style={styles.longTermIcon}><Ionicons name="calendar-outline" size={19} color={TEAL} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.longTermTitle}>12-month cash-flow scenarios</Text>
                  <Text style={styles.longTermMeta}>
                    {showLongTerm
                      ? `${data.long_term_outlook?.observed_completed_months || 0} completed months · ${data.long_term_outlook?.confidence || 'insufficient'} confidence`
                      : `Typical ${signedPeso(data.long_term_outlook.scenarios.typical_12_month_net_change)}`}
                  </Text>
                </View>
                <Ionicons name={showLongTerm ? 'chevron-up' : 'chevron-down'} size={18} color={SAGE} />
              </TouchableOpacity>

              {showLongTerm && (
                <>
                  {scenariosAreSimilar ? (
                    <View style={styles.scenarioRow}>
                      <View style={[styles.scenarioCell, styles.singleScenarioCell]}>
                        <Text style={styles.scenarioLabel}>Typical 12-month estimate</Text>
                        <Text style={[styles.scenarioValue, Number(longTermScenarios?.typical_12_month_net_change) < 0 && { color: RED }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {signedPeso(longTermScenarios?.typical_12_month_net_change)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.scenarioRow}>
                      {[
                        { label: 'Cautious', value: longTermScenarios!.cautious_12_month_net_change },
                        { label: 'Typical', value: longTermScenarios!.typical_12_month_net_change },
                        { label: 'Strong', value: longTermScenarios!.strong_12_month_net_change },
                      ].map((scenario) => (
                        <View key={scenario.label} style={styles.scenarioCell}>
                          <Text style={styles.scenarioLabel}>{scenario.label}</Text>
                          <Text style={[styles.scenarioValue, Number(scenario.value) < 0 && { color: RED }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {signedPeso(scenario.value)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {scenariosAreSimilar && (
                    <Text style={styles.longTermNote}>The three estimates are similar because your recorded monthly net results vary little.</Text>
                  )}
                  <Text style={styles.longTermNote}>Recorded net cash-flow scenarios over 12 months, based on observed monthly results. Not projected account balances or guarantees.</Text>
                  <TouchableOpacity style={styles.explainButton} onPress={() => setExplaining({
                    kind: 'long_term_cash_flow', priority: 'plan', title: '12-month cash-flow scenarios',
                    message: 'These scenarios use the 25th, 50th, and 75th percentiles of recorded monthly net cash flow, each extended over 12 months.',
                    action: 'Compare the assumptions with your expected income and expenses before using the scenarios to plan.',
                    how_calculated: `Cautious / typical / strong = 25th / 50th / 75th percentile of observed monthly net cash flow × 12, using ${data.long_term_outlook?.observed_completed_months} completed months.`,
                    evidence: {
                      observed_completed_months: data.long_term_outlook?.observed_completed_months,
                      average_monthly_recorded_income: data.long_term_outlook?.average_monthly_recorded_income,
                      average_monthly_recorded_expenses: data.long_term_outlook?.average_monthly_recorded_expenses,
                      average_monthly_recorded_net_cash_flow: data.long_term_outlook?.average_monthly_recorded_net_cash_flow,
                    },
                  })} accessibilityRole="button" accessibilityLabel="How we calculated the 12-month scenarios">
                    <Ionicons name="information-circle-outline" size={17} color={TEAL} /><Text style={styles.explainButtonText}>How we calculated this</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          <View style={styles.disclosureCard}>
            <Ionicons name="information-circle-outline" size={16} color={SAGE} />
            <Text style={styles.disclosureText}>Forecasts are estimates and may miss unrecorded activity. An AI service may help generate recommendations.</Text>
          </View>

          <TouchableOpacity style={styles.chatButton} onPress={() => setShowPlanTopics(true)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Discuss my plan with Finn">
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={WHITE} />
            <Text style={styles.chatButtonText}>Discuss my plan with Finn</Text>
          </TouchableOpacity>

          {/* ── Explain sheet ── */}
          <Modal visible={!!explaining} transparent animationType="slide" onRequestClose={() => setExplaining(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.explainSheet}>
                <View style={styles.sheetHandle} />
                <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                  <View style={styles.finnNoteHeader}>
                    <Image source={require('../assets/images/finn-advising.gif')} style={styles.finnNoteImage} resizeMode="contain" accessibilityLabel="Finn reviewing your financial figures" />
                    <View style={styles.finnNoteCopy}>
                      <Text style={styles.finnNoteEyebrow}>Finn explains</Text>
                      <Text style={styles.finnNoteTitle}>{explaining?.title}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setExplaining(null)} style={styles.closeSheetButton} accessibilityRole="button" accessibilityLabel="Close explanation"><Ionicons name="close" size={20} color={DEEP_GREEN} /></TouchableOpacity>
                  </View>

                  {/* Most important first: the calculation, then the plain-language finding */}
                  {!!explaining?.how_calculated && (
                    <View style={styles.howCalcBox}>
                      <Text style={styles.howCalcLabel}>How we calculated this</Text>
                      <Text style={styles.howCalcText}>{explaining.how_calculated}</Text>
                    </View>
                  )}

                  <Text style={styles.sheetSectionTitle}>What it means</Text>
                  <Text style={styles.sheetBody}>{explaining?.message}</Text>

                  {sheetActions.length > 0 && <>
                    <Text style={styles.sheetSectionTitle}>{sheetActions.length > 1 ? 'Options to consider' : 'One option to consider'}</Text>
                    {sheetActions.map((action, ai) => (
                      <View key={`sheet-action-${ai}`} style={styles.sheetActionRow}>
                        <Ionicons name="bulb-outline" size={15} color={TEAL} />
                        <Text style={styles.sheetActionText}>{action}</Text>
                      </View>
                    ))}
                  </>}

                  {!!explaining && evidenceFor(explaining).length > 0 && <>
                    <Text style={styles.sheetSectionTitle}>Figures behind it</Text>
                    <View style={styles.sheetEvidence}>
                      {evidenceFor(explaining).map((fact) => <View key={fact.label} style={styles.sheetFact}><Text style={styles.evidenceLabel}>{fact.label}</Text><Text style={styles.evidenceValue}>{fact.value}</Text></View>)}
                    </View>
                  </>}

                  <Text style={styles.sheetCaveat}>{explaining?.kind === 'spending_pattern'
                    ? 'This compares recorded spending so far this month with matching dates in prior months that had recorded expenses. A change in the records does not show its cause, and missing transactions can affect the comparison.'
                    : 'Forecasts are estimates and may omit activity that has not been recorded. Figures are drawn from your FinAI transaction history only.'}</Text>

                  {explaining?.kind.startsWith('budget_') && !!explaining.evidence?.budget_id && (
                    <TouchableOpacity style={styles.reviewBudgetButton} onPress={() => {
                      const evidence = explaining.evidence || {};
                      setExplaining(null);
                      onReviewBudget({
                        id: String(evidence.budget_id),
                        category_id: String(evidence.category_id || ''),
                        category: String(evidence.category || ''),
                        period: String(evidence.period || ''),
                      });
                    }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Review this budget">
                      <Ionicons name="create-outline" size={17} color={TEAL} />
                      <Text style={styles.reviewBudgetText}>Review this budget</Text>
                    </TouchableOpacity>
                  )}
                  {explaining?.kind === 'spending_pattern' && (
                    <TouchableOpacity style={styles.reviewBudgetButton} onPress={() => { setExplaining(null); onViewInsights(); }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Review spending in Insights">
                      <Ionicons name="search-outline" size={17} color={TEAL} />
                      <Text style={styles.reviewBudgetText}>Review spending</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>

                {/* Pinned so it's always reachable without scrolling */}
                <View style={styles.sheetFooter}>
                  <TouchableOpacity style={[styles.chatButton, { marginTop: 0 }]} onPress={() => explaining && discussRecommendation(explaining)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Discuss this with Finn">
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={WHITE} />
                    <Text style={styles.chatButtonText}>Discuss this with Finn</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* ── Discuss plan topics modal ── */}
          <Modal visible={showPlanTopics} transparent animationType="fade" onRequestClose={() => setShowPlanTopics(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.topicSheet}>
                <Text style={styles.sheetSectionTitle}>What would you like to discuss?</Text>
                <Text style={styles.sheetBody}>Finn will open the matching saved conversation with context from your latest Plan Ahead data.</Text>
                {([
                  ['budget', 'Budgets and spending', 'pie-chart-outline'],
                  ['goals', 'Savings goals', 'flag-outline'],
                  ['general', 'Overall plan', 'analytics-outline'],
                ] as const).map(([topic, label, icon]) => <TouchableOpacity key={topic} style={styles.topicOption} onPress={() => discussPlan(topic)} accessibilityRole="button" accessibilityLabel={`Discuss ${label.toLowerCase()}`}>
                  <Ionicons name={icon} size={20} color={TEAL} /><Text style={styles.topicOptionText}>{label}</Text><Ionicons name="chevron-forward" size={17} color={SAGE} />
                </TouchableOpacity>)}
                <TouchableOpacity style={styles.cancelTopicButton} onPress={() => setShowPlanTopics(false)} accessibilityRole="button" accessibilityLabel="Cancel"><Text style={styles.explainButtonText}>Cancel</Text></TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      ) : null}
    </View>
  );
}

// Soft, consistent elevation so cards separate from the cream page without heavy borders.
const softShadow = {
  shadowColor: '#1c3c36',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 30 },

  // Slim top bar
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  topCopy: { flex: 1, minWidth: 0 },
  topTitle: { color: DEEP_GREEN, fontSize: 13, fontWeight: '800' },
  topMeta: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 2 },
  refreshButton: { width: 36, height: 36, borderRadius: 13, backgroundColor: GREEN_BG, alignItems: 'center', justifyContent: 'center' },

  // Hero (health + safe to spend)
  summaryCard: { backgroundColor: WHITE, borderRadius: 24, padding: 18, marginBottom: 12, ...softShadow },
  healthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  healthEyebrow: { color: SAGE, fontSize: 12, fontWeight: '700' },
  healthChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  healthChipText: { fontSize: 12, fontWeight: '900' },
  healthScore: { fontSize: 46, fontWeight: '900', lineHeight: 52, marginTop: 4 },
  healthScoreOf: { fontSize: 18, fontWeight: '700', color: SAGE },
  healthBarTrack: { height: 8, backgroundColor: TRACK, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  healthBarFill: { height: '100%', borderRadius: 4 },
  indicatorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  indicatorPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  indicatorLabel: { fontSize: 12, fontWeight: '800' },
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: GREEN_BG, borderRadius: 16, padding: 12 },
  safeRowSpaced: { marginTop: 16 },
  safeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  safeCopy: { flex: 1, minWidth: 0 },
  safeLabel: { color: DEEP_GREEN, fontSize: 13, fontWeight: '800' },
  safeBasis: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 2 },
  safeAmount: { color: DEEP_GREEN, fontSize: 24, fontWeight: '900' },
  notesToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 12, paddingVertical: 4 },
  notesToggleText: { color: SAGE, fontSize: 11, fontWeight: '700' },
  notesBlock: { gap: 6, marginTop: 4 },
  notesText: { color: SAGE, fontSize: 11, lineHeight: 16 },

  // Momentum (compact)
  momentumCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GREEN_BG, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 16 },
  momentumMessage: { flex: 1, minWidth: 0, color: DEEP_GREEN, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  momentumCount: { minWidth: 52, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 7, borderRadius: 12, backgroundColor: WHITE },
  momentumCountValue: { color: TEAL, fontSize: 14, fontWeight: '900' },
  momentumCountLabel: { color: SAGE, fontSize: 9, fontWeight: '700', marginTop: 1 },

  // Your numbers
  periodCard: { backgroundColor: WHITE, borderRadius: 22, padding: 16, marginTop: 10, marginBottom: 12, ...softShadow },
  periodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  periodTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '900' },
  periodCaption: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 3 },
  periodSelector: { flexDirection: 'row', backgroundColor: CREAM, padding: 4, borderRadius: 13, marginTop: 12 },
  periodOption: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  periodOptionActive: { backgroundColor: DEEP_GREEN },
  periodOptionText: { color: SAGE, fontSize: 12, fontWeight: '800' },
  periodOptionTextActive: { color: WHITE },
  periodMetrics: { flexDirection: 'row', gap: 8, marginTop: 12 },
  periodMetric: { flex: 1, minWidth: 0, padding: 10, borderRadius: 12, backgroundColor: CREAM },
  periodMetricLabel: { color: SAGE, fontSize: 10, fontWeight: '700' },
  periodMetricValue: { fontSize: 14, fontWeight: '900', marginTop: 5 },
  inlineToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 12, paddingVertical: 4 },
  inlineToggleText: { color: TEAL, fontSize: 12, fontWeight: '800' },
  miniAlert: { backgroundColor: 'rgba(217,76,67,0.12)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  miniAlertText: { color: RED, fontSize: 10, fontWeight: '800' },
  chartArea: { height: 115, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: 12, marginTop: 8, borderBottomWidth: 1, borderBottomColor: TRACK },
  chartColumn: { flex: 1, alignItems: 'center', height: '100%', minWidth: 0 },
  chartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  chartBar: { width: 7, minHeight: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartLabel: { color: SAGE, fontSize: 9, marginTop: 5, marginBottom: 3 },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 9 },
  chartLegendItem: { color: SAGE, fontSize: 10, fontWeight: '700' },
  periodHint: { color: SAGE, fontSize: 11, lineHeight: 16, marginTop: 12 },
  coverageNote: { color: AMBER, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 10 },
  periodBudgetBlock: { marginTop: 4 },
  outlookRow: { paddingVertical: 7 },
  outlookTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  outlookName: { flex: 1, color: DEEP_GREEN, fontSize: 12, fontWeight: '800' },
  outlookMeta: { color: SAGE, fontSize: 10, fontWeight: '600' },
  budgetMiniTrack: { height: 5, backgroundColor: TRACK, borderRadius: 3, overflow: 'hidden' },
  budgetMiniFill: { height: '100%', borderRadius: 3 },
  insightsLink: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: TRACK, paddingTop: 12, marginTop: 13 },
  insightsLinkText: { color: TEAL, fontSize: 12, fontWeight: '800' },

  // Long-term (collapsible)
  longTermCard: { backgroundColor: WHITE, borderRadius: 20, padding: 14, marginTop: 6, marginBottom: 6, ...softShadow },
  longTermHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  longTermIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(61,125,108,0.1)', alignItems: 'center', justifyContent: 'center' },
  longTermTitle: { color: DEEP_GREEN, fontSize: 14, fontWeight: '900' },
  longTermMeta: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },
  scenarioRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  scenarioCell: { flex: 1, minWidth: 0, backgroundColor: CREAM, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 11 },
  singleScenarioCell: { flex: 0, width: '100%' },
  scenarioLabel: { color: SAGE, fontSize: 10, fontWeight: '700' },
  scenarioValue: { color: DEEP_GREEN, fontSize: 13, fontWeight: '900', marginTop: 5 },
  longTermNote: { color: SAGE, fontSize: 11, lineHeight: 16, marginTop: 11 },

  // Section headings
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 3 },
  countBadge: { minWidth: 30, height: 30, paddingHorizontal: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,125,108,0.12)' },
  countText: { color: TEAL, fontSize: 13, fontWeight: '900' },

  // Recommendation cards
  recommendationCard: { borderRadius: 20, padding: 15, marginBottom: 12, borderLeftWidth: 4, ...softShadow },
  recommendationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  recommendationIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recommendationHeading: { flex: 1, minWidth: 0 },
  recommendationTitle: { color: DEEP_GREEN, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  recommendationMessage: { color: BODY, fontSize: 13, lineHeight: 18, marginTop: 8, fontWeight: '600' },
  priorityBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9 },
  priorityText: { fontSize: 11, fontWeight: '800' },
  keyAction: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(28,60,54,0.08)' },
  keyActionText: { flex: 1, color: DEEP_GREEN, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  cardDetails: { marginTop: 2 },
  cardToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginTop: 10, paddingVertical: 4 },
  cardToggleText: { color: TEAL, fontSize: 12, fontWeight: '800' },
  confidenceLine: { color: SAGE, fontSize: 11, fontWeight: '700', marginTop: 10, textTransform: 'capitalize' },

  // Budget progress with projected tick
  budgetProgressWrap: { marginTop: 12 },
  budgetProgressTrack: { height: 8, backgroundColor: TRACK, borderRadius: 4, overflow: 'visible', position: 'relative' },
  budgetProgressFill: { height: '100%', borderRadius: 4 },
  budgetProjectedTick: { position: 'absolute', top: -3, width: 2, height: 14, backgroundColor: DEEP_GREEN, borderRadius: 1 },
  budgetProgressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  confidenceText: { color: SAGE, fontSize: 10, fontWeight: '700' },

  // Evidence grid
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: CREAM, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 6, marginTop: 10, gap: 2 },
  evidenceCell: { width: '48%', paddingHorizontal: 7, paddingVertical: 6 },
  evidenceLabel: { color: SAGE, fontSize: 10, fontWeight: '700' },
  evidenceValue: { color: DEEP_GREEN, fontSize: 13, fontWeight: '900', marginTop: 3 },

  // Extra suggestions
  suggestionList: { gap: 7, marginTop: 10 },
  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  suggestionText: { flex: 1, color: BODY, fontSize: 12, lineHeight: 17, fontWeight: '600' },

  // Context question buttons
  questionButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  questionButton: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, backgroundColor: DEEP_GREEN },
  questionButtonText: { color: WHITE, fontSize: 12, fontWeight: '800' },

  recommendationActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4, marginTop: 4 },

  // Goal cards
  goalCard: { backgroundColor: WHITE, borderRadius: 18, padding: 14, marginBottom: 10, ...softShadow },
  goalTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,125,108,0.1)' },
  goalCopy: { flex: 1, minWidth: 0 },
  goalTitle: { color: DEEP_GREEN, fontSize: 14, fontWeight: '900' },
  goalAmount: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 3 },
  goalMetaRight: { alignItems: 'flex-end' },
  goalPercent: { color: TEAL, fontSize: 15, fontWeight: '900' },
  goalDaysLeft: { color: SAGE, fontSize: 10, fontWeight: '700', marginTop: 2 },
  goalTrack: { height: 8, backgroundColor: TRACK, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  goalFill: { height: '100%', backgroundColor: TEAL, borderRadius: 4 },
  goalBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  goalPacePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 },
  goalPaceText: { fontSize: 12, fontWeight: '800' },
  goalDetailsHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  goalDetailsText: { color: TEAL, fontSize: 12, fontWeight: '800' },

  // Disclosure
  disclosureCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4, marginTop: 10 },
  disclosureText: { flex: 1, color: SAGE, fontSize: 11, lineHeight: 16 },

  // Buttons
  chatButton: { flexDirection: 'row', minHeight: 50, gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: DEEP_GREEN, borderRadius: 16, marginTop: 18, paddingHorizontal: 16 },
  chatButtonText: { color: WHITE, fontSize: 14, fontWeight: '800' },
  explainButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 13, paddingVertical: 4 },
  explainButtonText: { color: TEAL, fontSize: 13, fontWeight: '800' },
  reviewBudgetButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 13, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(61,125,108,0.25)', backgroundColor: 'rgba(61,125,108,0.06)' },
  reviewBudgetText: { color: TEAL, fontSize: 12, fontWeight: '800' },

  // Modals
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,32,29,0.48)' },
  explainSheet: { maxHeight: '86%', backgroundColor: CREAM, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22 },
  sheetScroll: { flexShrink: 1 },
  sheetFooter: { paddingTop: 12 },
  topicSheet: { backgroundColor: CREAM, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 30 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#D5DCD8', alignSelf: 'center', marginBottom: 14 },
  finnNoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  finnNoteImage: { width: 72, height: 80 },
  finnNoteCopy: { flex: 1, minWidth: 0 },
  finnNoteEyebrow: { color: TEAL, fontSize: 12, fontWeight: '800' },
  finnNoteTitle: { color: DEEP_GREEN, fontSize: 17, lineHeight: 22, fontWeight: '900', marginTop: 4 },
  closeSheetButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },

  howCalcBox: { backgroundColor: WHITE, borderRadius: 14, padding: 14, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: TEAL },
  howCalcLabel: { color: TEAL, fontSize: 12, fontWeight: '800', marginBottom: 5 },
  howCalcText: { color: DEEP_GREEN, fontSize: 14, fontWeight: '800', lineHeight: 20, fontFamily: 'SpaceMono-Regular' },

  sheetSectionTitle: { color: DEEP_GREEN, fontSize: 14, fontWeight: '900', marginTop: 16 },
  sheetBody: { color: BODY, fontSize: 13, lineHeight: 19, marginTop: 6 },
  sheetEvidence: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: WHITE, borderRadius: 14, padding: 9, marginTop: 8 },
  sheetFact: { width: '50%', paddingHorizontal: 7, paddingVertical: 6 },
  sheetActionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  sheetActionText: { flex: 1, color: BODY, fontSize: 13, lineHeight: 19 },
  sheetCaveat: { color: SAGE, fontSize: 11, lineHeight: 16, marginTop: 15, marginBottom: 4 },
  topicOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: WHITE, borderRadius: 14, padding: 15, marginTop: 10 },
  topicOptionText: { flex: 1, color: DEEP_GREEN, fontSize: 14, fontWeight: '800' },
  cancelTopicButton: { alignSelf: 'center', padding: 12, marginTop: 4 },

  // State cards
  stateCard: { backgroundColor: WHITE, borderRadius: 22, padding: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14, minHeight: 180, ...softShadow },
  stateTitle: { color: DEEP_GREEN, fontSize: 16, lineHeight: 21, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  stateCopy: { color: SAGE, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  retryButton: { marginTop: 15, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: TEAL },
  retryText: { color: WHITE, fontSize: 13, fontWeight: '800' },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,125,108,0.1)' },
});
