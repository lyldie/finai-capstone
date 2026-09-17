import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTransactions, TransactionType } from '../../context/TransactionContext'; 
import DateTimePicker from '@react-native-community/datetimepicker'; 
import ReceiptScannerModal from '../../components/ReceiptScannerModal'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---- FINAI BRAND TOKENS (shared with transactions.tsx / index.tsx) ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const INCOME = '#10B981';
const EXPENSE = '#FF6259';

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateFromIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date();
};

const isValidAmount = (value: string) => {
  if (!value) return false;
  const num = Number(value);
  return value !== '.' && !Number.isNaN(num) && num > 0;
};

const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = dateFromIso(value);
  return !Number.isNaN(d.getTime()) && formatLocalDate(d) === value;
};

export default function TabTwoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addTransaction, updateTransaction, fetchTransactions, categories, accounts } = useTransactions(); 

  const [type, setType] = useState<TransactionType>('Expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('Select Category');
  const [account, setAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [date, setDate] = useState(formatLocalDate(new Date()));
  const [scannerUserId, setScannerUserId] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const [isCatModalVisible, setIsCatModalVisible] = useState(false);
  const [isAccModalVisible, setIsAccModalVisible] = useState(false);
  const [isScannerVisible, setIsScannerVisible] = useState(false); 
  const [selectingTarget, setSelectingTarget] = useState<'from' | 'to'>('from');
  const [showDatePicker, setShowDatePicker] = useState(false); 
  const [tempDate, setTempDate] = useState(new Date()); 

  const displayedCategories = categories.filter((c: any) => c.type === type.toLowerCase());

  // FIX: wrapped in useCallback with [accounts] as a dependency. Previously this was a
  // plain function closing over `accounts`, and the useFocusEffect below only depended
  // on params?.id -- so if `accounts` finished loading asynchronously AFTER this closure
  // was first captured, resetForm could keep resetting to an empty/stale account list on
  // every refocus, silently blanking the account field on a fresh "New Transaction".
  const resetForm = useCallback(() => {
    setAmount('');
    setNote('');
    setCategory('Select Category');
    setAccount(accounts[0]?.name || '');
    setToAccount(accounts.find((item) => item.name !== accounts[0]?.name)?.name || '');
    setDate(formatLocalDate(new Date()));
    setType('Expense');
  }, [accounts]);

  useEffect(() => {
    AsyncStorage.getItem('user_id').then((id) => setScannerUserId(id || undefined));
  }, []);

  useEffect(() => {
    if (params?.id || accounts.length === 0) return;
    setAccount((current) => {
      const validCurrent = accounts.some((a) => a.name === current) ? current : accounts[0].name;
      setToAccount((tCurrent) => {
        if (accounts.some((a) => a.name === tCurrent) && tCurrent !== validCurrent) return tCurrent;
        return accounts.find((a) => a.name !== validCurrent)?.name || '';
      });
      return validCurrent;
    });
  }, [accounts, params?.id]);

  useEffect(() => {
    if (params && params.id) {
      if (params.type) {
        const pType = params.type as string;
        if (pType === 'Income' || pType === 'Expense' || pType === 'Transfer') {
          setType(pType as TransactionType);
        }
      }
      if (params.amount) setAmount(params.amount as string);
      if (params.note) setNote(params.note as string);
      if (params.category) setCategory(params.category as string);
      if (params.account) setAccount(params.account as string);
      if (params.to_account) setToAccount(params.to_account as string);
      if (params.date) setDate(params.date as string); 
    }
  }, [params.id, params.type, params.amount, params.note, params.category, params.account, params.to_account, params.date]);

  useFocusEffect(
    useCallback(() => {
      if (!params || !params.id) {
        resetForm();
      }
    }, [params?.id, resetForm])
  );

  const getActiveColor = () => {
    if (type === 'Income') return INCOME;
    if (type === 'Expense') return EXPENSE;
    return TEAL;
  };

  const getActiveTint = () => {
    if (type === 'Income') return 'rgba(16, 185, 129, 0.12)';
    if (type === 'Expense') return 'rgba(255, 98, 89, 0.12)';
    return 'rgba(61, 125, 108, 0.12)';
  };

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return; 
    }
    const [whole, decimal] = cleaned.split('.');
    setAmount(decimal === undefined ? whole : `${whole}.${decimal.slice(0, 2)}`);
  };

  const handleSave = async () => {
    if (isSaving) return;

    if (!account) { Alert.alert('Account required', 'Mag-register o pumili muna ng payment account.'); return; }
    if (type === 'Transfer' && !toAccount) { Alert.alert('Destination required', 'Pumili ng destination payment account.'); return; }

    const validAccountNames = accounts.map((a) => a.name);
    if (!validAccountNames.includes(account)) { Alert.alert('Ops!', 'Hindi valid ang napiling account. Pumili ulit.'); return; }
    if (type === 'Transfer' && !validAccountNames.includes(toAccount)) { Alert.alert('Ops!', 'Hindi valid ang destination account. Pumili ulit.'); return; }

    if (!isValidIsoDate(date) || date > formatLocalDate(new Date())) { Alert.alert('Invalid date', 'Pumili ng valid na transaction date.'); return; }

    if (!isValidAmount(amount)) { Alert.alert("Teka lang paps!", "Kailangan may amount ang transaction mo. 😂"); return; }

    if (type === 'Transfer' && account === toAccount) { Alert.alert("Teka lang paps!", "Hindi ka pwedeng mag-transfer sa parehong account. 😂"); return; }

    const finalCategory = type === 'Transfer' ? 'Transfer' : category;
    if (type !== 'Transfer' && finalCategory === 'Select Category') { Alert.alert("Wait lang!", "Pili ka muna ng category paps."); return; }

    const numericAmount = Number(amount).toFixed(2);

    setIsSaving(true);
    try {
      if (params && params.id) {
        await updateTransaction(params.id as string, numericAmount, finalCategory, note, type, account, type === 'Transfer' ? toAccount : undefined, date);
        Alert.alert("Success!", "Na-update na ang record!", [{ text: "OK", onPress: () => router.back() }]);
      } else {
        await addTransaction(numericAmount, finalCategory, note, type, account, type === 'Transfer' ? toAccount : undefined, date); 
        Alert.alert("Success!", `Na-record na ang iyong ${type}!`, [{ text: "OK", onPress: () => router.back() }]);
      }
    } catch (err) {
      console.error("Save Error:", err);
      Alert.alert("Ops!", "Hindi nagawa ang operation.");
    } finally {
      setIsSaving(false);
    }
  };

  const InputRow = ({ label, value, onPress, icon }: any) => (
    <TouchableOpacity style={styles.inputRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowLabelContainer}>
        <View style={[styles.rowIconChip, { backgroundColor: getActiveTint() }]}>
          <Ionicons name={icon} size={17} color={getActiveColor()} />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowValueContainer}>
        <Text style={[styles.rowValue, value === 'Select Category' && { color: '#A2B5B0' }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={SAGE} />
      </View>
    </TouchableOpacity>
  );

  const accountOptionsFor = (target: 'from' | 'to') => {
    if (type !== 'Transfer') return accounts;
    const exclude = target === 'from' ? toAccount : account;
    return accounts.filter((acc) => acc.name !== exclude);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconButton}>
          <Ionicons name="close" size={22} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params && params.id ? 'Edit Transaction' : 'New Transaction'}</Text>
        <View style={styles.headerRightActions}>
          {/* Ipinapakita lang ang scan button kung hindi edit mode AT nasa Expense tab */}
          {!params?.id && type === 'Expense' && (
            <TouchableOpacity onPress={() => setIsScannerVisible(true)} style={[styles.headerIconButton, { marginRight: 8 }]} activeOpacity={0.7}>
              <Ionicons name="scan-outline" size={20} color={getActiveColor()} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleSave} disabled={isSaving} activeOpacity={0.85} style={{ opacity: isSaving ? 0.5 : 1 }}>
            <View style={[styles.saveButtonCircle, { backgroundColor: getActiveColor() }]}>
              <Ionicons name="checkmark" size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.selectorContainer}>
        {(['Income', 'Expense', 'Transfer'] as TransactionType[]).map((t) => {
          const tColor = t === 'Income' ? INCOME : t === 'Expense' ? EXPENSE : TEAL;
          return (
            <TouchableOpacity key={t} style={[styles.selectorItem, type === t && { backgroundColor: tColor }]} onPress={() => { setType(t); if (t === 'Transfer') setCategory('Transfer'); else setCategory('Select Category'); }}>
              <Text style={[styles.selectorText, type === t && { color: 'white' }]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <View style={styles.amountSection}>
            <Text style={styles.currencyLabel}>PHP</Text>
            <View style={styles.amountInputRow}>
              <Text style={[styles.pesoSign, { color: getActiveColor() }]}>₱</Text>
              <TextInput 
                style={[styles.amountInput, { color: getActiveColor() }]} 
                placeholder="0.00" 
                placeholderTextColor="#A2B5B0" 
                keyboardType="decimal-pad" 
                autoFocus={!params?.id} 
                value={amount} 
                onChangeText={handleAmountChange} 
              />
            </View>
          </View>

          <View style={styles.card}>
            <InputRow label="Date" value={date} icon="calendar-outline" onPress={() => { setTempDate(dateFromIso(date)); setShowDatePicker(true); }} />
            {showDatePicker && (Platform.OS === 'ios' ? (
              <Modal visible={showDatePicker} animationType="slide" transparent={true}>
                <View style={styles.pickerModalOverlay}>
                  <View style={styles.pickerModalContainer}>
                    <View style={styles.pickerHeader}>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}><Text style={styles.pickerCancelText}>Cancel</Text></TouchableOpacity>
                      <Text style={styles.pickerHeaderTitle}>Select Date</Text>
                      <TouchableOpacity onPress={() => { setDate(formatLocalDate(tempDate)); setShowDatePicker(false); }}><Text style={styles.pickerDoneText}>Done</Text></TouchableOpacity>
                    </View>
                    <DateTimePicker value={tempDate} mode="date" display="spinner" themeVariant="light" maximumDate={new Date()} onChange={(e, d) => { if (d) setTempDate(d); }} />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker value={dateFromIso(date)} mode="date" display="default" maximumDate={new Date()} onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(formatLocalDate(d)); }} />
            ))}
            
            <InputRow label={type === 'Transfer' ? "From" : "Account"} value={account} icon="wallet-outline" onPress={() => { setSelectingTarget('from'); setIsAccModalVisible(true); }} />
            {type === 'Transfer' && <InputRow label="To" value={toAccount} icon="swap-horizontal-outline" onPress={() => { setSelectingTarget('to'); setIsAccModalVisible(true); }} />}
            {type !== 'Transfer' && <InputRow label="Category" value={category} icon="grid-outline" onPress={() => setIsCatModalVisible(true)} />}

            <View style={styles.inputRow}>
              <View style={styles.rowLabelContainer}>
                <View style={[styles.rowIconChip, { backgroundColor: getActiveTint() }]}>
                  <Ionicons name="pencil-outline" size={17} color={getActiveColor()} />
                </View>
                <Text style={styles.rowLabel}>Note</Text>
              </View>
              <TextInput style={styles.noteInput} placeholder="Optional" placeholderTextColor="#A2B5B0" value={note} onChangeText={setNote} textAlign="right" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={isCatModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            {displayedCategories.length === 0 ? (
              <View style={styles.emptyModalState}>
                <Ionicons name="folder-open-outline" size={30} color={SAGE} />
                <Text style={styles.emptyModalText}>Wala pang {type.toLowerCase()} category.</Text>
              </View>
            ) : (
              <FlatList data={displayedCategories} keyExtractor={(item: any) => item.id || item.name} numColumns={3} renderItem={({ item }: any) => (
                <TouchableOpacity style={styles.categoryGridItem} onPress={() => { setCategory(item.name); setIsCatModalVisible(false); }}>
                  <View style={[styles.iconCircle, { backgroundColor: getActiveTint() }]}>
                    <Ionicons name={item.icon as any} size={22} color={getActiveColor()} />
                  </View>
                  <Text style={styles.categoryText}>{item.name}</Text>
                </TouchableOpacity>
              )} />
            )}
            <TouchableOpacity onPress={() => setIsCatModalVisible(false)} style={styles.closeModalButton}>
              <Text style={{color: DEEP_GREEN, fontWeight: '700'}}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isAccModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Account</Text>
            {accountOptionsFor(selectingTarget).map((acc) => (
              <TouchableOpacity key={acc.id} style={styles.accOption} onPress={() => { selectingTarget === 'from' ? setAccount(acc.name) : setToAccount(acc.name); setIsAccModalVisible(false); }}>
                <View style={[styles.accIconChip, { backgroundColor: getActiveTint() }]}>
                  <Ionicons name={(acc.icon || "wallet-outline") as any} size={18} color={getActiveColor()} />
                </View>
                <Text style={styles.accOptionText}>{acc.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { setIsAccModalVisible(false); router.push('/accounts'); }} style={styles.manageAccountsButton}>
              <Ionicons name="settings-outline" size={18} color={DEEP_GREEN} />
              <Text style={styles.manageAccountsText}>Manage my accounts</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsAccModalVisible(false)} style={styles.closeModalButton}>
              <Text style={{color: DEEP_GREEN, fontWeight: '700'}}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ReceiptScannerModal 
        visible={isScannerVisible}
        onClose={() => setIsScannerVisible(false)}
        categories={categories}
        userId={scannerUserId}
        onScanComplete={(data) => {
          setAmount(data.amount);
          setCategory(categories.some((item) => item.name === data.category && item.type === 'expense') ? data.category : 'Select Category');
          setDate(/^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : formatLocalDate(new Date()));
          setNote(data.note);
          setType('Expense'); 
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 54, marginBottom: 22 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  saveButtonCircle: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  headerTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#ECE7DD', borderRadius: 25, padding: 4, marginBottom: 30 },
  selectorItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20 },
  selectorText: { color: SAGE, fontWeight: 'bold', fontSize: 12 },
  form: { flex: 1 },
  amountSection: { alignItems: 'center', marginBottom: 40, marginTop: 10 },
  currencyLabel: { color: SAGE, fontSize: 14, fontWeight: 'bold', marginBottom: 5, letterSpacing: 1 },
  amountInputRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pesoSign: { fontSize: 40, fontWeight: '300', marginTop: 8, marginRight: 4 },
  amountInput: { fontSize: 54, fontWeight: '300' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 10, overflow: 'hidden', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#ECE7DD' },
  rowLabelContainer: { flexDirection: 'row', alignItems: 'center' },
  rowIconChip: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowLabel: { color: DEEP_GREEN, fontSize: 14, fontWeight: '600' },
  rowValueContainer: { flexDirection: 'row', alignItems: 'center' },
  rowValue: { color: DEEP_GREEN, fontSize: 15, marginRight: 5, fontWeight: '700' },
  noteInput: { color: DEEP_GREEN, fontSize: 15, flex: 1, marginLeft: 20, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(28, 60, 54, 0.45)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', padding: 25, borderRadius: 28, elevation: 5, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16 },
  modalTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center', letterSpacing: 0.3 },
  categoryGridItem: { flex: 1/3, alignItems: 'center', marginBottom: 22 },
  iconCircle: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  categoryText: { color: DEEP_GREEN, fontSize: 12, textAlign: 'center', fontWeight: '600' },
  emptyModalState: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyModalText: { color: SAGE, fontSize: 13, fontWeight: '500' },
  closeModalButton: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  accOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#ECE7DD' },
  accIconChip: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  accOptionText: { color: DEEP_GREEN, fontSize: 15, fontWeight: '700' },
  manageAccountsButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(237, 178, 50, 0.16)' },
  manageAccountsText: { color: DEEP_GREEN, fontWeight: '700' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(28, 60, 54, 0.35)', justifyContent: 'flex-end' },
  pickerModalContainer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingBottom: 40, width: '100%', alignItems: 'center' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#ECE7DD', width: '100%' },
  pickerHeaderTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: 'bold' },
  pickerCancelText: { color: SAGE, fontSize: 15, fontWeight: '500' },
  pickerDoneText: { color: DEEP_GREEN, fontSize: 15, fontWeight: 'bold' },
});