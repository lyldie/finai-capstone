import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../config';
import { getSecureItem } from '../utils/secureStorage';
import { userFacingError } from '../utils/userFacingError';
import ForecastTimelineChart, { ChartPoint } from './ForecastTimelineChart';
import { CategoryForecast, PlanningData } from '../types/planning';

const GREEN = '#233D36', TEAL = '#4C806F', GOLD = '#E8B844', SAGE = '#6C817C', RED = '#B7443F', EXPENSE = '#C96B65';
const peso = (v: unknown) => `${String.fromCharCode(0x20b1)}${(Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const estimateWording = (value: unknown) => String(value ?? '')
  .replace(/\bforecast exceeded\b/gi, 'estimate exceeds the limit')
  .replace(/\bforecast over limit\b/gi, 'estimate above the limit')
  .replace(/\bforecasted\b/gi, 'estimated')
  .replace(/\bforecasts?\b/gi, (word) => word.toLowerCase() === 'forecasts' ? 'estimates' : 'estimate')
  .replace(/\bconfidence\s*:\s*(?:low|medium|high|limited|insufficient)\b/gi, 'available history is limited')
  .replace(/\b(?:low|medium|high|limited) confidence\b/gi, 'limited recorded history')
  .replace(/\bconfidence\b/gi, 'available history');
const completeAction = (value: unknown) => estimateWording(value)
  .replace(/\balign with annual\b/gi, 'align with your annual limit')
  .replace(/\balign with monthly\b/gi, 'align with your monthly limit')
  .replace(/\balign with weekly\b/gi, 'align with your weekly limit');
type Props = { data: PlanningData; onFinn: (message?: string) => void; onManageBills: () => void; onCategory: (item: CategoryForecast, period: 'monthly' | 'weekly') => void };

function totalRange(items: any[], period: 'monthly' | 'weekly', edge: 'range_low' | 'range_high') {
  if (!items.length || items.some((item) => item[period]?.[edge] == null)) return null;
  return items.reduce((sum, item) => sum + Number(item[period][edge]), 0);
}

function futureLabels(asOf: string | undefined, period: 'monthly' | 'weekly', count: number) {
  if (period === 'weekly') return Array.from({ length: count }, (_, i) => i === 0 ? 'Next wk' : `+${i + 1}`);
  const date = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(`${asOf}T12:00:00`) : new Date();
  return Array.from({ length: count }, (_, i) => {
    const next = new Date(date.getFullYear(), date.getMonth() + i, 1);
    return next.toLocaleString('en-US', { month: 'short' });
  });
}

function forecastMonthLabel(asOf?: string) {
  const date = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf)
    ? new Date(`${asOf}T12:00:00`)
    : new Date();
  return date.toLocaleString('en-US', { month: 'long' });
}

function periodSortKey(label: string, period: 'monthly' | 'weekly') {
  if (period === 'weekly') {
    const date = /^(\d{4}-\d{2}-\d{2})/.exec(label)?.[1];
    return date ? Date.parse(`${date}T00:00:00Z`) : Number.MAX_SAFE_INTEGER;
  }
  const match = /^([A-Za-z]{3}) (\d{4})$/.exec(label);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[1].toLowerCase());
  return month < 0 ? Number.MAX_SAFE_INTEGER : Date.UTC(Number(match[2]), month, 1);
}

function shortDate(dateValue: string | undefined) {
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return 'Soon';
  const date = new Date(`${dateValue}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function explanationRows(item: any) {
  const evidence = item.evidence && typeof item.evidence === 'object' ? item.evidence : {};
  const forecast = evidence.forecast != null ? evidence : evidence.monthly || evidence.weekly || {};
  const rows: [string, unknown][] = [
    ['Forecast', forecast.forecast], ['Range', forecast.range_low == null ? null : `${peso(forecast.range_low)} – ${peso(forecast.range_high)}`],
    ['Trend', forecast.trend_pct == null ? null : `${forecast.trend_pct}%`], ['Limit', forecast.limit],
    ['Last year same month', evidence.same_month_spending], ['Prior-year monthly average', evidence.annual_monthly_average],
    ['Goal remaining', evidence.remaining], ['Monthly goal pace', evidence.monthly_contribution_pace],
    ['Compared months', Array.isArray(evidence.window) ? evidence.window.map(peso).join(' · ') : null],
  ];
  return rows.filter(([, value]) => value !== undefined && value !== null && value !== '').slice(0, 4);
}

export default function PlanningDashboard({ data, onFinn, onManageBills, onCategory }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'Outlook' | 'Estimate' | 'My Plan'>('Outlook');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [insightTopic, setInsightTopic] = useState<'all' | 'spending' | 'income' | 'goals'>('all');
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [goalExtraAmount, setGoalExtraAmount] = useState('');
  const [goalWhatIfResult, setGoalWhatIfResult] = useState<any>(null);
  const [goalWhatIfLoading, setGoalWhatIfLoading] = useState(false);
  const [whatIfCategory, setWhatIfCategory] = useState('');
  const [whatIfAmount, setWhatIfAmount] = useState('');
  const [whatIfResult, setWhatIfResult] = useState<any>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [showForecastGuide, setShowForecastGuide] = useState(false);
  const [showGoalScenario, setShowGoalScenario] = useState(false);
  const [showSpendingScenario, setShowSpendingScenario] = useState(false);

  const categoryForecasts = data.category_forecasts || [];
  const items = categoryForecasts.filter((item: any) => item.type === kind);
  const expenses = categoryForecasts.filter((item: any) => item.type === 'expense');
  const incomes = categoryForecasts.filter((item: any) => item.type === 'income');
  const forecastCount = 1;
  const total = items.reduce((sum: number, item: any) => sum + Math.round((Number(item[period]?.forecast) || 0) * 100), 0) / 100;
  const rangeLow = totalRange(items, period, 'range_low');
  const rangeHigh = totalRange(items, period, 'range_high');
  const chartActual: ChartPoint[] = useMemo(() => {
    const totals = new Map<string, number>();
    items.forEach((item: any) => item[period]?.periods?.forEach((point: any) => totals.set(point.label, (totals.get(point.label) || 0) + Number(point.actual || 0))));
    if (period === 'monthly') {
      const asOf = data.metrics?.as_of_date && /^\d{4}-\d{2}-\d{2}$/.test(data.metrics.as_of_date)
        ? new Date(`${data.metrics.as_of_date}T12:00:00`)
        : new Date();
      return Array.from({ length: 3 }, (_, index) => {
        const date = new Date(asOf.getFullYear(), asOf.getMonth() - 3 + index, 1);
        const monthLabel = date.toLocaleString('en-US', { month: 'short' });
        const periodLabel = `${monthLabel} ${date.getFullYear()}`;
        return { label: monthLabel, value: totals.get(periodLabel) || 0 };
      });
    }

    const asOf = data.metrics?.as_of_date && /^\d{4}-\d{2}-\d{2}$/.test(data.metrics.as_of_date)
      ? new Date(`${data.metrics.as_of_date}T12:00:00`)
      : new Date();
    const currentMonday = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - ((asOf.getDay() + 6) % 7));
    const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const weeklyTotals = new Map<string, number>();
    totals.forEach((value, label) => {
      const start = /^(\d{4}-\d{2}-\d{2})/.exec(label)?.[1];
      if (start) weeklyTotals.set(start, value);
    });
    return Array.from({ length: 4 }, (_, index) => {
      const weeksAgo = 4 - index;
      const start = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - weeksAgo * 7);
      return { label: weeksAgo === 1 ? 'Last wk' : `${weeksAgo}w ago`, value: weeklyTotals.get(isoDate(start)) || 0 };
    });
  }, [items, period, data.metrics?.as_of_date]);
  const totalCents = (list: any[]) => list.reduce((sum, item) => sum + Math.round(Number(item.monthly?.forecast || 0) * 100), 0);
  const projectedIncome = totalCents(incomes) / 100;
  const projectedExpense = totalCents(expenses) / 100;
  const projectedNet = Math.round((projectedIncome - projectedExpense) * 100) / 100;
  const outlookChart = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    categoryForecasts.forEach((item: any) => item.monthly?.periods?.forEach((point: any) => {
      const current = totals.get(point.label) || { income: 0, expense: 0 };
      current[item.type as 'income' | 'expense'] += Number(point.actual) || 0;
      totals.set(point.label, current);
    }));
    const actual = [...totals.entries()].sort(([left], [right]) => periodSortKey(left, 'monthly') - periodSortKey(right, 'monthly')).slice(-3).map(([label, value]) => ({ label: label.split(' ')[0], value: value.income - value.expense }));
    const incomeLow = totalRange(incomes, 'monthly', 'range_low'), incomeHigh = totalRange(incomes, 'monthly', 'range_high');
    const expenseLow = totalRange(expenses, 'monthly', 'range_low'), expenseHigh = totalRange(expenses, 'monthly', 'range_high');
    return {
      actual,
      forecast: projectedIncome - projectedExpense,
      rangeLow: incomeLow == null || expenseHigh == null ? null : incomeLow - expenseHigh,
      rangeHigh: incomeHigh == null || expenseLow == null ? null : incomeHigh - expenseLow,
    };
  }, [categoryForecasts, projectedIncome, projectedExpense, incomes, expenses]);
  const urgent = (data.recommendations || []).filter((item: any) => item.priority === 'high').slice(0, 2);
  // Past spending comparisons belong on the dedicated Insights screen.
  const insights = data.recommendations || [];
  const priorityRank: Record<string, number> = { high: 0, medium: 1, goal: 2 };
  const orderedInsights = [...insights].sort((a: any, b: any) =>
    (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3));
  const topInsights = orderedInsights.slice(0, 3);
  const visibleInsights = (showAllInsights ? orderedInsights : topInsights)
    .filter((item: any) => !showAllInsights || insightTopic === 'all' || item.topic === insightTopic);
  const planHeadline = orderedInsights.some((item: any) => item.priority === 'high')
    ? 'Start with your top priority'
    : orderedInsights.length
      ? `${orderedInsights.length} ${orderedInsights.length === 1 ? 'suggestion' : 'suggestions'} based on your records`
      : data.insufficient_insight_data
        ? 'Add records to build your plan'
        : 'No immediate priority flagged';
  const goals = (data.goal_plans || []).filter((goal: any) => Number(goal.remaining) > 0 && goal.goal_id);
  const selectedGoal = goals.find((goal: any) => goal.goal_id === selectedGoalId) || goals[0];
  const selectedExpense = expenses.find((item: any) => item.category_id === whatIfCategory) || expenses[0];
  const upcoming = [
    ...(data.upcoming_bills || []).slice(0, 2).map((bill: any) => ({ label: `${shortDate(bill.due_date)} · ${bill.name} due`, amount: bill.amount })),
    ...goals.filter((goal: any) => goal.days_to_target != null).slice(0, 1).map((goal: any) => ({ label: `${goal.target} · ${goal.days_to_target} days`, amount: goal.suggested_monthly_saving, suffix: '/mo' })),
  ].slice(0, 2);

  const runGoalWhatIf = async () => {
    const amount = Number(goalExtraAmount);
    if (!selectedGoal || !Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,2})?$/.test(goalExtraAmount)) return;
    setGoalWhatIfLoading(true);
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/advisor/goal-what-if`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify({ goal_id: selectedGoal.goal_id, additional_monthly_contribution: amount }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Could not calculate this goal scenario.');
      setGoalWhatIfResult(payload);
    } catch (error) { setGoalWhatIfResult({ error: userFacingError(error, 'Could not calculate this goal scenario. Please check your connection and try again.') }); }
    finally { setGoalWhatIfLoading(false); }
  };
  const runSpendingWhatIf = async () => {
    const amount = Number(whatIfAmount);
    if (!selectedExpense?.category_id || !Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,2})?$/.test(whatIfAmount)) return;
    const estimatedMonthlySpend = Number(selectedExpense.monthly?.forecast) || 0;
    if (amount > estimatedMonthlySpend) {
      setWhatIfResult({ error: `Enter an amount up to ${peso(estimatedMonthlySpend)}/mo, the current estimate for ${selectedExpense.category}.` });
      return;
    }
    setWhatIfLoading(true);
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/advisor/what-if`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify({ category_id: selectedExpense.category_id, monthly_reduction: amount }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Could not calculate this scenario.');
      setWhatIfResult(payload);
    } catch (error) { setWhatIfResult({ error: userFacingError(error, 'Could not calculate this scenario. Please check your connection and try again.') }); }
    finally { setWhatIfLoading(false); }
  };

  return <View>
    <View style={s.tabs}>{(['Outlook', 'Estimate', 'My Plan'] as const).map((name) => <TouchableOpacity key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={[s.tab, tab === name && s.tabActive]}><Text style={[s.tabText, tab === name && s.tabTextActive]}>{name}</Text></TouchableOpacity>)}</View>

    {tab === 'Outlook' && <ScrollView contentContainerStyle={s.body}>
      <View style={s.hero}>
        <View style={s.between}><Text style={s.title}>Projected Net for {forecastMonthLabel(data.metrics?.as_of_date)}</Text><Text style={[s.statusPill, projectedNet >= 0 ? s.goodPill : s.alertPill]}>{projectedNet >= 0 ? 'Positive estimate' : 'Negative estimate'}</Text></View>
        <Text style={s.heroValue}>{projectedNet >= 0 ? '+' : ''}{peso(projectedNet)}</Text>
        <Text style={s.copy}>Estimated income minus estimated expenses for one month, based on recent completed months. This is not your current account balance.</Text>
        <ForecastTimelineChart actual={outlookChart.actual} forecast={outlookChart.forecast} rangeLow={outlookChart.rangeLow} rangeHigh={outlookChart.rangeHigh} forecastPeriods={1} futureLabels={futureLabels(data.metrics?.as_of_date, 'monthly', 1)} accessibilityLabel={`Recorded monthly net and estimate for ${forecastMonthLabel(data.metrics?.as_of_date)}`} height={160}/>
      </View>
      <View style={s.tiles}>
        <View style={s.tile}><Text style={s.tileLabel}>Health</Text><Text style={s.tileValue}>{data.health_score?.score == null ? '—' : `${data.health_score.score}/100`}</Text></View>
        <View style={s.tile}><Text style={s.tileLabel}>Safe this week</Text><Text style={s.tileValue}>{peso(data.safe_to_spend?.safe_this_week)}</Text></View>
        <View style={s.tile}><Text style={s.tileLabel}>Goals</Text><Text style={s.tileValue}>{goals.length} active</Text></View>
      </View>
      <View style={s.card}><Text style={s.title}>Needs attention</Text>{urgent.length ? urgent.map((item: any, index: number) => <View key={`${item.id}-${index}`} style={s.listRow}><View style={[s.statusDot, { backgroundColor: RED }]}/><View style={{flex:1}}><Text style={s.itemTitle}>{estimateWording(item.finding?.headline || 'Planning insight')}</Text><Text style={s.copy} numberOfLines={1}>{estimateWording(item.why)}</Text></View><Text style={[s.statusPill,s.alertPill]}>Review</Text></View>) : <Text style={s.copy}>No urgent alerts.</Text>}</View>
      <View style={s.card}><View style={s.between}><Text style={s.title}>Coming up</Text><TouchableOpacity onPress={onManageBills} accessibilityRole="button"><Text style={s.link}>Bills</Text></TouchableOpacity></View>{upcoming.length ? upcoming.map((item: any, i: number) => <View key={`${item.label}-${i}`} style={s.listRow}><Text style={s.itemTitle} numberOfLines={1}>{item.label}</Text><Text style={s.money}>{peso(item.amount)}{item.suffix || ''}</Text></View>) : <Text style={s.copy}>No bills due soon.</Text>}</View>
      <TouchableOpacity style={s.primaryButton} onPress={() => onFinn()} accessibilityRole="button"><Text style={s.primaryButtonText}>Discuss my plan with Finn</Text></TouchableOpacity>
    </ScrollView>}

    {tab === 'Estimate' && <ScrollView contentContainerStyle={s.body}>
      {period === 'weekly' && <View style={s.safeCard}><Text style={s.copy}>Safe to spend this week</Text><Text style={s.safeValue}>{peso(data.safe_to_spend?.safe_this_week)}</Text><Text style={s.copy}>{Number(data.safe_to_spend?.safe_this_week || 0) <= 0 ? data.safe_to_spend?.reason || 'Recorded limits and bills leave no estimated amount.' : 'After upcoming bills and goal pace'}</Text></View>}
      <View style={s.toggleRow}>
        <View style={s.toggle}>{(['expense','income'] as const).map(v => <TouchableOpacity key={v} onPress={() => setKind(v)} style={[s.toggleButton,kind===v&&s.toggleSelected]}><Text style={kind===v?s.toggleTextSelected:s.toggleText}>{v==='expense'?'Expenses':'Income'}</Text></TouchableOpacity>)}</View>
        <View style={s.toggle}>{(['weekly','monthly'] as const).map(v => <TouchableOpacity key={v} onPress={() => setPeriod(v)} style={[s.toggleButton,period===v&&s.toggleSelected]}><Text style={period===v?s.toggleTextSelected:s.toggleText}>{v==='weekly'?'Weekly':'Monthly'}</Text></TouchableOpacity>)}</View>
      </View>
      <View style={s.card}>
        <View style={s.between}><Text style={s.title}>{period === 'monthly' ? `Estimated ${kind === 'expense' ? 'Expenses' : 'Income'} for ${forecastMonthLabel(data.metrics?.as_of_date)}` : `Estimated ${kind === 'expense' ? 'Expenses' : 'Income'} next week`}</Text></View>
        <Text style={[s.forecastValue, kind === 'expense' && { color: EXPENSE }]}>{peso(total)}</Text>
        <ForecastTimelineChart actual={chartActual} forecast={total} rangeLow={rangeLow} rangeHigh={rangeHigh} forecastPeriods={forecastCount} futureLabels={futureLabels(data.metrics?.as_of_date, period, forecastCount)} colorMode={kind} showLegend showValueLabels accessibilityLabel={`${kind} history and ${period === 'monthly' ? `estimate for ${forecastMonthLabel(data.metrics?.as_of_date)}` : 'next-week estimate'}`} height={190}/>
        <Text style={s.copy}>{period === 'weekly' ? 'The next-week estimate uses the average of up to 4 completed weeks.' : 'This estimate uses the average of up to 3 completed months.'}</Text>
        {kind === 'income' && period === 'monthly' && Number(data.metrics?.reported_monthly_baseline) > 0 && <Text style={{ color: '#53645F', fontSize: 11, lineHeight: 16, backgroundColor: '#F1F4EF', padding: 10, borderRadius: 12 }}>Profile income reference: {peso(data.metrics?.reported_monthly_baseline)}/month. It is shown separately and is not added to the recorded-income estimate above.</Text>}
        <TouchableOpacity style={s.guideLink} onPress={() => setShowForecastGuide(true)} accessibilityRole="button"><Ionicons name="help-circle-outline" size={17} color={TEAL}/><Text style={s.link}>How this estimate works</Text></TouchableOpacity>
      </View>
      <View style={s.card}><View style={s.between}><Text style={s.title}>By category, next {period === 'weekly' ? 'week' : 'month'}</Text><Text style={s.copy}>All categories</Text></View>
        <Text style={s.copy}>Amount is the estimate. Change compares recent and previous {period === 'weekly' ? '4-week' : '3-month'} averages: minus means lower, plus means higher.</Text>
        {items.map((item: any) => { const f=item[period]; const label = f.limit == null ? 'No budget limit' : `Budget limit ${peso(f.limit)}`; const trend = f.trend_pct == null ? 'Not enough history' : `${f.trend_pct > 0 ? '+' : ''}${f.trend_pct}%`; return <TouchableOpacity key={item.category_id} style={s.categoryRow} onPress={() => onCategory(item,period)} accessibilityRole="button" accessibilityLabel={`Details for ${item.category}`}><View style={{flex:1}}><Text style={s.itemTitle}>{item.category}</Text><Text style={s.copy}>{label}</Text></View><View style={{alignItems:'flex-end',gap:4}}><Text style={[s.money, kind === 'expense' && { color: EXPENSE }]}>{peso(f.forecast)}</Text><Text style={[s.statusPill,s.changePill]}>{trend}</Text></View><Ionicons name="chevron-forward" size={16} color={SAGE}/></TouchableOpacity>})}
        {!items.length && <Text style={s.copy}>No active categories.</Text>}
      </View>
      {kind === 'expense' && period === 'monthly' && !!data.fixed_bill_forecasts?.length && <View style={s.card}><Text style={s.title}>Scheduled bills</Text>{data.fixed_bill_forecasts.slice(0,3).map((bill: any) => <View key={bill.id} style={s.listRow}><Text style={s.itemTitle}>{bill.name} · {bill.category}</Text><Text style={[s.money,{color:EXPENSE}]}>{peso(bill.forecast)}</Text></View>)}<TouchableOpacity onPress={onManageBills} style={s.linkButton}><Text style={s.link}>Manage bills</Text></TouchableOpacity></View>}
      <Text style={s.disclaimer}>Estimates may miss unrecorded activity.</Text>
      <Modal visible={showForecastGuide} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowForecastGuide(false)}>
        <View style={[s.guideOverlay, { paddingTop: Math.max(insets.top + 12, 32) }]}>
        <SafeAreaView style={s.guidePage} edges={['bottom']}>
          <View style={s.guideHeader}><View style={{flex:1}}><Text style={s.guideTitle}>How this estimate works</Text><Text style={s.copy}>{kind === 'expense' ? 'Expenses' : 'Income'} · {period === 'weekly' ? 'weekly' : 'monthly'} estimate</Text></View><TouchableOpacity style={s.guideClose} onPress={() => setShowForecastGuide(false)} accessibilityRole="button" accessibilityLabel="Close explanation"><Ionicons name="close" size={20} color={GREEN}/></TouchableOpacity></View>
          <ScrollView style={s.guideScroll} contentContainerStyle={s.guideBody}>
            <View style={s.guideCard}><Text style={s.guideLead}>The chart estimates a similar upcoming period based on your recent recorded activity.</Text>
              <GuideStep number="1" title={`Use the last ${period === 'weekly' ? '4 full weeks' : '3 full months'}`} body={`The current ${period === 'weekly' ? 'week' : 'month'} is incomplete, so it is left out. The solid bars show recorded ${kind === 'expense' ? 'spending' : 'income'} totals.`}/>
              <GuideStep number="2" title="Average each category" body={`For each ${kind === 'expense' ? 'expense' : 'income'} category, we average its last ${period === 'weekly' ? '4 completed weeks' : '3 completed months'}. A zero-activity period counts as zero if the category already existed. We add those category estimates to get the total shown above the chart.`}/>
              <GuideStep number="3" title="Use it as an estimate" body={`The dashed bars repeat the estimated ${period === 'weekly' ? 'weekly' : 'monthly'} amount for upcoming periods. They are flat estimates, not separate predictions for each date.`}/>
              <View style={s.guideValues}><Text style={s.guideSectionTitle}>Recent recorded totals</Text>{chartActual.length ? chartActual.map((point) => <View key={point.label} style={s.guideValueRow}><Text style={s.copy}>{point.label}</Text><Text style={s.guideValue}>{peso(point.value)}</Text></View>) : <Text style={s.copy}>No completed periods are available yet.</Text>}<View style={[s.guideValueRow,s.guideTotal]}><Text style={s.guideSectionTitle}>Estimated each {period === 'weekly' ? 'week' : 'month'}</Text><Text style={s.guideValue}>{peso(total)}</Text></View></View>
            </View>
            <View style={s.guideNote}><Text style={s.guideSectionTitle}>Keep in mind</Text><Text style={s.copy}>The estimate may miss unrecorded purchases, one-time bills, or changes in your plans. It does not account for seasonal changes.</Text></View>
          </ScrollView>
          <View style={s.guideFooter}><TouchableOpacity style={s.primaryButton} onPress={() => setShowForecastGuide(false)} accessibilityRole="button"><Text style={s.primaryButtonText}>Got it</Text></TouchableOpacity></View>
        </SafeAreaView>
        </View>
      </Modal>
    </ScrollView>}

      {tab === 'My Plan' && <ScrollView contentContainerStyle={s.body}>
      <View style={s.planHero}>
        <View style={s.between}><View style={s.planIcon}><Ionicons name="navigate" size={20} color={TEAL}/></View><Text style={[s.statusPill, data.recommendation_source === 'ai' ? s.goodPill : s.watchPill]}>{data.recommendation_source === 'ai' ? 'AI-POWERED' : 'RECORD-BASED'}</Text></View>
        <Text style={s.planHeadline}>{planHeadline}</Text>
        <Text style={s.copy} numberOfLines={2}>{estimateWording(typeof data.summary === 'string' && data.summary.trim() ? data.summary : 'Recommendations are based on your recorded transactions, budgets, goals, and available estimates.')}</Text>
        {!!orderedInsights.length && <View style={s.planCountRow}><Ionicons name="sparkles-outline" size={15} color={TEAL}/><Text style={s.planCount}>{orderedInsights.length} planning {orderedInsights.length === 1 ? 'point' : 'points'} · estimates may change</Text></View>}
      </View>
      {!!visibleInsights.length && <Text style={s.sectionTitle}>{showAllInsights ? 'All suggestions' : 'Your priorities'}</Text>}
      {showAllInsights && orderedInsights.length >= 6 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{(['all','spending','income','goals'] as const).map((topic) => <TouchableOpacity key={topic} onPress={() => setInsightTopic(topic)} style={[s.chip,insightTopic===topic&&s.chipSelected]}><Text style={[s.chipText,insightTopic===topic&&{color:'#fff'}]}>{topic === 'all' ? 'All' : topic[0].toUpperCase()+topic.slice(1)}</Text></TouchableOpacity>)}</ScrollView>}
      {visibleInsights.map((item: any,i:number) => {
        const id = `${item.id || item.topic || 'insight'}-${i}`;
        const isOpen = expandedInsight === id;
        const finding = item.finding || {};
        const evidence = item.evidence || {};
        const values = evidence.values || {};
        const keyNumber = finding.key_number;
        const nextStep = item.nextStep;
        const itemKind = item.kind || nextStep?.params?.kind || '';
        const numberLabel = itemKind === 'budget_risk' ? 'Estimated by period end' : itemKind === 'budget_watch' ? 'Used so far' : keyNumber?.label;
        const numberText = keyNumber ? `${numberLabel}: ${keyNumber.unit === '%' ? `${keyNumber.value > 0 ? '+' : ''}${keyNumber.value}%` : keyNumber.unit === 'months' ? `${keyNumber.value} months` : `${peso(keyNumber.value)}${keyNumber.unit === 'PHP/month' ? '/mo' : ''}`}` : null;
        const cta = completeAction(nextStep?.label || 'Review this plan with Finn');
        const headline = estimateWording(finding.headline || 'Review my plan');
        const why = estimateWording(item.why || '');
        const prompt = `Please explain this Plan Ahead item and suggest practical next steps: ${headline}. ${why} Suggested action: ${cta}. Use my recorded planning figures, distinguish recorded amounts from estimates, and mention what information is missing if relevant.`;
        const evidenceRows = Object.entries(values).filter(([key, value]) => value !== null && value !== undefined && !['periods','window','drivers'].includes(key) && !/(^id$|_id|confidence|evidence_id)/i.test(key)).slice(0,5);
        const iconName = item.topic === 'goals' ? 'flag-outline' : item.topic === 'income' ? 'trending-up-outline' : itemKind.includes('bill') ? 'calendar-outline' : 'wallet-outline';
        const usage = itemKind.startsWith('budget_') ? Math.max(0, Math.min(Number(values.percentage_used) || 0, 100)) : null;
        return <View key={id} style={s.insightCard}>
          <View style={s.between}><View style={s.between}><View style={[s.insightIcon,{backgroundColor:item.priority==='high'?'#FBE5E2':'#E7F1EC'}]}><Ionicons name={iconName as any} size={18} color={item.priority==='high'?RED:TEAL}/></View><Text style={s.insightLabel}>{item.priority === 'high' ? 'PRIORITY' : item.priority === 'goal' ? 'GOAL' : 'SUGGESTION'}</Text></View><Text style={[s.statusPill, item.priority === 'high' ? s.alertPill : s.goodPill]}>{item.topic === 'goals' ? 'Goals' : item.topic === 'income' ? 'Income' : 'Spending'}</Text></View>
          <Text style={s.insightTitle}>{estimateWording(finding.headline || 'Planning insight')}</Text>
          {numberText && <Text style={s.insightMetric}>{numberText}</Text>}
          {usage !== null && <View accessibilityLabel={`${Math.round(usage)} percent of budget used`}><View style={s.meterTrack}><View style={[s.meterFill,{width:`${usage}%`,backgroundColor:usage>=90?RED:usage>=70?GOLD:TEAL}]}/></View><Text style={s.meterCaption}>{Math.round(usage)}% of budget used</Text></View>}
          <Text style={s.copy} numberOfLines={2}>{estimateWording(item.why)}</Text>
          <View style={s.between}><TouchableOpacity style={s.softButton} onPress={() => onFinn(prompt)} accessibilityRole="button"><Text style={s.softButtonText}>{cta}</Text></TouchableOpacity><TouchableOpacity onPress={() => setExpandedInsight(isOpen ? null : id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={s.whyButton}><Text style={s.link}>{isOpen ? 'Hide details' : 'Why this?'}</Text></TouchableOpacity></View>
          {isOpen && <View style={s.explanation}><Text style={s.explanationTitle}>Evidence</Text>{evidence.window?.length > 0 && <Text style={s.copy}>Window: {evidence.window.join(', ')}</Text>}{evidence.comparison_period && <Text style={s.copy}>Compared with: {evidence.comparison_period}</Text>}{evidenceRows.map(([label,value]: any) => <View key={label} style={s.evidenceRow}><Text style={s.copy}>{estimateWording(String(label).replace(/_/g,' '))}</Text><Text style={s.evidenceValue}>{typeof value === 'number' ? peso(value) : String(value)}</Text></View>)}{evidence.how_calculated && <Text style={s.copy}>{estimateWording(evidence.how_calculated)}</Text>}</View>}
        </View>;
      })}
      {showAllInsights && orderedInsights.length > 0 && !visibleInsights.length && <View style={s.card}><Text style={s.copy}>No suggestions in this area yet.</Text></View>}
      {!orderedInsights.length && <View style={s.card}><Text style={s.title}>{data.insufficient_insight_data ? 'Not enough history yet' : 'No immediate priorities'}</Text><Text style={s.copy}>{data.insufficient_insight_data ? 'Record more transactions or add a budget or savings goal so FinAI can build a more useful plan.' : 'There are no current budget or goal signals to act on. Unrecorded activity can still change your outlook.'}</Text></View>}
      {orderedInsights.length > 3 && <TouchableOpacity style={s.seeAllButton} onPress={() => {setShowAllInsights(!showAllInsights);setInsightTopic('all')}} accessibilityRole="button" accessibilityState={{ expanded: showAllInsights }}><Text style={s.link}>{showAllInsights ? 'Show top priorities' : `See all ${orderedInsights.length} suggestions`}</Text><Ionicons name={showAllInsights?'chevron-up':'chevron-down'} size={16} color={TEAL}/></TouchableOpacity>}
      {goals.length > 0 && <View style={s.card}>
        <TouchableOpacity style={s.between} onPress={() => setShowGoalScenario(!showGoalScenario)} accessibilityRole="button" accessibilityState={{ expanded: showGoalScenario }}><View style={{flex:1}}><Text style={s.title}>Goal pace scenario</Text><Text style={s.copy}>Estimate how an extra monthly contribution could change your timeline.</Text></View><Ionicons name={showGoalScenario ? 'chevron-up' : 'chevron-down'} size={18} color={SAGE}/></TouchableOpacity>
        {showGoalScenario && <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{goals.map((goal:any)=><TouchableOpacity key={goal.goal_id} onPress={()=>{setSelectedGoalId(goal.goal_id);setGoalWhatIfResult(null)}} style={[s.chip,selectedGoal?.goal_id===goal.goal_id&&s.chipSelected]}><Text style={[s.chipText,selectedGoal?.goal_id===goal.goal_id&&{color:'#fff'}]}>{goal.target}</Text></TouchableOpacity>)}</ScrollView>
        {selectedGoal && <Text style={s.copy}>{peso(selectedGoal.remaining)} left to reach {selectedGoal.target}. Your recent contribution pace is {peso(selectedGoal.monthly_contribution_pace)}/mo.</Text>}
        <TextInput style={s.input} placeholder="Extra to add each month" value={goalExtraAmount} onChangeText={setGoalExtraAmount} keyboardType="decimal-pad" accessibilityLabel="Extra monthly goal contribution"/>
        {selectedGoal && <Text style={s.copy}>This amount is added on top of your recent contribution pace.</Text>}
        <TouchableOpacity style={s.softButton} onPress={runGoalWhatIf} disabled={goalWhatIfLoading} accessibilityRole="button">{goalWhatIfLoading?<ActivityIndicator color={TEAL}/>:<Text style={s.softButtonText}>Estimate goal timeline</Text>}</TouchableOpacity>
        {goalWhatIfResult?.error ? <Text style={s.error}>{goalWhatIfResult.error}</Text> : goalWhatIfResult && <View style={s.explanation}><Text style={s.insightMetric}>New pace {peso(goalWhatIfResult.new_monthly_contribution)}/mo</Text>{goalWhatIfResult.months_with_additional_contribution != null && <Text style={s.copy}>About {goalWhatIfResult.months_with_additional_contribution} months to reach {peso(goalWhatIfResult.remaining)}.</Text>}{goalWhatIfResult.days_saved == null ? <Text style={s.copy}>No recent contribution pace to compare yet.</Text> : <Text style={s.copy}>About {goalWhatIfResult.days_saved} days sooner than the recent pace.</Text>}</View>}
        </>}
      </View>}
      <View style={s.card}><TouchableOpacity style={s.between} onPress={() => setShowSpendingScenario(!showSpendingScenario)} accessibilityRole="button" accessibilityState={{ expanded: showSpendingScenario }}><View style={{flex:1}}><Text style={s.title}>Spending scenario</Text><Text style={s.copy}>Estimate how spending less could affect the next 3 months.</Text></View><Ionicons name={showSpendingScenario ? 'chevron-up' : 'chevron-down'} size={18} color={SAGE}/></TouchableOpacity>{showSpendingScenario && <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{expenses.map((item:any)=><TouchableOpacity key={item.category_id} onPress={()=>{setWhatIfCategory(item.category_id);setWhatIfResult(null)}} style={[s.chip,selectedExpense?.category_id===item.category_id&&s.chipSelected]}><Text style={[s.chipText,selectedExpense?.category_id===item.category_id&&{color:'#fff'}]}>{item.category}</Text></TouchableOpacity>)}</ScrollView>{selectedExpense&&<Text style={s.copy}>{selectedExpense.category} is estimated at about {peso(selectedExpense.monthly?.forecast)}/mo, based on your last 3 completed months. Choose a monthly reduction up to that estimate.</Text>}<TextInput style={s.input} placeholder="Monthly amount to reduce" value={whatIfAmount} onChangeText={setWhatIfAmount} keyboardType="decimal-pad" accessibilityLabel="Monthly expense reduction"/><TouchableOpacity style={s.softButton} onPress={runSpendingWhatIf} disabled={whatIfLoading} accessibilityRole="button">{whatIfLoading?<ActivityIndicator color={TEAL}/>:<Text style={s.softButtonText}>Calculate impact</Text>}</TouchableOpacity>{whatIfResult?.error?<Text style={s.error}>{whatIfResult.error}</Text>:whatIfResult&&<Text style={[s.insightMetric,{color:EXPENSE}]}>For {selectedExpense?.category}, reducing spending by {peso(whatIfResult.monthly_reduction)}/mo could lower the 3-month estimate by about {peso(whatIfResult.net_forecast_change)}, assuming other spending stays similar.</Text>}</>}</View>
      <Text style={s.disclaimer}>Suggestions use recorded data and estimates. Review them against your plans before making changes.</Text>
    </ScrollView>}
  </View>;
}

const s=StyleSheet.create({
  planHero:{backgroundColor:'#fff',borderRadius:26,padding:18,gap:11,borderWidth:1,borderColor:'#E8EFEA'},planIcon:{width:40,height:40,borderRadius:14,backgroundColor:'#E7F1EC',alignItems:'center',justifyContent:'center'},planHeadline:{color:GREEN,fontSize:22,fontWeight:'900',lineHeight:28},planCountRow:{flexDirection:'row',alignItems:'center',gap:6,marginTop:2},planCount:{color:TEAL,fontSize:11,fontWeight:'800'},sectionTitle:{color:GREEN,fontSize:16,fontWeight:'900',marginTop:2},seeAllButton:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#E7F1EC',borderRadius:24},insightIcon:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center'},meterTrack:{height:8,borderRadius:5,backgroundColor:'#E9E7DF',overflow:'hidden',marginTop:2},meterFill:{height:'100%',borderRadius:5},meterCaption:{color:SAGE,fontSize:10,fontWeight:'800',marginTop:4},
  tabs:{flexDirection:'row',marginHorizontal:16,marginTop:8,padding:4,borderRadius:30,backgroundColor:'#EEECE5'},tab:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:25},tabActive:{backgroundColor:GREEN},tabText:{color:SAGE,fontWeight:'800',fontSize:13},tabTextActive:{color:'#fff'},body:{padding:16,paddingBottom:32,gap:14},hero:{backgroundColor:'#fff',borderRadius:26,padding:20,gap:11},title:{color:GREEN,fontSize:17,fontWeight:'900'},heroValue:{color:TEAL,fontSize:36,fontWeight:'900',marginTop:3},copy:{color:'#627772',fontSize:12,lineHeight:18},tiles:{flexDirection:'row',gap:10},tile:{flex:1,backgroundColor:'#fff',padding:13,borderRadius:23,minHeight:82,justifyContent:'center',gap:8},tileLabel:{color:'#627772',fontSize:11},tileValue:{color:GREEN,fontSize:16,fontWeight:'900'},card:{backgroundColor:'#fff',padding:18,borderRadius:24,gap:10},between:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},statusPill:{overflow:'hidden',paddingHorizontal:12,paddingVertical:6,borderRadius:20,backgroundColor:'#F0EEE7',color:'#53645F',fontSize:10,fontWeight:'900'},changePill:{backgroundColor:'#F0EEE7',color:'#53645F'},goodPill:{backgroundColor:'#E1EEE8',color:'#316553'},watchPill:{backgroundColor:'#FCF0D6',color:'#91610D'},alertPill:{backgroundColor:'#FBE5E2',color:RED},listRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:'#EEECE5',paddingVertical:8},statusDot:{width:8,height:8,borderRadius:4,backgroundColor:GOLD},itemTitle:{color:GREEN,fontSize:13,fontWeight:'800',flexShrink:1},money:{color:GREEN,fontSize:13,fontWeight:'900'},primaryButton:{minHeight:52,alignItems:'center',justifyContent:'center',backgroundColor:GREEN,borderRadius:28},primaryButtonText:{color:'#fff',fontWeight:'900',fontSize:14},toggleRow:{flexDirection:'row',gap:10},toggle:{flex:1,flexDirection:'row',padding:3,borderRadius:24,backgroundColor:'#EEECE5'},toggleButton:{flex:1,minHeight:40,alignItems:'center',justifyContent:'center',borderRadius:21},toggleSelected:{backgroundColor:GREEN},toggleText:{color:SAGE,fontWeight:'800',fontSize:11},toggleTextSelected:{color:'#fff',fontWeight:'800',fontSize:11},categoryRow:{minHeight:60,flexDirection:'row',alignItems:'center',gap:8,borderTopWidth:1,borderTopColor:'#EEECE5',paddingVertical:9},safeCard:{backgroundColor:'#E2EFE9',borderRadius:24,padding:20,gap:7},link:{color:TEAL,fontSize:12,fontWeight:'900',textDecorationLine:'underline'},linkButton:{minHeight:40,justifyContent:'center',alignItems:'flex-start'},disclaimer:{color:SAGE,fontSize:10,lineHeight:15,textAlign:'center',paddingHorizontal:10},actionSuggestion:{backgroundColor:'#F5F7F3',borderRadius:14,padding:12,gap:6},insightCard:{backgroundColor:'#fff',padding:18,borderRadius:24,gap:10},insightLabel:{color:TEAL,fontSize:11,fontWeight:'900'},insightTitle:{color:GREEN,fontSize:18,fontWeight:'900',marginTop:2},insightMetric:{color:GREEN,fontSize:15,fontWeight:'900'},softButton:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',paddingHorizontal:14,borderRadius:24,backgroundColor:'#E1EEE8'},softButtonText:{color:TEAL,fontSize:12,fontWeight:'900',textAlign:'center'},whyButton:{minHeight:44,paddingHorizontal:6,justifyContent:'center'},explanation:{backgroundColor:'#F5F7F3',borderRadius:14,padding:12,gap:8},explanationTitle:{color:GREEN,fontSize:12,fontWeight:'900'},evidenceRow:{flexDirection:'row',justifyContent:'space-between',gap:10},evidenceValue:{color:GREEN,fontSize:11,fontWeight:'800',textAlign:'right',flexShrink:1},chip:{minHeight:38,justifyContent:'center',paddingHorizontal:13,borderRadius:20,backgroundColor:'#EEECE5'},chipSelected:{backgroundColor:GREEN},chipText:{color:GREEN,fontSize:11,fontWeight:'800'},input:{minHeight:46,borderRadius:12,borderWidth:1,borderColor:'#E3E8E2',paddingHorizontal:14,color:GREEN,backgroundColor:'#FAFAF7'},error:{color:RED,fontSize:12},forecastValue:{color:GREEN,fontSize:19,fontWeight:'900'},safeValue:{color:GREEN,fontSize:28,fontWeight:'900'},guideLink:{minHeight:36,flexDirection:'row',alignItems:'center',gap:6},guideOverlay:{flex:1,backgroundColor:'rgba(13,34,30,0.42)',justifyContent:'flex-end',paddingHorizontal:8},guidePage:{height:'88%',backgroundColor:'#FAF7F2',borderTopLeftRadius:26,borderTopRightRadius:26,overflow:'hidden'},guideScroll:{flex:1},guideFooter:{paddingHorizontal:16,paddingTop:10,paddingBottom:10,backgroundColor:'#FAF7F2',borderTopWidth:1,borderTopColor:'#EEECE5'},guideHeader:{flexDirection:'row',alignItems:'center',paddingHorizontal:18,paddingBottom:10,gap:12},guideTitle:{color:GREEN,fontSize:22,fontWeight:'900'},guideClose:{width:42,height:42,borderRadius:21,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},guideBody:{padding:16,paddingBottom:20,gap:12},guideCard:{backgroundColor:'#fff',borderRadius:22,padding:17,gap:12},guideLead:{color:GREEN,fontSize:14,lineHeight:21,fontWeight:'700'},guideStep:{flexDirection:'row',gap:10,alignItems:'flex-start'},guideNumber:{width:26,height:26,borderRadius:13,backgroundColor:GREEN,alignItems:'center',justifyContent:'center'},guideNumberText:{color:'#fff',fontSize:12,fontWeight:'900'},guideStepTitle:{color:GREEN,fontSize:12,fontWeight:'900',marginBottom:3},guideValues:{borderTopWidth:1,borderTopColor:'#EEF0EC',paddingTop:10,gap:7},guideSectionTitle:{color:GREEN,fontSize:13,fontWeight:'900'},guideValueRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},guideValue:{color:GREEN,fontSize:12,fontWeight:'900'},guideTotal:{borderTopWidth:1,borderTopColor:'#EEF0EC',paddingTop:9,marginTop:2},guideNote:{backgroundColor:'#E2EFE9',borderRadius:18,padding:16,gap:7}
});

function GuideStep({ number, title, body }: { number: string; title: string; body: string }) {
  return <View style={s.guideStep}><View style={s.guideNumber}><Text style={s.guideNumberText}>{number}</Text></View><View style={{flex:1}}><Text style={s.guideStepTitle}>{title}</Text><Text style={s.copy}>{body}</Text></View></View>;
}
