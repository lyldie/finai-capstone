import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/FinAIAlert';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions } from '../context/TransactionContext';
import { getSecureItem } from '../utils/secureStorage';
import { hasSubCentPrecision } from '../utils/money';
import { API_URL } from '../config';
import { userFacingError } from '../utils/userFacingError';

const GREEN = '#144A3D';
const CREAM = '#F7F9F8';
type Bill = { id: string; name: string; category: string; category_id: string; amount: number; due_day: number; due_date: string; period_key: string; status: 'paid' | 'unpaid' };

const money = (value: number) => `${String.fromCharCode(0x20b1)}${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FixedBillsScreen() {
  const router = useRouter();
  const { openAdd } = useLocalSearchParams<{ openAdd?: string }>();
  const { categories } = useTransactions();
  const expenses = categories.filter((item: any) => item.type?.toLowerCase() === 'expense' && !item.is_archived);
  const scrollRef = useRef<ScrollView>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [categoryId, setCategoryId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (openAdd === '1') {
      setFormVisible(true);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    }
  }, [openAdd]);

  const startAdding = () => {
    setEditingId(null); setName(''); setAmount(''); setDueDay('1'); setCategoryId('');
    setFormVisible(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

  const closeForm = () => {
    setFormVisible(false); setEditingId(null); setName(''); setAmount(''); setDueDay('1'); setCategoryId('');
  };

  const request = async (path: string, method = 'GET', body?: unknown) => {
    const token = await getSecureItem('user_token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch(`${API_URL}/api/bills${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Could not update fixed bills.');
    return payload;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await request(''); setBills(result.bills || []); }
    catch (error) { Alert.alert('Could not load bills', userFacingError(error, 'Check your connection and try again.')); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const addBill = async () => {
    const value = Number(amount);
    const day = Number(dueDay);
    if (!name.trim() || !categoryId || !Number.isFinite(value) || value <= 0 || !Number.isInteger(day) || day < 1 || day > 31 || hasSubCentPrecision(amount)) {
      Alert.alert('Check bill details', 'Enter a name, expense category, valid amount (up to 2 decimal places), and due day from 1 to 31.');
      return;
    }
    setBusy(true);
    try {
      const payload = { name: name.trim(), category_id: categoryId, amount: value, due_day: day };
      await request(editingId ? `/${editingId}` : '', editingId ? 'PATCH' : 'POST', payload);
      setName(''); setAmount(''); setDueDay('1'); setCategoryId(''); setEditingId(null);
      setFormVisible(false);
      await load();
    } catch (error) { Alert.alert('Could not save bill', userFacingError(error, 'Check your connection and try again.')); }
    finally { setBusy(false); }
  };

  const editBill = (bill: Bill) => {
    setEditingId(bill.id); setName(bill.name); setAmount(String(bill.amount)); setDueDay(String(bill.due_day)); setCategoryId(bill.category_id);
    setFormVisible(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

  const recordPayment = (bill: Bill) => router.push({
    pathname: '/(tabs)/two',
    params: {
      scheduled_bill_id: bill.id,
      scheduled_bill_period_key: bill.period_key,
      scheduled_bill_name: bill.name,
      scheduled_bill_category_id: bill.category_id,
      scheduled_bill_amount: String(bill.amount),
    },
  } as never);

  const archive = (bill: Bill) => Alert.alert('Archive recurring bill?', `${bill.name} will move to the Trash Bin, where you can restore it later.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: async () => { try { await request(`/${bill.id}`, 'DELETE'); await load(); } catch (error) { Alert.alert('Could not archive bill', userFacingError(error, 'Check your connection and try again.')); } } },
  ]);

  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color={GREEN} /></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={styles.title}>Scheduled bills</Text><Text style={styles.subtitle}>Set a monthly amount and due date</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={formVisible ? 'Close bill form' : 'Add a scheduled bill'} style={styles.headerAdd} onPress={formVisible ? closeForm : startAdding}>
        <Ionicons name={formVisible ? 'close' : 'add'} size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {formVisible && <View style={styles.card}>
        <Text style={styles.section}>{editingId ? 'Edit recurring bill' : 'Add a recurring bill'}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Bill name (e.g. Rent)" maxLength={80} />
        <Text style={styles.label}>Expense category</Text>
        <View style={styles.chips}>{expenses.map((item: any) => <TouchableOpacity key={item.id} onPress={() => setCategoryId(item.id)} style={[styles.chip, item.id === categoryId && styles.chipSelected]}><Text style={[styles.chipText, item.id === categoryId && styles.chipTextSelected]}>{item.name}</Text></TouchableOpacity>)}</View>
        <View style={styles.fields}><View style={{ flex: 1 }}><Text style={styles.label}>Monthly amount</Text><TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" /></View><View style={{ width: 100 }}><Text style={styles.label}>Due day</Text><TextInput style={styles.input} value={dueDay} onChangeText={setDueDay} placeholder="1–31" keyboardType="number-pad" maxLength={2} /></View></View>
        <Text style={styles.dueHint}>If a month has fewer days, the due date moves to that month’s last day.</Text>
        <TouchableOpacity style={styles.primary} onPress={addBill} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{editingId ? 'Update monthly bill' : 'Save monthly bill'}</Text>}</TouchableOpacity>
        {editingId && <TouchableOpacity style={styles.cancelEdit} onPress={closeForm}><Text style={styles.cancelText}>Cancel editing</Text></TouchableOpacity>}
      </View>}
      <Text style={styles.sectionHeading}>This month</Text>
      {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : bills.length === 0 ? <View style={styles.emptyState}><Text style={styles.empty}>No recurring bills yet. Add rent, subscriptions, or other regular payments.</Text><TouchableOpacity style={styles.emptyAdd} onPress={startAdding}><Ionicons name="add" size={17} color={GREEN} /><Text style={styles.emptyAddText}>Add a bill</Text></TouchableOpacity></View> : bills.map((bill) => <View key={bill.id} style={styles.billCard}>
        <View style={styles.billTop}><View style={{ flex: 1 }}><Text style={styles.billName}>{bill.name}</Text><Text style={styles.billMeta}>{bill.category} · Due {bill.due_date}</Text></View><Text style={styles.billAmount}>{money(bill.amount)}</Text></View>
        <View style={styles.billActions}><Text style={[styles.status, bill.status === 'paid' && styles.paid]}>{bill.status === 'paid' ? 'Paid' : 'Unpaid'}</Text>{bill.status === 'unpaid' && <TouchableOpacity style={styles.markButton} onPress={() => recordPayment(bill)}><Text style={styles.markText}>Record payment</Text></TouchableOpacity>}<TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${bill.name}`} style={styles.remove} onPress={() => editBill(bill)}><Ionicons name="create-outline" size={18} color={GREEN} /></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${bill.name}`} style={styles.remove} onPress={() => archive(bill)}><Ionicons name="trash-outline" size={18} color="#B94B48" /></TouchableOpacity></View>
      </View>)}
      <View style={styles.note}><Ionicons name="information-circle-outline" size={20} color={GREEN} /><Text style={styles.noteText}>Bills are monthly reminders. Record the actual payment to save it as an expense, update your account balance, and mark the bill paid together.</Text></View>
      <Text style={styles.footnote}>The monthly amount is a starting estimate. Check the actual amount, payment date, and account before saving.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: CREAM }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#fff' }, back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F4F2' }, headerAdd: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: GREEN }, title: { color: GREEN, fontSize: 19, fontWeight: '900' }, subtitle: { color: '#789087', fontSize: 12, marginTop: 2 }, content: { padding: 16, paddingBottom: 36 }, note: { flexDirection: 'row', gap: 9, padding: 13, borderRadius: 14, backgroundColor: '#EAF4EF', marginBottom: 14 }, noteText: { flex: 1, color: '#47645D', fontSize: 12, lineHeight: 18 }, card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E8EEEB' }, section: { color: GREEN, fontSize: 16, fontWeight: '900', marginBottom: 12 }, input: { backgroundColor: '#FAFBFB', borderWidth: 1, borderColor: '#E2EAE6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: GREEN, marginBottom: 12 }, label: { color: '#648179', fontSize: 11, fontWeight: '800', marginBottom: 7, textTransform: 'uppercase' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }, chip: { borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#F0F4F2', borderWidth: 1, borderColor: '#E2EAE6' }, chipSelected: { backgroundColor: GREEN, borderColor: GREEN }, chipText: { color: GREEN, fontSize: 12, fontWeight: '700' }, chipTextSelected: { color: '#fff' }, fields: { flexDirection: 'row', gap: 10 }, dueHint: { color: '#82938E', fontSize: 10, lineHeight: 15, marginTop: -3, marginBottom: 10 }, primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: GREEN, marginTop: 3 }, primaryText: { color: '#fff', fontWeight: '900' }, cancelEdit: { alignItems: 'center', padding: 12 }, cancelText: { color: '#718A82', fontWeight: '700' }, sectionHeading: { color: GREEN, fontSize: 17, fontWeight: '900', marginBottom: 10 }, empty: { color: '#718A82', lineHeight: 20, padding: 14 }, emptyState: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E8EEEB' }, emptyAdd: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginHorizontal: 14, marginBottom: 14, borderRadius: 12, backgroundColor: '#EAF4EF' }, emptyAddText: { color: GREEN, fontSize: 13, fontWeight: '800' }, billCard: { backgroundColor: '#fff', borderRadius: 16, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#E8EEEB' }, billTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, billName: { color: GREEN, fontWeight: '900', fontSize: 15 }, billMeta: { color: '#789087', fontSize: 12, marginTop: 4 }, billAmount: { color: GREEN, fontWeight: '900', fontSize: 16 }, billActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }, status: { color: '#A66A00', backgroundColor: '#FFF4D8', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, fontSize: 11, fontWeight: '900' }, paid: { color: GREEN, backgroundColor: '#EAF4EF' }, markButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#C9DDD4' }, markText: { color: GREEN, fontSize: 12, fontWeight: '800' }, remove: { padding: 9 }, footnote: { color: '#82938E', fontSize: 11, lineHeight: 17, marginTop: 8 },
});
