import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ForecastTimelineChart from '../components/ForecastTimelineChart';
import { CategoryForecast } from '../types/planning';

const GREEN = '#233D36', TEAL = '#4C806F', SAGE = '#71847F', GOLD = '#D9A62E', CREAM = '#FAF7F2';
const money = (value: number | null | undefined) => `\u20B1${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function CategoryForecastScreen() {
  const router = useRouter();
  const { period, name, forecast: rawForecast } = useLocalSearchParams<{ period: 'monthly' | 'weekly'; name: string; forecast: string }>();
  const [showFormula, setShowFormula] = useState(false);
  const forecast = useMemo<CategoryForecast | null>(() => {
    try { return JSON.parse(String(rawForecast || 'null')) as CategoryForecast | null; }
    catch { return null; }
  }, [rawForecast, period]);

  const values = period === 'weekly' ? forecast?.weekly : forecast?.monthly;
  const transactionCount = values?.periods?.reduce((sum, point) => sum + Number(point.transaction_count || 0), 0) || 0;
  const amountPerTransaction = values?.periods && transactionCount ? values.periods.reduce((sum, point) => sum + Number(point.actual || 0), 0) / transactionCount : null;
  const averageFrequency = values?.periods?.length ? transactionCount / values.periods.length : 0;
  const usage = Math.max(0, Math.min(Number(values?.limit_usage_pct) || 0, 100));
  const nextPeriod = period === 'weekly' ? 'week' : 'month';
  const recommendation = !values ? '' : values.limit != null && Number(values.limit_usage_pct) >= 90
    ? 'This estimate is close to the limit. Review recent records before changing your plan.'
      : Number(values.trend_pct) > 15
      ? 'Spending is trending up. Check the latest purchases to see what changed.'
      : values.confidence === 'low'
        ? 'Keep recording purchases to give this estimate more history.'
        : 'Use this estimate as a planning guide; adjust your limit if your plans have changed.';

  return <SafeAreaView style={s.page} edges={['top', 'left', 'right']}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={21} color={GREEN}/></TouchableOpacity>
      <View style={s.headerText}><Text style={s.title} numberOfLines={1}>{name || 'Category detail'}</Text><Text style={s.subtitle}>{period === 'weekly' ? 'Weekly outlook' : 'Monthly outlook'}</Text></View>
    </View>
    {!forecast || !values ? <Text style={s.error}>This forecast is unavailable. Go back and select the category again.</Text> : <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}>
        <View style={s.row}><Text style={s.eyebrow}>ESTIMATED NEXT {nextPeriod.toUpperCase()}</Text><Text style={s.confidence}>{values.confidence} confidence</Text></View>
        <Text style={s.value}>{money(values.forecast)}</Text>
        {values.limit != null ? <>
          <View style={s.row}><Text style={s.label}>Budget limit</Text><Text style={s.limit}>{money(values.limit)}</Text></View>
          <View style={s.track}><View style={[s.fill, usage >= 90 && s.fillHigh, { width: `${usage}%` }]}/></View>
          <View style={s.row}><Text style={s.usage}>{values.limit_usage_pct}% of limit</Text><Text style={s.range}>{values.range_low == null ? 'Estimate' : `${money(values.range_low)}–${money(values.range_high)}`}</Text></View>
        </> : <Text style={s.subtle}>{values.range_low == null ? 'Based on recorded activity' : `Likely range ${money(values.range_low)}–${money(values.range_high)}`}</Text>}
      </View>

      <View style={s.card}>
        <View style={s.row}><Text style={s.sectionTitle}>Spending history</Text><Text style={s.subtle}>{values.period_count} completed periods</Text></View>
        {values.periods?.length ? <ForecastTimelineChart
          actual={values.periods.map((point) => ({ label: point.label.split(' ')[0], value: Number(point.actual) || 0 }))}
          forecast={values.forecast} rangeLow={values.range_low} rangeHigh={values.range_high} limit={values.limit}
          accessibilityLabel={`${name || 'Category'} history, forecast and budget limit`} height={205}
        /> : <Text style={s.subtle}>No completed periods to chart yet.</Text>}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>What stands out</Text>
        <View style={s.metricRow}><View><Text style={s.metricLabel}>Records per period</Text><Text style={s.metricValue}>{averageFrequency.toFixed(1)}</Text></View><View><Text style={s.metricLabel}>Average purchase</Text><Text style={s.metricValue}>{amountPerTransaction == null ? '—' : money(amountPerTransaction)}</Text></View><View><Text style={s.metricLabel}>Recent change</Text><Text style={s.metricValue}>{values.trend_pct == null ? '—' : `${values.trend_pct > 0 ? '+' : ''}${values.trend_pct}%`}</Text></View></View>
        {forecast?.drivers.largest_recorded_day && <View style={s.biggestDay}><Text style={s.metricLabel}>Largest recorded day in the available history</Text><Text style={s.metricValue}>{forecast.drivers.largest_recorded_day.date} · {money(forecast.drivers.largest_recorded_day.amount)}</Text></View>}
      </View>

      <View style={s.tip}><View style={s.tipIcon}><Ionicons name="bulb-outline" size={19} color={GOLD}/></View><View style={{ flex: 1 }}><Text style={s.tipTitle}>A next step</Text><Text style={s.tipText}>{recommendation}</Text></View></View>

      <TouchableOpacity style={s.why} onPress={() => setShowFormula((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: showFormula }}>
        <Ionicons name={showFormula ? 'chevron-up' : 'help-circle-outline'} size={18} color={TEAL}/><Text style={s.whyText}>{showFormula ? 'Hide calculation' : 'Why this estimate?'}</Text><View style={{ flex: 1 }}/><Ionicons name={showFormula ? 'chevron-up' : 'chevron-down'} size={17} color={SAGE}/>
      </TouchableOpacity>
      {showFormula && <View style={s.explanation}>
        <Text style={s.subtle}>Simple moving average of the last {period === 'weekly' ? '4 completed ISO weeks' : '3 completed calendar months'}. Empty periods count as zero when the category already existed.</Text>
        <Text style={s.subtle}>Recorded amounts: {(values.periods || []).slice(-(period === 'weekly' ? 4 : 3)).map((point) => money(point.actual)).join(' · ') || 'No completed periods'}.</Text>
        <Text style={s.subtle}>The range uses the sample variation in those periods and is hidden when there is too little stable history.</Text>
        <Text style={s.disclaimer}>This estimate only uses recorded transactions and may miss unrecorded spending.</Text>
      </View>}
    </ScrollView>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: CREAM },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18 },
  back: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  headerText: { flex: 1 }, title: { color: GREEN, fontSize: 21, fontWeight: '900' }, subtitle: { color: SAGE, fontSize: 12, marginTop: 3 },
  content: { padding: 16, paddingBottom: 32, gap: 13 }, hero: { backgroundColor: '#fff', borderRadius: 25, padding: 20, gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, eyebrow: { color: SAGE, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, confidence: { color: TEAL, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  value: { color: GREEN, fontSize: 39, lineHeight: 46, fontWeight: '900', marginVertical: 2 }, label: { color: SAGE, fontSize: 12 }, limit: { color: GREEN, fontSize: 13, fontWeight: '900' }, track: { height: 8, borderRadius: 6, backgroundColor: '#E9E7DF', overflow: 'hidden', marginTop: 2 }, fill: { height: '100%', borderRadius: 6, backgroundColor: TEAL }, fillHigh: { backgroundColor: GOLD }, usage: { color: TEAL, fontSize: 11, fontWeight: '800' }, range: { color: SAGE, fontSize: 11, fontWeight: '700' }, subtle: { color: SAGE, fontSize: 11, lineHeight: 17 },
  card: { backgroundColor: '#fff', padding: 17, borderRadius: 23, gap: 10 }, sectionTitle: { color: GREEN, fontSize: 16, fontWeight: '900' }, metricRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 7 }, metricLabel: { color: SAGE, fontSize: 10 }, metricValue: { color: GREEN, fontSize: 13, fontWeight: '900', marginTop: 5 }, biggestDay: { borderTopWidth: 1, borderTopColor: '#EEF0EC', paddingTop: 10, marginTop: 1 },
  tip: { backgroundColor: '#E7F0EA', borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 11 }, tipIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }, tipTitle: { color: GREEN, fontSize: 13, fontWeight: '900', marginBottom: 4 }, tipText: { color: '#536B64', fontSize: 12, lineHeight: 18 },
  why: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }, whyText: { color: TEAL, fontSize: 12, fontWeight: '900' }, explanation: { backgroundColor: '#fff', padding: 15, borderRadius: 17, gap: 8, marginTop: -9 }, disclaimer: { color: SAGE, fontSize: 10, lineHeight: 15, marginTop: 2 }, error: { color: '#A8403A', padding: 20 },
});
