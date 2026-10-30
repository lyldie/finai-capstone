import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config';
import { getSecureItem } from '../utils/secureStorage';
import ForecastTimelineChart, { ChartPoint } from './ForecastTimelineChart';
import { CategoryForecast, PlanningData } from '../types/planning';

const GREEN = '#233D36', TEAL = '#4C806F', GOLD = '#E8B844', SAGE = '#6C817C', RED = '#B7443F';
const peso = (v: unknown) => `${String.fromCharCode(0x20b1)}${(Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
type Props = { data: PlanningData; onFinn: () => void; onManageBills: () => void; onCategory: (item: CategoryForecast, period: 'monthly' | 'weekly') => void };

function totalRange(items: any[], period: 'monthly' | 'weekly', edge: 'range_low' | 'range_high') {
  if (!items.length || items.some((item) => item[period]?.[edge] == null)) return null;
  return items.reduce((sum, item) => sum + Number(item[period][edge]), 0);
}

function futureLabels(asOf: string | undefined, period: 'monthly' | 'weekly', count: number) {
  if (period === 'weekly') return Array.from({ length: count }, (_, i) => `W+${i + 1}`);
  const date = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(`${asOf}T12:00:00`) : new Date();
  return Array.from({ length: count }, (_, i) => {
    const next = new Date(date.getFullYear(), date.getMonth() + i + 1, 1);
    return next.toLocaleString('en-US', { month: 'short' });
  });
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
  const [tab, setTab] = useState<'Outlook' | 'Forecast' | 'Insights'>('Outlook');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [goalExtraAmount, setGoalExtraAmount] = useState('');
  const [goalWhatIfResult, setGoalWhatIfResult] = useState<any>(null);
  const [goalWhatIfLoading, setGoalWhatIfLoading] = useState(false);
  const [whatIfCategory, setWhatIfCategory] = useState('');
  const [whatIfAmount, setWhatIfAmount] = useState('');
  const [whatIfResult, setWhatIfResult] = useState<any>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  const categoryForecasts = data.category_forecasts || [];
  const items = categoryForecasts.filter((item: any) => item.type === kind);
  const expenses = categoryForecasts.filter((item: any) => item.type === 'expense');
  const incomes = categoryForecasts.filter((item: any) => item.type === 'income');
  const actualCount = period === 'monthly' ? 3 : 4;
  const forecastCount = period === 'monthly' ? 3 : 4;
  const forecastConfidence = items.length === 0 ? 'No data' : items.some((item: any) => item[period]?.confidence === 'low') ? 'Low confidence' : items.some((item: any) => item[period]?.confidence === 'medium') ? 'Medium confidence' : 'High confidence';
  const total = items.reduce((sum: number, item: any) => sum + (Number(item[period]?.forecast) || 0), 0);
  const rangeLow = totalRange(items, period, 'range_low');
  const rangeHigh = totalRange(items, period, 'range_high');
  const chartActual: ChartPoint[] = useMemo(() => {
    const totals = new Map<string, number>();
    items.forEach((item: any) => item[period]?.periods?.forEach((point: any) => totals.set(point.label, (totals.get(point.label) || 0) + Number(point.actual || 0))));
    return [...totals.entries()].slice(-actualCount).map(([label, value], i, all) => ({
      label: period === 'weekly' ? `W-${all.length - i}` : label.split(' ')[0], value,
    }));
  }, [items, period, actualCount]);
  const outlookChart = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    categoryForecasts.forEach((item: any) => item.monthly?.periods?.forEach((point: any) => {
      const current = totals.get(point.label) || { income: 0, expense: 0 };
      current[item.type as 'income' | 'expense'] += Number(point.actual) || 0;
      totals.set(point.label, current);
    }));
    const actual = [...totals.entries()].slice(-3).map(([label, value]) => ({ label: label.split(' ')[0], value: value.income - value.expense }));
    const incomeLow = totalRange(incomes, 'monthly', 'range_low'), incomeHigh = totalRange(incomes, 'monthly', 'range_high');
    const expenseLow = totalRange(expenses, 'monthly', 'range_low'), expenseHigh = totalRange(expenses, 'monthly', 'range_high');
    return {
      actual,
      forecast: Number(data.monthly_net_forecast) || 0,
      rangeLow: incomeLow == null || expenseHigh == null ? null : incomeLow - expenseHigh,
      rangeHigh: incomeHigh == null || expenseLow == null ? null : incomeHigh - expenseLow,
    };
  }, [categoryForecasts, data.monthly_net_forecast, incomes, expenses]);
  const projectedIncome = incomes.reduce((sum: number, item: any) => sum + Number(item.monthly?.forecast || 0), 0);
  const projectedExpense = expenses.reduce((sum: number, item: any) => sum + Number(item.monthly?.forecast || 0), 0);
  const urgent = (data.recommendations || []).filter((item: any) => item.priority === 'high' || item.kind === 'budget_risk').slice(0, 2);
  // Past spending comparisons belong on the dedicated Insights screen.
  const actions = (data.recommendations || [])
    .filter((item: any) => item.kind !== 'spending_pattern' && (item.action || item.actions?.length))
    .slice(0, 3);
  const goals = (data.goal_plans || []).filter((goal: any) => Number(goal.remaining) > 0 && goal.goal_id);
  const selectedGoal = goals.find((goal: any) => goal.goal_id === selectedGoalId) || goals[0];
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
    } catch (error) { setGoalWhatIfResult({ error: error instanceof Error ? error.message : 'Could not calculate this goal scenario.' }); }
    finally { setGoalWhatIfLoading(false); }
  };
  const runSpendingWhatIf = async () => {
    const amount = Number(whatIfAmount);
    if (!whatIfCategory || !Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,2})?$/.test(whatIfAmount)) return;
    setWhatIfLoading(true);
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/advisor/what-if`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify({ category_id: whatIfCategory, monthly_reduction: amount }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Could not calculate this scenario.');
      setWhatIfResult(payload);
    } catch (error) { setWhatIfResult({ error: error instanceof Error ? error.message : 'Could not calculate this scenario.' }); }
    finally { setWhatIfLoading(false); }
  };

  return <View>
    <View style={s.tabs}>{(['Outlook', 'Forecast', 'Insights'] as const).map((name) => <TouchableOpacity key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={[s.tab, tab === name && s.tabActive]}><Text style={[s.tabText, tab === name && s.tabTextActive]}>{name}</Text></TouchableOpacity>)}</View>

    {tab === 'Outlook' && <ScrollView contentContainerStyle={s.body}>
      <View style={s.hero}>
        <View style={s.between}><Text style={s.title}>Next 3 months</Text><Text style={[s.statusPill, Number(data.monthly_net_forecast) >= 0 ? s.goodPill : s.alertPill]}>{Number(data.monthly_net_forecast) >= 0 ? 'On track' : 'Review'}</Text></View>
        <Text style={s.heroValue}>{Number(data.monthly_net_forecast) >= 0 ? '+' : ''}{peso((Number(data.monthly_net_forecast) || 0) * 3)}</Text>
        <Text style={s.copy}>Projected net · avg income {peso(projectedIncome)} · avg spend {peso(projectedExpense)}/mo</Text>
        <ForecastTimelineChart actual={outlookChart.actual} forecast={outlookChart.forecast} rangeLow={outlookChart.rangeLow} rangeHigh={outlookChart.rangeHigh} forecastPeriods={3} futureLabels={futureLabels(data.metrics?.as_of_date, 'monthly', 3)} accessibilityLabel="Recorded monthly net and projected next three months" height={160}/>
      </View>
      <View style={s.tiles}>
        <View style={s.tile}><Text style={s.tileLabel}>Health</Text><Text style={s.tileValue}>{data.health_score?.score == null ? '—' : `${data.health_score.score}/100`}</Text></View>
        <View style={s.tile}><Text style={s.tileLabel}>Safe this week</Text><Text style={s.tileValue}>{peso(data.safe_to_spend?.safe_this_week)}</Text></View>
        <View style={s.tile}><Text style={s.tileLabel}>Goals</Text><Text style={s.tileValue}>{goals.length} active</Text></View>
      </View>
      <View style={s.card}><Text style={s.title}>Needs attention</Text>{urgent.length ? urgent.map((item: any, index: number) => <View key={`${item.kind}-${index}`} style={s.listRow}><View style={[s.statusDot, item.priority === 'high' && { backgroundColor: RED }]}/><View style={{flex:1}}><Text style={s.itemTitle}>{item.title}</Text><Text style={s.copy} numberOfLines={1}>{item.message}</Text></View><Text style={[s.statusPill, item.priority === 'high' ? s.alertPill : s.watchPill]}>{item.priority === 'high' ? 'Over' : 'Watch'}</Text></View>) : <Text style={s.copy}>No urgent alerts.</Text>}</View>
      <View style={s.card}><View style={s.between}><Text style={s.title}>Coming up</Text><TouchableOpacity onPress={onManageBills} accessibilityRole="button"><Text style={s.link}>Bills</Text></TouchableOpacity></View>{upcoming.length ? upcoming.map((item: any, i: number) => <View key={`${item.label}-${i}`} style={s.listRow}><Text style={s.itemTitle} numberOfLines={1}>{item.label}</Text><Text style={s.money}>{peso(item.amount)}{item.suffix || ''}</Text></View>) : <Text style={s.copy}>No bills due soon.</Text>}</View>
      <TouchableOpacity style={s.primaryButton} onPress={onFinn} accessibilityRole="button"><Text style={s.primaryButtonText}>Discuss my plan with Finn</Text></TouchableOpacity>
    </ScrollView>}

    {tab === 'Forecast' && <ScrollView contentContainerStyle={s.body}>
      {period === 'weekly' && <View style={s.safeCard}><Text style={s.copy}>Safe to spend this week</Text><Text style={s.safeValue}>{peso(data.safe_to_spend?.safe_this_week)}</Text><Text style={s.copy}>{Number(data.safe_to_spend?.safe_this_week || 0) <= 0 ? data.safe_to_spend?.reason || 'Recorded limits and bills leave no estimated amount.' : 'After upcoming bills and goal pace'}</Text></View>}
      <View style={s.toggleRow}>
        <View style={s.toggle}>{(['expense','income'] as const).map(v => <TouchableOpacity key={v} onPress={() => setKind(v)} style={[s.toggleButton,kind===v&&s.toggleSelected]}><Text style={kind===v?s.toggleTextSelected:s.toggleText}>{v==='expense'?'Expenses':'Income'}</Text></TouchableOpacity>)}</View>
        <View style={s.toggle}>{(['weekly','monthly'] as const).map(v => <TouchableOpacity key={v} onPress={() => setPeriod(v)} style={[s.toggleButton,period===v&&s.toggleSelected]}><Text style={period===v?s.toggleTextSelected:s.toggleText}>{v==='weekly'?'Weekly':'Monthly'}</Text></TouchableOpacity>)}</View>
      </View>
      <View style={s.card}>
        <View style={s.between}><Text style={s.title}>{kind === 'expense' ? 'Expenses' : 'Income'}, {period === 'weekly' ? '4-week' : '3-month'} average</Text><Text style={s.statusPill}>{forecastConfidence}</Text></View>
        <ForecastTimelineChart actual={chartActual} forecast={total} rangeLow={rangeLow} rangeHigh={rangeHigh} forecastPeriods={forecastCount} futureLabels={futureLabels(data.metrics?.as_of_date, period, forecastCount)} colorMode={kind} accessibilityLabel={`${kind} history and next ${forecastCount} ${period} forecasts`} height={190}/>
        <Text style={s.copy}>Solid bars are recorded. Dashed bars are flat estimates.</Text>
      </View>
      <View style={s.card}><View style={s.between}><Text style={s.title}>By category, next {period === 'weekly' ? 'week' : 'month'}</Text><Text style={s.copy}>All categories</Text></View>
        {items.map((item: any) => { const f=item[period]; const label = f.limit == null ? 'No limit' : 'Limit'; const trend = f.trend_pct == null ? (period === 'weekly' ? 'Flat' : 'New') : `${f.trend_pct > 0 ? '+' : ''}${f.trend_pct}%`; return <TouchableOpacity key={item.category_id} style={s.categoryRow} onPress={() => onCategory(item,period)} accessibilityRole="button" accessibilityLabel={`Details for ${item.category}`}><View style={{flex:1}}><Text style={s.itemTitle}>{item.category}</Text><Text style={s.copy}>{label}</Text></View><View style={{alignItems:'flex-end',gap:4}}><Text style={s.money}>{peso(f.forecast)}</Text><Text style={[s.statusPill, f.limit_usage_pct >= 100 ? s.alertPill : f.limit_usage_pct >= 70 ? s.watchPill : s.goodPill]}>{trend}</Text></View><Ionicons name="chevron-forward" size={16} color={SAGE}/></TouchableOpacity>})}
        {!items.length && <Text style={s.copy}>No active categories.</Text>}
      </View>
      {kind === 'expense' && period === 'monthly' && !!data.fixed_bill_forecasts?.length && <View style={s.card}><Text style={s.title}>Scheduled bills</Text>{data.fixed_bill_forecasts.slice(0,3).map((bill: any) => <View key={bill.id} style={s.listRow}><Text style={s.itemTitle}>{bill.name} · {bill.category}</Text><Text style={s.money}>{peso(bill.forecast)}</Text></View>)}<TouchableOpacity onPress={onManageBills} style={s.linkButton}><Text style={s.link}>Manage bills</Text></TouchableOpacity></View>}
      <Text style={s.disclaimer}>Estimates may miss unrecorded activity.</Text>
    </ScrollView>}

    {tab === 'Insights' && <ScrollView contentContainerStyle={s.body}>
      {actions.map((item: any,i:number) => {
        const id = `${item.kind || 'insight'}-${i}`; const isOpen = expandedInsight === id; const details = explanationRows(item); const evidence = item.evidence || {};
        const metric = evidence.same_month_spending != null ? `${peso(evidence.same_month_spending)} that month` : evidence.projected_period_end_spend != null ? `${peso(evidence.projected_period_end_spend)} projected` : evidence.monthly?.forecast != null ? `${peso(evidence.monthly.forecast)} forecast` : evidence.remaining != null ? `${peso(evidence.remaining)} left` : evidence.safe_this_week != null ? `${peso(evidence.safe_this_week)} this week` : null;
        const budgetPeriod = String(evidence.period || '').toLowerCase();
        const horizon = item.kind === 'upcoming_bill' ? 'Coming up'
          : item.kind === 'goal_plan' || item.kind === 'goal_review' || item.kind === 'long_term_cash_flow' ? 'Long-term'
          : item.kind === 'budget_risk' || item.kind === 'budget_watch'
            ? budgetPeriod.includes('week') ? 'This week' : budgetPeriod.includes('day') ? 'Today' : budgetPeriod.includes('year') ? 'This year' : 'This month'
          : item.kind === 'seasonal_pattern' || item.kind === 'sma_limit_risk' || item.kind === 'sma_trend' ? 'Next month'
          : 'This month';
        const suggestedActions = Array.isArray(item.actions) && item.actions.length ? item.actions : item.action ? [item.action] : [];
        return <View key={id} style={s.insightCard}>
          <View style={s.between}><Text style={s.insightLabel}>{data.recommendation_source === 'ai' ? 'AI INSIGHT' : 'FINAI INSIGHT'}</Text><Text style={[s.statusPill, item.priority === 'high' ? s.alertPill : item.kind === 'seasonal_pattern' ? s.watchPill : s.goodPill]}>{horizon}</Text></View>
          <Text style={s.insightTitle}>{item.title}</Text>
          <Text style={s.copy} numberOfLines={2}>{item.message}</Text>
          {metric && <Text style={s.insightMetric}>{metric}{evidence.annual_monthly_average != null ? ` · avg ${peso(evidence.annual_monthly_average)}` : evidence.limit != null ? ` · limit ${peso(evidence.limit)}` : ''}</Text>}
          <View style={{backgroundColor:"#F5F7F3",borderRadius:14,padding:12,gap:6}}><Text style={s.explanationTitle}>Suggested next step</Text>{suggestedActions.map((action: string, actionIndex: number) => <Text key={`${actionIndex}-${action}`} style={s.copy}>• {action}</Text>)}</View>
          <View style={s.between}><TouchableOpacity style={s.softButton} onPress={onFinn} accessibilityRole="button"><Text style={s.softButtonText}>Plan this with Finn</Text></TouchableOpacity><TouchableOpacity onPress={() => setExpandedInsight(isOpen ? null : id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={s.whyButton}><Text style={s.link}>{isOpen ? 'Hide' : 'Why this?'}</Text></TouchableOpacity></View>
          {isOpen && <View style={s.explanation}><Text style={s.explanationTitle}>How we calculated this</Text>{item.how_calculated ? <Text style={s.copy}>{item.how_calculated}</Text> : null}{details.map(([label,value]: any) => <View key={label} style={s.evidenceRow}><Text style={s.copy}>{label}</Text><Text style={s.evidenceValue}>{typeof value === 'number' ? peso(value) : String(value)}</Text></View>)}{!item.how_calculated && !details.length && <Text style={s.copy}>Based on recorded activity; more history can change this estimate.</Text>}</View>}
        </View>;
      })}
      {!actions.length && <View style={s.card}><Text style={s.title}>No new insights right now</Text><Text style={s.copy}>When your recorded activity points to a useful next step, it will show up here. Forecasts are estimates and may change.</Text></View>}
      {goals.length > 0 && <View style={s.card}>
        <Text style={s.title}>Goal pace</Text><Text style={s.copy}>Try an extra monthly contribution and see how much sooner you could reach it.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{goals.map((goal:any)=><TouchableOpacity key={goal.goal_id} onPress={()=>{setSelectedGoalId(goal.goal_id);setGoalWhatIfResult(null)}} style={[s.chip,selectedGoal?.goal_id===goal.goal_id&&s.chipSelected]}><Text style={[s.chipText,selectedGoal?.goal_id===goal.goal_id&&{color:'#fff'}]}>{goal.target}</Text></TouchableOpacity>)}</ScrollView>
        {selectedGoal && <Text style={s.copy}>Recent pace: {peso(selectedGoal.monthly_contribution_pace)}/mo</Text>}
        <TextInput style={s.input} placeholder="Extra per month" value={goalExtraAmount} onChangeText={setGoalExtraAmount} keyboardType="decimal-pad" accessibilityLabel="Extra monthly goal contribution"/>
        <TouchableOpacity style={s.softButton} onPress={runGoalWhatIf} disabled={goalWhatIfLoading} accessibilityRole="button">{goalWhatIfLoading?<ActivityIndicator color={TEAL}/>:<Text style={s.softButtonText}>Estimate goal timeline</Text>}</TouchableOpacity>
        {goalWhatIfResult?.error ? <Text style={s.error}>{goalWhatIfResult.error}</Text> : goalWhatIfResult && <View style={s.explanation}><Text style={s.insightMetric}>New pace {peso(goalWhatIfResult.new_monthly_contribution)}/mo</Text>{goalWhatIfResult.months_with_additional_contribution != null && <Text style={s.copy}>About {goalWhatIfResult.months_with_additional_contribution} months to reach {peso(goalWhatIfResult.remaining)}.</Text>}{goalWhatIfResult.days_saved == null ? <Text style={s.copy}>No recent contribution pace to compare yet.</Text> : <Text style={s.copy}>About {goalWhatIfResult.days_saved} days sooner than the recent pace.</Text>}</View>}
      </View>}
      <View style={s.card}><Text style={s.title}>What if spending changed?</Text><Text style={s.copy}>Estimate the 3-month impact of spending less.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{expenses.map((item:any)=><TouchableOpacity key={item.category_id} onPress={()=>{setWhatIfCategory(item.category_id);setWhatIfResult(null)}} style={[s.chip,whatIfCategory===item.category_id&&s.chipSelected]}><Text style={[s.chipText,whatIfCategory===item.category_id&&{color:'#fff'}]}>{item.category}</Text></TouchableOpacity>)}</ScrollView><TextInput style={s.input} placeholder="Less per month" value={whatIfAmount} onChangeText={setWhatIfAmount} keyboardType="decimal-pad" accessibilityLabel="Monthly expense reduction"/><TouchableOpacity style={s.softButton} onPress={runSpendingWhatIf} disabled={whatIfLoading} accessibilityRole="button">{whatIfLoading?<ActivityIndicator color={TEAL}/>:<Text style={s.softButtonText}>Calculate impact</Text>}</TouchableOpacity>{whatIfResult?.error?<Text style={s.error}>{whatIfResult.error}</Text>:whatIfResult&&<Text style={s.insightMetric}>{peso(whatIfResult.net_forecast_change)} potential improvement in 3 months</Text>}</View>
      <Text style={s.disclaimer}>Suggestions use recorded data and forecasts. Review them against your plans before making changes.</Text>
    </ScrollView>}
  </View>;
}

const s=StyleSheet.create({
  tabs:{flexDirection:'row',marginHorizontal:16,marginTop:8,padding:4,borderRadius:30,backgroundColor:'#EEECE5'},tab:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:25},tabActive:{backgroundColor:GREEN},tabText:{color:SAGE,fontWeight:'800',fontSize:13},tabTextActive:{color:'#fff'},body:{padding:16,paddingBottom:32,gap:14},hero:{backgroundColor:'#fff',borderRadius:26,padding:20,gap:11},title:{color:GREEN,fontSize:17,fontWeight:'900'},heroValue:{color:TEAL,fontSize:36,fontWeight:'900',marginTop:3},copy:{color:'#627772',fontSize:12,lineHeight:18},tiles:{flexDirection:'row',gap:10},tile:{flex:1,backgroundColor:'#fff',padding:13,borderRadius:23,minHeight:82,justifyContent:'center',gap:8},tileLabel:{color:'#627772',fontSize:11},tileValue:{color:GREEN,fontSize:16,fontWeight:'900'},card:{backgroundColor:'#fff',padding:18,borderRadius:24,gap:10},between:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},statusPill:{overflow:'hidden',paddingHorizontal:12,paddingVertical:6,borderRadius:20,backgroundColor:'#F0EEE7',color:'#53645F',fontSize:10,fontWeight:'900'},goodPill:{backgroundColor:'#E1EEE8',color:'#316553'},watchPill:{backgroundColor:'#FCF0D6',color:'#91610D'},alertPill:{backgroundColor:'#FBE5E2',color:RED},listRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:'#EEECE5',paddingVertical:8},statusDot:{width:8,height:8,borderRadius:4,backgroundColor:GOLD},itemTitle:{color:GREEN,fontSize:13,fontWeight:'800',flexShrink:1},money:{color:GREEN,fontSize:13,fontWeight:'900'},primaryButton:{minHeight:52,alignItems:'center',justifyContent:'center',backgroundColor:GREEN,borderRadius:28},primaryButtonText:{color:'#fff',fontWeight:'900',fontSize:14},toggleRow:{flexDirection:'row',gap:10},toggle:{flex:1,flexDirection:'row',padding:3,borderRadius:24,backgroundColor:'#EEECE5'},toggleButton:{flex:1,minHeight:40,alignItems:'center',justifyContent:'center',borderRadius:21},toggleSelected:{backgroundColor:GREEN},toggleText:{color:SAGE,fontWeight:'800',fontSize:11},toggleTextSelected:{color:'#fff',fontWeight:'800',fontSize:11},categoryRow:{minHeight:60,flexDirection:'row',alignItems:'center',gap:8,borderTopWidth:1,borderTopColor:'#EEECE5',paddingVertical:9},safeCard:{backgroundColor:'#E2EFE9',borderRadius:24,padding:20,gap:7},safeValue:{color:TEAL,fontSize:34,fontWeight:'900'},link:{color:TEAL,fontSize:12,fontWeight:'900',textDecorationLine:'underline'},linkButton:{minHeight:40,justifyContent:'center',alignItems:'flex-start'},disclaimer:{color:SAGE,fontSize:10,lineHeight:15,textAlign:'center',paddingHorizontal:10},actionSuggestion:{backgroundColor:'#F5F7F3',borderRadius:14,padding:12,gap:6},insightCard:{backgroundColor:'#fff',padding:18,borderRadius:24,gap:10},insightLabel:{color:TEAL,fontSize:11,fontWeight:'900'},insightTitle:{color:GREEN,fontSize:18,fontWeight:'900',marginTop:2},insightMetric:{color:GREEN,fontSize:15,fontWeight:'900'},softButton:{minHeight:44,alignItems:'center',justifyContent:'center',paddingHorizontal:14,borderRadius:24,backgroundColor:'#E1EEE8'},softButtonText:{color:TEAL,fontSize:12,fontWeight:'900'},whyButton:{minHeight:44,paddingHorizontal:6,justifyContent:'center'},explanation:{backgroundColor:'#F5F7F3',borderRadius:14,padding:12,gap:8},explanationTitle:{color:GREEN,fontSize:12,fontWeight:'900'},evidenceRow:{flexDirection:'row',justifyContent:'space-between',gap:10},evidenceValue:{color:GREEN,fontSize:11,fontWeight:'800',textAlign:'right',flexShrink:1},chip:{minHeight:38,justifyContent:'center',paddingHorizontal:13,borderRadius:20,backgroundColor:'#EEECE5'},chipSelected:{backgroundColor:GREEN},chipText:{color:GREEN,fontSize:11,fontWeight:'800'},input:{minHeight:46,borderRadius:12,borderWidth:1,borderColor:'#E3E8E2',paddingHorizontal:14,color:GREEN,backgroundColor:'#FAFAF7'},error:{color:RED,fontSize:12}
});
