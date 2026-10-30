import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, Alert, View, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTransactions } from '../../context/TransactionContext';
import DepositModal from '../../components/DepositModal';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { getGoalEmoji } from '../../utils/goalEmoji';
import { getDisplayEmoji } from '../../components/EmojiPicker';
import { getBudgetStatusColor } from '../../utils/budgetThresholdColors';

// ---------------------------------------------------------------------------
// Design tokens (same FinAI palette)
// ---------------------------------------------------------------------------
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const TRACK = '#ECE7DD';
const CARD_BG = '#FFFFFF';
const ALERT_YELLOW = '#F59E0B';
const CRITICAL_RED = '#FF6259';
const INCOME_GREEN = '#10B981';
const HAIRLINE = 'rgba(28, 60, 54, 0.08)';

// One radius + one spacing rhythm for the whole screen
const RADIUS = 20;
const GAP = 20; // vertical gap between sections
const SCREEN_PAD = 20;

// One type scale for the whole screen
const TYPE = {
  title: 22,
  section: 17,
  cardTitle: 15,
  body: 14,
  caption: 12,
  micro: 11,
};

// Space reserved so the last item never hides behind the bottom tab bar
const BOTTOM_NAV_CLEARANCE = 130;

const CATEGORY_PALETTE = [DEEP_GREEN, GOLD, TEAL, '#B5563C', '#4A7FB5', '#8B5FBF', '#5FA8A0', '#C77DA0'];
const VISIBLE_CATEGORIES = 5;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const formatCurrency = (amount: number) =>
  String.fromCharCode(0x20b1) + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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

const formatShortDate = (value?: string) => {
  if (!value) return 'No date';
  const d = parseTransactionDate(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ---------------------------------------------------------------------------
// Tones: ONE system for every badge / status text on the screen
// ---------------------------------------------------------------------------
type Tone = 'success' | 'warn' | 'danger' | 'neutral';

const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  success: { bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857', dot: INCOME_GREEN },
  warn: { bg: 'rgba(245, 158, 11, 0.14)', fg: '#B45309', dot: ALERT_YELLOW },
  danger: { bg: 'rgba(255, 98, 89, 0.14)', fg: '#D6392F', dot: CRITICAL_RED },
  neutral: { bg: 'rgba(124, 154, 149, 0.16)', fg: '#4F6B66', dot: SAGE },
};

const toneForPercent = (pct: number): Tone => (pct >= 100 ? 'danger' : pct >= 70 ? 'warn' : 'success');

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------
function Badge({ label, tone = 'neutral', dot = false }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = TONES[tone];
  return (
    <View style={[badgeStyles.badge, { backgroundColor: t.bg }]}>
      {dot ? <View style={[badgeStyles.dot, { backgroundColor: t.dot }]} /> : null}
      <Text style={[badgeStyles.text, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ProgressBar({
  progress, colors, height = 8, trackColor = TRACK,
}: { progress: number; colors: [string, string]; height?: number; trackColor?: string }) {
  const pct = Math.min(Math.max(Number(progress) || 0, 0), 100);
  const fillWidth = pct > 0 ? Math.max(pct, 3) : 0;
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

function SectionHeader({
  title, subtitle, actionLabel, onAction,
}: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={sectionStyles.row}>
      <View style={sectionStyles.textWrap}>
        <Text style={sectionStyles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={sectionStyles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity style={sectionStyles.action} onPress={onAction} activeOpacity={0.8} accessibilityRole="button">
          <Ionicons name="add" size={16} color={DEEP_GREEN} />
          <Text style={sectionStyles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type SegmentedProps<T extends string> = {
  options: { key: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (key: T) => void;
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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function InsightsScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<'Stats' | 'Budget'>('Stats');
  const [timeframe, setTimeframe] = useState<'Week' | 'Month' | 'Year'>('Month');
  const [budgetTimeframe, setBudgetTimeframe] = useState<'Week' | 'Month' | 'Year'>('Month');
  const [subTab, setSubTab] = useState<'Income' | 'Expense'>('Expense');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [isDepositModalVisible, setIsDepositModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [draftDate, setDraftDate] = useState(new Date());
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<string[]>([]);
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);

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
    depositToGoal,
  } = transactionContext;

  const periodTypeForTimeframe = { Week: 'weekly', Month: 'monthly', Year: 'annual' } as const;
  const selectedPeriodType = periodTypeForTimeframe[timeframe];
  const todayKey = localDateKey(new Date());
  const today = parseTransactionDate(todayKey);
  const headerSubtitle = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const periodLower = timeframe.toLowerCase();
  const hasCustomRange = Boolean(customStart && customEnd);

  const activeBudgets = useMemo(() => budgets.filter((budget) =>
    budget.start_date && budget.end_date && budget.start_date <= todayKey && budget.end_date >= todayKey
  ), [budgets, todayKey]);

  const selectedBudgetPeriodType = periodTypeForTimeframe[budgetTimeframe];
  const budgetsForSelectedPeriod = useMemo(
    () => activeBudgets
      .filter((budget) => budget.period_type === selectedBudgetPeriodType)
      // Most urgent limits first so users see what needs attention
      .sort((a, b) => (Number(b.percentage_used) || 0) - (Number(a.percentage_used) || 0)),
    [activeBudgets, selectedBudgetPeriodType],
  );

  const budgetPool = useMemo(() => {
    const totalLimit = budgetsForSelectedPeriod.reduce((sum, b) => sum + (Number(b.available_limit ?? b.amount) || 0), 0);
    const totalSpent = budgetsForSelectedPeriod.reduce((sum, b) => sum + (Number(b.spent) || 0), 0);
    return {
      totalLimit,
      totalSpent,
      remaining: Math.max(totalLimit - totalSpent, 0),
      usage: totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0,
    };
  }, [budgetsForSelectedPeriod]);

  const goalTypes = (transactionContext as any).goalTypes || (transactionContext as any).goal_types || [];

  // Shared time-window predicate so stats, bar chart and category chart agree.
  const isInSelectedWindow = (dateString: string) => {
    if (hasCustomRange) return dateString >= customStart && dateString <= customEnd;
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

    const safeGoals = goals || [];
    const totalTarget = safeGoals.reduce((acc, g) => acc + (Number(g.target_amount) || 0), 0);
    const totalSavings = safeGoals.reduce((acc, g) => acc + (Number(g.current_savings) || 0), 0);
    const overallGoalProgress = totalTarget > 0 ? (totalSavings / totalTarget) * 100 : 0;

    return { totalBudget, totalSpent, usage, totalTarget, totalSavings, overallGoalProgress };
  }, [activeBudgets, selectedPeriodType, goals]);

  const chartData = useMemo(() => {
    const data: any[] = [];
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const barColor = subTab === 'Income' ? TEAL : CRITICAL_RED;
    const gradientTop = subTab === 'Income' ? '#9AD3C4' : '#FFB8B2';
    const labelStyle = (width: number) => ({ color: SAGE, fontSize: TYPE.micro, textAlign: 'center', width });

    if (hasCustomRange) {
      const start = parseTransactionDate(customStart);
      const end = parseTransactionDate(customEnd);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const bucketDays = days <= 14 ? 1 : 7;
      const bucketCount = Math.ceil(days / bucketDays);
      const totals = new Array(bucketCount).fill(0);
      transactions.forEach((t) => {
        if (t.type !== subTab || (subTab === 'Expense' && Boolean(t.goal_id)) || !isInSelectedWindow(t.date)) return;
        const offset = Math.floor((parseTransactionDate(t.date).getTime() - start.getTime()) / 86400000);
        totals[Math.min(Math.floor(offset / bucketDays), bucketCount - 1)] += Number(t.amount) || 0;
      });
      totals.forEach((value, index) => {
        const bucketStart = new Date(start);
        bucketStart.setDate(start.getDate() + index * bucketDays);
        data.push({ value, label: bucketDays === 1 ? `${bucketStart.getDate()}` : `${bucketStart.getDate()}/${bucketStart.getMonth() + 1}`, frontColor: barColor, gradientColor: gradientTop, labelTextStyle: labelStyle(30) });
      });
    } else if (timeframe === 'Year') {
      const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
      const monthlyTotals = new Array(12).fill(0);
      transactions.forEach(t => {
        if (t.type === subTab && (subTab !== 'Expense' || !t.goal_id)) {
          const d = parseTransactionDate(t.date);
          if (d.getFullYear() === currentYear && d <= today) monthlyTotals[d.getMonth()] += Number(t.amount) || 0;
        }
      });
      months.forEach((m, index) => {
        data.push({ value: monthlyTotals[index], label: m, frontColor: barColor, gradientColor: gradientTop, labelTextStyle: labelStyle(20) });
      });
    } else if (timeframe === 'Month') {
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
        data.push({ value, label: `W${index + 1}`, frontColor: barColor, gradientColor: gradientTop, labelTextStyle: labelStyle(24) });
      });
    } else {
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
          if (d >= startOfWeek && d < startOfNextWeek) dailyTotals[(d.getDay() + 6) % 7] += Number(t.amount) || 0;
        }
      });
      days.forEach((d, index) => {
        data.push({ value: dailyTotals[index], label: d, frontColor: barColor, gradientColor: gradientTop, labelTextStyle: labelStyle(30) });
      });
    }
    return data;
  }, [transactions, timeframe, subTab, hasCustomRange, customStart, customEnd]);

  const chartMaxValue = getNiceChartMax(Math.max(...chartData.map((item) => Number(item.value) || 0), 0));
  const chartStepValue = chartMaxValue / 4;
  const chartTotal = chartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  // screen padding (20*2) + card padding (20*2) + y-axis labels
  const Y_LABEL_WIDTH = 44;
  const chartInnerWidth = screenWidth - SCREEN_PAD * 2 - 40 - Y_LABEL_WIDTH;
  const barWidth = chartData.length > 14 ? 12 : chartData.length > 8 ? 16 : timeframe === 'Year' ? 12 : timeframe === 'Week' ? 22 : 28;
  const barSpacing = Math.max(4, Math.floor((chartInnerWidth - 16 - chartData.length * barWidth) / Math.max(chartData.length, 1)));

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
      icon: getDisplayEmoji(
        categories.find((item) => item.name === category && item.type === subTab.toLowerCase())?.icon,
        getCategoryEmoji(category, subTab.toLowerCase()),
      ),
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
    }));
  }, [transactions, timeframe, subTab, categories, hasCustomRange, customStart, customEnd]);

  const merchantBreakdown = useMemo(() => {
    if (subTab !== 'Expense') return [];
    const totals = new Map<string, { name: string; value: number }>();
    transactions.forEach((t: any) => {
      if (t.type !== 'Expense' || t.goal_id || !isInSelectedWindow(t.date)) return;
      const note = String(t.note || t.title || t.item_name || '');
      const receiptMerchant = note.match(/^Scanned from\s+(.+?)[.!]?$/i)?.[1]?.trim();
      const merchant = String(t.merchant || t.merchant_name || receiptMerchant || '').trim();
      if (!merchant) return;
      const key = merchant.toLocaleLowerCase();
      const current = totals.get(key);
      if (current === undefined) totals.set(key, { name: merchant, value: Number(t.amount) || 0 });
      else current.value += Number(t.amount) || 0;
    });
    return Array.from(totals.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [transactions, subTab, hasCustomRange, customStart, customEnd, timeframe]);

  const categoryChartTotal = useMemo(() => categoryChartData.reduce((sum, d) => sum + d.value, 0), [categoryChartData]);
  const visibleCategories = showAllCategories ? categoryChartData : categoryChartData.slice(0, VISIBLE_CATEGORIES);
  const hiddenCategoryCount = Math.max(categoryChartData.length - VISIBLE_CATEGORIES, 0);

  const resolvePresetName = (goal: any) => {
    if (goal.goal_type_name) return goal.goal_type_name;
    if (goal.preset_name) return goal.preset_name;
    if (goal.type_name) return goal.type_name;
    if (goal.goal_type?.name) return goal.goal_type.name;
    if (typeof goal.goal_type === 'string' && isNaN(Number(goal.goal_type)) && goal.goal_type.length < 20) return goal.goal_type;
    const typeId = goal.goal_type_id || goal.preset_id || (typeof goal.goal_type === 'string' ? goal.goal_type : null);
    if (typeId && goalTypes.length > 0) {
      const foundType = goalTypes.find((gt: any) => gt.id === typeId || gt._id === typeId);
      if (foundType?.name) return foundType.name;
    }
    return null;
  };

  // ---- derived display values ----
  const hasBudgetForPeriod = stats.totalBudget > 0;
  const budgetTone: Tone = hasBudgetForPeriod ? toneForPercent(stats.usage) : 'neutral';
  const budgetBadge = !hasBudgetForPeriod
    ? 'No limits set'
    : stats.usage > 100 ? 'Over budget'
    : stats.usage >= 100 ? 'Limit reached'
    : stats.usage >= 70 ? 'Watch spending'
    : 'On track';
  const remainingBudget = stats.totalBudget - stats.totalSpent;
  const remainingBudgetTone: Tone = !hasBudgetForPeriod ? 'neutral' : remainingBudget < 0 ? 'danger' : 'success';
  const remainingBudgetBadge = !hasBudgetForPeriod
    ? 'No limits'
    : remainingBudget < 0
      ? 'Over budget'
      : remainingBudget === 0
        ? 'Limit reached'
        : 'Available';
  const heroAccent = budgetPool.usage >= 70 ? getBudgetStatusColor(budgetPool.usage) : '#5FE3B3';
  const budgetPeriodNoun = budgetTimeframe === 'Week' ? 'week' : budgetTimeframe === 'Month' ? 'month' : 'year';
  const budgetPeriodAdj = budgetTimeframe === 'Week' ? 'Weekly' : budgetTimeframe === 'Month' ? 'Monthly' : 'Annual';
  const typeAccent = subTab === 'Income' ? TEAL : CRITICAL_RED;
  const heroUsedIcon: IconName = budgetPool.usage >= 100 ? 'alert-circle' : budgetPool.usage >= 70 ? 'warning' : 'checkmark-circle';

  const openDatePicker = (target: 'start' | 'end') => {
    const selected = target === 'start' ? customStart : customEnd;
    setDraftDate(selected ? parseTransactionDate(selected) : today);
    setDatePickerTarget(target);
  };
  const applyDate = (target: 'start' | 'end', value: Date) => {
    const key = localDateKey(value);
    if (target === 'start') {
      setCustomStart(key);
      if (customEnd && key > customEnd) setCustomEnd(key);
    } else {
      setCustomEnd(key);
      if (customStart && key < customStart) setCustomStart(key);
    }
    setDatePickerTarget(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Sticky header */}
      <View style={styles.stickyHeader}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerIconBadge}>
            <Ionicons name="sparkles" size={16} color={GOLD} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Insights</Text>
            <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
          </View>
        </View>

        <View style={styles.tabWrap}>
          <Segmented
            variant="gradient"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { key: 'Stats', label: 'Overview', icon: 'pie-chart-outline' },
              { key: 'Budget', label: 'Limits & Goals', icon: 'wallet-outline' },
            ]}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'Stats' ? (
          <View style={styles.viewContainer}>
            {/* ---------------- Savings (all-time) ---------------- */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.rowCenter}>
                  <View style={[styles.iconTile, { backgroundColor: 'rgba(237, 178, 50, 0.16)' }]}>
                    <Ionicons name="flag-outline" size={18} color={GOLD} />
                  </View>
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.cardTitle}>Savings goals</Text>
                    <Text style={styles.caption}>All goals, any time period</Text>
                  </View>
                </View>
                <Badge label={`${stats.overallGoalProgress.toFixed(0)}%`} tone="success" />
              </View>

              <View style={styles.bigValueRow}>
                <Text style={styles.bigValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatCurrency(stats.totalSavings)}</Text>
                <Text style={styles.bigValueSuffix} numberOfLines={1}>of {formatCurrency(stats.totalTarget)}</Text>
              </View>

              <ProgressBar progress={stats.overallGoalProgress} colors={[TEAL, INCOME_GREEN]} height={10} />
              <Text style={[styles.caption, { marginTop: 8 }]}>{formatCurrency(Math.max(stats.totalTarget - stats.totalSavings, 0))} to go</Text>
            </View>

            {/* ---------------- Period controls ---------------- */}
            <SectionHeader title={hasCustomRange ? 'Custom date range' : `This ${periodLower}`} subtitle="Charts and breakdowns follow your selected dates." />
            <View style={styles.controlStack}>
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
              <Segmented
                variant="solid"
                activeColor={typeAccent}
                value={subTab}
                onChange={setSubTab}
                options={[
                  { key: 'Income', label: 'Income', icon: 'arrow-down-circle-outline' },
                  { key: 'Expense', label: 'Spending', icon: 'arrow-up-circle-outline' },
                ]}
              />
            </View>

            <View style={styles.dateRangeCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateRangeTitle}>Custom date range</Text>
                <Text style={styles.dateRangeSubtitle}>{hasCustomRange ? `${customStart} to ${customEnd}` : 'Optional · filter the charts and breakdowns'}</Text>
              </View>
              <TouchableOpacity style={styles.dateRangeButton} onPress={() => openDatePicker('start')} accessibilityRole="button" accessibilityLabel="Choose start date">
                <Ionicons name="calendar-outline" size={16} color={DEEP_GREEN} />
                <Text style={styles.dateRangeButtonText}>{customStart || 'Start'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateRangeButton} onPress={() => openDatePicker('end')} accessibilityRole="button" accessibilityLabel="Choose end date">
                <Ionicons name="calendar-outline" size={16} color={DEEP_GREEN} />
                <Text style={styles.dateRangeButtonText}>{customEnd || 'End'}</Text>
              </TouchableOpacity>
              {hasCustomRange ? <TouchableOpacity onPress={() => { setCustomStart(''); setCustomEnd(''); }} accessibilityRole="button" accessibilityLabel="Clear custom dates"><Ionicons name="close-circle" size={20} color={SAGE} /></TouchableOpacity> : null}
            </View>
            {datePickerTarget && Platform.OS === 'ios' ? (
              <Modal transparent animationType="fade" visible onRequestClose={() => setDatePickerTarget(null)}>
                <View style={styles.datePickerOverlay}>
                  <View style={styles.datePickerCard}>
                    <View style={styles.datePickerHeader}>
                      <TouchableOpacity onPress={() => setDatePickerTarget(null)}><Text style={styles.datePickerAction}>Cancel</Text></TouchableOpacity>
                      <Text style={styles.datePickerTitle}>Choose {datePickerTarget} date</Text>
                      <TouchableOpacity onPress={() => applyDate(datePickerTarget, draftDate)}><Text style={styles.datePickerAction}>Done</Text></TouchableOpacity>
                    </View>
                    <DateTimePicker value={draftDate} mode="date" display="spinner" themeVariant="light" maximumDate={today} onChange={(_event: DateTimePickerEvent, value?: Date) => { if (value) setDraftDate(value); }} />
                  </View>
                </View>
              </Modal>
            ) : datePickerTarget ? (
              <DateTimePicker value={draftDate} mode="date" display="default" maximumDate={today} onChange={(event: DateTimePickerEvent, value?: Date) => { if (event.type === 'set' && value) applyDate(datePickerTarget, value); else setDatePickerTarget(null); }} />
            ) : null}

            {/* ---------------- Summary: one card, two columns ---------------- */}
            <View style={[styles.card, styles.summaryCard]}>
              <View style={styles.summaryCol}>
                <View style={styles.rowCenter}>
                  <Ionicons name="shield-checkmark-outline" size={15} color={SAGE} />
                  <Text style={styles.summaryLabel}>Budget used</Text>
                </View>
                <Text style={[styles.summaryValue, { color: hasBudgetForPeriod ? TONES[budgetTone].fg : SAGE }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {hasBudgetForPeriod ? `${stats.usage.toFixed(0)}%` : '—'}
                </Text>
                <Text style={styles.caption} numberOfLines={2}>
                  {hasBudgetForPeriod ? `${formatCurrency(stats.totalSpent)} of ${formatCurrency(stats.totalBudget)}` : 'Set a limit to track this'}
                </Text>
                <View style={styles.summaryBadge}>
                  <Badge label={budgetBadge} tone={budgetTone} dot />
                </View>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryCol}>
                <View style={styles.rowCenter}>
                  <Ionicons name="wallet-outline" size={15} color={SAGE} />
                  <Text style={styles.summaryLabel}>Remaining budget</Text>
                </View>
                <Text style={[styles.summaryValue, { color: TONES[remainingBudgetTone].fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {hasBudgetForPeriod ? `${remainingBudget < 0 ? '−' : ''}${formatCurrency(Math.abs(remainingBudget))}` : '—'}
                </Text>
                <Text style={styles.caption} numberOfLines={2}>
                  {hasBudgetForPeriod ? 'Active limits minus spending' : 'Set a limit to see what remains'}
                </Text>
                <View style={styles.summaryBadge}>
                  <Badge label={remainingBudgetBadge} tone={remainingBudgetTone} dot />
                </View>
              </View>
            </View>

            {/* ---------------- Trend chart ---------------- */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.cardTitle}>{subTab === 'Income' ? 'Income' : 'Spending'} trend</Text>
                  <Text style={styles.caption}>{hasCustomRange ? 'Within selected dates' : `By ${timeframe === 'Year' ? 'month' : timeframe === 'Month' ? 'week' : 'day'}`}</Text>
                </View>
                <View style={styles.totalWrap}>
                  <Text style={styles.caption}>Total</Text>
                  <Text style={[styles.totalValue, { color: typeAccent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {formatCurrency(chartTotal)}
                  </Text>
                </View>
              </View>

              <View style={styles.chartArea}>
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
                  yAxisTextStyle={{ color: SAGE, fontSize: TYPE.micro }}
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
                <Text style={styles.emptyHint}>No {subTab.toLowerCase()} recorded this {periodLower} yet.</Text>
              )}
            </View>

            {subTab === 'Expense' ? (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Spending by merchant</Text>
                    <Text style={styles.caption}>Receipt merchants in this period</Text>
                  </View>
                  <Ionicons name="storefront-outline" size={18} color={TEAL} />
                </View>
                {merchantBreakdown.length ? merchantBreakdown.map((item, index) => (
                  <View key={item.name.toLocaleLowerCase()}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.rowBetween}>
                      <Text style={[styles.rowTitle, { flex: 1, marginRight: 12 }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rowAmount}>{formatCurrency(item.value)}</Text>
                    </View>
                  </View>
                )) : <Text style={[styles.emptyHint, { textAlign: 'left', paddingHorizontal: 0 }]}>No merchant names found in receipts for this period.</Text>}
              </View>
            ) : null}

            {/* ---------------- Category breakdown ---------------- */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.cardTitle}>{subTab === 'Income' ? 'Income' : 'Spending'} by category</Text>
                  <Text style={styles.caption}>Where it came from {hasCustomRange ? 'in this date range' : `this ${periodLower}`}</Text>
                </View>
                <View style={[styles.iconTile, styles.iconTileSm, { backgroundColor: 'rgba(237, 178, 50, 0.16)' }]}>
                  <Ionicons name="pie-chart" size={15} color={GOLD} />
                </View>
              </View>

              {categoryChartData.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="pie-chart-outline" size={24} color={SAGE} />
                  </View>
                  <Text style={styles.emptyText}>No {subTab.toLowerCase()} records for this {periodLower}.</Text>
                </View>
              ) : (
                <View>
                  <View style={styles.donutWrap}>
                    <PieChart
                      data={categoryChartData.map(d => ({ value: d.value, color: d.color }))}
                      donut
                      radius={84}
                      innerRadius={60}
                      innerCircleColor={CARD_BG}
                      strokeWidth={categoryChartData.length > 1 ? 2 : 0}
                      strokeColor={CARD_BG}
                      centerLabelComponent={() => (
                        <View style={styles.donutCenter}>
                          <Text style={styles.caption}>Total</Text>
                          <Text style={styles.donutCenterValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                            {formatCurrency(categoryChartTotal)}
                          </Text>
                        </View>
                      )}
                    />
                  </View>

                  {visibleCategories.map((entry, i) => (
                    <View key={entry.category}>
                      {i > 0 ? <View style={styles.divider} /> : null}
                      <View style={styles.legendRow}>
                        <View style={styles.emojiTile}>
                          <Text style={{ fontSize: 18 }}>{entry.icon}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.rowBetween}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{entry.category}</Text>
                            <Text style={styles.rowAmount} numberOfLines={1}>{formatCurrency(entry.value)}</Text>
                          </View>
                          <View style={styles.legendBarRow}>
                            <View style={{ flex: 1 }}>
                              <ProgressBar progress={entry.percentage} colors={[entry.color, entry.color]} height={6} />
                            </View>
                            <Text style={styles.legendPct}>{entry.percentage.toFixed(0)}%</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}

                  {hiddenCategoryCount > 0 && (
                    <TouchableOpacity
                      style={styles.showMoreBtn}
                      onPress={() => setShowAllCategories((v) => !v)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.showMoreText}>
                        {showAllCategories ? 'Show less' : `Show ${hiddenCategoryCount} more`}
                      </Text>
                      <Ionicons name={showAllCategories ? 'chevron-up' : 'chevron-down'} size={14} color={DEEP_GREEN} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.viewContainer}>
            <View style={styles.controlStack}>
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

            {/* ---------------- Hero ---------------- */}
            <View style={styles.heroShadow}>
              <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
                <View style={styles.heroDecor} pointerEvents="none" />

                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Text style={styles.heroMeta}>Left to spend this {budgetPeriodNoun}</Text>
                    <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {formatCurrency(budgetPool.remaining)}
                    </Text>
                  </View>
                  <View style={styles.heroUsedPill}>
                    <Ionicons name={heroUsedIcon} size={14} color={heroAccent} />
                    <Text style={styles.heroUsedText}>{budgetPool.usage.toFixed(0)}% used</Text>
                  </View>
                </View>

                <View style={{ marginTop: 18, marginBottom: 16 }}>
                  <ProgressBar progress={budgetPool.usage} colors={[heroAccent, heroAccent]} height={10} trackColor="rgba(255,255,255,0.2)" />
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
                </View>
              </LinearGradient>
            </View>

            {/* ---------------- Category limits: ONE card, divided rows ---------------- */}
            <View style={styles.bulkHeadingRow}>
              <View style={{ flex: 1 }}><Text style={styles.sectionHeading}>{`${budgetPeriodAdj} limits`}</Text><Text style={styles.caption}>Tap to edit · Hold to select several</Text></View>
              <TouchableOpacity style={styles.headingAction} onPress={() => router.push('/setbudget')}><Ionicons name="add" size={16} color={DEEP_GREEN} /><Text style={styles.headingActionText}>Set limit</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.bulkBudgetsLink} onPress={() => router.push('/bulk-setbudget' as never)} accessibilityRole="button"><Ionicons name="layers-outline" size={16} color={DEEP_GREEN} /><Text style={styles.headingActionText}>Set different limits for multiple categories</Text></TouchableOpacity>
            {selectedBudgetIds.length > 0 ? <View style={styles.multiActionBar}><Text style={styles.multiActionLabel}>{selectedBudgetIds.length} selected</Text><TouchableOpacity onPress={() => setSelectedBudgetIds([])}><Text style={styles.multiActionCancel}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.multiActionDelete} onPress={() => Alert.alert('Delete selected limits?', `${selectedBudgetIds.length} budget limits will be removed.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { const ids = [...selectedBudgetIds]; for (const id of ids) await deleteBudget(id); setSelectedBudgetIds([]); } }])}><Ionicons name="trash-outline" size={15} color="#FFFFFF" /><Text style={styles.multiActionDeleteText}>Delete</Text></TouchableOpacity></View> : null}

            {isLoading ? (
              <ActivityIndicator size="small" color={DEEP_GREEN} style={{ marginVertical: 20 }} />
            ) : budgetsForSelectedPeriod.length === 0 ? (
              <View style={[styles.card, styles.emptyState]}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="wallet-outline" size={26} color={GOLD} />
                </View>
                <Text style={styles.emptyText}>No {budgetPeriodAdj.toLowerCase()} limits yet. Tap “Set limit” to add one.</Text>
              </View>
            ) : (
              <View style={[styles.card, styles.listCard]}>
                {budgetsForSelectedPeriod.map((item, index) => {
                  const categoryInfo = categories.find(c => c.id === item.category_id);
                  const categoryName = item.category_name || categoryInfo?.name || 'Unknown';
                  const spent = Number(item.spent) || 0;
                  const baseLimit = Number(item.amount) || 0;
                  const limitAmount = Number(item.available_limit ?? item.amount) || 0;
                  const rolloverIn = Number(item.rollover_in) || 0;
                  const pct = Number(item.percentage_used) || 0;
                  const tone = toneForPercent(pct);
                  const barColor = getBudgetStatusColor(pct);
                  const over = spent > limitAmount;
                  const emoji = getDisplayEmoji(
                    categories.find((c) => c.name === categoryName && c.type === 'expense')?.icon,
                    getCategoryEmoji(categoryName, 'expense'),
                  );

                  return (
                    <View key={item.id || index}>
                      {index > 0 ? <View style={[styles.divider, { marginHorizontal: 18 }]} /> : null}
                      <TouchableOpacity
                        style={[styles.limitRow, selectedBudgetIds.length > 0 && { paddingLeft: 48 }]}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (selectedBudgetIds.length > 0) { setSelectedBudgetIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]); return; }
                          router.push({
                          pathname: '/setbudget',
                          params: { id: item.id, category_id: item.category_id, amount: item.amount, period_type: item.period_type },
                          });
                        }}
                        onLongPress={() => setSelectedBudgetIds((current) => current.includes(item.id) ? current : [...current, item.id])}
                      >
                        {selectedBudgetIds.length > 0 ? <TouchableOpacity style={styles.multiCheck} onPress={() => setSelectedBudgetIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}><Ionicons name={selectedBudgetIds.includes(item.id) ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selectedBudgetIds.includes(item.id) ? DEEP_GREEN : SAGE} /></TouchableOpacity> : null}
                        <View style={styles.rowBetween}>
                          <View style={[styles.rowCenter, { flex: 1, minWidth: 0, marginRight: 10 }]}>
                            <View style={styles.emojiTile}>
                              <Text style={{ fontSize: 20 }}>{emoji}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">{categoryName}</Text>
                              <Text style={styles.caption} numberOfLines={1}>
                                {formatCurrency(spent)} of {formatCurrency(limitAmount)}
                              </Text>
                            </View>
                          </View>
                          <Badge label={`${pct.toFixed(0)}%`} tone={tone} />
                        </View>

                        <View style={{ marginTop: 12 }}>
                          <ProgressBar progress={pct} colors={[barColor, barColor]} height={8} />
                        </View>

                        <View style={[styles.rowBetween, { marginTop: 8 }]}>
                          <Text style={[styles.statusText, { color: TONES[tone].fg }]} numberOfLines={1}>
                            {over ? `${formatCurrency(spent - limitAmount)} over` : `${formatCurrency(limitAmount - spent)} left`}
                          </Text>
                          {pct >= 70 ? (
                            <Text style={[styles.statusText, { color: TONES[tone].fg }]}>
                              {pct >= 100 ? 'Limit reached' : 'Nearing limit'}
                            </Text>
                          ) : null}
                        </View>

                        {item.rollover_enabled ? (
                          <Text style={[styles.caption, { marginTop: 4 }]} numberOfLines={1}>
                            Base {formatCurrency(baseLimit)} · carry-over {rolloverIn >= 0 ? '+' : '−'}{formatCurrency(Math.abs(rolloverIn))}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ---------------- Goals ---------------- */}
            <View style={{ height: GAP - 8 }} />
            <SectionHeader
              title="Financial goals"
              subtitle="Tap to add savings · Hold to select several"
              actionLabel="New goal"
              onAction={() => router.push('/create-goal')}
            />
            {selectedGoalIds.length > 0 ? <View style={styles.multiActionBar}><Text style={styles.multiActionLabel}>{selectedGoalIds.length} selected</Text><TouchableOpacity onPress={() => setSelectedGoalIds([])}><Text style={styles.multiActionCancel}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.multiActionDelete} onPress={() => Alert.alert('Archive selected goals?', `${selectedGoalIds.length} goals will move to the archive.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive', onPress: async () => { for (const id of [...selectedGoalIds]) await archiveGoal?.(id); setSelectedGoalIds([]); } }])}><Ionicons name="archive-outline" size={15} color="#FFFFFF" /><Text style={styles.multiActionDeleteText}>Archive</Text></TouchableOpacity></View> : null}

            {(!goals || goals.length === 0) ? (
              <View style={[styles.card, styles.emptyState]}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="flag-outline" size={26} color={GOLD} />
                </View>
                <Text style={styles.emptyText}>No goals yet. Create one to start tracking your savings.</Text>
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
                    style={[styles.card, styles.goalCard, selectedGoalIds.length > 0 && { paddingLeft: 48 }]}
                    activeOpacity={0.85}
                    onLongPress={() => setSelectedGoalIds((current) => current.includes(goal.id) ? current : [...current, goal.id])}
                    onPress={() => {
                      if (selectedGoalIds.length > 0) { setSelectedGoalIds((current) => current.includes(goal.id) ? current.filter((id) => id !== goal.id) : [...current, goal.id]); return; }
                      setSelectedGoal(goal);
                      setIsDepositModalVisible(true);
                    }}
                  >
                    {selectedGoalIds.length > 0 ? <TouchableOpacity style={styles.goalMultiCheck} onPress={() => setSelectedGoalIds((current) => current.includes(goal.id) ? current.filter((id) => id !== goal.id) : [...current, goal.id])}><Ionicons name={selectedGoalIds.includes(goal.id) ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selectedGoalIds.includes(goal.id) ? DEEP_GREEN : SAGE} /></TouchableOpacity> : null}
                    <View style={styles.rowBetween}>
                      <View style={[styles.rowCenter, { flex: 1, minWidth: 0, marginRight: 8 }]}>
                        <View style={[styles.emojiTile, { backgroundColor: 'rgba(237, 178, 50, 0.16)' }]}>
                          <Text style={{ fontSize: 20 }}>{goalIcon}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">{goal.target_name}</Text>
                          <Text style={styles.caption} numberOfLines={1}>
                            {presetName ? `${presetName} · ` : ''}by {formatShortDate(goal.target_date)}
                          </Text>
                        </View>
                      </View>

                      {selectedGoalIds.length === 0 ? <View style={styles.rowCenter}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Edit goal"
                          onPress={() => router.push({
                            pathname: '/create-goal',
                            params: {
                              id: goal.id,
                              target_name: goal.target_name,
                              target_amount: goal.target_amount,
                              target_date: goal.target_date,
                              current_savings: goal.current_savings,
                              goal_type_id: (goal as any).goal_type_id || (goal as any).preset_id || (goal as any).goal_type,
                            },
                          })}
                        >
                          <Ionicons name="pencil" size={14} color={DEEP_GREEN} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: 'rgba(255, 98, 89, 0.12)', marginLeft: 8 }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Archive goal"
                          onPress={() => {
                            Alert.alert(
                              'Archive goal?',
                              `"${goal.target_name}" will move to the Trash Bin. You can restore it at any time.`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Archive', onPress: () => (archiveGoal ? archiveGoal(goal.id) : null) },
                              ],
                            );
                          }}
                        >
                          <Ionicons name="archive-outline" size={14} color={CRITICAL_RED} />
                        </TouchableOpacity>
                      </View> : null}
                    </View>

                    <View style={[styles.rowBetween, { marginTop: 16 }]}>
                      <Text style={styles.goalAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {formatCurrency(saved)} <Text style={styles.goalAmountOf}>of {formatCurrency(target)}</Text>
                      </Text>
                      <Badge label={`${progress.toFixed(0)}% saved`} tone="success" />
                    </View>

                    <View style={{ marginTop: 10 }}>
                      <ProgressBar progress={progress} colors={[TEAL, INCOME_GREEN]} height={8} />
                    </View>
                    <Text style={[styles.caption, { marginTop: 8 }]}>{formatCurrency(Math.max(target - saved, 0))} to go</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
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
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 2,
} as const;

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start', flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  text: { fontSize: TYPE.micro, fontWeight: '700' },
});

const sectionStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  textWrap: { flex: 1, marginRight: 10 },
  title: { fontSize: TYPE.section, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.2 },
  subtitle: { fontSize: TYPE.caption, color: SAGE, fontWeight: '500', marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(28, 60, 54, 0.07)', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '700', color: DEEP_GREEN },
});

const segStyles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: TRACK, borderRadius: 16, padding: 4 },
  item: { flex: 1 },
  pill: { flexDirection: 'row', minHeight: 40, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  pillSubtle: { backgroundColor: '#FFFFFF', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  pillShadow: { shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 },
  text: { fontSize: TYPE.body, fontWeight: '700', color: SAGE },
  textActiveDark: { color: DEEP_GREEN, fontWeight: '800' },
  textActiveLight: { color: '#FFFFFF', fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },

  // Header
  stickyHeader: { backgroundColor: CREAM, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIRLINE, paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerIconBadge: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(237, 178, 50, 0.16)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontSize: TYPE.title, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: TYPE.caption, color: SAGE, fontWeight: '600', marginTop: 1 },
  tabWrap: { marginTop: 12 },

  scrollContent: { paddingBottom: BOTTOM_NAV_CLEARANCE },
  viewContainer: { paddingHorizontal: SCREEN_PAD, paddingTop: GAP },
  controlStack: { gap: 10, marginBottom: 16 },
  bulkHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  sectionHeading: { color: DEEP_GREEN, fontSize: TYPE.section, fontWeight: '800' },
  headingAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(28, 60, 54, 0.07)' },
  headingActionText: { color: DEEP_GREEN, fontSize: 12, fontWeight: '700' },
  bulkBudgetsLink: { flexDirection: 'row', gap: 7, alignItems: 'center', minHeight: 36, alignSelf: 'flex-start', paddingHorizontal: 11, borderRadius: 12, backgroundColor: 'rgba(61, 125, 108, 0.10)', marginBottom: 10 },
  multiActionBar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 10 },
  multiActionLabel: { flex: 1, color: DEEP_GREEN, fontSize: 13, fontWeight: '800' },
  multiActionCancel: { color: SAGE, fontSize: 12, fontWeight: '700' },
  multiActionDelete: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 34, borderRadius: 10, backgroundColor: '#A33B34' },
  multiActionDeleteText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  multiCheck: { position: 'absolute', left: 15, top: 0, bottom: 0, justifyContent: 'center', zIndex: 2 },
  goalMultiCheck: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center', zIndex: 3 },
  dateRangeCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.08)' },
  datePickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 25, 22, 0.38)' },
  datePickerCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  datePickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  datePickerTitle: { color: DEEP_GREEN, fontSize: 14, fontWeight: '800' },
  datePickerAction: { color: TEAL, fontSize: 14, fontWeight: '800', paddingHorizontal: 4 },
  dateRangeTitle: { color: DEEP_GREEN, fontSize: 13, fontWeight: '800' },
  dateRangeSubtitle: { color: '#60756F', fontSize: 10, marginTop: 3 },
  dateRangeButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 7, borderRadius: 10, backgroundColor: CREAM },
  dateRangeButtonText: { color: DEEP_GREEN, fontWeight: '700', fontSize: 11 },

  // Base card: one radius, one shadow, one border for everything
  card: { backgroundColor: CARD_BG, borderRadius: RADIUS, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.05)', ...CARD_SHADOW },
  listCard: { padding: 0, overflow: 'hidden' },
  goalCard: { padding: 18 },

  // Shared text styles
  cardTitle: { fontSize: TYPE.cardTitle, fontWeight: '800', color: DEEP_GREEN },
  caption: { fontSize: TYPE.caption, color: SAGE, fontWeight: '500', lineHeight: 17 },
  rowTitle: { fontSize: TYPE.cardTitle, fontWeight: '700', color: DEEP_GREEN, flexShrink: 1 },
  rowAmount: { fontSize: TYPE.body, fontWeight: '700', color: DEEP_GREEN, marginLeft: 8 },
  statusText: { fontSize: TYPE.caption, fontWeight: '700' },

  // Layout helpers
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE },

  // Tiles
  iconTile: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  iconTileSm: { width: 32, height: 32, borderRadius: 11 },
  emojiTile: { width: 42, height: 42, borderRadius: 14, backgroundColor: CREAM, justifyContent: 'center', alignItems: 'center', marginRight: 12 },

  // Savings
  bigValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 16, marginBottom: 12, gap: 8 },
  bigValue: { fontSize: 28, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.6, flexShrink: 1 },
  bigValueSuffix: { fontSize: TYPE.body, fontWeight: '600', color: SAGE, flexShrink: 1 },

  // Summary (two-column)
  summaryCard: { flexDirection: 'row', padding: 0 },
  summaryCol: { flex: 1, padding: 18 },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE, marginVertical: 16 },
  summaryLabel: { fontSize: 13, fontWeight: '700', color: SAGE, marginLeft: 6 },
  summaryValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 8, marginBottom: 2 },
  summaryBadge: { marginTop: 10 },

  // Chart
  totalWrap: { alignItems: 'flex-end', maxWidth: '48%' },
  totalValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  chartArea: { width: '100%', alignItems: 'flex-start', overflow: 'hidden', paddingTop: 20 },
  emptyHint: { textAlign: 'center', color: SAGE, fontSize: TYPE.caption, fontWeight: '600', marginTop: 12 },

  // Donut + list
  donutWrap: { alignItems: 'center', marginTop: 20, marginBottom: 12 },
  donutCenter: { alignItems: 'center', width: 100 },
  donutCenterValue: { color: DEEP_GREEN, fontSize: 18, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  legendBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  legendPct: { color: SAGE, fontSize: TYPE.caption, fontWeight: '700', width: 36, textAlign: 'right' },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 6, borderRadius: 14, backgroundColor: 'rgba(28, 60, 54, 0.05)' },
  showMoreText: { fontSize: 13, fontWeight: '700', color: DEEP_GREEN },

  // Empty states
  emptyState: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: CREAM, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyText: { color: SAGE, textAlign: 'center', fontSize: TYPE.body, fontWeight: '500', lineHeight: 21 },

  // Hero
  heroShadow: { borderRadius: 24, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 5, marginBottom: 28 },
  heroCard: { borderRadius: 24, padding: 22, overflow: 'hidden' },
  heroDecor: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  heroMeta: { fontSize: TYPE.body, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  heroAmount: { fontSize: 36, fontWeight: '800', color: '#FFFFFF', marginTop: 4, letterSpacing: -1 },
  heroUsedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, flexShrink: 0 },
  heroUsedText: { fontSize: TYPE.caption, color: '#FFFFFF', fontWeight: '700' },
  heroFooter: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, minWidth: 0 },
  heroStatLabel: { fontSize: TYPE.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  heroStatValue: { fontSize: 16, color: '#FFFFFF', fontWeight: '800', marginTop: 2 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 16 },

  // Limit rows (inside one card)
  limitRow: { paddingHorizontal: 18, paddingVertical: 16 },

  // Goals
  goalAmount: { fontSize: 16, fontWeight: '800', color: DEEP_GREEN, flexShrink: 1, marginRight: 8 },
  goalAmountOf: { fontSize: 13, fontWeight: '600', color: SAGE },
  actionBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(28, 60, 54, 0.07)', justifyContent: 'center', alignItems: 'center' },
});
