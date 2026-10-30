import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Switch } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTransactions } from '../context/TransactionContext'; 
import { API_URL } from '../config';
import QuickAddCategoryModal from '../components/QuickAddCategoryModal';
import { getSecureItem } from '../utils/secureStorage';
import { hasSubCentPrecision } from '../utils/money';


const FINAI_DEEP_GREEN = '#144A3D';
const FINAI_SAGE = '#8A9A86';
const FINAI_LIGHT_BG = '#F7F9F8';
const FINAI_CARD_BG = '#FFFFFF';
const PESO = String.fromCharCode(0x20b1);

const PERIODS = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Annual', value: 'annual' },
] as const;

export default function SetBudgetScreen() {
  const router = useRouter();
  const { id, amount: initialAmount, categoryName, category_id, period_type } = useLocalSearchParams();
  
  const { categories, budgets, fetchTransactions, updateBudget, showTransactionToast } = useTransactions();
  
  const expenseCategories = categories?.filter((c: any) => c.type === 'expense') || [];

  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'weekly' | 'monthly' | 'annual'>('monthly');
  const [amount, setAmount] = useState(initialAmount as string || '');
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isQuickAddCategoryVisible, setIsQuickAddCategoryVisible] = useState(false);

  // A category may have a separate weekly, monthly, and annual budget.
  const availableCategories = expenseCategories;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const categoryBudgets = selectedCategory
    ? budgets.filter((item: any) => item.category_id === selectedCategory.id && item.start_date <= todayKey && item.end_date >= todayKey)
    : [];
  const samePeriodBudget = categoryBudgets.find((item: any) => item.period_type === selectedPeriod);
  const otherPeriodBudgets = categoryBudgets.filter((item: any) => item.period_type !== selectedPeriod);

  const handleCategoryCreated = (created: { id: string; name: string; type: 'expense' | 'income'; icon?: string }) => {
    setSelectedCategory(created);
    setIsQuickAddCategoryVisible(false);
    void fetchTransactions(false);
  };

  useEffect(() => {
    if (category_id) {
      const found = categories.find((c: any) => c.id === String(category_id));
      if (found) setSelectedCategory(found);
    }
    if (period_type === 'weekly' || period_type === 'monthly' || period_type === 'annual') {
      setSelectedPeriod(period_type);
    }
    if (id) {
      const savedBudget = budgets.find((item: any) => item.id === String(id));
      setRolloverEnabled(Boolean(savedBudget?.rollover_enabled));
    }
  }, [category_id, categories, period_type, id, budgets]);

  const handleSaveBudget = async () => {
    if (!selectedCategory) {
      Alert.alert('Choose a category', 'Select a category before continuing.');
      return;
    }

    if (hasSubCentPrecision(amount)) {
      Alert.alert('Too many decimal places', 'Budget limits can be entered to the nearest centavo (up to 2 decimal places).');
      return;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid budget amount.');
      return;
    }

    setLoading(true);
    try {
      const numericAmount = parseFloat(amount);
      if (id) {
        await updateBudget(id as string, numericAmount, rolloverEnabled);
      } else {
        const userId = await AsyncStorage.getItem('user_id');
        const token = await getSecureItem('user_token');
        if (!userId || !token) throw new Error('Your session has expired. Please log in again.');
        const payload = {
          user_id: userId,
          category_id: selectedCategory.id,
          amount: numericAmount,
          period_type: selectedPeriod,
          rollover_enabled: rolloverEnabled,
        };

        const response = await fetch(`${API_URL}/api/budgets/set-limit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not save this budget. Please try again.');
        }
        void fetchTransactions(false);
      }

      const formattedAmount = `${PESO}${numericAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const periodLabel = selectedPeriod;
      showTransactionToast({
        kind: 'success',
        title: id || samePeriodBudget ? 'Budget updated' : 'Budget saved',
        messages: [`${selectedCategory.name} ${periodLabel} limit is ${formattedAmount}.`],
      });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/insights' as never);
    } catch (error) {
      Alert.alert('Could not save budget', error instanceof Error
        ? error.message
        : "We couldn't save this limit. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={FINAI_DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>{id ? 'Edit budget' : 'Set a budget limit'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.fixedBillsLink} accessibilityRole="button" onPress={() => router.push('/fixed-bills' as never)}>
          <Ionicons name="calendar-outline" size={19} color={FINAI_DEEP_GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fixedBillsLinkTitle}>Scheduled bills</Text>
            <Text style={styles.fixedBillsLinkCopy}>Add recurring payments and due dates separately</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={FINAI_SAGE} />
        </TouchableOpacity>
        <View style={styles.welcomeSection}>
          <Text style={styles.title}>{id ? 'Edit your limit' : 'Set a spending limit'}</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.categoryHeaderRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>Category</Text>
            {!id && (
              <TouchableOpacity style={styles.addCategoryButton} onPress={() => setIsQuickAddCategoryVisible(true)}>
                <Ionicons name="add-circle-outline" size={18} color={FINAI_DEEP_GREEN} />
                <Text style={styles.addCategoryText}>Add category</Text>
              </TouchableOpacity>
            )}
          </View>
          {id ? (
            <View style={[styles.chip, { backgroundColor: '#EBF0EE', borderColor: '#D1D9D4' }]}>
              <Text style={{ color: FINAI_DEEP_GREEN, fontWeight: '700', fontSize: 13 }}>
                {selectedCategory?.name || categoryName}
              </Text>
            </View>
          ) : (
            <View style={styles.pickerContainer}>
              {availableCategories.map((cat: any) => (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[styles.chip, selectedCategory?.id === cat.id && styles.activeChip]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.chipText, selectedCategory?.id === cat.id && styles.activeChipText]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {!id && (
          <View style={styles.formCard}>
            <Text style={styles.label}>Budget period</Text>
            <View style={styles.row}>
              {PERIODS.map((period) => (
                <TouchableOpacity key={period.value} style={[styles.periodBtn, selectedPeriod === period.value && styles.activePeriodBtn]} onPress={() => setSelectedPeriod(period.value)}>
                  <Text style={[styles.periodText, selectedPeriod === period.value && styles.activePeriodText]}>{period.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.formCard}>
          {selectedCategory && samePeriodBudget && !id ? (
          <View style={styles.infoCard}><Ionicons name="information-circle-outline" size={18} color={FINAI_DEEP_GREEN} /><Text style={styles.infoText}>A {selectedPeriod} limit already exists for {selectedCategory.name}. Saving here updates it.</Text></View>
          ) : null}
          {selectedCategory && otherPeriodBudgets.length > 0 ? (
          <View style={styles.infoCard}><Ionicons name="information-circle-outline" size={18} color={FINAI_DEEP_GREEN} /><Text style={styles.infoText}>This category also has a {otherPeriodBudgets.map((item: any) => item.period_type).join(" and ")} limit. This creates a separate period limit that tracks the same spending.</Text></View>
          ) : null}
          <Text style={styles.label}>Limit amount ({PESO})</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.currencySymbol}>{PESO}</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={FINAI_SAGE} />
          </View>
          <Text style={styles.helperText}>
            Enter the maximum amount for each {selectedPeriod.replace('annual', 'year').replace('monthly', 'month').replace('weekly', 'week')}. {id ? 'Change it here to update this limit.' : 'You can change it later with Edit budget.'}
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.rolloverHeader}>
            <View style={styles.rolloverCopy}>
              <Text style={styles.rolloverTitle}>Carry balance forward</Text>
              <Text style={styles.helperText}>
                {rolloverEnabled
                  ? "Unused money adds to the next period. Spending above the available amount reduces the next period's limit."
                  : 'Off: each period starts with this limit and no carried balance.'}
              </Text>
            </View>
            <Switch value={rolloverEnabled} onValueChange={setRolloverEnabled} trackColor={{ false: '#D1D9D4', true: FINAI_SAGE }} thumbColor={rolloverEnabled ? FINAI_DEEP_GREEN : '#F4F4F4'} />
          </View>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{id || samePeriodBudget ? 'Update limit' : 'Save limit'}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <QuickAddCategoryModal
        visible={isQuickAddCategoryVisible}
        type="expense"
        onClose={() => setIsQuickAddCategoryVisible(false)}
        onCreated={handleCategoryCreated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FINAI_LIGHT_BG },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EBF0EE' },
  backButton: { padding: 8, borderRadius: 8, backgroundColor: '#F0F4F2' },
  appBarTitle: { fontSize: 16, fontWeight: '700', color: FINAI_DEEP_GREEN },
  scrollContent: { paddingBottom: 40, paddingHorizontal: 20 },
  fixedBillsLink: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EAF4EF', borderRadius: 14, padding: 13, marginTop: 14 },
  fixedBillsLinkTitle: { color: FINAI_DEEP_GREEN, fontSize: 13, fontWeight: '800' },
  fixedBillsLinkCopy: { color: FINAI_SAGE, fontSize: 11, marginTop: 2 },
  welcomeSection: { marginVertical: 20 },
  title: { fontSize: 24, fontWeight: '800', color: FINAI_DEEP_GREEN, marginBottom: 6 },
  formCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EBF0EE', marginBottom: 16, elevation: 2 },
  label: { fontSize: 13, fontWeight: '700', color: FINAI_DEEP_GREEN, marginBottom: 12, textTransform: 'uppercase' },
  categoryHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  addCategoryButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingLeft: 8 },
  addCategoryText: { fontSize: 12, color: FINAI_DEEP_GREEN, fontWeight: '700' },
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F0F4F2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E6ECE9' },
  activeChip: { backgroundColor: FINAI_DEEP_GREEN, borderColor: FINAI_DEEP_GREEN },
  chipText: { color: FINAI_SAGE, fontSize: 13, fontWeight: '600' },
  activeChipText: { color: '#FFF', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  periodBtn: { flex: 1, backgroundColor: '#F0F4F2', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E6ECE9' },
  activePeriodBtn: { backgroundColor: FINAI_DEEP_GREEN, borderColor: FINAI_DEEP_GREEN },
  periodText: { color: FINAI_SAGE, fontSize: 13, fontWeight: '600' },
  activePeriodText: { color: '#FFF', fontWeight: '700' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFBFB', borderRadius: 12, borderWidth: 1, borderColor: '#E6ECE9', paddingHorizontal: 14 },
  currencySymbol: { fontSize: 20, fontWeight: '700', color: FINAI_DEEP_GREEN, marginRight: 8 },
  input: { flex: 1, color: FINAI_DEEP_GREEN, paddingVertical: 14, fontSize: 18, fontWeight: '700' },
  helperText: { color: FINAI_SAGE, fontSize: 12, lineHeight: 18, marginTop: 4 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EAF4EF', borderRadius: 14, padding: 13, marginBottom: 16 },
  infoText: { flex: 1, color: FINAI_DEEP_GREEN, fontSize: 12, lineHeight: 18 },
  rolloverHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rolloverCopy: { flex: 1 },
  rolloverTitle: { color: FINAI_DEEP_GREEN, fontSize: 14, fontWeight: '700' },
  actionContainer: { marginTop: 12 },
  saveButton: { backgroundColor: FINAI_DEEP_GREEN, paddingVertical: 16, borderRadius: 14, alignItems: 'center', elevation: 3 },
  saveButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
