import React, { useState, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTransactions } from '../../context/TransactionContext';
import { useAuth } from '../../context/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';

// ---- FINAI BRAND TOKENS (shared with transactions.tsx) ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const INCOME = '#10B981';
const EXPENSE = '#FF6259';

export default function HomeDashboard() {
  const { user } = useAuth();
  const {
    transactions,
    balance,
    totalIncome,
    totalExpense,
    fetchTransactions,
    accounts,
    getAccountBalance,
    isLoading
  } = useTransactions();

  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchTransactions(false);
    }, [fetchTransactions])
  );

  const greetingMessage = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Magandang Umaga";
    if (hour < 18) return "Magandang Hapon";
    return "Magandang Gabi";
  }, []);

  const dynamicAiTip = useMemo(() => {
    if (totalExpense > totalIncome && totalIncome > 0) {
      return "Paps, medyo alanganin tayo ngayon. Mas malaki ang gastos mo kaysa sa kinita mo. Preno-preno muna sa luho!";
    } else if (balance <= 500 && balance >= 0) {
      return "Kulang na lang sa pambili ng kape ang balanse mo, paps. Magtipid-tipid muna habang naghihintay ng sweldo!";
    } else if (totalIncome > 0 && totalExpense <= totalIncome * 0.5) {
      return "Ang galing ng pag-budget mo ngayon, paps! Malaki ang natira sa kita mo. Keep it up!";
    } else {
      return "Huwag mong hintaying maubos ang sweldo bago magtipid, paps. Konting pigil sa luho, malaking tulong sa bulsa!";
    }
  }, [totalIncome, totalExpense, balance]);

  const budgetHealthStatus = useMemo(() => {
    if (totalIncome === 0) return { label: "No Income Recorded", color: SAGE, percentage: 0 };
    const ratio = totalExpense / totalIncome;
    if (ratio > 0.85) return { label: "Critical Budget Warning", color: EXPENSE, percentage: Math.min(ratio * 100, 100) };
    if (ratio > 0.6) return { label: "Moderate Spending", color: GOLD, percentage: ratio * 100 };
    return { label: "Budget on Track", color: INCOME, percentage: ratio * 100 };
  }, [totalIncome, totalExpense]);

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
          <Text style={styles.greetingText}>{greetingMessage}</Text>
          <Text style={styles.userName}>{user?.name || 'User'}!</Text>
        </View>
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.peanutButton}
            onPress={() => router.push('/chat' as never)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 18 }}>🥜</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => router.push('/notifications' as never)}
          >
            <Ionicons name="notifications-outline" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* AI Advisor tip */}
        <View style={styles.aiTipCard}>
          <View style={styles.aiTipHeader}>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={11} color={DEEP_GREEN} />
              <Text style={styles.aiBadgeText}>FINAI ADVISOR</Text>
            </View>
          </View>
          <Text style={styles.aiTipText}>"{dynamicAiTip}"</Text>
          <TouchableOpacity onPress={() => router.push('/chat' as never)} style={styles.aiTipAction}>
            <Text style={styles.aiTipActionText}>Magtanong kay FinAi</Text>
            <Ionicons name="arrow-forward" size={14} color={TEAL} />
          </TouchableOpacity>
        </View>

        {/* Hero balance card */}
        <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceValue}>
            ₱{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.miniIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.22)' }]}>
                <Ionicons name="arrow-up" size={14} color="#5FE3B3" />
              </View>
              <View>
                <Text style={styles.statLabel}>Income</Text>
                <Text style={[styles.statValue, { color: '#5FE3B3' }]}>
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
                <Text style={styles.statLabel}>Expenses</Text>
                <Text style={[styles.statValue, { color: '#FF9B93' }]}>
                  -₱{(totalExpense || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.healthContainer}>
            <View style={styles.healthHeaderRow}>
              <Text style={styles.healthTitle}>Budget Health Status</Text>
              <Text style={[styles.healthStatusText, { color: budgetHealthStatus.color === SAGE ? 'rgba(255,255,255,0.7)' : budgetHealthStatus.color }]}>
                {budgetHealthStatus.label}
              </Text>
            </View>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(budgetHealthStatus.percentage, 100)}%`, backgroundColor: budgetHealthStatus.color === SAGE ? 'rgba(255,255,255,0.4)' : budgetHealthStatus.color }
                ]}
              />
            </View>
          </View>
        </LinearGradient>

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
              return (
                <View key={acc.id || idx} style={styles.accountCard}>
                  <View style={styles.accountCardHeader}>
                    <View style={styles.accountIconBox}>
                      <Ionicons name={(acc.icon || "wallet") as any} size={20} color={DEEP_GREEN} />
                    </View>
                    <Ionicons name="ellipsis-horizontal" size={16} color={SAGE} />
                  </View>
                  <View style={styles.accountCardBody}>
                    <Text style={styles.accountName} numberOfLines={1}>{acc.name}</Text>
                    <Text style={[styles.accountBalance, liveBalance < 0 && { color: EXPENSE }]}>
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
            <Text style={styles.emptyAccountsText}>Wala pang naka-setup na accounts.</Text>
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
              const color = isTransfer ? TEAL : isIncome ? INCOME : EXPENSE;
              const bgColor = isTransfer ? 'rgba(61, 125, 108, 0.12)' : isIncome ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 98, 89, 0.12)';
              const iconName = isTransfer ? 'swap-horizontal' : isIncome ? 'arrow-up-outline' : 'arrow-down-outline';
              const prefix = isTransfer ? '' : isIncome ? '+' : '-';
              return (
                <View key={item.id || index} style={styles.recentFloatingCard}>
                  <View style={styles.recentLeft}>
                    <View style={[styles.recentIconBox, { backgroundColor: bgColor }]}>
                      <Ionicons name={iconName as any} size={18} color={color} />
                    </View>
                    <View style={styles.recentInfo}>
                      <Text style={styles.recentCategory} numberOfLines={1}>
                        {isTransfer ? `${item.account} → ${item.to_account || 'Other'}` : item.category}
                      </Text>
                      <Text style={styles.recentNote} numberOfLines={1}>{item.note || 'No description'}</Text>
                    </View>
                  </View>

                  <View style={styles.recentRight}>
                    <Text style={[styles.recentAmount, { color: isTransfer ? DEEP_GREEN : color }]}>
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
            <Text style={styles.emptyRecentText}>Wala pang recent transactions.</Text>
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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 10,
    backgroundColor: CREAM,
  },
  greetingText: { fontSize: 13, color: SAGE, fontWeight: '600', letterSpacing: 0.3 },
  userName: { fontSize: 22, color: DEEP_GREEN, fontWeight: '800', marginTop: 2 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  peanutButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2
  },
  notificationButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2
  },
  scrollContent: { padding: 20, paddingBottom: 110 },

  // AI tip
  aiTipCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 20,
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3
  },
  aiTipHeader: { flexDirection: 'row', marginBottom: 10 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(237, 178, 50, 0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  aiBadgeText: { color: DEEP_GREEN, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  aiTipText: { color: DEEP_GREEN, fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginBottom: 12 },
  aiTipAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTipActionText: { color: TEAL, fontSize: 13, fontWeight: '700' },

  // Balance hero
  balanceCard: {
    borderRadius: 26, padding: 24, marginBottom: 26,
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8
  },
  balanceLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  balanceValue: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 8, letterSpacing: -0.5 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  miniIconContainer: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  statDivider: { width: 1, height: 35, backgroundColor: 'rgba(255,255,255,0.14)', marginHorizontal: 15 },

  healthContainer: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  healthHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  healthTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  healthStatusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  progressBarBackground: { height: 6, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  // Section headers
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '800' },
  pillButton: { backgroundColor: 'rgba(237, 178, 50, 0.18)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  pillButtonText: { color: DEEP_GREEN, fontSize: 12, fontWeight: '700' },

  // Wallet cards
  accountsScrollRow: { gap: 16, paddingBottom: 15, paddingTop: 5, paddingHorizontal: 2 },
  accountCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, width: 155, height: 130,
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

  // Recent transactions
  recentListContainer: { paddingBottom: 10 },
  recentFloatingCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, marginBottom: 12,
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

  // FAB
  fabWrapper: {
    position: 'absolute', bottom: 25, right: 25, borderRadius: 32,
    shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8
  },
  fab: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' }
});