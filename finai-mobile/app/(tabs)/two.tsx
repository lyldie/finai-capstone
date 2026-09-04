import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTransactions, TransactionType } from '../../context/TransactionContext'; 
import DateTimePicker from '@react-native-community/datetimepicker'; 
import ReceiptScannerModal from '../../components/ReceiptScannerModal'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  const resetForm = () => {
    setAmount('');
    setNote('');
    setCategory('Select Category');
    setAccount(accounts[0]?.name || '');
    setToAccount(accounts.find((item) => item.name !== accounts[0]?.name)?.name || '');
    setDate(formatLocalDate(new Date()));
    setType('Expense');
  };

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
    }, [params?.id]) 
  );

  const getActiveColor = () => {
    if (type === 'Income') return '#10B981';
    if (type === 'Expense') return '#EF4444';
    return '#3B82F6';
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
        <Ionicons name={icon} size={20} color="#7C9A95" style={{ marginRight: 10 }} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowValueContainer}>
        <Text style={[styles.rowValue, value === 'Select Category' && { color: '#A2B5B0' }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color="#7C9A95" />
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
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={28} color="#142D2A" /></TouchableOpacity>
        <Text style={styles.headerTitle}>{params && params.id ? 'Edit Transaction' : 'New Transaction'}</Text>
        <View style={styles.headerRightActions}>
          {/* Ipinapakita lang ang scan button kung hindi edit mode AT nasa Expense tab */}
          {!params?.id && type === 'Expense' && (
            <TouchableOpacity onPress={() => setIsScannerVisible(true)} style={styles.scanHeaderButton} activeOpacity={0.7}>
              <Ionicons name="scan-outline" size={22} color={getActiveColor()} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleSave} disabled={isSaving} style={{ marginLeft: 15, opacity: isSaving ? 0.4 : 1 }}>
            <Ionicons name="checkmark" size={28} color={getActiveColor()} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.selectorContainer}>
        {(['Income', 'Expense', 'Transfer'] as TransactionType[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.selectorItem, type === t && { backgroundColor: getActiveColor() }]} onPress={() => { setType(t); if (t === 'Transfer') setCategory('Transfer'); else setCategory('Select Category'); }}>
            <Text style={[styles.selectorText, type === t && { color: 'white' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <View style={styles.amountSection}>
            <Text style={styles.currencyLabel}>PHP</Text>
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
                <Ionicons name="pencil-outline" size={20} color="#7C9A95" style={{ marginRight: 10 }} />
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
            <FlatList data={displayedCategories} keyExtractor={(item: any) => item.id || item.name} numColumns={3} renderItem={({ item }: any) => (
              <TouchableOpacity style={styles.categoryGridItem} onPress={() => { setCategory(item.name); setIsCatModalVisible(false); }}>
                <View style={styles.iconCircle}><Ionicons name={item.icon as any} size={24} color={getActiveColor()} /></View>
                <Text style={styles.categoryText}>{item.name}</Text>
              </TouchableOpacity>
            )} />
            <TouchableOpacity onPress={() => setIsCatModalVisible(false)} style={styles.closeModalButton}>
              <Text style={{color: '#142D2A', fontWeight: '600'}}>Close</Text>
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
                <Ionicons name="wallet-outline" size={20} color={getActiveColor()} />
                <Text style={styles.accOptionText}>{acc.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { setIsAccModalVisible(false); router.push('/accounts'); }} style={styles.manageAccountsButton}>
              <Ionicons name="settings-outline" size={18} color="#2b5f56" />
              <Text style={styles.manageAccountsText}>Manage my accounts</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsAccModalVisible(false)} style={styles.closeModalButton}>
              <Text style={{color: '#142D2A', fontWeight: '600'}}>Close</Text>
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
  container: { flex: 1, backgroundColor: '#F4F7F6', paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 50, marginBottom: 20 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },
  scanHeaderButton: { padding: 4 },
  headerTitle: { color: '#142D2A', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#E2EAF4', borderRadius: 25, padding: 4, marginBottom: 30 },
  selectorItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20 },
  selectorText: { color: '#7C9A95', fontWeight: 'bold', fontSize: 12 },
  form: { flex: 1 },
  amountSection: { alignItems: 'center', marginBottom: 40, marginTop: 10 },
  currencyLabel: { color: '#7C9A95', fontSize: 14, fontWeight: 'bold', marginBottom: 5, letterSpacing: 1 },
  amountInput: { fontSize: 54, fontWeight: '300' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 10, overflow: 'hidden', shadowColor: '#142D2A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#E2EAF4' },
  rowLabelContainer: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { color: '#142D2A', fontSize: 14, fontWeight: '500' },
  rowValueContainer: { flexDirection: 'row', alignItems: 'center' },
  rowValue: { color: '#142D2A', fontSize: 15, marginRight: 5, fontWeight: '600' },
  noteInput: { color: '#142D2A', fontSize: 15, flex: 1, marginLeft: 20, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.4)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', padding: 25, borderRadius: 30, borderWidth: 1, borderColor: '#E2EAF4', elevation: 5 },
  modalTitle: { color: '#142D2A', fontSize: 18, fontWeight: 'bold', marginBottom: 25, textAlign: 'center', letterSpacing: 0.5 },
  categoryGridItem: { flex: 1/3, alignItems: 'center', marginBottom: 25 },
  iconCircle: { width: 55, height: 55, borderRadius: 18, backgroundColor: '#F4F7F6', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  categoryText: { color: '#7C9A95', fontSize: 12, textAlign: 'center', fontWeight: '500' },
  closeModalButton: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  accOption: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 0.5, borderBottomColor: '#E2EAF4' },
  accOptionText: { color: '#142D2A', fontSize: 16, marginLeft: 15, fontWeight: '500' },
  manageAccountsButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: '#EAF4F1' },
  manageAccountsText: { color: '#2b5f56', fontWeight: '700' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.3)', justifyContent: 'flex-end' },
  pickerModalContainer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingBottom: 40, width: '100%', alignItems: 'center' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#E2EAF4', width: '100%' },
  pickerHeaderTitle: { color: '#142D2A', fontSize: 16, fontWeight: 'bold' },
  pickerCancelText: { color: '#7C9A95', fontSize: 15, fontWeight: '500' },
  pickerDoneText: { color: '#142D2A', fontSize: 15, fontWeight: 'bold' },
});