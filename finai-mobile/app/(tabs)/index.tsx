import React, { useState, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTransactions } from '../../context/TransactionContext';
import { useAuth } from '../../context/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';

// 👈 IMPORT NATIN YUNG MGA EMOJI HELPERS
import { getAccountDisplayEmoji } from '../../utils/accountEmoji';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { getDisplayEmoji } from '../../components/EmojiPicker';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const RED = '#D94C43';
const INCOME = '#10B981';
const EXPENSE = '#FF6259';

export default function HomeDashboard() {
  const [aiTipCardHeight, setAiTipCardHeight] = useState(174);
  const { user } = useAuth();
  const {
    transactions,
    balance,
    totalIncome,
    totalExpense,
    totalSavings,
    fetchTransactions,
    accounts,
    categories,
    budgets,
    getAccountBalance,
    isLoading,
    isRefreshing,
    notifications,
  } = useTransactions();

  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchTransactions(false);
    }, [fetchTransactions])
  );

  const greetingMessage = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const localDateKey = (value: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const todayKey = localDateKey(new Date());
  const mostUsedBudget = useMemo(() => budgets
    .filter((budget) => budget.start_date && budget.end_date && budget.start_date <= todayKey && budget.end_date >= todayKey)
    .map((budget) => ({
      ...budget,
      usage: Number(budget.percentage_used) || 0,
      remainingAmount: Math.max(Number(budget.remaining ?? (budget.amount - budget.spent)) || 0, 0),
    }))
    .sort((left, right) => right.usage - left.usage)[0], [budgets, todayKey]);

  const dynamicAiTip = useMemo(() => {
    if (!mostUsedBudget) return 'Set a category budget in Insights to get clear spending limits and alerts here.';
    const category = mostUsedBudget.category_name || 'This category';
    const period = mostUsedBudget.period_type || 'budget';
    const used = mostUsedBudget.usage;
    const spent = Number(mostUsedBudget.spent) || 0;
    const limit = Number(mostUsedBudget.available_limit ?? mostUsedBudget.amount) || 0;
    const remaining = mostUsedBudget.remainingAmount;
    const startDate = Date.parse(`${mostUsedBudget.start_date}T00:00:00Z`);
    const endDate = Date.parse(`${mostUsedBudget.end_date}T00:00:00Z`);
    const todayDate = Date.parse(`${todayKey}T00:00:00Z`);
    const periodDays = Math.round((endDate - startDate) / 86400000) + 1;
    const elapsedDays = Math.round((todayDate - startDate) / 86400000) + 1;
    const daysRemaining = Math.max(periodDays - elapsedDays, 0);
    if (used > 100) return `${category} is over its ${period} limit. You have spent \u20B1${spent.toLocaleString()} of \u20B1${limit.toLocaleString()}.`;
    if (used >= 100) return `${category} has reached its ${period} limit. You have spent \u20B1${spent.toLocaleString()} of \u20B1${limit.toLocaleString()}.`;
    if (used >= 90) return `${category} is close to its ${period} limit (${used.toFixed(0)}% used). \u20B1${remaining.toLocaleString()} remains.`;
    if (used >= 70 && periodDays > 0 && elapsedDays > 0 && elapsedDays <= periodDays / 2) {
      return `${category} has used ${used.toFixed(0)}% of its ${period} limit with ${daysRemaining} days remaining. About \u20B1${remaining.toLocaleString()} remains; review upcoming expenses if useful.`;
    }
    if (used >= 70) return `${category} has used ${used.toFixed(0)}% of its ${period} limit. About \u20B1${remaining.toLocaleString()} remains.`;
    return `Your most-used budget is ${category} at ${used.toFixed(0)}%. About \u20B1${remaining.toLocaleString()} remains for this ${period} period.`;
  }, [mostUsedBudget]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={DEEP_GREEN} />
      </View>
    );
  }

  const recentTransactions = transactions.slice(0, 3);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greetingText}>{greetingMessage},</Text>
          <Text style={styles.userName}>{user?.name?.trim().split(/\s+/)[0] || 'User'}!</Text>
        </View>
        <View style={styles.headerRightActions}>
          <TouchableOpacity style={styles.peanutButton} onPress={() => router.push('/ai' as never)} activeOpacity={0.8} accessibilityLabel="Open Finn AI advisor">
            <Ionicons name="chatbubbles" size={19} color={DEEP_GREEN} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.notificationButton} onPress={() => router.push('/notifications' as never)}>
            <Ionicons name="notifications-outline" size={20} color={DEEP_GREEN} />
            {notifications.filter((n) => !n.is_read).length > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notifications.filter((n) => !n.is_read).length > 99 ? '99+' : notifications.filter((n) => !n.is_read).length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {isRefreshing && <Text style={styles.refreshingHint}>Updating your latest data…</Text>}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={styles.heroCardsStack}>
        {/* Dashboard shortcut to the full planning analysis */}
        <TouchableOpacity
          style={styles.aiTipCard}
          onLayout={({ nativeEvent }) => setAiTipCardHeight(nativeEvent.layout.height)}
          onPress={() => router.push('/plan-ahead' as never)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Open Plan Ahead recommendations"
        >
          <View style={styles.aiTipHeader}>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={12} color={DEEP_GREEN} />
              <Text style={styles.aiBadgeText}>QUICK BUDGET TIP</Text>
            </View>
          </View>
          <View style={styles.aiTipBody}>
            <View style={styles.aiTipCopy}>
              <Text style={styles.aiTipText}>{dynamicAiTip}</Text>
              <View style={styles.aiTipAction}>
                <Text style={styles.aiTipActionText}>Open Plan Ahead</Text>
                <Ionicons name="arrow-forward" size={15} color={TEAL} />
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Hero balance card */}
        <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total wallet balance</Text>
          <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            ₱{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.miniIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.22)' }]}>
                <Ionicons name="arrow-up" size={14} color="#5FE3B3" />
              </View>
              <View>
                <Text style={styles.statLabel}>Total income</Text>
                <Text style={[styles.statValue, { color: '#5FE3B3' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  +₱{(totalIncome || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <View style={[styles.miniIconContainer, { backgroundColor: 'rgba(255, 98, 89, 0.22)' }]}>
                <Ionicons name="arrow-down" size={14} color="#FF9B93" />
              </View>
              <View>
                <Text style={styles.statLabel}>Total expenses</Text>
                <Text style={[styles.statValue, { color: '#FF9B93' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  -₱{(totalExpense || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>

        </LinearGradient>

        <View
          style={[styles.finnTipImage, { top: aiTipCardHeight - 127 }]}
          pointerEvents="none"
        >
          <Image
            source={require('../../assets/images/finn-wave.gif')}
            style={styles.finnTipImageContent}
            resizeMode="contain"
            accessible={false}
          />
        </View>
        </View>

        <View style={styles.savingsSummaryCard}>
          <View style={styles.savingsSummaryIcon}>
            <Ionicons name="flag-outline" size={20} color={TEAL} />
          </View>
          <View style={styles.savingsSummaryCopy}>
            <Text style={styles.savingsSummaryTitle}>Goal savings</Text>
            <Text style={styles.savingsSummaryCaption}>Tracked separately from your wallets</Text>
          </View>
          <Text style={styles.savingsSummaryAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            ₱{totalSavings.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        {/* Wallets */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Wallets</Text>
          <TouchableOpacity style={styles.pillButton} onPress={() => router.push('/accounts' as never)}>
            <Text style={styles.pillButtonText}>Manage</Text>
          </TouchableOpacity>
        </View>

        {accounts && accounts.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountsScrollRow}>
            {accounts.map((acc, idx) => {
              const liveBalance = getAccountBalance(acc.name);
              // LILINISIN NATIN YUNG "walle" ISSUE DITO
              const displayIcon = getAccountDisplayEmoji(acc.icon, acc.name);

              return (
                <View key={acc.id || idx} style={styles.accountCard}>
                  <View style={styles.accountCardHeader}>
                    <View style={styles.accountIconBox}>
                      <Text style={{ fontSize: 22 }}>{displayIcon}</Text>
                    </View>
                    <Ionicons name="ellipsis-horizontal" size={16} color={SAGE} />
                  </View>
                  <View style={styles.accountCardBody}>
                    <Text style={styles.accountName} numberOfLines={1}>{acc.name}</Text>
                    <Text style={[styles.accountBalance, liveBalance < 0 && { color: EXPENSE }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      ₱{liveBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyAccountsCard}>
            <Ionicons name="card-outline" size={32} color={SAGE} />
            <Text style={styles.emptyAccountsText}>You have not added any accounts yet.</Text>
          </View>
        )}

        {/* Recent transactions */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity style={styles.pillButton} onPress={() => router.push('/(tabs)/transactions' as never)}>
            <Text style={styles.pillButtonText}>See All</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length > 0 ? (
          <View style={styles.recentListContainer}>
            {recentTransactions.map((item, index) => {
              const isIncome = item.type === 'Income';
              const isTransfer = item.type === 'Transfer';
              const isContribution = item.type === 'Contribution' || Boolean(item.goal_id);
              const color = isTransfer || isContribution ? TEAL : isIncome ? INCOME : EXPENSE;
              const bgColor = isTransfer || isContribution ? 'rgba(61, 125, 108, 0.12)' : isIncome ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 98, 89, 0.12)';
              const prefix = isTransfer ? '' : isIncome ? '+' : '-';
              
              const categoryIcon = categories.find((category) => category.name === item.category && category.type === item.type.toLowerCase())?.icon;
              // LILINISIN DIN YUNG MGA LUMANG TEXT ICONS DITO
              const transactionEmoji = isContribution ? '🎯' : isTransfer
                ? '🔄' 
                : getDisplayEmoji(categoryIcon, getCategoryEmoji(item.category, item.type.toLowerCase()));

              return (
                <View key={item.id || index} style={styles.recentFloatingCard}>
                  <View style={styles.recentLeft}>
                    <View style={[styles.recentIconBox, { backgroundColor: bgColor }]}>
                      <Text style={{ fontSize: 20 }}>{transactionEmoji}</Text>
                    </View>
                    <View style={styles.recentInfo}>
                      <Text style={styles.recentCategory} numberOfLines={1}>
                        {isTransfer ? `${item.account} → ${item.to_account || 'Other'}` : isContribution ? 'Goal Contribution' : item.category}
                      </Text>
                      <Text style={styles.recentNote} numberOfLines={1}>{item.note || 'No description'}</Text>
                    </View>
                  </View>

                  <View style={styles.recentRight}>
                    <Text style={[styles.recentAmount, { color: isTransfer ? DEEP_GREEN : color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {prefix}₱{(parseFloat(item.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <Text style={styles.recentDate}>{formatDate(item.date)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyRecentCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="receipt-outline" size={28} color={GOLD} />
            </View>
            <Text style={styles.emptyRecentText}>No recent transactions.</Text>
          </View>
        )}

      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fabWrapper}
        onPress={() => router.push('/(tabs)/two' as never)}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM },
  refreshingHint: { color: SAGE, fontSize: 11, fontWeight: '600', textAlign: 'right', paddingHorizontal: 22, paddingTop: 4 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 42,
    paddingBottom: 6,
    backgroundColor: CREAM,
  },
  greetingText: { fontSize: 18, lineHeight: 24, color: DEEP_GREEN, fontWeight: '800', letterSpacing: 0.1 },
  userName: { fontSize: 25, lineHeight: 30, color: DEEP_GREEN, fontWeight: '800', marginTop: -1 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  peanutButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2
  },
  notificationButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF',
    position: 'relative',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2
  },
  notificationBadge: {
    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18,
    paddingHorizontal: 4, borderRadius: 9, backgroundColor: RED,
    borderWidth: 1.5, borderColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  scrollContent: { padding: 20, paddingBottom: 110 },

  heroCardsStack: { position: 'relative', overflow: 'visible' },
  aiTipCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, minHeight: 174, marginTop: 18, marginBottom: 20,
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3
  },
  aiTipHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(237, 178, 50, 0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  aiBadgeText: { color: DEEP_GREEN, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  aiTipText: { color: DEEP_GREEN, fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginBottom: 12 },
  aiTipAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTipActionText: { color: TEAL, fontSize: 13, fontWeight: '700' },
  aiTipBody: { paddingRight: 98 },
  aiTipCopy: { minWidth: 0 },
  finnTipImage: { position: 'absolute', width: 178, height: 178, right: -17, zIndex: 3, elevation: 10 },
  finnTipImageContent: { width: '100%', height: '100%' },

  balanceCard: {
    borderRadius: 24, padding: 22, marginBottom: 12,
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8
  },
  balanceLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  balanceValue: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 8, letterSpacing: -0.5 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  savingsSummaryCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, marginBottom: 22, borderWidth: 1, borderColor: 'rgba(28,60,54,0.06)' },
  savingsSummaryIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(61,125,108,0.12)', alignItems: 'center', justifyContent: 'center' },
  savingsSummaryCopy: { flex: 1 },
  savingsSummaryTitle: { color: DEEP_GREEN, fontSize: 14, fontWeight: '800' },
  savingsSummaryCaption: { color: SAGE, fontSize: 10, fontWeight: '600', marginTop: 3 },
  savingsSummaryAmount: { color: TEAL, fontSize: 16, fontWeight: '900', maxWidth: '42%' },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  miniIconContainer: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  statDivider: { width: 1, height: 35, backgroundColor: 'rgba(255,255,255,0.14)', marginHorizontal: 15 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '800' },
  pillButton: { backgroundColor: 'rgba(237, 178, 50, 0.18)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  pillButtonText: { color: DEEP_GREEN, fontSize: 12, fontWeight: '700' },

  accountsScrollRow: { gap: 16, paddingBottom: 15, paddingTop: 5, paddingHorizontal: 2 },
  accountCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, width: 160, height: 132,
    justifyContent: 'space-between',
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3
  },
  accountCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  accountIconBox: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(28, 60, 54, 0.08)', justifyContent: 'center', alignItems: 'center' },
  accountCardBody: { marginTop: 10 },
  accountName: { color: SAGE, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  accountBalance: { color: DEEP_GREEN, fontSize: 19, fontWeight: '900', letterSpacing: -0.5 },

  emptyAccountsCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#ECE7DD', borderStyle: 'dashed', gap: 12 },
  emptyAccountsText: { color: SAGE, fontSize: 13, fontWeight: '600' },

  recentListContainer: { paddingBottom: 10 },
  recentFloatingCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', padding: 15, borderRadius: 18, marginBottom: 10,
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2
  },
  recentLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  recentIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  recentInfo: { flex: 1, justifyContent: 'center' },
  recentCategory: { color: DEEP_GREEN, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  recentNote: { color: SAGE, fontSize: 12, fontWeight: '500' },

  recentRight: { alignItems: 'flex-end', justifyContent: 'center' },
  recentAmount: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  recentDate: { color: SAGE, fontSize: 11, fontWeight: '600' },

  emptyRecentCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#ECE7DD', borderStyle: 'dashed', gap: 12 },
  emptyIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: CREAM, justifyContent: 'center', alignItems: 'center' },
  emptyRecentText: { color: SAGE, fontSize: 14, fontWeight: '600' },

  fabWrapper: {
    position: 'absolute', bottom: 25, right: 25, borderRadius: 32,
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8
  },
  fab: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' }
});
