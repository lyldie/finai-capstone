import React, { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Account, Transaction, useTransactions } from '../context/TransactionContext';
import { getAccountDisplayEmoji } from '../utils/accountEmoji';

const GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const CREAM = '#FAF7F2';
const SAGE = '#7C9A95';
const RED = '#D94C43';
const INCOME = '#10B981';

const formatMoney = (value: number) => `₱${Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AccountDetailsScreen() {
  const router = useRouter();
  const { accountId, accountName } = useLocalSearchParams<{ accountId?: string; accountName?: string }>();
  const { accounts, transactions, getAccountBalance } = useTransactions();
  const account = accounts.find((item: Account) => item.id === accountId || item.name === accountName);
  const accountTransactions = useMemo(() => transactions
    .filter((item: Transaction) => item.account === account?.name || item.to_account === account?.name)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id)), [transactions, account?.name]);
  const currentBalance = account ? getAccountBalance(account.name) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={21} color={GREEN} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{account?.name || accountName || 'Wallet'}</Text>
          <Text style={styles.subtitle}>Wallet details</Text>
        </View>
        <TouchableOpacity style={styles.historyButton} onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { account: account?.name || accountName } } as never)} accessibilityRole="button" accessibilityLabel="View all account transactions">
          <Ionicons name="receipt-outline" size={20} color={GREEN} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.balanceCard}>
          <View style={styles.walletIcon}><Text style={styles.emoji}>{getAccountDisplayEmoji(account?.icon, account?.name || 'wallet')}</Text></View>
          <Text style={styles.balanceLabel}>Current balance</Text>
          <Text style={[styles.balanceValue, currentBalance < 0 && { color: '#FFE0DC' }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(currentBalance)}</Text>
          <Text style={styles.balanceNote}>Available in {account?.name || accountName || 'this wallet'}</Text>
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Transactions</Text><Text style={styles.sectionSubtitle}>{accountTransactions.length} records for this wallet</Text></View>
          <TouchableOpacity style={styles.seeAll} onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { account: account?.name || accountName } } as never)}>
            <Text style={styles.seeAllText}>See all</Text><Ionicons name="chevron-forward" size={15} color={TEAL} />
          </TouchableOpacity>
        </View>

        {accountTransactions.length ? accountTransactions.slice(0, 30).map((item: Transaction) => {
          const incoming = item.type === 'Income' || (item.type === 'Transfer' && item.to_account === account?.name);
          const outgoing = item.type === 'Expense' || item.type === 'Contribution' || (item.type === 'Transfer' && item.account === account?.name);
          const prefix = incoming ? '+' : outgoing ? '−' : '';
          const amountColor = incoming ? INCOME : outgoing ? RED : GREEN;
          return (
            <TouchableOpacity key={item.id} style={styles.transactionRow} activeOpacity={0.82} onPress={() => router.push({ pathname: '/(tabs)/two', params: { id: item.id, amount: item.amount, category: item.category, note: item.note, type: item.type, account: item.account, to_account: item.to_account || '', date: item.date } } as never)} accessibilityRole="button" accessibilityLabel={`Edit ${item.category} transaction`}>
              <View style={styles.rowIcon}><Ionicons name={item.type === 'Income' || incoming ? 'arrow-down' : item.type === 'Transfer' ? 'swap-horizontal' : 'arrow-up'} size={17} color={TEAL} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.type === 'Transfer' ? `Transfer ${incoming ? 'in' : 'out'}` : item.category}</Text>
                <Text style={styles.rowNote} numberOfLines={1}>{item.note || item.date}</Text>
              </View>
              <View style={styles.rowAmountCopy}>
                <Text style={[styles.rowAmount, { color: amountColor }]}>{prefix}{formatMoney(Number(item.amount) || 0)}</Text>
                <Text style={styles.rowDate}>{item.date}</Text>
              </View>
            </TouchableOpacity>
          );
        }) : (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={27} color={SAGE} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyCopy}>Transactions recorded from this wallet will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerCopy: { flex: 1 },
  title: { color: GREEN, fontSize: 20, fontWeight: '900' },
  subtitle: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 2 },
  historyButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6EBCF' },
  content: { padding: 18, paddingBottom: 36 },
  balanceCard: { backgroundColor: GREEN, borderRadius: 26, padding: 23, marginBottom: 25 },
  walletIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 21 },
  emoji: { fontSize: 27 },
  balanceLabel: { color: '#C5D9D1', fontSize: 13, fontWeight: '600' },
  balanceValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 5 },
  balanceNote: { color: '#C5D9D1', fontSize: 12, fontWeight: '600', marginTop: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { color: GREEN, fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 3 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 8 },
  seeAllText: { color: TEAL, fontSize: 12, fontWeight: '800' },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, backgroundColor: '#FFFFFF', borderRadius: 17, marginBottom: 9 },
  rowIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,125,108,0.12)' },
  rowCopy: { flex: 1 },
  rowTitle: { color: GREEN, fontSize: 13, fontWeight: '800' },
  rowNote: { color: SAGE, fontSize: 10, marginTop: 3 },
  rowAmountCopy: { alignItems: 'flex-end', maxWidth: '43%' },
  rowAmount: { fontSize: 12, fontWeight: '900' },
  rowDate: { color: SAGE, fontSize: 9, marginTop: 3 },
  emptyState: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, alignItems: 'center' },
  emptyTitle: { color: GREEN, fontSize: 14, fontWeight: '900', marginTop: 9 },
  emptyCopy: { color: SAGE, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 5 },
});
