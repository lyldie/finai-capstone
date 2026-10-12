import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const TRACK = '#ECE7DD';
const RED = '#D94C43';
const AMBER = '#A56300';

type Recommendation = {
  kind: string;
  priority: string;
  title: string;
  message: string;
  action: string;
  actions?: string[];
  context_question?: string;
  evidence?: Record<string, any>;
};

type PlanningData = {
  summary: string;
  summary_source: 'ai' | 'rule_based' | string;
  recommendation_source?: 'ai' | 'rule_based' | string;
  metrics: {
    as_of_date: string;
    days_with_records: number;
    history_truncated: boolean;
    active_budget_count?: number;
    active_goal_count?: number;
  };
  recommendations: Recommendation[];
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
  onAskFinAI: () => void;
};

const peso = (value: unknown) => `₱${(Number(value) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

const signedPeso = (value: unknown) => {
  const amount = Number(value) || 0;
  return `${amount < 0 ? '−' : '+'}${peso(Math.abs(amount))}`;
};

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
      { label: 'Prior period', value: peso(evidence.previous_period_to_same_day_spending) },
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

export default function PlanningInsightsPanel({ data, loading, error, onRefresh, onAskFinAI }: Props) {
  return (
    <View style={styles.container}>
      <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="sparkles" size={22} color={GOLD} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>FINAI PLANNING ADVISOR</Text>
          <Text style={styles.heroTitle}>Plan ahead with your numbers</Text>
          <Text style={styles.heroSubtitle}>Gemini reviews your spending patterns, budget forecasts, and savings goals to suggest practical next steps.</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Recalculate figures and request fresh Gemini planning recommendations" onPress={onRefresh} style={styles.refreshButton} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="refresh-outline" size={19} color="#FFFFFF" />}
        </TouchableOpacity>
      </LinearGradient>

      {loading && !data ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.stateTitle}>Reviewing your recent activity…</Text>
          <Text style={styles.stateCopy}>This can take a few seconds while FinAI prepares your plan.</Text>
        </View>
      ) : error && !data ? (
        <View style={styles.stateCard}>
          <Ionicons name="cloud-offline-outline" size={32} color={AMBER} />
          <Text style={styles.stateTitle}>Couldn’t load your planning analysis</Text>
          <Text style={styles.stateCopy}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
        </View>
      ) : data ? (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryIcon}><Ionicons name="bulb-outline" size={19} color={GOLD} /></View>
              <View style={styles.summaryHeading}>
                <Text style={styles.summaryTitle}>Your planning overview</Text>
                <Text style={styles.summaryDate}>Updated {data.metrics?.as_of_date || 'today'} · tap refresh to rerun</Text>
              </View>
              <View style={styles.sourceBadge}><Text style={styles.sourceBadgeText}>{data.recommendation_source === 'ai' ? 'GEMINI ANALYSIS' : 'RULE-BASED'}</Text></View>
            </View>
            <Text style={styles.summaryText}>{data.summary}</Text>
          </View>

          <View style={styles.longTermCard}>
            <View style={styles.longTermHeader}>
              <View style={styles.longTermIcon}><Ionicons name="calendar-outline" size={19} color={TEAL} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.longTermTitle}>12-month cash-flow scenarios</Text>
                <Text style={styles.longTermMeta}>
                  {data.long_term_outlook?.observed_completed_months || 0} completed months with records · {data.long_term_outlook?.confidence || 'insufficient'} confidence
                </Text>
              </View>
            </View>
            {data.long_term_outlook?.available && data.long_term_outlook.scenarios ? (
              <>
                <View style={styles.scenarioRow}>
                  {[
                    { label: 'Cautious', value: data.long_term_outlook.scenarios.cautious_12_month_net_change },
                    { label: 'Typical', value: data.long_term_outlook.scenarios.typical_12_month_net_change },
                    { label: 'Strong', value: data.long_term_outlook.scenarios.strong_12_month_net_change },
                  ].map((scenario) => (
                    <View key={scenario.label} style={styles.scenarioCell}>
                      <Text style={styles.scenarioLabel}>{scenario.label}</Text>
                      <Text style={[styles.scenarioValue, Number(scenario.value) < 0 && { color: RED }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {signedPeso(scenario.value)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.longTermNote}>Recorded net cash-flow scenarios over 12 months, based on observed monthly results. Months without records are excluded; these are not projected account balances or guarantees.</Text>
              </>
            ) : (
              <Text style={styles.longTermNote}>Record activity in at least 3 completed months to see scenarios. Missing months are not assumed to have zero income or expenses.</Text>
            )}
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              <Text style={styles.sectionSubtitle}>{data.recommendation_source === 'ai' ? 'Gemini recommendations grounded in your calculated figures' : 'Evidence first, then a practical next step'}</Text>
            </View>
            <View style={styles.countBadge}><Text style={styles.countText}>{data.recommendations?.length || 0}</Text></View>
          </View>

          {!data.recommendations?.length ? (
            <View style={styles.stateCard}>
              {data.metrics?.days_with_records === 0 && !data.metrics?.active_budget_count && !data.metrics?.active_goal_count ? (
                <View style={styles.emptyIcon}><Ionicons name="add-circle-outline" size={30} color={TEAL} /></View>
              ) : (
                <View style={styles.emptyIcon}><Ionicons name="checkmark-circle-outline" size={30} color={TEAL} /></View>
              )}
              <Text style={styles.stateTitle}>
                {data.metrics?.days_with_records === 0 && !data.metrics?.active_budget_count && !data.metrics?.active_goal_count
                  ? 'Add data to start planning'
                  : 'No immediate planning flags'}
              </Text>
              <Text style={styles.stateCopy}>
                {data.metrics?.days_with_records === 0 && !data.metrics?.active_budget_count && !data.metrics?.active_goal_count
                  ? 'Record transactions, set a budget, or create a savings goal. FinAI needs some of your financial context before it can make useful suggestions.'
                  : 'This only means no flags were found in the available records. Keep recording transactions and review your plan as your situation changes.'}
              </Text>
            </View>
          ) : data.recommendations.map((item, index) => {
            const facts = evidenceFor(item);
            const isHigh = item.priority === 'high';
            const confidence = item.evidence?.confidence;
            const usedPercent = Number(item.evidence?.percentage_used) || 0;
            return (
              <View key={`${item.kind}-${index}`} style={styles.recommendationCard}>
                <View style={styles.recommendationHeader}>
                  <View style={[styles.recommendationIcon, isHigh && styles.recommendationIconHigh]}>
                    <Ionicons name={iconFor(item.kind)} size={19} color={isHigh ? RED : TEAL} />
                  </View>
                  <View style={styles.recommendationHeading}>
                    <Text style={styles.recommendationTitle}>{item.title}</Text>
                    <Text style={styles.recommendationMessage}>{item.message}</Text>
                  </View>
                  <View style={[styles.priorityBadge, isHigh && styles.priorityBadgeHigh]}>
                    <Text style={[styles.priorityText, isHigh && styles.priorityTextHigh]}>{isHigh ? 'WATCH' : item.kind.startsWith('goal_') ? 'GOAL' : 'PLAN'}</Text>
                  </View>
                </View>

                {facts.length > 0 && (
                  <View style={styles.evidenceGrid}>
                    {facts.map((fact) => (
                      <View key={fact.label} style={styles.evidenceCell}>
                        <Text style={styles.evidenceLabel}>{fact.label}</Text>
                        <Text style={styles.evidenceValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{fact.value}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {item.kind.startsWith('budget_') && (
                  <View style={styles.budgetProgressWrap}>
                    <View style={styles.budgetProgressTrack}>
                      <View style={[styles.budgetProgressFill, { width: `${Math.min(usedPercent, 100)}%`, backgroundColor: isHigh ? RED : GOLD }]} />
                    </View>
                    <Text style={styles.confidenceText}>{usedPercent.toFixed(0)}% used · {confidence || 'low'} confidence forecast</Text>
                  </View>
                )}

                {(item.actions?.length ? item.actions : item.action ? [item.action] : []).map((action, actionIndex) => (
                  <View key={`action-${actionIndex}`} style={styles.actionBox}>
                    <Ionicons name="arrow-forward-circle-outline" size={18} color={TEAL} />
                    <Text style={styles.actionText}>{action}</Text>
                  </View>
                ))}
                {!!item.context_question && (
                  <View style={styles.questionBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={TEAL} />
                    <Text style={styles.questionText}>{item.context_question}</Text>
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.disclosureCard}>
            <Ionicons name="information-circle-outline" size={16} color={SAGE} />
            <Text style={styles.disclosureText}>Gemini uses a summary of your financial records. Forecasts are estimates and may miss unrecorded activity.</Text>
          </View>

          <TouchableOpacity style={styles.chatButton} onPress={onAskFinAI} activeOpacity={0.85}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
            <Text style={styles.chatButtonText}>Ask FinAI about this plan</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  hero: { borderRadius: 22, padding: 19, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#B9D8CE', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 19, lineHeight: 24, fontWeight: '900', marginTop: 5 },
  heroSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 18, marginTop: 5 },
  refreshButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 22, borderWidth: 1, borderColor: 'rgba(28,60,54,0.05)' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(237,178,50,0.17)', alignItems: 'center', justifyContent: 'center' },
  summaryHeading: { flex: 1, minWidth: 0 },
  summaryTitle: { color: DEEP_GREEN, fontSize: 15, fontWeight: '900' },
  summaryDate: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 2 },
  sourceBadge: { backgroundColor: 'rgba(61,125,108,0.1)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  sourceBadgeText: { color: TEAL, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  summaryText: { color: DEEP_GREEN, fontSize: 14, lineHeight: 21, marginTop: 13 },
  longTermCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 17, marginBottom: 22, borderWidth: 1, borderColor: 'rgba(28,60,54,0.05)' },
  longTermHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  longTermIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(61,125,108,0.1)', alignItems: 'center', justifyContent: 'center' },
  longTermTitle: { color: DEEP_GREEN, fontSize: 15, fontWeight: '900' },
  longTermMeta: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 3, textTransform: 'capitalize' },
  scenarioRow: { flexDirection: 'row', gap: 8, marginTop: 15 },
  scenarioCell: { flex: 1, minWidth: 0, backgroundColor: CREAM, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 11 },
  scenarioLabel: { color: SAGE, fontSize: 10, fontWeight: '700' },
  scenarioValue: { color: DEEP_GREEN, fontSize: 13, fontWeight: '900', marginTop: 5 },
  longTermNote: { color: SAGE, fontSize: 11, lineHeight: 16, marginTop: 11 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 3 },
  countBadge: { minWidth: 30, height: 30, paddingHorizontal: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,125,108,0.12)' },
  countText: { color: TEAL, fontSize: 13, fontWeight: '900' },
  recommendationCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 17, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(28,60,54,0.05)' },
  recommendationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  recommendationIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(61,125,108,0.1)', alignItems: 'center', justifyContent: 'center' },
  recommendationIconHigh: { backgroundColor: 'rgba(255,98,89,0.12)' },
  recommendationHeading: { flex: 1, minWidth: 0 },
  recommendationTitle: { color: DEEP_GREEN, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  recommendationMessage: { color: SAGE, fontSize: 12, lineHeight: 17, marginTop: 3 },
  priorityBadge: { backgroundColor: 'rgba(237,178,50,0.18)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  priorityBadgeHigh: { backgroundColor: 'rgba(255,98,89,0.13)' },
  priorityText: { color: AMBER, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  priorityTextHigh: { color: RED },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: CREAM, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 7, marginTop: 14 },
  evidenceCell: { width: '50%', paddingHorizontal: 7, paddingVertical: 5 },
  evidenceLabel: { color: SAGE, fontSize: 10, fontWeight: '700' },
  evidenceValue: { color: DEEP_GREEN, fontSize: 14, fontWeight: '900', marginTop: 2 },
  budgetProgressWrap: { marginTop: 12 },
  budgetProgressTrack: { height: 8, backgroundColor: TRACK, borderRadius: 4, overflow: 'hidden' },
  budgetProgressFill: { height: '100%', borderRadius: 4 },
  confidenceText: { color: SAGE, fontSize: 10, fontWeight: '700', marginTop: 5, textTransform: 'capitalize' },
  actionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(61,125,108,0.08)', padding: 12, borderRadius: 13, marginTop: 13 },
  actionText: { flex: 1, color: DEEP_GREEN, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  questionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 3, marginTop: 10 },
  questionText: { flex: 1, color: TEAL, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  disclosureCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4, marginTop: 8 },
  disclosureText: { flex: 1, color: SAGE, fontSize: 11, lineHeight: 16 },
  chatButton: { flexDirection: 'row', minHeight: 48, gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: DEEP_GREEN, borderRadius: 15, marginTop: 18, paddingHorizontal: 16 },
  chatButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  stateCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14, minHeight: 180 },
  stateTitle: { color: DEEP_GREEN, fontSize: 16, lineHeight: 21, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  stateCopy: { color: SAGE, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  retryButton: { marginTop: 15, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: TEAL },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,125,108,0.1)' },
});
