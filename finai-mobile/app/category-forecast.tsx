import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ForecastTimelineChart from '../components/ForecastTimelineChart';
import { CategoryForecast } from '../types/planning';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildPlanAheadChatContext, planAheadChatStorageKey } from '../utils/planAheadChatContext';

const GREEN = '#233D36', TEAL = '#4C806F', SAGE = '#71847F', GOLD = '#D9A62E', CREAM = '#FAF7F2', EXPENSE = '#C96B65';
const money = (value: number | null | undefined) => `\u20B1${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function CategoryForecastScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { period, name, forecast: rawForecast } = useLocalSearchParams<{ period: 'monthly' | 'weekly'; name: string; forecast: string }>();
  const [showFormula, setShowFormula] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const forecast = useMemo<CategoryForecast | null>(() => {
    try { return JSON.parse(String(rawForecast || 'null')) as CategoryForecast | null; }
    catch { return null; }
  }, [rawForecast, period]);

  const values = period === 'weekly' ? forecast?.weekly : forecast?.monthly;
  const isExpense = forecast?.type !== 'income';
  const windowSize = period === 'weekly' ? 4 : 3;
  const usedAmounts = values?.window || [];
  const usedPeriods = values?.periods?.slice(-usedAmounts.length) || [];
  const transactionCount = usedPeriods.reduce((sum, point) => sum + Number(point.transaction_count || 0), 0);
  const amountPerTransaction = transactionCount ? usedPeriods.reduce((sum, point) => sum + Number(point.actual || 0), 0) / transactionCount : null;
  const averageFrequency = usedPeriods.length ? transactionCount / usedPeriods.length : 0;
  const usage = Math.max(0, Math.min(Number(values?.limit_usage_pct) || 0, 100));
  const nextPeriod = period === 'weekly' ? 'week' : 'month';
  const trendLabel = values?.trend_pct == null ? 'Change needs more history' : `Compared with previous ${windowSize} ${period === 'weekly' ? 'weeks' : 'months'}`;
  const estimateNote = !values ? '' : usedAmounts.length < windowSize
    ? `This estimate uses ${usedAmounts.length} of ${windowSize} completed periods.`
    : Number(values.forecast) === 0
      ? 'There is no recent recorded activity for this category.'
      : values.confidence === 'low'
        ? `Recorded ${isExpense ? 'spending' : 'income'} varied across the periods used.`
        : '';
  const recommendation = !values ? '' : values.limit != null && isExpense
    ? Number(values.forecast) > Number(values.limit)
      ? `The estimate is ${money(Number(values.forecast) - Number(values.limit))} above your ${money(values.limit)} limit. Review planned spending or adjust the limit if your plans have changed.`
      : `The estimate is ${money(Number(values.limit) - Number(values.forecast))} below your limit. A ${money(Number(values.forecast) / (period === 'weekly' ? 1 : 4.33))} weekly target can keep spending near this estimate.`
    : values.confidence === 'low' ? `Record ${isExpense ? 'spending' : 'income'} consistently to make this estimate more useful.` : `Use ${money(values.forecast)} as a reference for your next ${period === 'weekly' ? 'week' : 'month'}; update it if your plans change.`;

  const askFinnAboutEstimate = async () => {
    if (!forecast) return;
    const prompt = `Please explain my ${period === 'weekly' ? 'weekly' : 'monthly'} ${forecast.type} estimate for ${forecast.category}. Explain the estimate, range, recent recorded periods, and any budget limit. Distinguish recorded values from estimates.`;
    try {
      if (user?.id) {
        const cached = await AsyncStorage.getItem(`@offline_${user.id}_planning_data`);
        const parsed = cached ? JSON.parse(cached) : null;
        const fullData = parsed?.data || parsed;
        const context = fullData?.category_forecasts
          ? buildPlanAheadChatContext(fullData, forecast.category)
          : buildPlanAheadChatContext({
              category_forecasts: [forecast], monthly_net_forecast: null as any,
              recommendations: [], goal_plans: [],
            } as any, forecast.category);
        await AsyncStorage.setItem(planAheadChatStorageKey(user.id), JSON.stringify(context));
        router.push({ pathname: '/chat', params: { topic: isExpense ? 'budget' : 'general', prefill: prompt, plan_ahead: '1' } });
        return;
      }
    } catch { /* The question can still be sent without the saved Plan Ahead context. */ }
    router.push({ pathname: '/chat', params: { topic: isExpense ? 'budget' : 'general', prefill: prompt } });
  };

  return <SafeAreaView style={s.page} edges={['top', 'left', 'right']}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={21} color={GREEN}/></TouchableOpacity>
      <View style={s.headerText}><Text style={s.title} numberOfLines={1}>{name || 'Category detail'}</Text><Text style={s.subtitle}>{period === 'weekly' ? 'Weekly outlook' : 'Monthly outlook'}</Text></View>
    </View>
    {!forecast || !values ? <Text style={s.error}>This estimate could not be loaded. Return to Plan Ahead and open the category again.</Text> : <ScrollView contentContainerStyle={s.content}>
      <View style={s.takeaway}><Text style={s.takeawayText}>{values.limit == null || !isExpense
        ? `${name || 'This category'} is estimated at about ${money(values.forecast)} next ${nextPeriod}.`
        : `${name || 'This category'} is estimated at about ${money(values.forecast)} next ${nextPeriod}, ${Number(values.forecast) <= Number(values.limit) ? 'within' : 'above'} your ${money(values.limit)} limit.`}</Text></View>

      <View style={s.hero}>
        <View style={s.row}><Text style={s.eyebrow}>ESTIMATE FOR NEXT {nextPeriod.toUpperCase()}</Text></View>
        <Text style={[s.value, isExpense && { color: EXPENSE }]}>{money(values.forecast)}</Text>
        {values.limit != null ? <>
          <View style={s.row}><Text style={s.label}>Budget limit</Text><Text style={s.limit}>{money(values.limit)}</Text></View>
          <View style={s.track}><View style={[s.fill, usage >= 90 && s.fillHigh, { width: `${usage}%` }]}/></View>
          <View style={s.row}><Text style={s.usage}>{values.limit_usage_pct}% of {money(values.limit)} limit</Text><Text style={s.range}>{values.range_low == null ? 'No range available' : `Likely ${money(values.range_low)}–${money(values.range_high)}`}</Text></View>
        </> : <Text style={s.subtle}>{values.range_low == null ? 'Based on recorded activity' : `Likely range ${money(values.range_low)}–${money(values.range_high)}`}</Text>}
        {!!estimateNote && <Text style={s.subtle}>{estimateNote}</Text>}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>How we got {money(values.forecast)}</Text>
        <Text style={s.subtle}>Average of your last {windowSize} completed {period === 'weekly' ? 'weeks' : 'months'}.</Text>
        <View style={s.periodPills}>{usedPeriods.map((point, index) => <View key={`${point.label}-${index}`} style={s.periodPill}><Text style={s.periodLabel}>{point.label.split(' ')[0]}</Text><Text style={[s.periodAmount, isExpense && { color: EXPENSE }]}>{money(usedAmounts[index])}</Text></View>)}</View>
        {usedAmounts.length > 0 && <Text style={[s.equation, isExpense && { color: EXPENSE }]}>{usedAmounts.map(money).join(' + ')} ÷ {usedAmounts.length} = {money(values.forecast)}</Text>}
        <Text style={s.subtle}>This is the average of recorded category amounts for those periods.</Text>
      </View>

      <View style={s.card}>
        <View style={s.row}><Text style={s.sectionTitle}>{isExpense ? 'Spending history' : 'Income history'}</Text><Text style={s.subtle}>Dashed bar = estimate</Text></View>
        {values.periods?.length ? <ForecastTimelineChart
          actual={values.periods.map((point) => ({ label: point.label.split(' ')[0], value: Number(point.actual) || 0 }))}
          forecast={values.forecast} rangeLow={values.range_low} rangeHigh={values.range_high} limit={values.limit}
          showLegend showValueLabels colorMode={isExpense ? 'expense' : 'income'} accessibilityLabel={`${name || 'Category'} history, estimate and budget limit`} height={205}
        /> : <Text style={s.subtle}>No completed periods to chart yet.</Text>}
        <Text style={s.subtle}>Based on {usedPeriods.map((point) => point.label.split(' ')[0]).join(', ') || 'available recorded periods'}.</Text>
      </View>

      <View style={s.card}>
        <View style={s.row}><Text style={s.sectionTitle}>What stands out</Text><TouchableOpacity onPress={() => setShowMore((open) => !open)} accessibilityRole="button"><Text style={s.more}>{showMore ? 'Less' : 'More'}</Text></TouchableOpacity></View>
        <View style={s.metricRow}><View><Text style={s.metricLabel}>Purchases per {period === 'monthly' ? 'month' : 'week'}</Text><Text style={s.metricValue}>{averageFrequency.toFixed(1)}</Text></View><View><Text style={s.metricLabel}>Average purchase</Text><Text style={[s.metricValue, isExpense && { color: EXPENSE }]}>{amountPerTransaction == null ? '—' : money(amountPerTransaction)}</Text></View></View>
        <View style={s.biggestDay}><Text style={s.metricLabel}>{trendLabel}</Text><Text style={s.metricValue}>{values.trend_pct == null ? '—' : `${values.trend_pct > 0 ? '+' : ''}${values.trend_pct}%`}</Text></View>
        {showMore && forecast?.drivers.largest_recorded_day && <View style={s.biggestDay}><Text style={s.metricLabel}>Highest {isExpense ? 'spending' : 'income'} recorded day</Text><Text style={s.metricValue}>{forecast.drivers.largest_recorded_day.date} · {money(forecast.drivers.largest_recorded_day.amount)}</Text></View>}
      </View>

      <View style={s.tip}><View style={s.tipIcon}><Ionicons name="bulb-outline" size={19} color={GOLD}/></View><View style={{ flex: 1 }}><Text style={s.tipTitle}>A next step</Text><Text style={s.tipText}>{recommendation}</Text></View></View>

      <TouchableOpacity style={s.askFinn} onPress={askFinnAboutEstimate} accessibilityRole="button"><Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF"/><Text style={s.askFinnText}>Ask Finn about this estimate</Text></TouchableOpacity>

      <TouchableOpacity style={s.why} onPress={() => setShowFormula((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: showFormula }}>
        <Ionicons name={showFormula ? 'chevron-up' : 'help-circle-outline'} size={18} color={TEAL}/><Text style={s.whyText}>{showFormula ? 'Hide details' : 'About this estimate and range'}</Text><View style={{ flex: 1 }}/><Ionicons name={showFormula ? 'chevron-up' : 'chevron-down'} size={17} color={SAGE}/>
      </TouchableOpacity>
      {showFormula && <View style={s.explanation}>
        {!!estimateNote && <Text style={s.subtle}>{estimateNote}</Text>}
        <Text style={s.subtle}>The range reflects how much the periods used in the average varied. It is hidden when there is too little recorded history.</Text>
        <Text style={s.disclaimer}>This estimate uses recorded transactions only and may miss unrecorded activity or one-time changes.</Text>
      </View>}
    </ScrollView>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: CREAM },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18 },
  back: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  headerText: { flex: 1 }, title: { color: GREEN, fontSize: 21, fontWeight: '900' }, subtitle: { color: SAGE, fontSize: 12, marginTop: 3 },
  content: { padding: 16, paddingBottom: 32, gap: 13 }, hero: { backgroundColor: '#fff', borderRadius: 25, padding: 20, gap: 9 }, takeaway: { backgroundColor: '#E2EFE9', borderRadius: 19, padding: 15 }, takeawayText: { color: GREEN, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, eyebrow: { color: SAGE, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  value: { color: GREEN, fontSize: 39, lineHeight: 46, fontWeight: '900', marginVertical: 2 }, label: { color: SAGE, fontSize: 12 }, limit: { color: GREEN, fontSize: 13, fontWeight: '900' }, track: { height: 8, borderRadius: 6, backgroundColor: '#E9E7DF', overflow: 'hidden', marginTop: 2 }, fill: { height: '100%', borderRadius: 6, backgroundColor: TEAL }, fillHigh: { backgroundColor: GOLD }, usage: { color: TEAL, fontSize: 11, fontWeight: '800' }, range: { color: SAGE, fontSize: 11, fontWeight: '700' }, subtle: { color: SAGE, fontSize: 11, lineHeight: 17 },
  card: { backgroundColor: '#fff', padding: 17, borderRadius: 23, gap: 10 }, sectionTitle: { color: GREEN, fontSize: 16, fontWeight: '900' }, metricRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 7 }, metricLabel: { color: SAGE, fontSize: 10 }, metricValue: { color: GREEN, fontSize: 13, fontWeight: '900', marginTop: 5 }, biggestDay: { borderTopWidth: 1, borderTopColor: '#EEF0EC', paddingTop: 10, marginTop: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, periodPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, periodPill: { backgroundColor: '#EEECE5', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, gap: 3 }, periodLabel: { color: SAGE, fontSize: 10 }, periodAmount: { color: GREEN, fontSize: 11, fontWeight: '900' }, equation: { color: GREEN, fontSize: 14, fontWeight: '900', lineHeight: 20 }, more: { color: TEAL, fontSize: 11, fontWeight: '900' },
  tip: { backgroundColor: '#E7F0EA', borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 11 }, tipIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }, tipTitle: { color: GREEN, fontSize: 13, fontWeight: '900', marginBottom: 4 }, tipText: { color: '#536B64', fontSize: 12, lineHeight: 18 },
  askFinn: { minHeight: 50, borderRadius: 17, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, askFinnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  why: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }, whyText: { color: TEAL, fontSize: 12, fontWeight: '900' }, explanation: { backgroundColor: '#fff', padding: 15, borderRadius: 17, gap: 8, marginTop: -9 }, disclaimer: { color: SAGE, fontSize: 10, lineHeight: 15, marginTop: 2 }, error: { color: '#A8403A', padding: 20 },
});
