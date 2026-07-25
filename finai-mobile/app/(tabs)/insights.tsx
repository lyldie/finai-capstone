import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, Alert, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTransactions } from '../../context/TransactionContext';
import DepositModal from '../../components/DepositModal';

// FINAI OFFICIAL COLOR PALETTE
const FINAI_DEEP_GREEN = '#144A3D';
const FINAI_SAGE = '#8A9A86';
const FINAI_LIGHT_BG = '#F7F9F8';
const FINAI_CARD_BG = '#FFFFFF';
const ALERT_YELLOW = '#F59E0B';
const CRITICAL_RED = '#EF4444';

// HELPER: Currency Formatter (Exact amount, comma-separated)
const formatCurrency = (amount: number) => {
  return '₱' + Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export default function InsightsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'Stats' | 'Budget'>('Stats');
  const [timeframe, setTimeframe] = useState<'Week' | 'Month' | 'Year'>('Month');
  const [subTab, setSubTab] = useState<'Income' | 'Expense'>('Expense');
  
  const [isDepositModalVisible, setIsDepositModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);

  // DYNAMIC Context (Sama natin si goalTypes/presetTypes kung mayroon sa context)
  const transactionContext = useTransactions();
  const { 
    budgets = [], 
    transactions = [], 
    isLoading = false, 
    categories = [], 
    deleteBudget, 
    goals = [], 
    deleteGoal, 
    accounts = [], 
    depositToGoal 
  } = transactionContext;
  
  // Safe extraction ng goalTypes list mula sa context kung available
  const goalTypes = (transactionContext as any).goalTypes || (transactionContext as any).goal_types || [];

  const getAccountBalance = (accName: string) => {
    const account = accounts?.find((a: any) => a.name === accName);
    return account ? ((account as any).balance || (account as any).initial_balance || 0) : 0;
  };

  // DYNAMIC COMPUTATIONS
  const stats = useMemo(() => {
    const totalBudget = budgets.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
    const totalSpent = transactions
      .filter(t => t.type === 'Expense')
      .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    
    const usage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    
    const netCashFlow = transactions.reduce((acc, t) => 
      t.type === 'Income' ? acc + (Number(t.amount) || 0) : acc - (Number(t.amount) || 0), 0);

    const safeGoals = goals || [];
    const totalTarget = safeGoals.reduce((acc, g) => acc + (Number(g.target_amount) || 0), 0);
    const totalSavings = safeGoals.reduce((acc, g) => acc + (Number(g.current_savings) || 0), 0);
    const overallGoalProgress = totalTarget > 0 ? (totalSavings / totalTarget) * 100 : 0;

    return { totalBudget, totalSpent, usage, netCashFlow, totalTarget, totalSavings, overallGoalProgress };
  }, [budgets, transactions, goals]);

  const getAlertColor = (percentage: number) => {
    if (percentage >= 100) return CRITICAL_RED;     // Over budget
    if (percentage >= 90) return CRITICAL_RED;      // Critical alert
    if (percentage >= 70) return ALERT_YELLOW;      // Warning
    return '#10B981';                               // Success/On Track
  };

  const getAlertIcon = (percentage: number) => {
    if (percentage >= 100) return '🚨';
    if (percentage >= 70) return '⚠️';
    return '✅';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Food & Dining': return 'fast-food-outline';
      case 'Transportation': return 'car-outline';
      case 'Entertainment': return 'film-outline';
      case 'Shopping': return 'shirt-outline';
      case 'Utilities': return 'flash-outline';
      default: return 'wallet-outline';
    }
  };

  // SMART RESOLUTION FOR PRESET / GOAL TYPE NAME ("Travel", "Gadgets", etc.)
  const resolvePresetName = (goal: any) => {
    // 1. Direct name properties mula sa object
    if (goal.goal_type_name) return goal.goal_type_name;
    if (goal.preset_name) return goal.preset_name;
    if (goal.type_name) return goal.type_name;
    if (goal.goal_type?.name) return goal.goal_type.name;
    if (typeof goal.goal_type === 'string' && isNaN(Number(goal.goal_type)) && goal.goal_type.length < 20) {
      return goal.goal_type;
    }

    // 2. Fallback: Kuhanin via ID lookup sa goalTypes array (mula sa context)
    const typeId = goal.goal_type_id || goal.preset_id || (typeof goal.goal_type === 'string' ? goal.goal_type : null);
    if (typeId && goalTypes.length > 0) {
      const foundType = goalTypes.find((gt: any) => gt.id === typeId || gt._id === typeId);
      if (foundType?.name) return foundType.name;
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Financial Insights</Text>
        <Text style={styles.headerSubtitle}>AI-powered financial monitoring</Text>
      </View>

      <View style={styles.tabOuterContainer}>
        <View style={styles.finaiSegmentControl}>
          <TouchableOpacity style={[styles.finaiSegmentBtn, activeTab === 'Stats' && styles.finaiSegmentActiveBtn]} onPress={() => setActiveTab('Stats')}>
            <Ionicons name="pie-chart-outline" size={16} color={activeTab === 'Stats' ? '#FFF' : FINAI_SAGE} style={{marginRight: 6}} />
            <Text style={[styles.finaiSegmentText, activeTab === 'Stats' && styles.finaiSegmentActiveText]}>Analytics</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.finaiSegmentBtn, activeTab === 'Budget' && styles.finaiSegmentActiveBtn]} onPress={() => setActiveTab('Budget')}>
            <Ionicons name="wallet-outline" size={16} color={activeTab === 'Budget' ? '#FFF' : FINAI_SAGE} style={{marginRight: 6}} />
            <Text style={[styles.finaiSegmentText, activeTab === 'Budget' && styles.finaiSegmentActiveText]}>Limits & Goals</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'Stats' ? (
          <View style={styles.viewContainer}>
            <View style={styles.timeframeRow}>
              {(['Week', 'Month', 'Year'] as const).map((t) => (
                <TouchableOpacity key={t} style={[styles.timeframePill, timeframe === t && styles.timeframePillActive]} onPress={() => setTimeframe(t)}>
                  <Text style={[styles.timeframePillText, timeframe === t && styles.timeframePillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.incExpToggleContainer}>
              <TouchableOpacity style={[styles.incExpBtn, subTab === 'Income' && styles.incomeActiveBtn]} onPress={() => setSubTab('Income')}><Text style={[styles.incExpText, subTab === 'Income' && styles.incExpTextActive]}>Income</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.incExpBtn, subTab === 'Expense' && styles.expenseActiveBtn]} onPress={() => setSubTab('Expense')}><Text style={[styles.incExpText, subTab === 'Expense' && styles.incExpTextActive]}>Expenses</Text></TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Key Metrics ({timeframe})</Text>
            <View style={styles.kpiGridRow}>
              <View style={styles.finaiKpiCard}>
                <Text style={styles.kpiMetaText}>Budget Adherence</Text>
                <Text style={[styles.kpiMainValue, { color: getAlertColor(stats.usage) }]}>
                  {stats.totalBudget > 0 ? Math.max(100 - stats.usage, 0).toFixed(0) : 0}%
                </Text>
                <View style={stats.usage >= 70 ? styles.miniBadgeNeutral : styles.miniBadgeSuccess}>
                  <Text style={styles.badgeText}>{stats.usage >= 90 ? 'Critical' : stats.usage >= 70 ? 'Warning' : 'On Track'}</Text>
                </View>
              </View>
              <View style={styles.finaiKpiCard}>
                <Text style={styles.kpiMetaText}>Net Cash Flow</Text>
                <Text style={[styles.kpiMainValue, { color: stats.netCashFlow >= 0 ? FINAI_DEEP_GREEN : CRITICAL_RED }]}>
                  {stats.netCashFlow >= 0 ? '+' : ''}{formatCurrency(stats.netCashFlow)}
                </Text>
                <View style={styles.miniBadgeNeutral}><Text style={styles.badgeText}>{stats.netCashFlow >= 0 ? 'Positive' : 'Deficit'}</Text></View>
              </View>
            </View>

            {/* Total Savings Progress Card */}
            <View style={styles.finaiFullKpiCard}>
              <View style={styles.fullCardHeader}>
                <View>
                  <Text style={styles.kpiMetaText}>Total Savings Progress (All Goals)</Text>
                  <Text style={[styles.kpiMainValue, { color: FINAI_DEEP_GREEN }]}>{formatCurrency(stats.totalSavings)}</Text>
                </View>
                <View style={styles.fullCardRightSide}>
                  <Text style={styles.goalPercentageText}>{stats.overallGoalProgress.toFixed(0)}% Total Saved</Text>
                  <Text style={styles.miniGoalTarget}>Combined Target: {formatCurrency(stats.totalTarget)}</Text>
                </View>
              </View>
              <View style={styles.analyticsProgressBarWrapper}><View style={[styles.analyticsProgressBarFill, { width: `${Math.min(stats.overallGoalProgress, 100)}%` }]} /></View>
            </View>

            <View style={styles.finaiChartCard}>
              <View style={styles.chartHeaderLayout}>
                <Text style={styles.chartTitle}>Overview Chart</Text>
                <Ionicons name="trending-up" size={18} color={FINAI_DEEP_GREEN} />
              </View>
              <View style={styles.chartVisualArea}>
                <Ionicons name="bar-chart" size={54} color="#E2EAF4" />
                <Text style={styles.chartStatusText}>Interactive FinAI chart visualization will hook here paps</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.viewContainer}>
            {/* HERO BUDGET CARD */}
            <View style={styles.finaiBudgetHeroCard}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={styles.heroMetaText}>Remaining Total Allowance</Text>
                  <Text style={styles.heroAmountValue}>
                    {formatCurrency(Math.max(stats.totalBudget - stats.totalSpent, 0))}
                  </Text>
                </View>
                <TouchableOpacity style={styles.finaiGearBtn}><Ionicons name="options-outline" size={16} color="#FFF" /><Text style={styles.gearBtnText}>Pool Setup</Text></TouchableOpacity>
              </View>
              
              <View style={styles.progressBarWrapper}>
                <View style={[styles.progressBarFill, { width: `${Math.min(stats.usage, 100)}%`, backgroundColor: getAlertColor(stats.usage) }]} />
              </View>
              
              <View style={styles.heroFooter}>
                <Text style={styles.heroFooterText}>Total Pool: {formatCurrency(stats.totalBudget)}</Text>
                <Text style={[styles.alertBadgeText, { color: getAlertColor(stats.usage) }]}>
                  {getAlertIcon(stats.usage)} {stats.usage.toFixed(0)}% Used
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Category Spending Limits</Text>
              <TouchableOpacity style={styles.finaiAddBtn} onPress={() => router.push('/setbudget')}>
                <Ionicons name="add-circle" size={20} color={FINAI_DEEP_GREEN} />
                <Text style={styles.finaiAddBtnText}>Set Limit</Text>
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <ActivityIndicator size="small" color={FINAI_DEEP_GREEN} style={{ marginVertical: 20 }} />
            ) : budgets.length === 0 ? (
              <View style={styles.categoryBudgetCard}>
                <Text style={{ color: FINAI_SAGE, textAlign: 'center', fontSize: 13, padding: 10 }}>
                  Walang nakaset na budget limit paps. Pindutin ang "Set Limit" sa itaas para mag-add! 🐿️
                </Text>
              </View>
            ) : (
              budgets.map((item, index) => {
                const categoryInfo = categories.find(c => c.id === item.category_id);
                const categoryName = categoryInfo ? categoryInfo.name : 'Unknown';

                const spent = transactions
                  .filter(t => t.type === 'Expense' && t.category === categoryName)
                  .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
                
                const limitAmount = item.amount || 0;
                const percentageUsed = limitAmount > 0 ? (spent / limitAmount) * 100 : 0;

                const rawMonthYear = item.month_year || '07-2026';
                const cleanMonthYear = rawMonthYear.includes('-') && rawMonthYear.split('-')[0].length === 4 
                  ? `${rawMonthYear.split('-')[1]}-${rawMonthYear.split('-')[0]}` 
                  : rawMonthYear;

                return (
                  <TouchableOpacity 
                    key={item.id || index} 
                    style={styles.categoryBudgetCard}
                    onPress={() => router.push({
                      pathname: '/setbudget',
                      params: { id: item.id, category_id: item.category_id, amount: item.amount }
                    })}
                    onLongPress={() => {
                      Alert.alert("Burahin ang budget?", `Sigurado ka bang buburahin ang budget limit para sa ${categoryName}?`, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => deleteBudget(item.id) }
                      ]);
                    }}
                  >
                    <View style={styles.categoryMainRow}>
                      <View style={styles.categoryLeftPart}>
                        <View style={[styles.categoryIconCircle, { backgroundColor: 'rgba(20, 74, 61, 0.08)' }]}>
                          <Ionicons name={getCategoryIcon(categoryName)} size={18} color={FINAI_DEEP_GREEN} />
                        </View>
                        <View style={{ marginLeft: 12 }}>
                          <Text style={styles.categoryTitle}>{categoryName}</Text>
                          <Text style={styles.categoryPeriodText}>{cleanMonthYear} Limit</Text>
                        </View>
                      </View>
                      <View style={styles.categoryRightPart}>
                        <Text style={styles.categoryUsageStats}>{formatCurrency(spent)} / {formatCurrency(limitAmount)}</Text>
                        <Text style={[styles.categoryRemainingText, { color: getAlertColor(percentageUsed) }]}>
                          {formatCurrency(Math.max(limitAmount - spent, 0))} left
                        </Text>
                      </View>
                    </View>
                    <View style={styles.catProgressBarWrapper}>
                      <View style={[styles.catProgressBarFill, { 
                        width: `${Math.min(percentageUsed, 100)}%`, 
                        backgroundColor: getAlertColor(percentageUsed) 
                      }]} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            
            {/* DYNAMIC: ACTIVE FINANCIAL GOALS */}
            <View style={[styles.sectionHeaderRow, { marginTop: 12 }]}>
              <Text style={styles.sectionLabel}>Active Financial Goals</Text>
              <TouchableOpacity style={styles.finaiAddBtn} onPress={() => router.push('/create-goal')}>
                <Ionicons name="add-circle" size={20} color={FINAI_DEEP_GREEN} />
                <Text style={styles.finaiAddBtnText}>Create Goal</Text>
              </TouchableOpacity>
            </View>
            
            {(!goals || goals.length === 0) ? (
              <View style={styles.finaiGoalCard}>
                <Text style={{ color: FINAI_SAGE, textAlign: 'center', fontSize: 13, padding: 10 }}>
                  Walang nakaset na financial goals paps. Gumawa na para sa capstone! 🎯
                </Text>
              </View>
            ) : (
              goals.map((goal, index) => {
                const target = Number(goal.target_amount) || 0;
                const saved = Number(goal.current_savings) || 0;
                const progress = target > 0 ? (saved / target) * 100 : 0;

                // 👉 SMART PRESET / GOAL TYPE BADGE RESOLUTION
                const presetName = resolvePresetName(goal);

                return (
                  <TouchableOpacity 
                    key={goal.id || index} 
                    style={[styles.finaiGoalCard, { marginBottom: 12 }]} 
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedGoal(goal);
                      setIsDepositModalVisible(true);
                    }}
                  >
                    <View style={styles.goalMainLayout}>
                      <View style={styles.goalLeftColumn}>
                        <View style={styles.targetIconCircle}><Text style={{fontSize: 18}}>🎯</Text></View>
                        <View style={{marginLeft: 10}}>
                          <Text style={styles.finaiGoalTitle}>{goal.target_name}</Text>
                          
                          {/* PRESET BADGE: Pinapakita ang "Travel", "Gadgets", etc. */}
                          {presetName ? (
                            <View style={styles.presetBadge}>
                              <Text style={styles.presetBadgeText}>{presetName}</Text>
                            </View>
                          ) : null}

                          <Text style={styles.finaiGoalDate}>Target: {goal.target_date || 'N/A'}</Text>
                        </View>
                      </View>

                      {/* EDIT & DELETE ACTION BUTTONS */}
                      <View style={styles.goalActionsRow}>
                        <TouchableOpacity 
                          style={styles.actionIconButton}
                          onPress={() => router.push({
                            pathname: '/create-goal',
                            params: { 
                              id: goal.id, 
                              target_name: goal.target_name, 
                              target_amount: goal.target_amount, 
                              target_date: goal.target_date, 
                              current_savings: goal.current_savings,
                              goal_type_id: (goal as any).goal_type_id || (goal as any).preset_id || (goal as any).goal_type,
                            }
                          })}
                        >
                          <Ionicons name="pencil" size={14} color={FINAI_DEEP_GREEN} />
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.actionIconButton, { backgroundColor: '#FEE2E2', marginLeft: 6 }]}
                          onPress={() => {
                            Alert.alert(
                              "Burahin ang Goal?",
                              `Sigurado ka bang buburahin ang target na "${goal.target_name}"?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                { 
                                  text: "Delete", 
                                  style: "destructive", 
                                  onPress: () => deleteGoal ? deleteGoal(goal.id) : null 
                                }
                              ]
                            );
                          }}
                        >
                          <Ionicons name="trash-outline" size={14} color={CRITICAL_RED} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* STATS & PROGRESS BAR */}
                    <View style={styles.goalProgressInfoRow}>
                      <Text style={styles.goalProgressStats}>
                        {formatCurrency(saved)} / {formatCurrency(target)}
                      </Text>
                      <Text style={styles.goalPercentageText}>{progress.toFixed(0)}% Saved</Text>
                    </View>

                    <View style={styles.goalProgressBarWrapper}>
                      <View style={[styles.goalProgressBarFill, { width: `${Math.min(progress, 100)}%` }]} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

          </View>
        )}
      </ScrollView>

      <DepositModal 
        visible={isDepositModalVisible} 
        onClose={() => setIsDepositModalVisible(false)} 
        selectedGoal={selectedGoal}
        accounts={accounts || []}
        getAccountBalance={getAccountBalance}
        depositToGoal={depositToGoal}
      />
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FINAI_LIGHT_BG },
  headerContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: FINAI_DEEP_GREEN },
  headerSubtitle: { fontSize: 12, color: FINAI_SAGE, marginTop: 2 },
  tabOuterContainer: { paddingHorizontal: 20, marginVertical: 12 },
  finaiSegmentControl: { flexDirection: 'row', backgroundColor: '#E6ECE9', borderRadius: 12, padding: 4 },
  finaiSegmentBtn: { flex: 1, flexDirection: 'row', paddingVertical: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  finaiSegmentActiveBtn: { backgroundColor: FINAI_DEEP_GREEN, elevation: 3, shadowColor: FINAI_DEEP_GREEN, shadowOpacity: 0.15, shadowRadius: 4 },
  finaiSegmentText: { fontSize: 13, fontWeight: '600', color: FINAI_SAGE },
  finaiSegmentActiveText: { color: '#FFFFFF', fontWeight: '700' },
  scrollContent: { paddingBottom: 40 },
  viewContainer: { paddingHorizontal: 20 },
  timeframeRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  timeframePill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E2EAF4', marginHorizontal: 4, backgroundColor: '#FFF' },
  timeframePillActive: { backgroundColor: '#E6ECE9', borderColor: FINAI_DEEP_GREEN },
  timeframePillText: { fontSize: 12, color: FINAI_SAGE, fontWeight: '600' },
  timeframePillTextActive: { color: FINAI_DEEP_GREEN, fontWeight: '700' },
  incExpToggleContainer: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#E2EAF4', marginBottom: 20 },
  incExpBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  incomeActiveBtn: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  expenseActiveBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  incExpText: { fontSize: 13, fontWeight: '600', color: FINAI_SAGE },
  incExpTextActive: { color: FINAI_DEEP_GREEN, fontWeight: '700' },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: FINAI_DEEP_GREEN, marginBottom: 12 },
  kpiGridRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  finaiKpiCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 16, padding: 16, width: '48%', borderWidth: 1, borderColor: '#EBF0EE', elevation: 2, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5 },
  finaiFullKpiCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 16, padding: 16, width: '100%', borderWidth: 1, borderColor: '#EBF0EE', elevation: 2, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, marginBottom: 16 },
  fullCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  fullCardRightSide: { alignItems: 'flex-end' },
  miniGoalTarget: { fontSize: 11, color: FINAI_SAGE, marginTop: 2 },
  kpiMetaText: { fontSize: 11, color: FINAI_SAGE, fontWeight: '600' },
  kpiMainValue: { fontSize: 18, fontWeight: '800', marginVertical: 4 },
  miniBadgeSuccess: { backgroundColor: 'rgba(16, 185, 129, 0.1)', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniBadgeNeutral: { backgroundColor: 'rgba(20, 74, 61, 0.1)', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', color: FINAI_DEEP_GREEN },
  finaiChartCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#EBF0EE', marginTop: 8 },
  chartHeaderLayout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  chartTitle: { fontSize: 14, fontWeight: '700', color: FINAI_DEEP_GREEN },
  chartVisualArea: { height: 160, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFBFB', borderRadius: 12, padding: 16 },
  chartStatusText: { fontSize: 11, color: FINAI_SAGE, textAlign: 'center', marginTop: 8 },
  finaiBudgetHeroCard: { backgroundColor: FINAI_DEEP_GREEN, borderRadius: 20, padding: 20, elevation: 4, shadowColor: FINAI_DEEP_GREEN, shadowOpacity: 0.2, shadowRadius: 8, marginBottom: 24 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroMetaText: { fontSize: 12, color: '#A9BDB7', fontWeight: '600' },
  heroAmountValue: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  finaiGearBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  gearBtnText: { fontSize: 11, color: '#FFF', fontWeight: '700', marginLeft: 4 },
  progressBarWrapper: { height: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 5, overflow: 'hidden', marginVertical: 16 },
  progressBarFill: { height: '100%', borderRadius: 5 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  heroFooterText: { fontSize: 11, color: '#A9BDB7', fontWeight: '500' },
  alertBadgeText: { fontSize: 11, fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  finaiAddBtn: { flexDirection: 'row', alignItems: 'center' },
  finaiAddBtnText: { fontSize: 12, fontWeight: '700', color: FINAI_DEEP_GREEN, marginLeft: 4 },
  categoryBudgetCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EBF0EE', marginBottom: 12 },
  categoryMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryLeftPart: { flexDirection: 'row', alignItems: 'center' },
  categoryIconCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  categoryTitle: { fontSize: 13, fontWeight: '700', color: FINAI_DEEP_GREEN },
  categoryPeriodText: { fontSize: 10, color: FINAI_SAGE, marginTop: 1 },
  categoryRightPart: { alignItems: 'flex-end' },
  categoryUsageStats: { fontSize: 13, fontWeight: '700', color: FINAI_DEEP_GREEN },
  categoryRemainingText: { fontSize: 11, color: '#10B981', fontWeight: '600', marginTop: 1 },
  catProgressBarWrapper: { height: 6, backgroundColor: '#E6ECE9', borderRadius: 3, overflow: 'hidden', marginTop: 10, width: '100%' },
  catProgressBarFill: { height: '100%', borderRadius: 3 },
  finaiGoalCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EBF0EE', flexDirection: 'column' },
  goalMainLayout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  goalLeftColumn: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  targetIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F0F4F2', justifyContent: 'center', alignItems: 'center' },
  finaiGoalTitle: { fontSize: 13, fontWeight: '700', color: FINAI_DEEP_GREEN },
  finaiGoalDate: { fontSize: 10, color: FINAI_SAGE, marginTop: 2 },
  presetBadge: { backgroundColor: '#EAF5F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginVertical: 3 },
  presetBadgeText: { fontSize: 10, fontWeight: '700', color: FINAI_DEEP_GREEN },
  goalActionsRow: { flexDirection: 'row', alignItems: 'center' },
  actionIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(20, 74, 61, 0.08)', justifyContent: 'center', alignItems: 'center' },
  goalProgressInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  goalProgressStats: { fontSize: 12, fontWeight: '700', color: FINAI_DEEP_GREEN },
  goalPercentageText: { fontSize: 11, color: '#10B981', fontWeight: '600' },
  goalProgressBarWrapper: { height: 6, backgroundColor: '#E6ECE9', borderRadius: 3, overflow: 'hidden', marginTop: 8, width: '100%' },
  goalProgressBarFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },
  analyticsProgressBarWrapper: { height: 6, backgroundColor: '#E6ECE9', borderRadius: 3, overflow: 'hidden', marginTop: 10, width: '100%' },
  analyticsProgressBarFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },
});