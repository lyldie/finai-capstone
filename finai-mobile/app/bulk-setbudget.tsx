import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../config';
import { useTransactions } from '../context/TransactionContext';
import { getSecureItem } from '../utils/secureStorage';

const GREEN = '#1c3c36';
const CREAM = '#FAF7F2';
const SAGE = '#60756F';
const GOLD = '#edb232';

export default function BulkSetBudgetScreen() {
  const router = useRouter();
  const { categories, fetchTransactions } = useTransactions();
  const expenseCategories = useMemo(() => categories.filter((item) => item.type === 'expense'), [categories]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'annual'>('monthly');
  const [saving, setSaving] = useState(false);
  const selected = expenseCategories.filter((category) => enabled[category.id]);

  const save = async () => {
    const rows = selected.map((category) => ({
      user_id: '', category_id: category.id, amount: Number(amounts[category.id]),
      period_type: period, rollover_enabled: false,
    }));
    if (!rows.length) {
      Alert.alert('Add an amount', 'Enter a limit for at least one category.');
      return;
    }
    if (selected.some((category) => !Number.isFinite(Number(amounts[category.id])) || Number(amounts[category.id]) <= 0 || Number(amounts[category.id]) > 1000000000)) {
      Alert.alert('Check the amounts', 'Each selected category needs a valid amount above zero.');
      return;
    }
    if (selected.some((category) => !/^\d+(\.\d{1,2})?$/.test(amounts[category.id].trim()))) {
      Alert.alert('Check the amounts', 'Amounts can have up to two decimal places.');
      return;
    }
    try {
      setSaving(true);
      const token = await getSecureItem('user_token');
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId || !token) throw new Error('Your session expired. Sign in and try again.');
      const response = await fetch(`${API_URL}/api/budgets/set-limits-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ budgets: rows.map((row) => ({ ...row, user_id: userId })) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not save these budgets. Try again.');
      await fetchTransactions(false);
      Alert.alert('Limits saved', `${rows.length} category ${rows.length === 1 ? 'limit is' : 'limits are'} ready.`, [{ text: 'Done', onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert('Could not save limits', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={22} color={GREEN} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Set multiple limits</Text><Text style={styles.subtitle}>Choose categories and enter each amount.</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>PERIOD</Text>
        <View style={styles.segment}>{(['weekly', 'monthly', 'annual'] as const).map((item) => <TouchableOpacity key={item} style={[styles.segmentItem, period === item && styles.segmentActive]} onPress={() => setPeriod(item)}><Text style={[styles.segmentText, period === item && styles.segmentTextActive]}>{item === 'annual' ? 'Annual' : item[0].toUpperCase() + item.slice(1)}</Text></TouchableOpacity>)}</View>
        <Text style={styles.helper}>These are category spending limits. Add scheduled payments and due dates separately in Plan Ahead.</Text>
        <Text style={styles.label}>EXPENSE CATEGORIES · {selected.length} SELECTED</Text>
        <View style={styles.card}>{expenseCategories.map((category, index) => {
          const active = Boolean(enabled[category.id]);
          return <View key={category.id} style={[styles.categoryRow, index > 0 && styles.rowBorder]}>
            <TouchableOpacity style={styles.selectIcon} onPress={() => setEnabled((current) => ({ ...current, [category.id]: !active }))} accessibilityRole="checkbox" accessibilityState={{ checked: active }}>
              <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={active ? GREEN : SAGE} />
            </TouchableOpacity>
            <Text style={styles.categoryName} numberOfLines={1}>{category.name}</Text>
            <TextInput style={styles.amount} placeholder="₱ amount" placeholderTextColor="#84938F" keyboardType="decimal-pad" value={amounts[category.id] || ''} onFocus={() => setEnabled((current) => ({ ...current, [category.id]: true }))} onChangeText={(value) => { setAmounts((current) => ({ ...current, [category.id]: value })); setEnabled((current) => ({ ...current, [category.id]: true })); }} />
          </View>;
        })}</View>
        <TouchableOpacity style={[styles.save, saving && { opacity: 0.7 }]} onPress={save} disabled={saving} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="checkmark" size={18} color="#FFFFFF" /><Text style={styles.saveText}>Save {selected.length || ''} limits</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  title: { color: GREEN, fontSize: 20, fontWeight: '800' }, subtitle: { color: SAGE, fontSize: 12, marginTop: 3 },
  content: { padding: 18, paddingBottom: 48 },
  label: { color: SAGE, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  segment: { flexDirection: 'row', backgroundColor: '#EEECE5', borderRadius: 14, padding: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, segmentActive: { backgroundColor: GREEN },
  segmentText: { color: SAGE, fontSize: 13, fontWeight: '700' }, segmentTextActive: { color: '#FFFFFF' },
  helper: { color: SAGE, fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 6 },
  card: { borderRadius: 18, backgroundColor: '#FFFFFF', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E8E7E0' },
  categoryRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E8E4' },
  selectIcon: { padding: 4 }, categoryName: { flex: 1, color: GREEN, fontWeight: '700', fontSize: 14 },
  amount: { width: 104, height: 40, backgroundColor: CREAM, borderRadius: 10, paddingHorizontal: 9, color: GREEN, textAlign: 'right', fontWeight: '700' },
  save: { height: 52, borderRadius: 16, backgroundColor: GREEN, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
