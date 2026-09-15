import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, Text, View, SectionList, TouchableOpacity, Alert, StatusBar, TextInput, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTransactions, Transaction } from '../../context/TransactionContext';
import { useRouter, useFocusEffect } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const INCOME = '#10B981';
const EXPENSE = '#FF6259';
const TRANSFER = '#3D7D6C';

const transactionDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date(value);
};

export default function TransactionsScreen() {
  const {
    transactions,
    deleteTransaction,
    fetchTransactions,
    isLoading,
    categories,
    accounts,
    notifications
  } = useTransactions();

  const [activeTab, setActiveTab] = useState<'Daily' | 'Monthly' | 'Yearly'>('Daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAccount, setSelectedAccount] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<number | null>(today.getDate());

  const router = useRouter();
  const unreadNotifications = notifications.filter((notification) => !notification.is_read).length;

  useFocusEffect(
    useCallback(() => {
      fetchTransactions(false);
    }, [fetchTransactions])
  );

  const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fullMonthsNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handlePrevPeriod = useCallback(() => {
    setSelectedCalendarDate(null);
    if (activeTab === 'Yearly') {
      setSelectedYear(prev => prev - 1);
    } else {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(prev => prev - 1);
      } else {
        setSelectedMonth(prev => prev - 1);
      }
    }
  }, [activeTab, selectedMonth]);

  const handleNextPeriod = useCallback(() => {
    setSelectedCalendarDate(null);
    if (activeTab === 'Yearly') {
      setSelectedYear(prev => prev + 1);
    } else {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(prev => prev + 1);
      } else {
        setSelectedMonth(prev => prev + 1);
      }
    }
  }, [activeTab, selectedMonth]);

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
        <Ionicons name="pencil-sharp" size={16} color={DEEP_GREEN} />
        <Text style={[styles.actionButtonText, { color: DEEP_GREEN }]}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.actionButton, styles.deleteActionButton]} onPress={() => confirmDelete(item.id, swipeableInstance)}>
        <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
        <Text style={styles.actionButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  ), [handleEditPress, confirmDelete]);

  const renderTransactionItem = useCallback(({ item }: { item: Transaction }) => {
    let swipeableRef: Swipeable | null = null;
    let iconName: any = "arrow-down-outline", iconColor = EXPENSE, amountColor = DEEP_GREEN, prefix = '-', bgColor = 'rgba(255, 98, 89, 0.12)';

    if (item.type === 'Income') {
      iconName = "arrow-up-outline"; iconColor = INCOME; amountColor = INCOME; prefix = '+'; bgColor = 'rgba(16, 185, 129, 0.12)';
    } else if (item.type === 'Transfer') {
      iconName = "swap-horizontal"; iconColor = TEAL; amountColor = DEEP_GREEN; prefix = ''; bgColor = 'rgba(61, 125, 108, 0.12)';
    }

    return (
      <Swipeable ref={(ref) => { swipeableRef = ref; }} renderRightActions={() => renderRightActions(item, swipeableRef)}>
        <View style={styles.transactionCard}>
          <View style={styles.cardLeft}>
            <View style={[styles.cardIconBox, { backgroundColor: bgColor }]}>
              <Ionicons name={iconName} size={19} color={iconColor} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardCategory} numberOfLines={1}>
                {item.type === 'Transfer' ? `${item.account} → ${item.to_account || 'Other'}` : item.category}
              </Text>
              <Text style={styles.cardNote} numberOfLines={1}>{item.note || 'No description'}</Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardAmount, { color: amountColor }]}>
              {prefix}₱{(parseFloat(item.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Text>
            <View style={styles.cardAccountPill}>
              <Text style={styles.cardAccountName} numberOfLines={1}>{item.account}</Text>
            </View>
          </View>
        </View>
      </Swipeable>
    );
  }, [renderRightActions]);

  const dailySections = useMemo(() => {
    const groups: { [key: string]: { title: string; data: Transaction[]; income: number; expense: number } } = {};
    const filteredTransactions = transactions.filter(t => {
      const transDate = transactionDate(t.date);
      if (!startDate && !endDate && (transDate.getMonth() !== selectedMonth || transDate.getFullYear() !== selectedYear)) return false;
      const matchesType = selectedFilter === 'All' || t.type === selectedFilter;
      const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
      const matchesAccount = selectedAccount === 'All' || t.account === selectedAccount || t.to_account === selectedAccount;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = query === '' || (t.category && t.category.toLowerCase().includes(query)) || (t.note && t.note.toLowerCase().includes(query));
      return matchesType && matchesCategory && matchesAccount && matchesSearch;
    });

    filteredTransactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = { title: t.date, data: [], income: 0, expense: 0 };
      groups[t.date].data.push(t);
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'Income') groups[t.date].income += amt;
      else if (t.type === 'Expense') groups[t.date].expense += amt;
    });
    return Object.values(groups).sort((a, b) => transactionDate(b.title).getTime() - transactionDate(a.title).getTime());
  }, [transactions, searchQuery, selectedFilter, selectedCategory, selectedAccount, startDate, endDate, selectedMonth, selectedYear]);

  // MONTHLY CALENDAR LOGIC
  const calendarData = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const firstDayIndex = new Date(selectedYear, selectedMonth, 1).getDay();
    const blanks = Array.from({ length: firstDayIndex }).map(() => null);
    const days = Array.from({ length: daysInMonth }).map((_, i) => i + 1);
    const totalSlots = [...blanks, ...days];

    const monthTrans = transactions.filter(t => {
      const d = transactionDate(t.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    const daySummaries: { [key: number]: { income: number; expense: number; data: Transaction[] } } = {};
    monthTrans.forEach(t => {
      const day = transactionDate(t.date).getDate();
      if (!daySummaries[day]) daySummaries[day] = { income: 0, expense: 0, data: [] };
      daySummaries[day].data.push(t);
      if (t.type === 'Income') daySummaries[day].income += (parseFloat(t.amount) || 0);
      else if (t.type === 'Expense') daySummaries[day].expense += (parseFloat(t.amount) || 0);
    });

    let monthIncSum = 0; let monthExpSum = 0;
    Object.values(daySummaries).forEach(d => { monthIncSum += d.income; monthExpSum += d.expense; });

    return { totalSlots, daySummaries, monthIncSum, monthExpSum, monthNet: monthIncSum - monthExpSum };
  }, [transactions, selectedMonth, selectedYear]);

  // YEARLY LOGIC
  const yearlyStats = useMemo(() => {
    let yearIncome = 0; let yearExpense = 0;
    transactions.forEach(t => {
      if (transactionDate(t.date).getFullYear() === selectedYear) {
        if (t.type === 'Income') yearIncome += parseFloat(t.amount) || 0;
        if (t.type === 'Expense') yearExpense += parseFloat(t.amount) || 0;
      }
    });
    return { yearIncome, yearExpense, yearNet: yearIncome - yearExpense };
  }, [transactions, selectedYear]);

  const clearAdvancedFilters = () => { setSelectedCategory('All'); setSelectedAccount('All'); setStartDate(''); setEndDate(''); };
  const applyAdvancedFilters = () => setIsFilterModalVisible(false);
  const hasAdvancedFilters = selectedCategory !== 'All' || selectedAccount !== 'All' || !!startDate || !!endDate;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={DEEP_GREEN} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DEEP_GREEN} />

      {/* ---------------- GRADIENT HEADER ---------------- */}
      <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
        <View style={styles.topNav}>
          <View>
            <Text style={styles.headerEyebrow}>Your activity</Text>
            <Text style={styles.headerTitle}>Transactions</Text>
          </View>
          <TouchableOpacity style={styles.notificationButton} onPress={() => router.push('/notifications' as never)}>
            <Ionicons name="notifications-outline" size={20} color={DEEP_GREEN} />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotifications}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.tabContainer}>
          {(['Daily', 'Monthly', 'Yearly'] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.navTab, activeTab === tab && styles.activeNavTab]}>
              <Text style={[styles.navTabText, activeTab === tab && styles.activeNavTabText]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dateNavigatorRow}>
          <TouchableOpacity onPress={handlePrevPeriod} style={styles.dateNavButton}>
            <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.dateNavDisplay}>
            {activeTab === 'Yearly' ? selectedYear : `${fullMonthsNames[selectedMonth]} ${selectedYear}`}
          </Text>
          <TouchableOpacity onPress={handleNextPeriod} style={styles.dateNavButton}>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* -------------------- DAILY TAB -------------------- */}
      {activeTab === 'Daily' && (
        <View style={{ flex: 1 }}>
          <View style={styles.floatingSearchCard}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={SAGE} style={styles.searchIcon} />
              <TextInput placeholder="Search records..." placeholderTextColor={SAGE} style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {['All', 'Income', 'Expense', 'Transfer'].map((filter) => (
                <TouchableOpacity key={filter} onPress={() => setSelectedFilter(filter)} style={[styles.filterChip, selectedFilter === filter && styles.activeFilterChip]}>
                  <Text style={[styles.filterChipText, selectedFilter === filter && styles.activeFilterChipText]}>{filter}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setIsFilterModalVisible(true)} style={[styles.filterChip, hasAdvancedFilters && styles.activeFilterChip]}>
                <Ionicons name="options-outline" size={14} color={hasAdvancedFilters ? DEEP_GREEN : SAGE} />
                <Text style={[styles.filterChipText, hasAdvancedFilters && styles.activeFilterChipText]}>Filters</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {dailySections.length > 0 ? (
            <SectionList
              sections={dailySections}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled={true}
              contentContainerStyle={styles.listContent}
              renderSectionHeader={({ section: { title, income, expense } }) => (
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionDateText}>{transactionDate(title).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}</Text>
                  <View style={styles.sectionSummaryPills}>
                    {income > 0 && <Text style={styles.sectionIncome}>+₱{income.toLocaleString()}</Text>}
                    {expense > 0 && <Text style={styles.sectionExpense}>-₱{expense.toLocaleString()}</Text>}
                  </View>
                </View>
              )}
              renderItem={renderTransactionItem}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={36} color={GOLD} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.comingSoonText}>No records found for this period.</Text>
            </View>
          )}
        </View>
      )}

      {/* -------------------- MONTHLY TAB (CALENDAR VIEW) -------------------- */}
      {activeTab === 'Monthly' && (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>

          <View style={styles.calendarCardWrapper}>
            <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.calendarCard}>
              <View style={styles.calendarHeaderBadge}>
                <Text style={styles.calendarHeaderBadgeText}>Calendar ledger</Text>
              </View>

              <View style={styles.calendarWeekRow}>
                {daysOfWeek.map(d => <Text key={d} style={styles.calendarWeekText}>{d}</Text>)}
              </View>

              <View style={styles.calendarGrid}>
                {calendarData.totalSlots.map((dayNum, index) => {
                  if (!dayNum) return <View key={`blank-${index}`} style={styles.calendarCell} />;

                  const hasData = calendarData.daySummaries[dayNum];
                  const isSelected = selectedCalendarDate === dayNum;

                  return (
                    <TouchableOpacity
                      key={dayNum}
                      style={[styles.calendarCell, isSelected && styles.calendarCellSelected]}
                      onPress={() => setSelectedCalendarDate(dayNum)}
                    >
                      <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>{dayNum}</Text>
                      {hasData && (
                        <View style={styles.calendarDotRow}>
                          {hasData.income > 0 && <View style={[styles.calendarDot, { backgroundColor: isSelected ? DEEP_GREEN : INCOME }]} />}
                          {hasData.expense > 0 && <View style={[styles.calendarDot, { backgroundColor: isSelected ? DEEP_GREEN : EXPENSE }]} />}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.calendarSummaryDivider} />
              <View style={styles.calendarSummaryRow}>
                <View>
                  <Text style={styles.calendarSummaryLabel}>Total income</Text>
                  <Text style={styles.calendarSummaryInc}>+₱{calendarData.monthIncSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.calendarSummaryLabel}>Total expense</Text>
                  <Text style={styles.calendarSummaryExp}>-₱{calendarData.monthExpSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {selectedCalendarDate !== null && (
            <View style={styles.selectedDateContainer}>
              <Text style={styles.selectedDateTitle}>
                {fullMonthsNames[selectedMonth]} {selectedCalendarDate}, {selectedYear}
              </Text>

              {calendarData.daySummaries[selectedCalendarDate] ? (
                calendarData.daySummaries[selectedCalendarDate].data.map(item => (
                  <React.Fragment key={item.id}>
                    {renderTransactionItem({ item })}
                  </React.Fragment>
                ))
              ) : (
                <View style={styles.emptyContainerMini}>
                  <Text style={styles.comingSoonText}>No transactions on this date.</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* -------------------- YEARLY TAB (GRID VIEW) -------------------- */}
      {activeTab === 'Yearly' && (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>

          <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.yearlyOverviewCard}>
            <Text style={styles.yearlyOverviewTitle}>Annual net cash flow · {selectedYear}</Text>
            <Text style={[styles.yearlyNetValue, { color: yearlyStats.yearNet >= 0 ? GOLD : '#FF9B93' }]}>
              {yearlyStats.yearNet >= 0 ? '+' : ''}₱{yearlyStats.yearNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Text>
            <View style={styles.yearlyOverviewRow}>
              <Text style={styles.miniStatTextIn}>Income  ₱{yearlyStats.yearIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
              <View style={styles.yearlyVerticalDivider} />
              <Text style={styles.miniStatTextOut}>Expense  ₱{yearlyStats.yearExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
            </View>
          </LinearGradient>

          <View style={styles.yearlyGridContainer}>
            {monthsNames.map((mName, idx) => {
              const filtered = transactions.filter(t => transactionDate(t.date).getMonth() === idx && transactionDate(t.date).getFullYear() === selectedYear);
              const inc = filtered.filter(t => t.type === 'Income').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
              const exp = filtered.filter(t => t.type === 'Expense').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
              const net = inc - exp;
              const isCurrentMonth = idx === today.getMonth() && selectedYear === today.getFullYear();

              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.yearlyGridBox, isCurrentMonth && styles.yearlyGridBoxCurrent]}
                  onPress={() => { setSelectedMonth(idx); setActiveTab('Monthly'); }}
                >
                  <Text style={styles.yearlyGridMonth}>{mName}</Text>
                  <Text style={[styles.yearlyGridNet, { color: net > 0 ? INCOME : net < 0 ? EXPENSE : SAGE }]}>
                    {net > 0 ? '+' : ''}{net === 0 ? '-' : '₱' + Math.abs(net).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </Text>
                  {filtered.length > 0 && <Text style={styles.yearlyGridCount}>{filtered.length} txns</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* FILTER MODAL */}
      <Modal visible={isFilterModalVisible} transparent animationType="slide" onRequestClose={() => setIsFilterModalVisible(false)}>
        <View style={styles.filterModalOverlay}>
          <View style={styles.filterModalContent}>
            <View style={styles.filterModalHandle} />
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter transactions</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)}>
                <View style={styles.closeBtnCircle}><Ionicons name="close" size={20} color={DEEP_GREEN} /></View>
              </TouchableOpacity>
            </View>
            <Text style={styles.filterLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalChipRow}>
              {['All', ...categories.map((c) => c.name)].map((name) => (
                <TouchableOpacity key={name} onPress={() => setSelectedCategory(name)} style={[styles.modalFilterChip, selectedCategory === name && styles.modalActiveFilterChip]}>
                  <Text style={[styles.modalFilterChipText, selectedCategory === name && styles.modalActiveFilterChipText]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.filterLabel}>Payment account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalChipRow}>
              {['All', ...accounts.map((a) => a.name)].map((name) => (
                <TouchableOpacity key={name} onPress={() => setSelectedAccount(name)} style={[styles.modalFilterChip, selectedAccount === name && styles.modalActiveFilterChip]}>
                  <Text style={[styles.modalFilterChipText, selectedAccount === name && styles.modalActiveFilterChipText]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.filterModalActions}>
              <TouchableOpacity onPress={clearAdvancedFilters} style={styles.clearFilterButton}>
                <Text style={styles.clearFilterText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={applyAdvancedFilters} activeOpacity={0.85}>
                <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.applyFilterButton}>
                  <Text style={styles.applyFilterText}>Apply filters</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM },

  // ---- Gradient header ----
  headerGradient: { paddingTop: 54, paddingBottom: 18, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  headerEyebrow: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },

  notificationButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#FFFFFF' },
  notificationBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: DEEP_GREEN },
  notificationBadgeText: { color: DEEP_GREEN, fontSize: 9, fontWeight: '800' },

  tabContainer: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', padding: 4, borderRadius: 24, marginBottom: 16 },
  navTab: { flex: 1, paddingVertical: 9, borderRadius: 20, alignItems: 'center' },
  activeNavTab: { backgroundColor: GOLD },
  navTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  activeNavTabText: { color: DEEP_GREEN },

  dateNavigatorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateNavButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  dateNavDisplay: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // ---- Floating search / filters ----
  floatingSearchCard: { paddingHorizontal: 16, marginTop: -14 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, height: 48, paddingHorizontal: 14, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: DEEP_GREEN, fontSize: 14, fontWeight: '500' },

  filterRow: { flexDirection: 'row', paddingTop: 12, paddingBottom: 4, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#ECE7DD' },
  activeFilterChip: { backgroundColor: GOLD, borderColor: GOLD },
  filterChipText: { color: SAGE, fontSize: 12, fontWeight: '700' },
  activeFilterChipText: { color: DEEP_GREEN },

  listContent: { paddingBottom: 100, paddingHorizontal: 16, paddingTop: 14 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginTop: 8, marginBottom: 4 },
  sectionDateText: { color: SAGE, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  sectionSummaryPills: { flexDirection: 'row', gap: 10 },
  sectionIncome: { color: INCOME, fontSize: 12, fontWeight: '700' },
  sectionExpense: { color: EXPENSE, fontSize: 12, fontWeight: '700' },

  // ---- Transaction card ----
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    shadowColor: DEEP_GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardCategory: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  cardNote: { color: SAGE, fontSize: 12, fontWeight: '500' },
  cardRight: { alignItems: 'flex-end', justifyContent: 'center' },
  cardAmount: { fontSize: 15, fontWeight: '900', marginBottom: 4 },
  cardAccountPill: { backgroundColor: CREAM, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  cardAccountName: { fontSize: 10, fontWeight: '700', color: SAGE },

  // ---- Calendar card ----
  calendarCardWrapper: { borderRadius: 26, marginBottom: 20, elevation: 4, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 14 },
  calendarCard: { borderRadius: 26, padding: 20 },
  calendarHeaderBadge: { marginBottom: 12 },
  calendarHeaderBadgeText: { color: GOLD, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },

  calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  calendarWeekText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800', width: `${100 / 7}%`, textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: `${100 / 7}%`, height: 46, justifyContent: 'center', alignItems: 'center', marginBottom: 4, borderRadius: 14 },
  calendarCellSelected: { backgroundColor: GOLD },
  calendarDayText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  calendarDayTextSelected: { fontWeight: '800', color: DEEP_GREEN },
  calendarDotRow: { flexDirection: 'row', gap: 3, position: 'absolute', bottom: 6 },
  calendarDot: { width: 4, height: 4, borderRadius: 2 },
  calendarSummaryDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.14)', marginVertical: 14 },
  calendarSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  calendarSummaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: 2 },
  calendarSummaryInc: { fontSize: 16, fontWeight: '800', color: '#5FE3B3' },
  calendarSummaryExp: { fontSize: 16, fontWeight: '800', color: '#FF9B93' },

  selectedDateContainer: { marginTop: 4 },
  selectedDateTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800', marginBottom: 12, marginLeft: 4 },

  // ---- Yearly ----
  yearlyOverviewCard: { borderRadius: 26, padding: 24, marginBottom: 20, alignItems: 'center', elevation: 4, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 14 },
  yearlyOverviewTitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 6 },
  yearlyNetValue: { fontSize: 34, fontWeight: '900', marginBottom: 14 },
  yearlyOverviewRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(255, 255, 255, 0.12)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  yearlyVerticalDivider: { width: 1, height: 14, backgroundColor: 'rgba(255, 255, 255, 0.25)' },

  yearlyGridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  yearlyGridBox: { width: '31.5%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  yearlyGridBoxCurrent: { borderColor: GOLD },
  yearlyGridMonth: { color: SAGE, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  yearlyGridNet: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
  yearlyGridCount: { color: SAGE, fontSize: 10, fontWeight: '700', marginTop: 8, backgroundColor: CREAM, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  miniStatTextIn: { fontSize: 12, fontWeight: '700', color: '#5FE3B3' },
  miniStatTextOut: { fontSize: 12, fontWeight: '700', color: '#FF9B93' },

  // ---- Swipe actions ----
  actionsContainer: { flexDirection: 'row', width: 140, paddingBottom: 10, paddingLeft: 8 },
  actionButton: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 16, marginHorizontal: 2 },
  editActionButton: { backgroundColor: GOLD },
  deleteActionButton: { backgroundColor: EXPENSE },
  actionButtonText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },

  // ---- Empty state ----
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, gap: 8 },
  emptyIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 4, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 },
  emptyTitle: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800' },
  emptyContainerMini: { alignItems: 'center', paddingVertical: 25 },
  comingSoonText: { color: SAGE, fontSize: 13, fontWeight: '600' },

  // ---- Filter modal ----
  filterModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28, 60, 54, 0.5)' },
  filterModalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 35, maxHeight: '80%' },
  filterModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ECE7DD', alignSelf: 'center', marginBottom: 16 },
  filterModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  filterModalTitle: { color: DEEP_GREEN, fontSize: 20, fontWeight: '800' },
  closeBtnCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: CREAM, justifyContent: 'center', alignItems: 'center' },
  filterLabel: { color: SAGE, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 10, letterSpacing: 0.5 },
  modalChipRow: { gap: 10, paddingRight: 20, paddingBottom: 5 },

  modalFilterChip: { backgroundColor: CREAM, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16 },
  modalActiveFilterChip: { backgroundColor: GOLD },
  modalFilterChipText: { color: SAGE, fontSize: 12, fontWeight: '700' },
  modalActiveFilterChipText: { color: DEEP_GREEN },

  filterModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 30 },
  clearFilterButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: CREAM, justifyContent: 'center' },
  clearFilterText: { color: SAGE, fontWeight: '800', fontSize: 14 },
  applyFilterButton: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 },
  applyFilterText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 }
});