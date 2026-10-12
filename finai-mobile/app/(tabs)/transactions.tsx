import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, Text, View, SectionList, TouchableOpacity, Alert, StatusBar, TextInput, ScrollView, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransactions, Transaction } from '../../context/TransactionContext';
import { useRouter, useFocusEffect } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { getDisplayEmoji } from '../../components/EmojiPicker';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const TRACK = '#ECE7DD';
const INCOME = '#10B981';
const EXPENSE = '#FF6259';
const TRANSFER = '#3D7D6C';

const transactionDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date(value);
};

const isValidDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

// One consistent peso formatter for the whole screen (always en-US, sign handled by the caller).
const peso = (value: number, decimals: 'fixed' | 'auto' | 'none' = 'auto') => {
  const options =
    decimals === 'fixed' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : decimals === 'none' ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 2 };
  return '₱' + Math.abs(Number(value) || 0).toLocaleString('en-US', options);
};

// Spending heatmap: darker coral = more spent that day relative to the month's biggest day.
const heatBackground = (expense: number, max: number) =>
  expense > 0 && max > 0 ? `rgba(255, 98, 89, ${(0.1 + 0.32 * (expense / max)).toFixed(2)})` : 'transparent';

export default function TransactionsScreen() {
  const {
    transactions,
    archiveTransaction,
    fetchTransactions,
    isLoading,
    categories,
    accounts,
    notifications
  } = useTransactions();

  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'Daily' | 'Monthly' | 'Yearly'>('Daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAccount, setSelectedAccount] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  const phTodayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const phTodayPart = (type: string) => phTodayParts.find((item) => item.type === type)?.value || '';
  const today = new Date(Number(phTodayPart('year')), Number(phTodayPart('month')) - 1, Number(phTodayPart('day')));
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

  // Jump the calendar back to today's date.
  const goToToday = () => {
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth());
    setSelectedCalendarDate(today.getDate());
  };

  const confirmArchive = useCallback((id: string, swipeableInstance: Swipeable | null) => {
    Alert.alert('Archive record', 'Move this record to the archive?', [
      { text: "Cancel", style: "cancel", onPress: () => swipeableInstance?.close() },
      {
        text: "Archive",
        style: "default",
        onPress: async () => {
          try {
            await archiveTransaction(id);
            swipeableInstance?.close();
          } catch (error) {
            Alert.alert("Couldn't archive transaction", error instanceof Error ? error.message : "Please try again.");
          }
        }
      }
    ]);
  }, [archiveTransaction]);

  const handleEditPress = useCallback((item: Transaction, swipeableInstance: Swipeable | null) => {
    if (item.goal_id) {
      swipeableInstance?.close();
      Alert.alert('Goal contribution', 'Edit or remove this contribution from its savings goal so the goal total stays accurate.');
      return;
    }
    swipeableInstance?.close();
    router.push({
      pathname: '/(tabs)/two',
      params: { id: item.id, amount: item.amount, category: item.category, note: item.note, type: item.type, account: item.account, to_account: item.to_account || '', date: item.date }
    });
  }, [router]);

  const renderRightActions = useCallback((item: Transaction, swipeableInstance: Swipeable | null) => (
    <View style={styles.actionsContainer}>
      {!item.goal_id && (
        <TouchableOpacity style={[styles.actionButton, styles.editActionButton]} onPress={() => handleEditPress(item, swipeableInstance)}>
          <Ionicons name="pencil-sharp" size={16} color={DEEP_GREEN} />
          <Text style={[styles.actionButtonText, { color: DEEP_GREEN }]}>Edit</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.actionButton, styles.archiveActionButton]} onPress={() => confirmArchive(item.id, swipeableInstance)}>
        <Ionicons name="archive-outline" size={16} color="#FFFFFF" />
        <Text style={styles.actionButtonText}>Archive</Text>
      </TouchableOpacity>
    </View>
  ), [handleEditPress, confirmArchive]);

  const renderTransactionItem = useCallback(({ item }: { item: Transaction }) => {
    let swipeableRef: Swipeable | null = null;
    let amountColor = DEEP_GREEN, prefix = '-', bgColor = 'rgba(255, 98, 89, 0.12)';

    if (item.type === 'Income') {
      amountColor = INCOME; prefix = '+'; bgColor = 'rgba(16, 185, 129, 0.12)';
    } else if (item.type === 'Transfer') {
      amountColor = DEEP_GREEN; prefix = ''; bgColor = 'rgba(61, 125, 108, 0.12)';
    } else if (item.type === 'Contribution' || item.goal_id) {
      amountColor = TEAL; prefix = '-'; bgColor = 'rgba(61, 125, 108, 0.12)';
    }
    const categoryIcon = categories.find((category) => category.name === item.category && category.type === item.type.toLowerCase())?.icon;
    const transactionEmoji = item.type === 'Transfer'
      ? '🔄'
      : item.type === 'Contribution' || item.goal_id
        ? '🎯'
        : getDisplayEmoji(categoryIcon, getCategoryEmoji(item.category, item.type.toLowerCase()));

    return (
      <Swipeable ref={(ref) => { swipeableRef = ref; }} renderRightActions={() => renderRightActions(item, swipeableRef)}>
        <View style={styles.transactionCard}>
          <View style={styles.cardLeft}>
            <View style={[styles.cardIconBox, { backgroundColor: bgColor }]}>
              <Text style={{ fontSize: 20 }}>{transactionEmoji}</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardCategory} numberOfLines={1}>
                {item.type === 'Transfer' ? `${item.account} → ${item.to_account || 'Other'}` : item.type === 'Contribution' || item.goal_id ? 'Goal Contribution' : item.category}
              </Text>
              {item.note ? <Text style={styles.cardNote} numberOfLines={1}>{item.note}</Text> : null}
            </View>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardAmount, { color: amountColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
              {prefix}{peso(parseFloat(item.amount) || 0, 'fixed')}
            </Text>
            <View style={styles.cardAccountPill}>
              <Text style={styles.cardAccountName} numberOfLines={1}>{item.account}</Text>
            </View>
          </View>
        </View>
      </Swipeable>
    );
  }, [renderRightActions, categories]);

  const dailySections = useMemo(() => {
    const groups: { [key: string]: { title: string; data: Transaction[]; income: number; expense: number } } = {};
    const filteredTransactions = transactions.filter(t => {
      const transDate = transactionDate(t.date);
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      if (!startDate && !endDate && (transDate.getMonth() !== selectedMonth || transDate.getFullYear() !== selectedYear)) return false;
      const matchesType = selectedFilter === 'All'
        || (selectedFilter === 'Expense' && t.type === 'Expense' && !t.goal_id)
        || (selectedFilter === 'Contribution' && (t.type === 'Contribution' || Boolean(t.goal_id)))
        || (selectedFilter !== 'All' && selectedFilter !== 'Expense' && selectedFilter !== 'Contribution' && t.type === selectedFilter);
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
      else if (t.type === 'Expense' && !t.goal_id) groups[t.date].expense += amt;
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

    const daySummaries: { [key: number]: { income: number; expense: number; other: boolean; data: Transaction[] } } = {};
    monthTrans.forEach(t => {
      const day = transactionDate(t.date).getDate();
      if (!daySummaries[day]) daySummaries[day] = { income: 0, expense: 0, other: false, data: [] };
      daySummaries[day].data.push(t);
      if (t.type === 'Income') daySummaries[day].income += (parseFloat(t.amount) || 0);
      else if (t.type === 'Expense' && !t.goal_id) daySummaries[day].expense += (parseFloat(t.amount) || 0);
      else daySummaries[day].other = true; // transfers + goal contributions
    });

    let monthIncSum = 0; let monthExpSum = 0; let maxDayExpense = 0;
    Object.values(daySummaries).forEach(d => {
      monthIncSum += d.income;
      monthExpSum += d.expense;
      if (d.expense > maxDayExpense) maxDayExpense = d.expense;
    });

    return { totalSlots, daySummaries, monthIncSum, monthExpSum, monthNet: monthIncSum - monthExpSum, maxDayExpense };
  }, [transactions, selectedMonth, selectedYear]);

  // YEARLY LOGIC
  const yearlyStats = useMemo(() => {
    let yearIncome = 0; let yearExpense = 0;
    transactions.forEach(t => {
      if (transactionDate(t.date).getFullYear() === selectedYear) {
        if (t.type === 'Income') yearIncome += parseFloat(t.amount) || 0;
        if (t.type === 'Expense' && !t.goal_id) yearExpense += parseFloat(t.amount) || 0;
      }
    });
    return { yearIncome, yearExpense, yearNet: yearIncome - yearExpense };
  }, [transactions, selectedYear]);

  // Per-month buckets for the year grid (computed once instead of filtering inside render).
  const yearlyMonths = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => ({ income: 0, expense: 0, count: 0 }));
    transactions.forEach(t => {
      const d = transactionDate(t.date);
      if (d.getFullYear() !== selectedYear) return;
      const bucket = buckets[d.getMonth()];
      bucket.count += 1;
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'Income') bucket.income += amt;
      else if (t.type === 'Expense' && !t.goal_id) bucket.expense += amt;
    });

    const months = buckets.map((b, index) => ({ ...b, index, net: b.income - b.expense }));
    const maxBar = Math.max(1, ...months.map(m => Math.max(m.income, m.expense)));
    const withActivity = months.filter(m => m.income > 0 || m.expense > 0);

    let best: (typeof months)[number] | null = null;
    let low: (typeof months)[number] | null = null;
    if (withActivity.length > 0) {
      best = withActivity.reduce((a, b) => (b.net > a.net ? b : a));
      low = withActivity.reduce((a, b) => (b.net < a.net ? b : a));
      if (withActivity.length < 2 || best.index === low.index) low = null;
    }
    return { months, maxBar, best, low };
  }, [transactions, selectedYear]);

  const clearAdvancedFilters = () => { setSelectedCategory('All'); setSelectedAccount('All'); setStartDate(''); setEndDate(''); };
  const applyAdvancedFilters = () => {
    if ((startDate && !isValidDateOnly(startDate)) || (endDate && !isValidDateOnly(endDate))) {
      Alert.alert('Invalid date', 'Use a real date in YYYY-MM-DD format.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      Alert.alert('Invalid date range', 'The start date must be before or equal to the end date.');
      return;
    }
    setIsFilterModalVisible(false);
  };
  const hasAdvancedFilters = selectedCategory !== 'All' || selectedAccount !== 'All' || !!startDate || !!endDate;

  // ---- derived display values (presentation only) ----
  const rangeActive = !!startDate || !!endDate;
  const navDisabled = activeTab === 'Daily' && rangeActive; // month arrows do nothing while a custom range is active
  const activeFilterCount = (selectedCategory !== 'All' ? 1 : 0) + (selectedAccount !== 'All' ? 1 : 0) + (rangeActive ? 1 : 0);
  const anyListFilterActive = hasAdvancedFilters || selectedFilter !== 'All' || searchQuery.trim() !== '';
  const resetEverything = () => { setSelectedFilter('All'); setSearchQuery(''); clearAdvancedFilters(); };
  const isTodaySelected =
    selectedYear === today.getFullYear() && selectedMonth === today.getMonth() && selectedCalendarDate === today.getDate();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={DEEP_GREEN} />
      </View>
    );
  }

  const selectedDaySummary = selectedCalendarDate !== null ? calendarData.daySummaries[selectedCalendarDate] : undefined;
  const selectedDayLabel = selectedCalendarDate !== null
    ? new Date(selectedYear, selectedMonth, selectedCalendarDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DEEP_GREEN} />

      {/* ---------------- GRADIENT HEADER ---------------- */}
      <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.headerGradient, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topNav}>
          <Text style={styles.headerTitle}>Transactions</Text>

          <View style={styles.headerRightActions}>
            <TouchableOpacity style={styles.iconHeaderButton} onPress={() => router.push('/archive' as never)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconHeaderButton} onPress={() => router.push('/notifications' as never)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
              {unreadNotifications > 0 && (
                <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotifications}</Text></View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabContainer}>
          {(['Daily', 'Monthly', 'Yearly'] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.navTab, activeTab === tab && styles.activeNavTab]} activeOpacity={0.85}>
              <Text style={[styles.navTabText, activeTab === tab && styles.activeNavTabText]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dateNavigatorRow}>
          <TouchableOpacity onPress={handlePrevPeriod} disabled={navDisabled} style={[styles.dateNavButton, navDisabled && styles.dateNavButtonDisabled]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.dateNavDisplay}>
            {navDisabled ? 'Custom date range' : activeTab === 'Yearly' ? selectedYear : `${fullMonthsNames[selectedMonth]} ${selectedYear}`}
          </Text>
          <TouchableOpacity onPress={handleNextPeriod} disabled={navDisabled} style={[styles.dateNavButton, navDisabled && styles.dateNavButtonDisabled]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* -------------------- DAILY TAB -------------------- */}
      {activeTab === 'Daily' && (
        <View style={{ flex: 1 }}>
          <View style={styles.floatingSearchCard}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={18} color={SAGE} style={styles.searchIcon} />
                <TextInput placeholder="Search records..." placeholderTextColor={SAGE} style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery} />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={SAGE} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(true)} style={[styles.filterButton, hasAdvancedFilters && styles.filterButtonActive]} activeOpacity={0.85}>
                <Ionicons name="options-outline" size={20} color={DEEP_GREEN} />
                {activeFilterCount > 0 && (
                  <View style={styles.filterCountBadge}><Text style={styles.filterCountText}>{activeFilterCount}</Text></View>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {['All', 'Income', 'Expense', 'Transfer', 'Contribution'].map((filter) => (
                <TouchableOpacity key={filter} onPress={() => setSelectedFilter(filter)} style={[styles.filterChip, selectedFilter === filter && styles.activeFilterChip]}>
                  <Text style={[styles.filterChipText, selectedFilter === filter && styles.activeFilterChipText]}>{filter}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {rangeActive && (
              <View style={styles.rangeChipRow}>
                <View style={styles.rangeChip}>
                  <Ionicons name="calendar-outline" size={14} color={DEEP_GREEN} />
                  <Text style={styles.rangeChipText} numberOfLines={1}>{startDate || '…'}  →  {endDate || '…'}</Text>
                  <TouchableOpacity onPress={() => { setStartDate(''); setEndDate(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={DEEP_GREEN} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
                    {income > 0 && <Text style={styles.sectionIncome}>+{peso(income)}</Text>}
                    {expense > 0 && <Text style={styles.sectionExpense}>-{peso(expense)}</Text>}
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
              {anyListFilterActive && (
                <TouchableOpacity onPress={resetEverything} style={styles.emptyResetButton} activeOpacity={0.85}>
                  <Text style={styles.emptyResetText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* -------------------- MONTHLY TAB (CALENDAR VIEW) -------------------- */}
      {activeTab === 'Monthly' && (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>

          <View style={styles.calendarCard}>
            <View style={styles.calendarHeaderRow}>
              <Text style={styles.calendarHeaderBadgeText}>Calendar ledger</Text>
              {!isTodaySelected && (
                <TouchableOpacity onPress={goToToday} style={styles.todayPill} activeOpacity={0.85}>
                  <Ionicons name="today-outline" size={13} color={DEEP_GREEN} />
                  <Text style={styles.todayPillText}>Today</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.calendarWeekRow}>
              {daysOfWeek.map(d => <Text key={d} style={styles.calendarWeekText}>{d}</Text>)}
            </View>

            <View style={styles.calendarGrid}>
              {calendarData.totalSlots.map((dayNum, index) => {
                if (!dayNum) return <View key={`blank-${index}`} style={styles.calendarCell} />;

                const hasData = calendarData.daySummaries[dayNum];
                const isSelected = selectedCalendarDate === dayNum;
                const isToday = selectedYear === today.getFullYear() && selectedMonth === today.getMonth() && dayNum === today.getDate();

                return (
                  <TouchableOpacity
                    key={dayNum}
                    style={styles.calendarCell}
                    activeOpacity={0.8}
                    onPress={() => setSelectedCalendarDate(dayNum)}
                  >
                    <View
                      style={[
                        styles.calendarCellInner,
                        { backgroundColor: isSelected ? DEEP_GREEN : hasData ? heatBackground(hasData.expense, calendarData.maxDayExpense) : 'transparent' },
                        isToday && !isSelected && styles.calendarCellToday,
                      ]}
                    >
                      <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, isToday && !isSelected && styles.calendarDayTextToday]}>{dayNum}</Text>
                      {hasData && (
                        <View style={styles.calendarDotRow}>
                          {hasData.income > 0 && <View style={[styles.calendarDot, { backgroundColor: INCOME }]} />}
                          {hasData.expense > 0 && <View style={[styles.calendarDot, { backgroundColor: EXPENSE }]} />}
                          {hasData.other && <View style={[styles.calendarDot, { backgroundColor: isSelected ? '#8FB8AE' : TRANSFER }]} />}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.calendarSummaryDivider} />
            <View style={styles.calendarSummaryRow}>
              <View style={styles.calendarSummaryCol}>
                <View style={styles.calendarSummaryLabelRow}>
                  <View style={[styles.summaryDot, { backgroundColor: INCOME }]} />
                  <Text style={styles.calendarSummaryLabel}>Income</Text>
                </View>
                <Text style={[styles.calendarSummaryValue, { color: '#047857' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>+{peso(calendarData.monthIncSum)}</Text>
              </View>
              <View style={styles.calendarSummaryCol}>
                <View style={styles.calendarSummaryLabelRow}>
                  <View style={[styles.summaryDot, { backgroundColor: EXPENSE }]} />
                  <Text style={styles.calendarSummaryLabel}>Expense</Text>
                </View>
                <Text style={[styles.calendarSummaryValue, { color: '#D6392F' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>-{peso(calendarData.monthExpSum)}</Text>
              </View>
              <View style={[styles.calendarSummaryCol, { alignItems: 'flex-end' }]}>
                <Text style={styles.calendarSummaryLabel}>Net</Text>
                <Text style={[styles.calendarSummaryValue, { color: calendarData.monthNet >= 0 ? DEEP_GREEN : '#D6392F' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {calendarData.monthNet >= 0 ? '+' : '-'}{peso(calendarData.monthNet)}
                </Text>
              </View>
            </View>
          </View>

          {selectedCalendarDate !== null && (
            <View style={styles.selectedDateContainer}>
              <View style={styles.selectedDateHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedDateTitle} numberOfLines={1}>{selectedDayLabel}</Text>
                  <Text style={styles.selectedDateSubtitle}>
                    {selectedDaySummary ? `${selectedDaySummary.data.length} record${selectedDaySummary.data.length === 1 ? '' : 's'}` : 'No records'}
                  </Text>
                </View>
                {selectedDaySummary && (
                  <View style={styles.selectedDateTotals}>
                    {selectedDaySummary.income > 0 && <Text style={styles.sectionIncome}>+{peso(selectedDaySummary.income)}</Text>}
                    {selectedDaySummary.expense > 0 && <Text style={styles.sectionExpense}>-{peso(selectedDaySummary.expense)}</Text>}
                  </View>
                )}
              </View>

              {selectedDaySummary ? (
                selectedDaySummary.data.map(item => (
                  <React.Fragment key={item.id}>
                    {renderTransactionItem({ item })}
                  </React.Fragment>
                ))
              ) : (
                <View style={styles.emptyContainerMini}>
                  <Ionicons name="calendar-clear-outline" size={26} color={SAGE} />
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
            <Text style={[styles.yearlyNetValue, { color: yearlyStats.yearNet >= 0 ? GOLD : '#FF9B93' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
              {yearlyStats.yearNet >= 0 ? '+' : '-'}{peso(yearlyStats.yearNet, 'fixed')}
            </Text>
            <View style={styles.yearlyOverviewRow}>
              <Text style={styles.miniStatTextIn}>Income  {peso(yearlyStats.yearIncome, 'none')}</Text>
              <View style={styles.yearlyVerticalDivider} />
              <Text style={styles.miniStatTextOut}>Expense  {peso(yearlyStats.yearExpense, 'none')}</Text>
            </View>

            {(yearlyMonths.best || yearlyMonths.low) && (
              <View style={styles.yearlyInsightRow}>
                {yearlyMonths.best && (
                  <View style={styles.yearlyInsightChip}>
                    <Ionicons name="arrow-up-circle" size={14} color="#5FE3B3" />
                    <Text style={styles.yearlyInsightText} numberOfLines={1}>
                      Best: {monthsNames[yearlyMonths.best.index]} {yearlyMonths.best.net >= 0 ? '+' : '-'}{peso(yearlyMonths.best.net, 'none')}
                    </Text>
                  </View>
                )}
                {yearlyMonths.low && (
                  <View style={styles.yearlyInsightChip}>
                    <Ionicons name="arrow-down-circle" size={14} color="#FF9B93" />
                    <Text style={styles.yearlyInsightText} numberOfLines={1}>
                      Lowest: {monthsNames[yearlyMonths.low.index]} {yearlyMonths.low.net >= 0 ? '+' : '-'}{peso(yearlyMonths.low.net, 'none')}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </LinearGradient>

          <View style={styles.yearlyLegendRow}>
            <View style={styles.yearlyLegendItem}><View style={[styles.summaryDot, { backgroundColor: INCOME }]} /><Text style={styles.yearlyLegendText}>Income</Text></View>
            <View style={styles.yearlyLegendItem}><View style={[styles.summaryDot, { backgroundColor: EXPENSE }]} /><Text style={styles.yearlyLegendText}>Expense</Text></View>
          </View>

          <View style={styles.yearlyGridContainer}>
            {monthsNames.map((mName, idx) => {
              const m = yearlyMonths.months[idx];
              const hasActivity = m.income > 0 || m.expense > 0;
              const isCurrentMonth = idx === today.getMonth() && selectedYear === today.getFullYear();
              const isFuture = selectedYear > today.getFullYear() || (selectedYear === today.getFullYear() && idx > today.getMonth());
              const isBest = yearlyMonths.best?.index === idx;
              const isLow = yearlyMonths.low?.index === idx;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.yearlyGridBox, isCurrentMonth && styles.yearlyGridBoxCurrent, !hasActivity && styles.yearlyGridBoxEmpty]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedMonth(idx);
                    // Don't carry over a stale day (e.g. day 31 into February).
                    setSelectedCalendarDate(isCurrentMonth ? today.getDate() : null);
                    setActiveTab('Monthly');
                  }}
                >
                  {(isBest || isLow) && (
                    <View style={styles.yearlyGridBadge}>
                      <Ionicons name={isBest ? 'arrow-up-circle' : 'arrow-down-circle'} size={15} color={isBest ? INCOME : EXPENSE} />
                    </View>
                  )}
                  <Text style={styles.yearlyGridMonth}>{mName}</Text>

                  {hasActivity ? (
                    <>
                      <Text
                        style={[styles.yearlyGridNet, { color: m.net > 0 ? INCOME : m.net < 0 ? EXPENSE : SAGE }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {m.net > 0 ? '+' : m.net < 0 ? '-' : ''}{peso(m.net, 'none')}
                      </Text>
                      <View style={styles.yearlyMiniBars}>
                        <View style={[styles.yearlyMiniBar, { backgroundColor: INCOME, height: m.income > 0 ? Math.max(4, (m.income / yearlyMonths.maxBar) * 30) : 0 }]} />
                        <View style={[styles.yearlyMiniBar, { backgroundColor: EXPENSE, height: m.expense > 0 ? Math.max(4, (m.expense / yearlyMonths.maxBar) * 30) : 0 }]} />
                      </View>
                    </>
                  ) : (
                    <Text style={styles.yearlyGridEmptyText}>{isFuture ? 'Upcoming' : 'No activity'}</Text>
                  )}

                  {m.count > 0 && <Text style={styles.yearlyGridCount}>{m.count} txns</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* FILTER MODAL */}
      <Modal visible={isFilterModalVisible} transparent animationType="slide" onRequestClose={() => setIsFilterModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.filterModalOverlay}>
          <View style={styles.filterModalContent}>
            <View style={styles.filterModalHandle} />
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter transactions</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)}>
                <View style={styles.closeBtnCircle}><Ionicons name="close" size={20} color={DEEP_GREEN} /></View>
              </TouchableOpacity>
            </View>
            <Text style={styles.filterLabel}>Date range (optional)</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="From YYYY-MM-DD"
                placeholderTextColor={SAGE}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                style={[styles.searchInput, { backgroundColor: CREAM, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 }]}
              />
              <TextInput
                value={endDate}
                onChangeText={setEndDate}
                placeholder="To YYYY-MM-DD"
                placeholderTextColor={SAGE}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                style={[styles.searchInput, { backgroundColor: CREAM, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 }]}
              />
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
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: DEEP_GREEN,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM },

  // ---- Gradient header (top padding comes from the safe-area inset) ----
  headerGradient: { paddingBottom: 16, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },

  headerRightActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconHeaderButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)' },
  notificationBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: DEEP_GREEN },
  notificationBadgeText: { color: DEEP_GREEN, fontSize: 9, fontWeight: '800' },

  tabContainer: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', padding: 4, borderRadius: 24, marginBottom: 14 },
  navTab: { flex: 1, paddingVertical: 9, borderRadius: 20, alignItems: 'center' },
  activeNavTab: { backgroundColor: GOLD },
  navTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  activeNavTabText: { color: DEEP_GREEN },

  dateNavigatorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateNavButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  dateNavButtonDisabled: { opacity: 0.35 },
  dateNavDisplay: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // ---- Floating search / filters ----
  floatingSearchCard: { paddingHorizontal: 16, marginTop: -14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, height: 48, paddingHorizontal: 14, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: DEEP_GREEN, fontSize: 14, fontWeight: '500' },
  filterButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  filterButtonActive: { backgroundColor: GOLD },
  filterCountBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: DEEP_GREEN, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: CREAM },
  filterCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },

  filterRow: { flexDirection: 'row', paddingTop: 12, paddingBottom: 4, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: TRACK },
  activeFilterChip: { backgroundColor: GOLD, borderColor: GOLD },
  filterChipText: { color: SAGE, fontSize: 12, fontWeight: '700' },
  activeFilterChipText: { color: DEEP_GREEN },

  rangeChipRow: { flexDirection: 'row', marginTop: 8 },
  rangeChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(237, 178, 50, 0.22)', borderWidth: 1, borderColor: GOLD, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, maxWidth: '100%' },
  rangeChipText: { color: DEEP_GREEN, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  listContent: { paddingBottom: 100, paddingHorizontal: 16, paddingTop: 14 },

  // Sticky date headers need a solid background so cards don't show through while scrolling
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, marginTop: 4, marginBottom: 4, backgroundColor: CREAM },
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
    ...CARD_SHADOW,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(28, 60, 54, 0.035)'
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardCategory: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800' },
  cardNote: { color: SAGE, fontSize: 12, fontWeight: '500', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8, maxWidth: '42%' },
  cardAmount: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  cardAccountPill: { backgroundColor: CREAM, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  cardAccountName: { fontSize: 10, fontWeight: '700', color: SAGE },

  // ---- Calendar card (light card so it separates from the gradient header) ----
  calendarCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, marginBottom: 18, ...CARD_SHADOW, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.04)' },
  calendarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, minHeight: 28 },
  calendarHeaderBadgeText: { color: TEAL, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  todayPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(237, 178, 50, 0.24)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  todayPillText: { color: DEEP_GREEN, fontSize: 12, fontWeight: '800' },

  calendarWeekRow: { flexDirection: 'row', marginBottom: 6 },
  calendarWeekText: { color: SAGE, fontSize: 11, fontWeight: '800', width: `${100 / 7}%`, textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: `${100 / 7}%`, height: 46, padding: 2 },
  calendarCellInner: { flex: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  calendarCellToday: { borderWidth: 1.5, borderColor: GOLD },
  calendarDayText: { fontSize: 14, fontWeight: '700', color: DEEP_GREEN, marginBottom: 2 },
  calendarDayTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  calendarDayTextToday: { color: DEEP_GREEN, fontWeight: '900' },
  calendarDotRow: { flexDirection: 'row', gap: 3, position: 'absolute', bottom: 5 },
  calendarDot: { width: 6, height: 6, borderRadius: 3 },
  calendarSummaryDivider: { height: 1, backgroundColor: 'rgba(28, 60, 54, 0.08)', marginTop: 10, marginBottom: 12 },
  calendarSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  calendarSummaryCol: { flex: 1, minWidth: 0 },
  calendarSummaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryDot: { width: 7, height: 7, borderRadius: 3.5 },
  calendarSummaryLabel: { fontSize: 11, color: SAGE, fontWeight: '700', marginBottom: 2 },
  calendarSummaryValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },

  // ---- Selected day ----
  selectedDateContainer: { marginTop: 2 },
  selectedDateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4, gap: 10 },
  selectedDateTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800' },
  selectedDateSubtitle: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 2 },
  selectedDateTotals: { alignItems: 'flex-end', gap: 2 },

  // ---- Yearly ----
  yearlyOverviewCard: { borderRadius: 22, padding: 22, marginBottom: 14, alignItems: 'center', ...CARD_SHADOW, shadowOpacity: 0.14, elevation: 3 },
  yearlyOverviewTitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 6 },
  yearlyNetValue: { fontSize: 34, fontWeight: '800', marginBottom: 14, letterSpacing: -0.8 },
  yearlyOverviewRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(255, 255, 255, 0.12)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  yearlyVerticalDivider: { width: 1, height: 14, backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  yearlyInsightRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  yearlyInsightChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  yearlyInsightText: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700' },

  yearlyLegendRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginBottom: 10, paddingHorizontal: 4 },
  yearlyLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  yearlyLegendText: { color: SAGE, fontSize: 11, fontWeight: '700' },

  yearlyGridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  yearlyGridBox: { width: '31.5%', minHeight: 112, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 12, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', ...CARD_SHADOW, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  yearlyGridBoxCurrent: { borderColor: GOLD },
  yearlyGridBoxEmpty: { backgroundColor: 'rgba(255,255,255,0.6)', shadowOpacity: 0, elevation: 0, borderColor: 'rgba(28, 60, 54, 0.05)' },
  yearlyGridBadge: { position: 'absolute', top: 7, right: 7 },
  yearlyGridMonth: { color: SAGE, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  yearlyGridNet: { fontSize: 14, fontWeight: '800', textAlign: 'center', alignSelf: 'stretch' },
  yearlyGridEmptyText: { color: 'rgba(124, 154, 149, 0.7)', fontSize: 11, fontWeight: '600', marginTop: 8 },
  yearlyMiniBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 5, height: 30, marginTop: 8 },
  yearlyMiniBar: { width: 9, borderRadius: 3 },
  yearlyGridCount: { color: SAGE, fontSize: 10, fontWeight: '700', marginTop: 8, backgroundColor: CREAM, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  miniStatTextIn: { fontSize: 12, fontWeight: '700', color: '#5FE3B3' },
  miniStatTextOut: { fontSize: 12, fontWeight: '700', color: '#FF9B93' },

  // ---- Swipe actions ----
  actionsContainer: { flexDirection: 'row', width: 140, paddingBottom: 10, paddingLeft: 8 },
  actionButton: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 16, marginHorizontal: 2 },
  editActionButton: { backgroundColor: GOLD },
  archiveActionButton: { backgroundColor: TEAL },
  actionButtonText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },

  // ---- Empty state ----
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, gap: 8 },
  emptyIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 4, ...CARD_SHADOW, shadowOpacity: 0.08, shadowRadius: 10 },
  emptyTitle: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800' },
  emptyResetButton: { marginTop: 10, backgroundColor: 'rgba(28, 60, 54, 0.07)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  emptyResetText: { color: DEEP_GREEN, fontSize: 13, fontWeight: '800' },
  emptyContainerMini: { alignItems: 'center', paddingVertical: 25, gap: 8 },
  comingSoonText: { color: SAGE, fontSize: 13, fontWeight: '600' },

  // ---- Filter modal ----
  filterModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28, 60, 54, 0.5)' },
  filterModalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 35, maxHeight: '80%' },
  filterModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: TRACK, alignSelf: 'center', marginBottom: 16 },
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