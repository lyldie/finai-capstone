import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, Text, Alert, View, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTransactions } from '../../context/TransactionContext';
import DepositModal from '../../components/DepositModal';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { getGoalEmoji } from '../../utils/goalEmoji';
import { getDisplayEmoji } from '../../components/EmojiPicker';

// ---- FINAI BRAND TOKENS (standardized to match transactions.tsx / index.tsx) ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const TRACK = '#ECE7DD';
const FINAI_CARD_BG = '#FFFFFF';
const ALERT_YELLOW = '#F59E0B';
const CRITICAL_RED = '#FF6259';
const INCOME_GREEN = '#10B981';

// Rotating palette for category breakdown slices (kept distinct from semantic income/expense colors)
const CATEGORY_PALETTE = [DEEP_GREEN, GOLD, TEAL, '#B5563C', '#4A7FB5', '#8B5FBF', '#5FA8A0', '#C77DA0'];

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const formatCurrency = (amount: number) => {
  return '₱' + Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

// Compact label for chart axis (₱1.5k instead of ₱1,500)
const formatCompact = (value: number) => {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${+(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
};

const parseTransactionDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
};

const localDateKey = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const getNiceChartMax = (value: number, sections = 4) => {
  const safeMax = Math.max(Number.isFinite(value) ? value : 0, 100);
  const rawStep = safeMax / sections;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const niceMultiplier = [1, 2, 2.5, 5, 10].find((step) => step >= normalizedStep) || 10;
  return Math.max(100, niceMultiplier * magnitude * sections);
};

// Darker text shade for each semantic color so small pill text stays readable on its tint.
const pillTextColor = (color: string) => {
  if (color === INCOME_GREEN) return '#047857';
  if (color === ALERT_YELLOW) return '#B45309';
  if (color === CRITICAL_RED) return '#D6392F';
  return DEEP_GREEN;
};

// ---------------------------------------------------------------------------
// Small reusable UI pieces (presentation only)
// ---------------------------------------------------------------------------

type SegmentedProps<T extends string> = {
  options: { key: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (key: T) => void;
  // gradient = primary tab switch, subtle = secondary period switch, solid = semantic color switch
  variant?: 'gradient' | 'subtle' | 'solid';
  activeColor?: string;
};

function Segmented<T extends string>({ options, value, onChange, variant = 'subtle', activeColor = DEEP_GREEN }: SegmentedProps<T>) {
  return (
    <View style={segStyles.track}>
      {options.map((opt) => {
        const active = opt.key === value;
        const onLight = variant === 'subtle';
        const iconColor = active ? (onLight ? DEEP_GREEN : '#FFFFFF') : SAGE;
        const content = (
          <>
            {opt.icon ? <Ionicons name={opt.icon} size={16} color={iconColor} style={{ marginRight: 6 }} /> : null}
            <Text style={[segStyles.text, active && (onLight ? segStyles.textActiveDark : segStyles.textActiveLight)]}>{opt.label}</Text>
          </>
        );
        return (
          <TouchableOpacity
            key={opt.key}
            style={segStyles.item}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {active && variant === 'gradient' ? (
              <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[segStyles.pill, segStyles.pillShadow]}>
                {content}
              </LinearGradient>
            ) : (
              <View
                style={[
                  segStyles.pill,
                  active && variant === 'subtle' && segStyles.pillSubtle,
                  active && variant === 'solid' && [segStyles.pillShadow, { backgroundColor: activeColor }],
                ]}
              >
                {content}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[pillStyles.pill, { backgroundColor: color + '1F' }]}>
      <View style={[pillStyles.dot, { backgroundColor: color }]} />
      <Text style={[pillStyles.text, { color: pillTextColor(color) }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ProgressBar({
  progress, colors, height = 10, trackColor = TRACK,
}: { progress: number; colors: [string, string]; height?: number; trackColor?: string }) {
  const pct = Math.min(Math.max(Number(progress) || 0, 0), 100);
  const fillWidth = pct > 0 ? Math.max(pct, 3) : 0; // keep tiny values visible
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden', width: '100%' }}>
      {fillWidth > 0 && (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: `${fillWidth}%`, height: '100%', borderRadius: height / 2 }}
        />
      )}
    </View>
  );
}

export default function InsightsScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<'Stats' | 'Budget'>('Stats');
  const [timeframe, setTimeframe] = useState<'Week' | 'Month' | 'Year'>('Month');
  const [budgetTimeframe, setBudgetTimeframe] = useState<'Week' | 'Month' | 'Year'>('Month');
  const [subTab, setSubTab] = useState<'Income' | 'Expense'>('Expense');
  const [isDepositModalVisible, setIsDepositModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);

  const transactionContext = useTransactions();
  const {
    budgets = [],
    transactions = [],
    isLoading = false,
    categories = [],
    deleteBudget,
    goals = [],
    archiveGoal,
    accounts = [],
    getAccountBalance,
    depositToGoal
  } = transactionContext;

  const periodTypeForTimeframe = { Week: 'weekly', Month: 'monthly', Year: 'annual' } as const;
  const selectedPeriodType = periodTypeForTimeframe[timeframe];
  // Use the same business timezone as backend budgets and advisor analytics.
  const todayKey = localDateKey(new Date());
  const today = parseTransactionDate(todayKey);
  const headerSubtitle = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const activeBudgets = useMemo(() => budgets.filter((budget) =>
    budget.start_date && budget.end_date && budget.start_date <= todayKey && budget.end_date >= todayKey
  ), [budgets, todayKey]);
  const periodTypeForBudgetView = { Week: 'weekly', Month: 'monthly', Year: 'annual' } as const;
  const selectedBudgetPeriodType = periodTypeForBudgetView[budgetTimeframe];
  const budgetsForSelectedPeriod = useMemo(
    () => activeBudgets.filter((budget) => budget.period_type === selectedBudgetPeriodType),
    [activeBudgets, selectedBudgetPeriodType],
  );
  const budgetPool = useMemo(() => {
    const totalLimit = budgetsForSelectedPeriod.reduce(
      (sum, budget) => sum + (Number(budget.available_limit ?? budget.amount) || 0), 0,
    );
    const totalSpent = budgetsForSelectedPeriod.reduce(
      (sum, budget) => sum + (Number(budget.spent) || 0), 0,
    );
    return {
      totalLimit,
      totalSpent,
      remaining: Math.max(totalLimit - totalSpent, 0),
      usage: totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0,
    };
  }, [budgetsForSelectedPeriod]);

  const goalTypes = (transactionContext as any).goalTypes || (transactionContext as any).goal_types || [];

  // Shared time-window predicate so stats, the bar chart, and the category chart all
  // agree on what "this period" means.
  const isInSelectedWindow = (dateString: string) => {
    const d = parseTransactionDate(dateString);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    if (timeframe === 'Year') return d.getFullYear() === currentYear && d <= today;
    if (timeframe === 'Month') return d.getFullYear() === currentYear && d.getMonth() === currentMonth && d <= today;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfWeek.getDate() + 7);
    return d >= startOfWeek && d < startOfNextWeek;
  };

  const stats = useMemo(() => {
    const relevantBudgets = activeBudgets.filter((budget) => budget.period_type === selectedPeriodType);
    const totalBudget = relevantBudgets.reduce((acc, b) => acc + (Number(b.available_limit ?? b.amount) || 0), 0);
    const totalSpent = relevantBudgets.reduce((acc, b) => acc + (Number(b.spent) || 0), 0);

    const usage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // FIX: previously summed ALL transactions ever, regardless of the Week/Month/Year
    // toggle -- even though the card is labeled "Net Cash Flow" under "Key Metrics
    // (Month)". Now scoped to the same window the charts already use.
    const netCashFlow = transactions.reduce((acc, t) => {
      if (!isInSelectedWindow(t.date)) return acc;
      const amount = Number(t.amount) || 0;
      if (t.type === 'Income') return acc + amount;
      if (t.type === 'Expense' && !t.goal_id) return acc - amount;
      return acc;
    }, 0);

    const safeGoals = goals || [];
    const totalTarget = safeGoals.reduce((acc, g) => acc + (Number(g.target_amount) || 0), 0);
    const totalSavings = safeGoals.reduce((acc, g) => acc + (Number(g.current_savings) || 0), 0);
    const overallGoalProgress = totalTarget > 0 ? (totalSavings / totalTarget) * 100 : 0;

    return { totalBudget, totalSpent, usage, netCashFlow, totalTarget, totalSavings, overallGoalProgress };
  }, [activeBudgets, selectedPeriodType, transactions, goals, timeframe]);

  const chartData = useMemo(() => {
    const data: any[] = [];
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const barColor = subTab === 'Income' ? TEAL : CRITICAL_RED;
    const gradientTop = subTab === 'Income' ? '#9AD3C4' : '#FFB8B2';

    if (timeframe === 'Year') {
      const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
      const monthlyTotals = new Array(12).fill(0);

      transactions.forEach(t => {
        if (t.type === subTab && (subTab !== 'Expense' || !t.goal_id)) {
          const d = parseTransactionDate(t.date);
          if (d.getFullYear() === currentYear && d <= today) {
            monthlyTotals[d.getMonth()] += Number(t.amount) || 0;
          }
        }
      });

      months.forEach((m, index) => {
        data.push({
          value: monthlyTotals[index],
          label: m,
          frontColor: barColor,
          gradientColor: gradientTop,
          labelTextStyle: { color: SAGE, fontSize: 11, textAlign: 'center', width: 20 }
        });
      });
    } else if (timeframe === 'Month') {
      // Group the month into real Monday–Sunday calendar weeks. Using day
      // chunks (1–7, 8–14, ...) split weeks differently from the budget/advisor.
      const firstDayOffset = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;
      const weeklyTotals = new Array(6).fill(0);

      transactions.forEach(t => {
        if (t.type === subTab && (subTab !== 'Expense' || !t.goal_id)) {
          const d = parseTransactionDate(t.date);
          if (d.getFullYear() === currentYear && d.getMonth() === currentMonth && d <= today) {
            const weekIndex = Math.floor((d.getDate() - 1 + firstDayOffset) / 7);
            weeklyTotals[weekIndex] += Number(t.amount) || 0;
          }
        }
      });

      weeklyTotals.forEach((value, index) => {
        data.push({
          value,
          label: `W${index + 1}`,
          frontColor: barColor,
          gradientColor: gradientTop,
          labelTextStyle: { color: SAGE, fontSize: 11, textAlign: 'center', width: 24 }
        });
      });
    } else if (timeframe === 'Week') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dailyTotals = new Array(7).fill(0);
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfNextWeek = new Date(startOfWeek);
      startOfNextWeek.setDate(startOfWeek.getDate() + 7);

      transactions.forEach(t => {
        if (t.type === subTab && (subTab !== 'Expense' || !t.goal_id)) {
          const d = parseTransactionDate(t.date);
          if (d >= startOfWeek && d < startOfNextWeek) {
            dailyTotals[(d.getDay() + 6) % 7] += Number(t.amount) || 0;
          }
        }
      });

      days.forEach((d, index) => {
        data.push({
          value: dailyTotals[index],
          label: d,
          frontColor: barColor,
          gradientColor: gradientTop,
          labelTextStyle: { color: SAGE, fontSize: 11, textAlign: 'center', width: 30 }
        });
      });
    }

    return data;
  }, [transactions, timeframe, subTab]);

  const chartMaxValue = getNiceChartMax(Math.max(...chartData.map((item) => Number(item.value) || 0), 0));
  const chartStepValue = chartMaxValue / 4;
  const chartTotal = chartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  // Size bars so the chart always fills the card width (card inner width minus y-axis labels).
  const Y_LABEL_WIDTH = 44;
  const chartInnerWidth = screenWidth - 76 - Y_LABEL_WIDTH;
  const barWidth = timeframe === 'Year' ? 12 : timeframe === 'Week' ? 22 : 28;
  const barSpacing = Math.max(4, Math.floor((chartInnerWidth - 16 - chartData.length * barWidth) / Math.max(chartData.length, 1)));

  // NEW: Category breakdown for the selected type + timeframe (no backend changes needed —
  // every transaction already carries `category`, this is a pure client-side aggregation).
  const categoryChartData = useMemo(() => {
    const totals: { [key: string]: number } = {};

    transactions.forEach(t => {
      if (t.type !== subTab || (subTab === 'Expense' && Boolean(t.goal_id))) return;
      if (!isInSelectedWindow(t.date)) return;
      const cat = t.category || 'General';
      totals[cat] = (totals[cat] || 0) + (Number(t.amount) || 0);
    });

    const entries = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);

    return entries.map(([category, value], index) => ({
      value,
      category,
      icon: getDisplayEmoji(categories.find((item) => item.name === category && item.type === subTab.toLowerCase())?.icon, getCategoryEmoji(category, subTab.toLowerCase())),
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
    }));
  }, [transactions, timeframe, subTab, categories]);

  const categoryChartTotal = useMemo(
    () => categoryChartData.reduce((sum, d) => sum + d.value, 0),
    [categoryChartData]
  );

  const getAlertColor = (percentage: number) => {
    if (percentage >= 100) return CRITICAL_RED;
    if (percentage >= 90) return CRITICAL_RED;
    if (percentage >= 70) return ALERT_YELLOW;
    return INCOME_GREEN;
  };

  const getAlertIconName = (percentage: number): IconName => {
    if (percentage >= 100) return 'alert-circle';
    if (percentage >= 70) return 'warning';
    return 'checkmark-circle';
  };

  const resolvePresetName = (goal: any) => {
    if (goal.goal_type_name) return goal.goal_type_name;
    if (goal.preset_name) return goal.preset_name;
    if (goal.type_name) return goal.type_name;
    if (goal.goal_type?.name) return goal.goal_type.name;
    if (typeof goal.goal_type === 'string' && isNaN(Number(goal.goal_type)) && goal.goal_type.length < 20) {
      return goal.goal_type;
    }
    const typeId = goal.goal_type_id || goal.preset_id || (typeof goal.goal_type === 'string' ? goal.goal_type : null);
    if (typeId && goalTypes.length > 0) {
      const foundType = goalTypes.find((gt: any) => gt.id === typeId || gt._id === typeId);
      if (foundType?.name) return foundType.name;
    }
    return null;
  };

  // ---- derived display values (presentation only) ----
  const hasBudgetForPeriod = stats.totalBudget > 0;
  const adherenceColor = hasBudgetForPeriod ? getAlertColor(stats.usage) : SAGE;
  const adherenceLabel = !hasBudgetForPeriod ? 'No limits' : stats.usage >= 90 ? 'Critical' : stats.usage >= 70 ? 'Warning' : 'On Track';
  const heroAccent = budgetPool.usage >= 70 ? getAlertColor(budgetPool.usage) : '#5FE3B3';
  const budgetPeriodNoun = budgetTimeframe === 'Week' ? 'week' : budgetTimeframe === 'Month' ? 'month' : 'year';
  const budgetPeriodAdj = budgetTimeframe === 'Week' ? 'Weekly' : budgetTimeframe === 'Month' ? 'Monthly' : 'Annual';
  const typeAccent = subTab === 'Income' ? TEAL : CRITICAL_RED;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.stickyHeader}>
        <View style={styles.headerContainer}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconBadge}>
              <Ionicons name="sparkles" size={16} color={GOLD} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Financial Insights</Text>
              <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabOuterContainer}>
          <Segmented
            variant="gradient"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { key: 'Stats', label: 'Analytics', icon: 'pie-chart-outline' },
              { key: 'Budget', label: 'Limits & Goals', icon: 'wallet-outline' },
            ]}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'Stats' ? (
          <View style={styles.viewContainer}>
            <View style={styles.controlSpacing}>
              <Segmented
                variant="subtle"
                value={timeframe}
                onChange={setTimeframe}
                options={[
                  { key: 'Week', label: 'Week' },
                  { key: 'Month', label: 'Month' },
                  { key: 'Year', label: 'Year' },
                ]}
              />
            </View>

            <View style={styles.controlSpacing}>
              <Segmented
                variant="solid"
                activeColor={typeAccent}
                value={subTab}
                onChange={setSubTab}
                options={[
                  { key: 'Income', label: 'Income', icon: 'arrow-down-circle-outline' },
                  { key: 'Expense', label: 'Expenses', icon: 'arrow-up-circle-outline' },
                ]}
              />
            </View>

            <Text style={styles.sectionLabel}>Key Metrics · This {timeframe.toLowerCase()}</Text>
            <View style={styles.kpiGridRow}>
              <View style={styles.finaiKpiCard}>
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconBadge, { backgroundColor: adherenceColor + '1F' }]}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={adherenceColor} />
                  </View>
                  <StatusPill label={adherenceLabel} color={adherenceColor} />
                </View>
                <Text style={styles.kpiMetaText}>Budget Adherence</Text>
                <Text style={[styles.kpiMainValue, { color: hasBudgetForPeriod ? adherenceColor : SAGE }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {hasBudgetForPeriod ? `${Math.max(100 - stats.usage, 0).toFixed(0)}%` : '—'}
                </Text>
                <Text style={styles.kpiCaption} numberOfLines={2}>
                  {hasBudgetForPeriod ? `${stats.usage.toFixed(0)}% of limits used` : 'No limits set yet'}
                </Text>
              </View>

              <View style={styles.finaiKpiCard}>
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconBadge, { backgroundColor: (stats.netCashFlow >= 0 ? INCOME_GREEN : CRITICAL_RED) + '1F' }]}>
                    <Ionicons name={stats.netCashFlow >= 0 ? 'trending-up' : 'trending-down'} size={18} color={stats.netCashFlow >= 0 ? INCOME_GREEN : CRITICAL_RED} />
                  </View>
                  <StatusPill label={stats.netCashFlow >= 0 ? 'Positive' : 'Deficit'} color={stats.netCashFlow >= 0 ? INCOME_GREEN : CRITICAL_RED} />
                </View>
                <Text style={styles.kpiMetaText}>Net Cash Flow</Text>
                <Text style={[styles.kpiMainValue, { color: stats.netCashFlow >= 0 ? DEEP_GREEN : CRITICAL_RED }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {stats.netCashFlow >= 0 ? '+' : ''}{formatCurrency(stats.netCashFlow)}
                </Text>
                <Text style={styles.kpiCaption} numberOfLines={2}>Income minus expenses</Text>
              </View>
            </View>

            <View style={styles.finaiFullKpiCard}>
              <View style={styles.savingsHeaderRow}>
                <View style={[styles.kpiIconBadge, styles.savingsIconBadge]}>
                  <Ionicons name="flag-outline" size={19} color={GOLD} />
                </View>
                <View style={styles.savingsTitleColumn}>
                  <Text style={styles.savingsTitle} numberOfLines={1}>Total Savings Progress</Text>
                  <Text style={styles.savingsSubtitle} numberOfLines={1}>Across all active goals</Text>
                </View>
                <View style={styles.savingsPercentPill}>
                  <Text style={styles.savingsPercentText}>{stats.overallGoalProgress.toFixed(0)}%</Text>
                </View>
              </View>

              <View style={styles.savingsValueRow}>
                <Text style={styles.savingsValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatCurrency(stats.totalSavings)}</Text>
                <Text style={styles.savingsOf} numberOfLines={1}>of {formatCurrency(stats.totalTarget)}</Text>
              </View>

              <ProgressBar progress={stats.overallGoalProgress} colors={[TEAL, INCOME_GREEN]} height={10} />
              <Text style={styles.savingsCaption}>{formatCurrency(Math.max(stats.totalTarget - stats.totalSavings, 0))} to go</Text>
            </View>

            <View style={styles.finaiChartCard}>
              <View style={styles.chartHeaderLayout}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chartTitle}>Overview Chart</Text>
                  <Text style={styles.chartSubtitle}>{subTab} trend this {timeframe.toLowerCase()}</Text>
                </View>
                <View style={styles.chartTotalWrap}>
                  <Text style={styles.chartTotalLabel}>Total</Text>
                  <Text style={[styles.chartTotalValue, { color: typeAccent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {formatCurrency(chartTotal)}
                  </Text>
                </View>
              </View>

              <View style={styles.chartVisualArea}>
                <BarChart
                  data={chartData}
                  barWidth={barWidth}
                  spacing={barSpacing}
                  roundedTop
                  barBorderRadius={6}
                  rulesType="dashed"
                  rulesColor="rgba(28, 60, 54, 0.10)"
                  dashWidth={4}
                  dashGap={5}
                  xAxisThickness={1}
                  xAxisColor="rgba(28, 60, 54, 0.12)"
                  yAxisThickness={0}
                  yAxisTextStyle={{ color: SAGE, fontSize: 11 }}
                  noOfSections={4}
                  maxValue={chartMaxValue}
                  stepValue={chartStepValue}
                  roundToDigits={0}
                  showFractionalValues={false}
                  yAxisLabelPrefix={String.fromCharCode(0x20B1)}
                  yAxisLabelWidth={Y_LABEL_WIDTH}
                  formatYLabel={(label) => formatCompact(Number(label) || 0)}
                  isAnimated={false}
                  showGradient
                  initialSpacing={8}
                  endSpacing={0}
                  width={chartInnerWidth}
                  height={170}
                />
              </View>
              {chartTotal === 0 && (
                <Text style={styles.chartEmptyHint}>No {subTab.toLowerCase()} recorded this {timeframe.toLowerCase()} yet.</Text>
              )}
            </View>

            {/* Category breakdown donut */}
            <View style={styles.finaiChartCard}>
              <View style={styles.chartHeaderLayout}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chartTitle}>{subTab} by Category</Text>
                  <Text style={styles.chartSubtitle}>Breakdown for this {timeframe.toLowerCase()}</Text>
                </View>
                <View style={styles.chartIconBadge}>
                  <Ionicons name="pie-chart" size={16} color={GOLD} />
                </View>
              </View>

              {categoryChartData.length === 0 ? (
                <View style={styles.emptyCategoryState}>
                  <View style={styles.emptyCategoryIcon}>
                    <Ionicons name="pie-chart-outline" size={24} color={SAGE} />
                  </View>
                  <Text style={styles.emptyCategoryText}>No {subTab.toLowerCase()} records for this {timeframe.toLowerCase()}.</Text>
                </View>
              ) : (
                <View>
                  <View style={styles.donutWrap}>
                    <PieChart
                      data={categoryChartData.map(d => ({ value: d.value, color: d.color }))}
                      donut
                      radius={80}
                      innerRadius={56}
                      innerCircleColor={FINAI_CARD_BG}
                      strokeWidth={categoryChartData.length > 1 ? 2 : 0}
                      strokeColor={FINAI_CARD_BG}
                      centerLabelComponent={() => (
                        <View style={styles.donutCenter}>
                          <Text style={styles.donutCenterLabel}>Total</Text>
                          <Text style={styles.donutCenterValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                            {formatCurrency(categoryChartTotal)}
                          </Text>
                        </View>
                      )}
                    />
                  </View>

                  <View style={styles.legendColumn}>
                    {categoryChartData.slice(0, 6).map((entry) => (
                      <View key={entry.category} style={styles.legendRow}>
                        <View style={[styles.legendIcon, { backgroundColor: entry.color + '22' }]}>
                          <Text style={{ fontSize: 18 }}>{entry.icon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.legendTopLine}>
                            <Text style={styles.legendCategory} numberOfLines={1}>{entry.category}</Text>
                            <Text style={styles.legendAmount} numberOfLines={1}>{formatCurrency(entry.value)}</Text>
                          </View>
                          <View style={styles.legendBarRow}>
                            <View style={{ flex: 1 }}>
                              <ProgressBar progress={entry.percentage} colors={[entry.color, entry.color]} height={6} />
                            </View>
                            <Text style={styles.legendPct}>{entry.percentage.toFixed(0)}%</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                    {categoryChartData.length > 6 && (
                      <Text style={styles.legendMore}>+{categoryChartData.length - 6} more categories</Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>
        ) : activeTab === 'Budget' ? (
          <View style={styles.viewContainer}>
            <View style={styles.controlSpacing}>
              <Segmented
                variant="subtle"
                value={budgetTimeframe}
                onChange={setBudgetTimeframe}
                options={[
                  { key: 'Week', label: 'Weekly' },
                  { key: 'Month', label: 'Monthly' },
                  { key: 'Year', label: 'Annual' },
                ]}
              />
            </View>

            <View style={styles.heroShadow}>
              <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.finaiBudgetHeroCard}>
                <View style={styles.heroDecorA} pointerEvents="none" />
                <View style={styles.heroDecorB} pointerEvents="none" />

                <View style={styles.heroHeader}>
                  <View style={styles.heroSummary}>
                    <Text style={styles.heroMetaText}>Remaining this {budgetPeriodNoun}</Text>
                    <Text style={styles.heroAmountValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {formatCurrency(budgetPool.remaining)}
                    </Text>
                  </View>
                  <View style={styles.periodBadge}>
                    <Ionicons name="wallet-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.periodBadgeText}>{budgetPeriodAdj.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={styles.heroBarWrap}>
                  <ProgressBar
                    progress={budgetPool.usage}
                    colors={[heroAccent, heroAccent]}
                    height={12}
                    trackColor="rgba(255,255,255,0.2)"
                  />
                </View>

                <View style={styles.heroFooter}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatLabel}>Spent</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{formatCurrency(budgetPool.totalSpent)}</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatLabel}>Total limit</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{formatCurrency(budgetPool.totalLimit)}</Text>
                  </View>
                  <View style={styles.heroUsedPill}>
                    <Ionicons name={getAlertIconName(budgetPool.usage)} size={15} color={heroAccent} />
                    <Text style={styles.heroUsedText}>{budgetPool.usage.toFixed(0)}% used</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, styles.sectionLabelInRow]}>{budgetPeriodAdj} Category Limits</Text>
              <TouchableOpacity style={styles.finaiAddBtn} onPress={() => router.push('/setbudget')} activeOpacity={0.8}>
                <Ionicons name="add" size={16} color={DEEP_GREEN} />
                <Text style={styles.finaiAddBtnText}>Set Limit</Text>
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <ActivityIndicator size="small" color={DEEP_GREEN} style={{ marginVertical: 20 }} />
            ) : budgetsForSelectedPeriod.length === 0 ? (
              <View style={styles.emptyStateCard}>
                <View style={styles.emptyStateIconCircle}>
                  <Ionicons name="wallet-outline" size={28} color={GOLD} />
                </View>
                <Text style={styles.emptyStateText}>
                  No {budgetPeriodAdj.toLowerCase()} limits yet. Select “Set Limit” to add one.
                </Text>
              </View>
            ) : (
              budgetsForSelectedPeriod.map((item, index) => {
                const categoryInfo = categories.find(c => c.id === item.category_id);
                const categoryName = item.category_name || categoryInfo?.name || 'Unknown';
                const spent = Number(item.spent) || 0;
                const baseLimit = Number(item.amount) || 0;
                const limitAmount = Number(item.available_limit ?? item.amount) || 0;
                const rolloverIn = Number(item.rollover_in) || 0;
                const percentageUsed = Number(item.percentage_used) || 0;
                const periodLabel = `${item.period_type[0].toUpperCase()}${item.period_type.slice(1)} · ${item.period_key}`;
                const alertColor = getAlertColor(percentageUsed);

                return (
                  <TouchableOpacity
                    key={item.id || index}
                    style={styles.categoryBudgetCard}
                    activeOpacity={0.85}
                    onPress={() => router.push({
                      pathname: '/setbudget',
                      params: { id: item.id, category_id: item.category_id, amount: item.amount, period_type: item.period_type }
                    })}
                    onLongPress={() => {
                      Alert.alert('Delete budget?', `Are you sure you want to delete the budget limit for ${categoryName}?`, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => deleteBudget(item.id) }
                      ]);
                    }}
                  >
                    <View style={styles.categoryMainRow}>
                      <View style={styles.categoryLeftPart}>
                        <View style={[styles.categoryIconCircle, { backgroundColor: 'rgba(28, 60, 54, 0.07)' }]}>
                          <Text style={{ fontSize: 20 }}>{getDisplayEmoji(categories.find((category) => category.name === categoryName && category.type === 'expense')?.icon, getCategoryEmoji(categoryName, 'expense'))}</Text>
                        </View>
                        <View style={styles.categoryTextColumn}>
                          <Text style={styles.categoryTitle} numberOfLines={1} ellipsizeMode="tail">{categoryName}</Text>
                          <Text style={styles.categoryPeriodText} numberOfLines={1}>{periodLabel} limit</Text>
                        </View>
                      </View>
                      <View style={styles.categoryRightPart}>
                        <Text style={styles.categoryUsageStats} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{formatCurrency(spent)} / {formatCurrency(limitAmount)}</Text>
                        {item.rollover_enabled && (
                          <Text style={styles.categoryPeriodText}>
                            Base {formatCurrency(baseLimit)} · carry {rolloverIn >= 0 ? '+' : '−'}{formatCurrency(Math.abs(rolloverIn))}
                          </Text>
                        )}
                        <Text style={[styles.categoryRemainingText, { color: alertColor }]}>
                          {formatCurrency(Math.max(limitAmount - spent, 0))} left
                        </Text>
                      </View>
                    </View>

                    <View style={styles.catBarWrap}>
                      <ProgressBar progress={percentageUsed} colors={[alertColor, alertColor]} height={8} />
                    </View>
                    <View style={styles.catFooterRow}>
                      <Text style={styles.catFooterText}>{percentageUsed.toFixed(0)}% used</Text>
                      {percentageUsed >= 70 && (
                        <Text style={[styles.catFooterText, { color: pillTextColor(alertColor), fontWeight: '800' }]}>
                          {percentageUsed >= 100 ? 'Limit reached' : 'Nearing limit'}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            <View style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
              <Text style={[styles.sectionLabel, styles.sectionLabelInRow]}>Active Financial Goals</Text>
              <TouchableOpacity style={styles.finaiAddBtn} onPress={() => router.push('/create-goal')} activeOpacity={0.8}>
                <Ionicons name="add" size={16} color={DEEP_GREEN} />
                <Text style={styles.finaiAddBtnText}>Create Goal</Text>
              </TouchableOpacity>
            </View>

            {(!goals || goals.length === 0) ? (
              <View style={styles.emptyStateCard}>
                <View style={styles.emptyStateIconCircle}>
                  <Ionicons name="flag-outline" size={28} color={GOLD} />
                </View>
                <Text style={styles.emptyStateText}>
                  No financial goals yet. Create one to start tracking your savings progress.
                </Text>
              </View>
            ) : (
              goals.map((goal, index) => {
                const target = Number(goal.target_amount) || 0;
                const saved = Number(goal.current_savings) || 0;
                const progress = target > 0 ? (saved / target) * 100 : 0;
                const presetName = resolvePresetName(goal);
                const preset = goalTypes.find((item: any) => item.id === goal.goal_type_id || item._id === goal.goal_type_id);
                const goalIcon = getDisplayEmoji(preset?.icon, getGoalEmoji(presetName || goal.target_name));

                return (
                  <TouchableOpacity
                    key={goal.id || index}
                    style={[styles.finaiGoalCard, { marginBottom: 14 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedGoal(goal);
                      setIsDepositModalVisible(true);
                    }}
                  >
                    <View style={styles.goalMainLayout}>
                      <View style={styles.goalLeftColumn}>
                        <View style={styles.targetIconCircle}><Text style={{ fontSize: 20 }}>{goalIcon}</Text></View>
                        <View style={styles.goalTitleColumn}>
                          <Text style={styles.finaiGoalTitle} numberOfLines={1} ellipsizeMode="tail">{goal.target_name}</Text>
                          {presetName ? (
                            <View style={styles.presetBadge}>
                              <Text style={styles.presetBadgeText} numberOfLines={1} ellipsizeMode="tail">{presetName}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.finaiGoalDate} numberOfLines={1} ellipsizeMode="tail">Target: {goal.target_date || 'N/A'}</Text>
                        </View>
                      </View>

                      <View style={styles.goalActionsRow}>
                        <TouchableOpacity
                          style={styles.actionIconButton}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          onPress={() => router.push({
                            pathname: '/create-goal',
                            params: {
                              id: goal.id,
                              target_name: goal.target_name,
                              target_amount: goal.target_amount,
                              target_date: goal.target_date,
                              current_savings: goal.current_savings,
                              goal_type_id: (goal as any).goal_type_id || (goal as any).preset_id || (goal as any).goal_type,
                            }
                          })}
                        >
                          <Ionicons name="pencil" size={14} color={DEEP_GREEN} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionIconButton, { backgroundColor: 'rgba(255, 98, 89, 0.12)', marginLeft: 6 }]}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          onPress={() => {
                            Alert.alert(
                              "Archive goal?",
                              `"${goal.target_name}" will move to the Trash Bin. You can restore it at any time.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Archive",
                                  onPress: () => archiveGoal ? archiveGoal(goal.id) : null
                                }
                              ]
                            );
                          }}
                        >
                          <Ionicons name="archive-outline" size={14} color={CRITICAL_RED} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.goalProgressInfoRow}>
                      <Text style={styles.goalProgressStats} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {formatCurrency(saved)} <Text style={styles.goalProgressOf}>/ {formatCurrency(target)}</Text>
                      </Text>
                      <View style={styles.goalPercentPill}>
                        <Text style={styles.goalPercentText} numberOfLines={1}>{progress.toFixed(0)}% saved</Text>
                      </View>
                    </View>

                    <View style={styles.goalBarWrap}>
                      <ProgressBar progress={progress} colors={[TEAL, INCOME_GREEN]} height={9} />
                    </View>
                    <Text style={styles.goalToGo}>{formatCurrency(Math.max(target - saved, 0))} to go</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>

      <DepositModal
        visible={isDepositModalVisible}
        onClose={() => setIsDepositModalVisible(false)}
        selectedGoal={selectedGoal}
        accounts={accounts || []}
        getAccountBalance={getAccountBalance}
        depositToGoal={depositToGoal}
      />

    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CARD_SHADOW = {
  shadowColor: DEEP_GREEN,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
} as const;

const segStyles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: TRACK, borderRadius: 16, padding: 4 },
  item: { flex: 1 },
  pill: { flexDirection: 'row', minHeight: 40, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  pillSubtle: { backgroundColor: '#FFFFFF', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  pillShadow: { shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 },
  text: { fontSize: 14, fontWeight: '700', color: SAGE },
  textActiveDark: { color: DEEP_GREEN, fontWeight: '800' },
  textActiveLight: { color: '#FFFFFF', fontWeight: '800' },
});

const pillStyles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  text: { fontSize: 11, fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },

  // Sticky header + tab switch, separated from scrolling content by a hairline
  stickyHeader: { backgroundColor: CREAM, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28, 60, 54, 0.10)', paddingBottom: 10 },
  headerContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerIconBadge: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(237, 178, 50, 0.16)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontSize: 23, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 12, color: SAGE, fontWeight: '600', marginTop: 1 },
  tabOuterContainer: { paddingHorizontal: 20, marginTop: 10 },

  scrollContent: { paddingBottom: 110 },
  viewContainer: { paddingHorizontal: 20, paddingTop: 16 },
  controlSpacing: { marginBottom: 14 },

  sectionLabel: { fontSize: 17, fontWeight: '800', color: DEEP_GREEN, marginBottom: 14, letterSpacing: -0.2, marginTop: 6 },
  sectionLabelInRow: { marginBottom: 0, marginTop: 0, flex: 1, marginRight: 8 },

  // KPI cards
  kpiGridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  finaiKpiCard: { flex: 1, backgroundColor: FINAI_CARD_BG, borderRadius: 22, padding: 16, ...CARD_SHADOW, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.04)' },
  kpiTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 6 },
  kpiIconBadge: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  kpiMetaText: { fontSize: 13, lineHeight: 18, color: SAGE, fontWeight: '700' },
  kpiMainValue: { fontSize: 25, fontWeight: '800', marginTop: 4, marginBottom: 2, letterSpacing: -0.5 },
  kpiCaption: { fontSize: 12, lineHeight: 16, color: SAGE, fontWeight: '500' },

  // Savings card
  finaiFullKpiCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 22, padding: 18, width: '100%', ...CARD_SHADOW, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.04)' },
  savingsHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  savingsIconBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(237, 178, 50, 0.16)', marginRight: 12 },
  savingsTitleColumn: { flex: 1, minWidth: 0 },
  savingsTitle: { color: DEEP_GREEN, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  savingsSubtitle: { color: SAGE, fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 1 },
  savingsPercentPill: { backgroundColor: 'rgba(16, 185, 129, 0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginLeft: 8 },
  savingsPercentText: { fontSize: 13, fontWeight: '800', color: '#047857' },
  savingsValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 16, marginBottom: 12, gap: 8 },
  savingsValue: { fontSize: 28, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.6, flexShrink: 1 },
  savingsOf: { fontSize: 13, fontWeight: '600', color: SAGE, flexShrink: 1 },
  savingsCaption: { fontSize: 12, fontWeight: '600', color: SAGE, marginTop: 8 },

  // Chart cards
  finaiChartCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 22, padding: 18, ...CARD_SHADOW, marginTop: 4, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.04)' },
  chartHeaderLayout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 },
  chartTitle: { fontSize: 16, fontWeight: '800', color: DEEP_GREEN },
  chartSubtitle: { fontSize: 12, color: SAGE, fontWeight: '600', marginTop: 3 },
  chartTotalWrap: { alignItems: 'flex-end', maxWidth: '48%' },
  chartTotalLabel: { fontSize: 11, color: SAGE, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  chartTotalValue: { fontSize: 20, fontWeight: '800', marginTop: 1, letterSpacing: -0.3 },
  chartIconBadge: { width: 32, height: 32, borderRadius: 11, backgroundColor: 'rgba(237, 178, 50, 0.16)', justifyContent: 'center', alignItems: 'center' },
  chartVisualArea: { width: '100%', alignItems: 'flex-start', overflow: 'hidden', paddingTop: 6 },
  chartEmptyHint: { textAlign: 'center', color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 10 },

  // Donut / category breakdown
  donutWrap: { alignItems: 'center', marginBottom: 20 },
  donutCenter: { alignItems: 'center', width: 96 },
  donutCenterLabel: { color: SAGE, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  donutCenterValue: { color: DEEP_GREEN, fontSize: 17, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 },
  legendColumn: { gap: 14 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendIcon: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  legendTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  legendCategory: { color: DEEP_GREEN, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  legendAmount: { color: DEEP_GREEN, fontSize: 13, fontWeight: '700' },
  legendBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendPct: { color: SAGE, fontSize: 12, fontWeight: '700', width: 34, textAlign: 'right' },
  legendMore: { color: SAGE, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  emptyCategoryState: { paddingVertical: 24, alignItems: 'center' },
  emptyCategoryIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: CREAM, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  emptyCategoryText: { color: SAGE, fontSize: 13, fontWeight: '500', textAlign: 'center' },

  // Budget hero
  heroShadow: { borderRadius: 24, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 5, marginBottom: 26 },
  finaiBudgetHeroCard: { borderRadius: 24, padding: 22, overflow: 'hidden' },
  heroDecorA: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  heroDecorB: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(237, 178, 50, 0.08)', bottom: -50, left: -30 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  heroSummary: { flex: 1, minWidth: 0, marginRight: 4 },
  heroMetaText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  heroAmountValue: { fontSize: 36, fontWeight: '800', color: '#FFFFFF', marginTop: 4, letterSpacing: -1 },
  periodBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, flexShrink: 0 },
  periodBadgeText: { fontSize: 11, color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.6 },
  heroBarWrap: { marginTop: 20, marginBottom: 18 },
  heroFooter: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, minWidth: 0 },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroStatValue: { fontSize: 15, color: '#FFFFFF', fontWeight: '800', marginTop: 2 },
  heroStatDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 12 },
  heroUsedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, marginLeft: 10 },
  heroUsedText: { fontSize: 12, color: '#FFFFFF', fontWeight: '800' },

  // Section headers + add buttons
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  finaiAddBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(28, 60, 54, 0.07)', gap: 4 },
  finaiAddBtnText: { fontSize: 13, fontWeight: '800', color: DEEP_GREEN },

  // Category limit cards
  categoryBudgetCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 20, padding: 17, ...CARD_SHADOW, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.04)' },
  categoryMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryLeftPart: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 },
  categoryIconCircle: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  categoryTitle: { fontSize: 16, fontWeight: '800', color: DEEP_GREEN },
  categoryPeriodText: { fontSize: 12, color: SAGE, marginTop: 3 },
  categoryTextColumn: { marginLeft: 12, flex: 1, minWidth: 0 },
  categoryRightPart: { alignItems: 'flex-end', flexShrink: 1, minWidth: 0, maxWidth: '48%' },
  categoryUsageStats: { fontSize: 15, fontWeight: '800', color: DEEP_GREEN },
  categoryRemainingText: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  catBarWrap: { marginTop: 14 },
  catFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  catFooterText: { fontSize: 12, color: SAGE, fontWeight: '600' },

  // Goal cards
  finaiGoalCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 20, padding: 17, ...CARD_SHADOW, flexDirection: 'column', borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.04)' },
  goalMainLayout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  goalLeftColumn: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 },
  goalTitleColumn: { marginLeft: 12, flex: 1, minWidth: 0 },
  targetIconCircle: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(237, 178, 50, 0.16)', justifyContent: 'center', alignItems: 'center' },
  finaiGoalTitle: { fontSize: 16, fontWeight: '800', color: DEEP_GREEN },
  finaiGoalDate: { fontSize: 12, color: SAGE, marginTop: 3 },
  presetBadge: { backgroundColor: 'rgba(61, 125, 108, 0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginTop: 4 },
  presetBadgeText: { fontSize: 10, fontWeight: '800', color: TEAL },
  goalActionsRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  actionIconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(28, 60, 54, 0.07)', justifyContent: 'center', alignItems: 'center' },
  goalProgressInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 8 },
  goalProgressStats: { fontSize: 16, fontWeight: '800', color: DEEP_GREEN, flexShrink: 1 },
  goalProgressOf: { fontSize: 13, fontWeight: '600', color: SAGE },
  goalPercentPill: { backgroundColor: 'rgba(16, 185, 129, 0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  goalPercentText: { fontSize: 12, color: '#047857', fontWeight: '800' },
  goalBarWrap: { marginTop: 10 },
  goalToGo: { fontSize: 12, fontWeight: '600', color: SAGE, marginTop: 8 },

  // Empty states
  emptyStateCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 22, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', ...CARD_SHADOW, marginBottom: 14 },
  emptyStateIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: CREAM, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyStateText: { color: SAGE, textAlign: 'center', fontSize: 15, fontWeight: '600', lineHeight: 22 },
});
