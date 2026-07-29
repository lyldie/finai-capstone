import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, Text, View, SectionList, TouchableOpacity, Alert, StatusBar, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTransactions, Transaction } from '../../context/TransactionContext';
import { useAuth } from '../../context/AuthContext'; // 👈 1. Import Auth Context
import { useRouter, useFocusEffect } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable'; 

export default function Dashboard() {
  const { user } = useAuth(); // 👈 2. Kunin ang user data
  const { 
    transactions, 
    totalIncome, 
    totalExpense, 
    balance, 
    deleteTransaction, 
    fetchTransactions,
    isLoading,
    categories,
    accounts
  } = useTransactions();

  const [activeTab, setActiveTab] = useState('Daily'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All'); 
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); 
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  const monthsNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  const greetingMessage = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning 👋";
    if (hour < 18) return "Good Afternoon 👋";
    return "Good Evening 👋";
  }, []);

  const handlePrevMonth = useCallback(() => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  }, [selectedMonth]);

  const handleNextMonth = useCallback(() => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  }, [selectedMonth]);

  const sections = useMemo(() => {
    const groups: { [key: string]: { title: string; data: Transaction[]; income: number; expense: number } } = {};
    const filteredTransactions = transactions.filter(t => {
      const transDate = new Date(t.date);
      if (activeTab === 'Daily') {
        if (transDate.getMonth() !== selectedMonth || transDate.getFullYear() !== selectedYear) return false;
      }
      const matchesType = selectedFilter === 'All' || t.type === selectedFilter;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = query === '' || 
        (t.category && t.category.toLowerCase().includes(query)) || 
        (t.note && t.note.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });

    filteredTransactions.forEach(t => {
      const date = t.date;
      if (!groups[date]) groups[date] = { title: date, data: [], income: 0, expense: 0 };
      groups[date].data.push(t);
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'Income') groups[date].income += amt;
      else if (t.type === 'Expense') groups[date].expense += amt;
    });
    return Object.values(groups).sort((a, b) => new Date(b.title).getTime() - new Date(a.title).getTime());
  }, [transactions, searchQuery, selectedFilter, activeTab, selectedMonth, selectedYear]); 

  const localStats = useMemo(() => {
    let incMonthSum = 0, expMonthSum = 0, incYearSum = 0, expYearSum = 0;
    transactions.forEach(t => {
      const transDate = new Date(t.date);
      const amt = parseFloat(t.amount) || 0;
      if (transDate.getMonth() === selectedMonth && transDate.getFullYear() === selectedYear) {
        if (t.type === 'Income') incMonthSum += amt;
        if (t.type === 'Expense') expMonthSum += amt;
      }
      if (transDate.getFullYear() === selectedYear) {
        if (t.type === 'Income') incYearSum += amt;
        if (t.type === 'Expense') expYearSum += amt;
      }
    });
    return { monthIncome: incMonthSum, monthExpense: expMonthSum, monthNet: incMonthSum - expMonthSum, yearIncome: incYearSum, yearExpense: expYearSum, yearNet: incYearSum - expYearSum };
  }, [transactions, selectedMonth, selectedYear]);

  const confirmDelete = useCallback((id: string, swipeableInstance: Swipeable | null) => {
    Alert.alert("Delete Record", "Sigurado ka ba paps?", [
      { text: "Cancel", style: "cancel", onPress: () => swipeableInstance?.close() },
      { text: "Delete", style: "destructive", onPress: () => { deleteTransaction(id); swipeableInstance?.close(); } }
    ]);
  }, [deleteTransaction]);

  const handleEditPress = useCallback((item: Transaction, swipeableInstance: Swipeable | null) => {
    swipeableInstance?.close();
    router.push({
      pathname: '/(tabs)/two',
      params: { id: item.id, amount: item.amount, category: item.category, note: item.note, type: item.type, account: item.account, to_account: item.to_account || '', date: item.date }
    });
  }, [router]);

  const renderRightActions = useCallback((item: Transaction, swipeableInstance: Swipeable | null) => (
    <View style={styles.actionsContainer}>
      <TouchableOpacity style={[styles.actionButton, styles.editActionButton]} onPress={() => handleEditPress(item, swipeableInstance)}>
        <Ionicons name="pencil-sharp" size={20} color="#FFFFFF" />
        <Text style={styles.actionButtonText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.actionButton, styles.deleteActionButton]} onPress={() => confirmDelete(item.id, swipeableInstance)}>
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.actionButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  ), [handleEditPress, confirmDelete]);

  const renderTransactionItem = useCallback(({ item }: { item: Transaction }) => {
    let swipeableRef: Swipeable | null = null;
    let iconName: any = "arrow-down-circle", iconColor = '#EF4444', amountColor = '#EF4444', prefix = '-';
    if (item.type === 'Income') { iconName = "arrow-up-circle"; iconColor = '#10B981'; amountColor = '#10B981'; prefix = '+'; }
    else if (item.type === 'Transfer') { iconName = "swap-horizontal"; iconColor = '#6B7280'; amountColor = '#374151'; prefix = ''; }
    return (
      <Swipeable ref={(ref) => { swipeableRef = ref; }} renderRightActions={() => renderRightActions(item, swipeableRef)}>
        <View style={styles.itemCard}>
          <View style={styles.iconPlaceholder}><Ionicons name={iconName} size={26} color={iconColor} /></View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemCategory}>{item.type === 'Transfer' ? `${item.account} ➡️ ${item.to_account || 'Other'}` : item.category}</Text>
            <Text style={styles.itemNote} numberOfLines={1}>{item.note || 'No description'}</Text>
          </View>
          <Text style={[styles.itemAmount, { color: amountColor }]}>{prefix}₱{(parseFloat(item.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
      </Swipeable>
    );
  }, [renderRightActions]);

  const renderSectionHeader = useCallback(({ section: { title, income, expense } }: any) => (
    <View style={styles.dateHeader}>
      <Text style={styles.dateText}>{title}</Text>
      <View style={styles.dateSummary}>
        <Text style={styles.dayIncome}>+₱{(income || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
        <Text style={styles.dayExpense}>-₱{(expense || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
      </View>
    </View>
  ), []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
        <ActivityIndicator size="large" color="#2b5f56" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      
      <View style={styles.topNav}>
        {['Daily', 'Monthly'].map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.navTab, activeTab === tab && styles.activeNavTab]}>
            <Text style={[styles.navTabText, activeTab === tab && styles.activeNavTabText]}>{tab === 'Daily' ? 'Daily History' : 'Monthly Overview'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Greeting Header (Fixed Single Line) */}
      <View style={styles.greetingContainer}>
        <Text style={styles.greetingText}>
          {greetingMessage}, <Text style={styles.greetingName}>{user?.name || 'User'}!</Text>
        </Text>
      </View>

      <View style={styles.headerCard}>
        {activeTab === 'Daily' ? (
          <>
            <Text style={styles.balanceLabel}>Net Balance ({monthsNames[selectedMonth]})</Text>
            <Text style={styles.balanceValue}>₱{localStats.monthNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Income</Text>
                <Text style={[styles.statValue, { color: '#10B981' }]}>+₱{localStats.monthIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Expenses</Text>
                <Text style={[styles.statValue, { color: '#EF4444' }]}>-₱{localStats.monthExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.balanceLabel}>Yearly Net Total ({selectedYear})</Text>
            <Text style={styles.balanceValue}>₱{localStats.yearNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Total Income</Text>
                <Text style={[styles.statValue, { color: '#10B981' }]}>+₱{localStats.yearIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Total Expenses</Text>
                <Text style={[styles.statValue, { color: '#EF4444' }]}>-₱{localStats.yearExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {activeTab === 'Daily' && (
        <View style={styles.searchFilterWrapper}>
          <View style={styles.dateNavigatorRow}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.dateNavButton}><Ionicons name="chevron-back" size={20} color="#2b5f56" /></TouchableOpacity>
            <Text style={styles.dateNavDisplay}>{monthsNames[selectedMonth]} {selectedYear}</Text>
            <TouchableOpacity onPress={handleNextMonth} style={styles.dateNavButton}><Ionicons name="chevron-forward" size={20} color="#2b5f56" /></TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#7C9A95" style={styles.searchIcon} />
            <TextInput placeholder="Search..." placeholderTextColor="#7C9A95" style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {['All', 'Income', 'Expense', 'Transfer'].map((filter) => (
              <TouchableOpacity key={filter} onPress={() => setSelectedFilter(filter)} style={[styles.filterChip, selectedFilter === filter && styles.activeFilterChip]}>
                <Text style={[styles.filterChipText, selectedFilter === filter && styles.activeFilterChipText]}>{filter}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {activeTab === 'Daily' ? (
        <View style={{ flex: 1 }}>
          {sections.length > 0 ? (
            <SectionList sections={sections} keyExtractor={(item) => item.id} stickySectionHeadersEnabled={true} contentContainerStyle={styles.listContent} renderSectionHeader={renderSectionHeader} renderItem={renderTransactionItem} />
          ) : (
            <View style={styles.emptyContainer}><Ionicons name="calendar-outline" size={40} color="#7C9A95" /><Text style={styles.comingSoonText}>Walang transaksyon paps.</Text></View>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.yearlyCard}>
            <View style={styles.yearlyHeaderRow}><Ionicons name="analytics" size={16} color="#2b5f56" style={{ marginRight: 6 }} /><Text style={styles.yearlyTitle}>Yearly Breakdown ({selectedYear})</Text></View>
            <View style={styles.yearlyStatsRow}>
              <View style={styles.yearlyStatBadge}><Text style={styles.yearlyBadgeLabel}>INCOME</Text><Text style={styles.yearlyBadgeValue}>+₱{localStats.yearIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text></View>
              <View style={styles.yearlyStatBadge}><Text style={[styles.yearlyBadgeLabel, { color: '#EF4444' }]}>EXPENSE</Text><Text style={[styles.yearlyBadgeValue, { color: '#EF4444' }]}>-₱{localStats.yearExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text></View>
            </View>
          </View>
          {monthsNames.map((mName, idx) => {
            const filtered = transactions.filter(t => new Date(t.date).getMonth() === idx && new Date(t.date).getFullYear() === selectedYear);
            const inc = filtered.filter(t => t.type === 'Income').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
            const exp = filtered.filter(t => t.type === 'Expense').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
            if (filtered.length === 0) return null;
            return (
              <View key={idx} style={styles.monthRowCard}>
                <View style={styles.monthLeftBlock}>
                    <Text style={styles.monthMainName}>{mName}</Text>
                    <Text style={styles.transactionCountSub}>{filtered.length} transactions</Text>
                </View>
                <View style={styles.monthRightBlock}>
                  <Text style={[styles.monthlyStatText, { color: '#10B981' }]}>{inc > 0 ? `+₱${inc.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '₱0.00'}</Text>
                  <Text style={[styles.monthlyStatText, { color: '#EF4444' }]}>{exp > 0 ? `-₱${exp.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '₱0.00'}</Text>
                </View>
              </View>
            );
          }).reverse()}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/(tabs)/two')}><Ionicons name="add" size={32} color="#FFFFFF" /></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  topNav: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingTop: 55, paddingBottom: 15, justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navTab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#F3F4F6' },
  activeNavTab: { backgroundColor: '#2b5f56', elevation: 2 }, 
  navTabText: { color: '#56736E', fontSize: 13, fontWeight: '700' },
  activeNavTabText: { color: '#FFFFFF' }, 
  greetingContainer: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 2 },
  greetingText: { fontSize: 18, color: '#7C9A95', fontWeight: '600' },
  greetingName: { color: '#142D2A', fontWeight: '800' },
  headerCard: { backgroundColor: '#FFFFFF', marginHorizontal: 15, marginTop: 12, padding: 20, borderRadius: 25, borderWidth: 1, borderColor: '#2b5f56', elevation: 4, marginBottom: 5 },
  balanceLabel: { color: '#56736E', fontSize: 13, textAlign: 'center', fontWeight: '600' },
  balanceValue: { fontSize: 34, fontWeight: '800', textAlign: 'center', marginVertical: 8, color: '#142D2A' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15, alignItems: 'center' },
  statItem: { alignItems: 'center' },
  statLabel: { color: '#7C9A95', fontSize: 11, marginBottom: 2, textTransform: 'uppercase', fontWeight: '700' },
  statValue: { fontSize: 15, fontWeight: '700' },
  statDivider: { width: 1, height: 25, backgroundColor: '#E2E8F0' },
  searchFilterWrapper: { paddingHorizontal: 15, marginVertical: 10 },
  dateNavigatorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, paddingVertical: 10, paddingHorizontal: 15, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  dateNavButton: { padding: 5 },
  dateNavDisplay: { color: '#142D2A', fontSize: 15, fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, height: 45, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#142D2A', fontSize: 14 },
  filterRow: { flexDirection: 'row', paddingTop: 10, gap: 8 },
  filterChip: { backgroundColor: '#F3F4F6', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  activeFilterChip: { backgroundColor: '#2b5f56', borderColor: '#2b5f56' },
  filterChipText: { color: '#56736E', fontSize: 12, fontWeight: '600' },
  activeFilterChipText: { color: '#FFFFFF' },
  listContent: { paddingBottom: 120 },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#F9FAFB', borderBottomWidth: 0.5, borderColor: '#E2E8F0' },
  dateText: { color: '#2b5f56', fontSize: 12, fontWeight: 'bold' }, 
  dateSummary: { flexDirection: 'row' },
  dayIncome: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  dayExpense: { color: '#EF4444', fontSize: 11, fontWeight: '700', marginLeft: 10 },
  itemCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6' },
  iconPlaceholder: { width: 40, alignItems: 'center' },
  itemInfo: { flex: 1, marginLeft: 10 },
  itemCategory: { color: '#142D2A', fontSize: 16, fontWeight: '600' }, 
  itemNote: { color: '#7C9A95', fontSize: 13, marginTop: 2 }, 
  itemAmount: { fontSize: 16, fontWeight: '700' },
  actionsContainer: { flexDirection: 'row', width: 140, height: '100%' },
  actionButton: { flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: 2 },
  editActionButton: { backgroundColor: '#2b5f56' },
  deleteActionButton: { backgroundColor: '#EF4444' },
  actionButtonText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  comingSoonText: { color: '#7C9A95', marginTop: 10, fontWeight: '500' },
  fab: { position: 'absolute', bottom: 30, right: 25, backgroundColor: '#2b5f56', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  yearlyCard: { backgroundColor: '#FFFFFF', marginHorizontal: 15, marginTop: 15, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  yearlyHeaderRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderColor: '#E2E8F0', paddingBottom: 8 },
  yearlyTitle: { color: '#2b5f56', fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  yearlyStatsRow: { flexDirection: 'row', gap: 10 },
  yearlyStatBadge: { flex: 1, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 12, borderWidth: 0.5, borderColor: '#E2E8F0' },
  yearlyBadgeLabel: { color: '#7C9A95', fontSize: 9, fontWeight: '700' },
  yearlyBadgeValue: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  monthRowCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 15, marginVertical: 6, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  monthMainName: { color: '#142D2A', fontSize: 16, fontWeight: '700' },
  transactionCountSub: { color: '#7C9A95', fontSize: 12, marginTop: 3 },
  monthLeftBlock: { flexDirection: 'column', flex: 1 },
  monthRightBlock: { alignItems: 'flex-end', minWidth: 120 },
  monthlyStatText: { fontSize: 14, fontWeight: '700', textAlign: 'right', lineHeight: 20 }
});