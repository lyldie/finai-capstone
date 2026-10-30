import React, { useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTransactions, Goal } from '../context/TransactionContext';
import DepositModal from '../components/DepositModal';
import { getGoalEmoji } from '../utils/goalEmoji';
import { getDisplayEmoji } from '../components/EmojiPicker';

const GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const CREAM = '#FAF7F2';
const SAGE = '#718780';
const GOLD = '#D09116';

const money = (value: number) => `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GoalSavingsScreen() {
  const router = useRouter();
  const { goals = [], totalSavings = 0, transactions = [], goalTypes = [], accounts = [], getAccountBalance, depositToGoal } = useTransactions();
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null);
  const [depositVisible, setDepositVisible] = useState(false);
  const activeSaved = goals.reduce((sum, goal) => sum + (Number(goal.current_savings) || 0), 0);
  const targetTotal = goals.reduce((sum, goal) => sum + (Number(goal.target_amount) || 0), 0);
  const progress = targetTotal > 0 ? Math.min((activeSaved / targetTotal) * 100, 100) : 0;
  const archivedSavings = Math.max(Number(totalSavings) - activeSaved, 0);
  const goalContributions = useMemo(() => transactions.filter((item) => item.type === 'Contribution' || item.goal_id), [transactions]);

  const openDeposit = (goal: Goal) => {
    setDepositGoal(goal);
    setDepositVisible(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={21} color={GREEN} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Goal savings</Text><Text style={styles.subtitle}>Money set aside for what matters to you</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#174D42', '#3D7D6C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.piggyTile}><Text style={styles.piggy}>🐷</Text></View>
            <View style={styles.reservedPill}><Text style={styles.reservedText}>SET ASIDE</Text></View>
          </View>
          <Text style={styles.heroLabel}>Total savings</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{money(totalSavings)}</Text>
          <Text style={styles.heroNote}>Still yours · not included in your wallet balance</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <View style={styles.progressLabels}><Text style={styles.progressText}>{money(activeSaved)} saved toward active goals</Text><Text style={styles.progressText}>{progress.toFixed(0)}%</Text></View>
          <Text style={styles.targetText}>Active goal targets: {money(targetTotal)}</Text>
        </LinearGradient>

        {archivedSavings > 0 ? <View style={styles.archiveNote}><Ionicons name="archive-outline" size={16} color={TEAL} /><Text style={styles.archiveNoteText}>{money(archivedSavings)} retained from archived goals.</Text></View> : null}

        <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Your goals</Text><Text style={styles.sectionSubtitle}>{goals.length} active {goals.length === 1 ? 'goal' : 'goals'} · contributions shown per goal</Text></View><TouchableOpacity style={styles.newGoal} onPress={() => router.push('/create-goal' as never)}><Ionicons name="add" size={16} color={GREEN} /><Text style={styles.newGoalText}>New</Text></TouchableOpacity></View>

        {goals.length ? goals.map((goal) => {
          const saved = Number(goal.current_savings) || 0;
          const target = Number(goal.target_amount) || 0;
          const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
          const expanded = expandedGoalId === goal.id;
          const goalType = goalTypes.find((item) => item.id === goal.goal_type_id);
          const emoji = getDisplayEmoji(goalType?.icon, getGoalEmoji(goalType?.name || goal.target_name));
          const contributions = goalContributions.filter((item) => item.goal_id === goal.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          return <View key={goal.id} style={styles.goalCard}>
            <TouchableOpacity style={styles.goalTop} activeOpacity={0.82} onPress={() => setExpandedGoalId(expanded ? null : goal.id)} accessibilityRole="button" accessibilityState={{ expanded }}>
              <View style={styles.goalIcon}><Text style={styles.goalEmoji}>{emoji}</Text></View>
              <View style={styles.goalInfo}><Text style={styles.goalName} numberOfLines={1}>{goal.target_name}</Text><Text style={styles.goalTarget}>Target {money(target)} · due {goal.target_date || 'not set'}</Text></View>
              <View style={styles.goalAmountWrap}><Text style={styles.goalAmount}>{money(saved)}</Text><Text style={styles.goalPercent}>{pct.toFixed(0)}%</Text></View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={SAGE} />
            </TouchableOpacity>
            <View style={styles.goalProgressTrack}><View style={[styles.goalProgressFill, { width: `${pct}%` }]} /></View>
            <View style={styles.goalFooter}><Text style={styles.goalRemaining}>{money(Math.max(target - saved, 0))} to go</Text><TouchableOpacity style={styles.addContribution} onPress={() => openDeposit(goal)} accessibilityRole="button"><Ionicons name="add-circle-outline" size={16} color={TEAL} /><Text style={styles.addContributionText}>Add savings</Text></TouchableOpacity></View>
            {expanded ? <View style={styles.contributionsBlock}>
              <Text style={styles.contributionsTitle}>Contributions</Text>
              {contributions.length ? contributions.map((item) => <View key={item.id} style={styles.contributionRow}><View style={styles.contributionIcon}><Ionicons name="arrow-down" size={14} color={TEAL} /></View><View style={styles.contributionCopy}><Text style={styles.contributionName} numberOfLines={1}>{item.note || `From ${item.account}`}</Text><Text style={styles.contributionMeta}>{item.date} · {item.account}</Text></View><Text style={styles.contributionAmount}>+{money(Number(item.amount) || 0)}</Text></View>) : <Text style={styles.emptyCopy}>No contribution records are linked to this goal yet.</Text>}
            </View> : null}
          </View>;
        }) : <View style={styles.emptyCard}><View style={styles.piggyTile}><Text style={styles.piggy}>🐷</Text></View><Text style={styles.emptyTitle}>Start with a goal</Text><Text style={styles.emptyCopy}>Create a goal to give your savings a clear purpose.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/create-goal' as never)}><Text style={styles.emptyButtonText}>Create a goal</Text></TouchableOpacity></View>}

        <Text style={styles.disclaimer}>Goal savings are allocations of money already recorded in your wallets. Contributions reduce the source wallet balance; they are not expenses.</Text>
      </ScrollView>
      <DepositModal visible={depositVisible} onClose={() => setDepositVisible(false)} selectedGoal={depositGoal} accounts={accounts} getAccountBalance={getAccountBalance} depositToGoal={depositToGoal} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 11 },
  backButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  title: { color: GREEN, fontSize: 21, fontWeight: '900' }, subtitle: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 3 },
  content: { padding: 18, paddingBottom: 40 },
  hero: { borderRadius: 23, padding: 20, overflow: 'hidden', marginBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  piggyTile: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }, piggy: { fontSize: 27 },
  reservedPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.16)' }, reservedText: { color: '#FFFFFF', fontSize: 10, letterSpacing: 0.8, fontWeight: '900' },
  heroLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '700', marginTop: 18 },
  heroAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -0.8, marginTop: 2 },
  heroNote: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4 },
  progressTrack: { height: 9, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 19 }, progressFill: { height: '100%', backgroundColor: '#F1C453', borderRadius: 5 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, progressText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' }, targetText: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 5 },
  archiveNote: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#EAF2EE', padding: 11, borderRadius: 13, marginBottom: 18 }, archiveNoteText: { color: GREEN, fontSize: 11, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { color: GREEN, fontSize: 18, fontWeight: '900' }, sectionSubtitle: { color: SAGE, fontSize: 11, marginTop: 3 },
  newGoal: { flexDirection: 'row', gap: 3, alignItems: 'center', paddingHorizontal: 11, minHeight: 34, borderRadius: 17, backgroundColor: '#F4E8C8' }, newGoalText: { color: GREEN, fontSize: 12, fontWeight: '800' },
  goalCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(28,60,54,0.06)' },
  goalTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, goalIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#EAF2EE', alignItems: 'center', justifyContent: 'center' }, goalEmoji: { fontSize: 21 },
  goalInfo: { flex: 1, minWidth: 0 }, goalName: { color: GREEN, fontSize: 14, fontWeight: '800' }, goalTarget: { color: SAGE, fontSize: 10, marginTop: 3 }, goalAmountWrap: { alignItems: 'flex-end' }, goalAmount: { color: GREEN, fontSize: 13, fontWeight: '900' }, goalPercent: { color: TEAL, fontSize: 10, fontWeight: '800', marginTop: 2 },
  goalProgressTrack: { height: 7, borderRadius: 4, backgroundColor: '#E9E7DF', overflow: 'hidden', marginTop: 13 }, goalProgressFill: { height: '100%', borderRadius: 4, backgroundColor: GOLD },
  goalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, goalRemaining: { color: SAGE, fontSize: 11, fontWeight: '600' }, addContribution: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 }, addContributionText: { color: TEAL, fontSize: 11, fontWeight: '800' },
  contributionsBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E6EAE6', paddingTop: 12, marginTop: 10 }, contributionsTitle: { color: GREEN, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  contributionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, contributionIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: '#EAF2EE', alignItems: 'center', justifyContent: 'center' }, contributionCopy: { flex: 1 }, contributionName: { color: GREEN, fontSize: 11, fontWeight: '700' }, contributionMeta: { color: SAGE, fontSize: 9, marginTop: 2 }, contributionAmount: { color: TEAL, fontSize: 11, fontWeight: '800' },
  emptyCard: { alignItems: 'center', padding: 24, backgroundColor: '#FFFFFF', borderRadius: 20 }, emptyTitle: { color: GREEN, fontSize: 16, fontWeight: '900', marginTop: 12 }, emptyCopy: { color: SAGE, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 }, emptyButton: { backgroundColor: GREEN, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 11, marginTop: 15 }, emptyButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  disclaimer: { color: SAGE, fontSize: 10, lineHeight: 16, paddingHorizontal: 4, marginTop: 4 },
});
