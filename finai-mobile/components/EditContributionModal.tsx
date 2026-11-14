import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/FinAIAlert';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Account, Transaction } from '../context/TransactionContext';
import { hasSubCentPrecision } from '../utils/money';
import { userFacingError } from '../utils/userFacingError';

const GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#718780';
const CREAM = '#FAF7F2';

const dateFromKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date();
};
const dateToKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const dateLabel = (value: string) => dateFromKey(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const philippinesTodayKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

type Props = {
  transaction: Transaction | null;
  goalName: string;
  accounts: Account[];
  onClose: () => void;
  onSave: (transaction: Transaction, amount: string, account: string, date: string) => Promise<void>;
};

export default function EditContributionModal({ transaction, goalName, accounts, onClose, onSave }: Props) {
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState('');
  const [date, setDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [draftDate, setDraftDate] = useState(new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setAmount(String(transaction.amount || ''));
    setAccount(transaction.account || '');
    setDate(transaction.date || dateToKey(new Date()));
    setDraftDate(dateFromKey(transaction.date || dateToKey(new Date())));
    setShowDatePicker(false);
  }, [transaction]);

  const save = async () => {
    if (!transaction) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || hasSubCentPrecision(amount)) {
      Alert.alert('Check the amount', 'Enter a contribution greater than zero, up to two decimal places.');
      return;
    }
    if (!account || !accounts.some((item) => item.name === account)) {
      Alert.alert('Choose an account', 'Select an active payment account for this contribution.');
      return;
    }
    if (date > philippinesTodayKey()) {
      Alert.alert('Check the date', 'A contribution date cannot be in the future.');
      return;
    }
    setSaving(true);
    try {
      await onSave(transaction, amount, account, date);
      onClose();
    } catch (error) {
      Alert.alert('Could not update contribution', userFacingError(error, 'FinAI could not update this contribution. Check the details and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return <Modal visible={Boolean(transaction)} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>SAVINGS MOVEMENT</Text>
            <Text style={styles.title}>Edit contribution</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{goalName || 'Savings goal'}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close edit contribution">
            <Ionicons name="close" size={20} color={GREEN} />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Contribution amount</Text>
        <View style={styles.amountWrap}><Text style={styles.currency}>₱</Text><TextInput style={styles.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel="Contribution amount" /></View>

        <Text style={styles.label}>Payment account</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountList}>
          {accounts.map((item) => <TouchableOpacity key={item.id} style={[styles.accountChip, item.name === account && styles.accountChipSelected]} onPress={() => setAccount(item.name)} accessibilityRole="button" accessibilityState={{ selected: item.name === account }}><Text style={[styles.accountText, item.name === account && styles.accountTextSelected]}>{item.name}</Text></TouchableOpacity>)}
        </ScrollView>

        <Text style={styles.label}>Date</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => { setDraftDate(dateFromKey(date)); setShowDatePicker((current) => !current); }} accessibilityRole="button" accessibilityLabel="Change contribution date">
          <Ionicons name="calendar-outline" size={18} color={TEAL} /><Text style={styles.dateText}>{dateLabel(date)}</Text><Ionicons name="chevron-down" size={16} color={SAGE} />
        </TouchableOpacity>
        {showDatePicker && Platform.OS === 'android' && <DateTimePicker value={draftDate} mode="date" display="default" maximumDate={new Date()} onChange={(event: DateTimePickerEvent, selected?: Date) => { setShowDatePicker(false); if (event.type === 'set' && selected) setDate(dateToKey(selected)); }} />}
        {showDatePicker && Platform.OS === 'ios' && <View style={styles.iosPicker}><DateTimePicker value={draftDate} mode="date" display="spinner" themeVariant="light" maximumDate={new Date()} onChange={(_event, selected) => { if (selected) setDraftDate(selected); }} /><TouchableOpacity style={styles.doneButton} onPress={() => { setDate(dateToKey(draftDate)); setShowDatePicker(false); }}><Text style={styles.doneText}>Done</Text></TouchableOpacity></View>}

        <Text style={styles.helper}>This updates the contribution record, the selected account balance, and this goal’s saved amount.</Text>
        <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={save} disabled={saving} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="checkmark-circle" size={18} color="#FFFFFF" /><Text style={styles.saveText}>Save changes</Text></>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(13,34,30,0.48)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, maxHeight: '92%', borderRadius: 24, padding: 20, backgroundColor: CREAM, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  titleWrap: { flex: 1 }, eyebrow: { color: SAGE, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: GREEN, fontSize: 20, fontWeight: '900', marginTop: 3 }, subtitle: { color: SAGE, fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  label: { color: GREEN, fontSize: 12, fontWeight: '800', marginBottom: 7, marginTop: 11 },
  amountWrap: { minHeight: 56, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4EAE6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }, currency: { color: TEAL, fontSize: 23, fontWeight: '800', marginRight: 6 }, amountInput: { flex: 1, color: GREEN, fontSize: 24, fontWeight: '900', paddingVertical: 8 },
  accountList: { gap: 8, paddingVertical: 2 }, accountChip: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E9E5', paddingHorizontal: 14, paddingVertical: 10 }, accountChipSelected: { backgroundColor: GREEN, borderColor: GREEN }, accountText: { color: GREEN, fontSize: 12, fontWeight: '700' }, accountTextSelected: { color: '#FFFFFF' },
  dateButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 13, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 9 }, dateText: { flex: 1, color: GREEN, fontSize: 14, fontWeight: '700' }, iosPicker: { borderRadius: 14, backgroundColor: '#FFFFFF', marginTop: 8, overflow: 'hidden' }, doneButton: { alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E1E9E5' }, doneText: { color: TEAL, fontWeight: '800' },
  helper: { color: SAGE, fontSize: 11, lineHeight: 16, marginTop: 13 }, saveButton: { minHeight: 48, borderRadius: 15, backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }, disabled: { opacity: 0.65 }, saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, cancelButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, cancelText: { color: GREEN, fontSize: 13, fontWeight: '800' },
});
