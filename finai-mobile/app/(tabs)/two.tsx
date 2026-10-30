import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTransactions, TransactionType, AppNotification } from '../../context/TransactionContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import ReceiptScannerModal from '../../components/ReceiptScannerModal';
import QuickAddCategoryModal from '../../components/QuickAddCategoryModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Emoji helpers
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { getAccountDisplayEmoji } from '../../utils/accountEmoji';
import { getDisplayEmoji } from '../../components/EmojiPicker';
import { hasSubCentPrecision } from '../../utils/money';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const TRACK = '#ECE7DD';
const INCOME = '#10B981';
const EXPENSE = '#FF6259';
const TRANSFER = '#3B82F6';

const QUICK_AMOUNTS = [100, 500, 1000];

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const philippineTodayKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const dateFromIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date();
};

const isValidAmount = (value: string) => {
  if (!value) return false;
  const normalized = value.replace(/,/g, '');
  const num = Number(normalized);
  return normalized !== '.' && Number.isFinite(num) && num > 0 && !hasSubCentPrecision(normalized);
};

const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = dateFromIso(value);
  return !Number.isNaN(d.getTime()) && formatLocalDate(d) === value;
};

// Display-only: "2026-10-12" -> "Today · Oct 12, 2026" (the stored value stays YYYY-MM-DD)
const prettyDate = (iso: string) => {
  const short = dateFromIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const todayKey = philippineTodayKey();
  if (iso === todayKey) return `Today · ${short}`;
  const yesterday = dateFromIso(todayKey);
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === formatLocalDate(yesterday)) return `Yesterday · ${short}`;
  return short;
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Defined outside the screen so it isn't re-created (and re-mounted) on every render.
type InputRowProps = {
  label: string;
  value: string;
  onPress: () => void;
  iconName: IconName;
  emoji?: string | null;
  tint: string;
  accent: string;
  placeholder?: boolean;
  invalid?: boolean;
};

function InputRow({ label, value, onPress, iconName, emoji, tint, accent, placeholder, invalid }: InputRowProps) {
  return (
    <TouchableOpacity style={styles.inputRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowLabelContainer}>
        <View style={[styles.rowIconChip, { backgroundColor: invalid ? 'rgba(255, 98, 89, 0.14)' : tint }]}>
          {emoji ? (
            <Text style={{ fontSize: 16 }}>{emoji}</Text>
          ) : (
            <Ionicons name={iconName} size={17} color={invalid ? EXPENSE : accent} />
          )}
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowValueContainer}>
        <Text
          style={[styles.rowValue, placeholder && styles.rowValuePlaceholder, invalid && { color: EXPENSE }]}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={SAGE} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabTwoScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addTransaction, updateTransaction, fetchTransactions, categories, accounts, getAccountBalance, showTransactionToast } = useTransactions();

  const [type, setType] = useState<TransactionType>('Expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('Select Category');
  const [account, setAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [date, setDate] = useState(philippineTodayKey());
  const [scannerUserId, setScannerUserId] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  // UI-only: becomes true after the first save attempt so missing fields can be highlighted.
  const [attempted, setAttempted] = useState(false);

  const [isCatModalVisible, setIsCatModalVisible] = useState(false);
  const [isQuickAddCategoryVisible, setIsQuickAddCategoryVisible] = useState(false);
  const [isAccModalVisible, setIsAccModalVisible] = useState(false);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [selectingTarget, setSelectingTarget] = useState<'from' | 'to'>('from');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  const displayedCategories = categories.filter((c: any) => c.type === type.toLowerCase());

  const resetForm = useCallback(() => {
    setAmount('');
    setNote('');
    setCategory('Select Category');
    setAccount(accounts[0]?.name || '');
    setToAccount(accounts.find((item) => item.name !== accounts[0]?.name)?.name || '');
    setDate(philippineTodayKey());
    setType('Expense');
    setAttempted(false);
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
    return TRANSFER;
  };

  const getActiveTint = () => {
    if (type === 'Income') return 'rgba(16, 185, 129, 0.12)';
    if (type === 'Expense') return 'rgba(255, 98, 89, 0.12)';
    return 'rgba(59, 130, 246, 0.12)';
  };

  const amountFontSize = amount.length > 10 ? 32 : amount.length > 8 ? 36 : amount.length > 6 ? 42 : 48;
  const amountInputWidth = Math.min(
    Math.max((amount || '0.00').length * amountFontSize * 0.55, 105),
    windowWidth - 100,
  );

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    const [whole, decimal] = cleaned.split('.');
    setAmount(decimal === undefined ? whole : `${whole}.${decimal}`);
  };

  const handleAmountBlur = () => {
    if (hasSubCentPrecision(amount)) return;
    if (!amount.trim() || !isValidAmount(amount)) return;
    const numericAmount = Number(amount.replace(/,/g, ''));
    if (Number.isFinite(numericAmount)) {
      setAmount(numericAmount.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }));
    }
  };

  const handleAmountFocus = () => {
    setAmount((current) => current.replace(/,/g, '').replace(/\.00$/, ''));
  };

  // Quick-add chips: adds to whatever is already typed (display convenience only).
  const addQuickAmount = (value: number) => {
    const current = Number(amount.replace(/,/g, '')) || 0;
    const next = Math.round((current + value) * 100) / 100;
    setAmount(String(next));
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setAttempted(true);
    if (!account) { Alert.alert('Account required', 'Add or select a payment account first.'); return; }
    if (type === 'Transfer' && !toAccount) { Alert.alert('Destination required', 'Select a destination payment account.'); return; }

    const validAccountNames = accounts.map((a) => a.name);
    if (!validAccountNames.includes(account)) { Alert.alert('Invalid account', 'Select a valid account and try again.'); return; }
    if (type === 'Transfer' && !validAccountNames.includes(toAccount)) { Alert.alert('Invalid destination', 'Select a valid destination account and try again.'); return; }

    if (!isValidIsoDate(date) || date > philippineTodayKey()) { Alert.alert('Invalid date', 'Select a valid transaction date.'); return; }
    if (hasSubCentPrecision(amount)) { Alert.alert('Too many decimal places', 'Enter an amount to the nearest centavo (up to 2 decimal places).'); return; }
    if (!isValidAmount(amount)) { Alert.alert('Amount required', 'Enter an amount for this transaction.'); return; }
    if (type === 'Transfer' && account === toAccount) { Alert.alert('Choose another account', 'You cannot transfer money to the same account.'); return; }

    const finalCategory = type === 'Transfer' ? 'Transfer' : category;
    if (type !== 'Transfer' && finalCategory === 'Select Category') { Alert.alert('Choose a category', 'Select a category before continuing.'); return; }

    const numericAmount = Number(amount.replace(/,/g, '')).toFixed(2);

    setIsSaving(true);
    try {
      let budgetNotifications: AppNotification[] = [];
      if (params && params.id) {
        budgetNotifications = await updateTransaction(params.id as string, numericAmount, finalCategory, note, type, account, type === 'Transfer' ? toAccount : undefined, date);
      } else {
        budgetNotifications = await addTransaction(numericAmount, finalCategory, note, type, account, type === 'Transfer' ? toAccount : undefined, date);
      }

      const spikeNotifications = budgetNotifications.filter((notification) => notification.event_type === 'spending_spike');
      const budgetAlerts = budgetNotifications.filter((notification) => notification.event_type !== 'spending_spike');
      const hasCriticalBudgetAlert = budgetAlerts.some(
        (notification) => notification.threshold >= 90,
      );
      if (hasCriticalBudgetAlert && Platform.OS !== 'web') {
        // These are newly created alerts returned by the save request, so a
        // background refresh cannot repeatedly vibrate for an existing alert.
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      }

      const formattedAmount = `₱${Number(numericAmount).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      const transactionSummary = type === 'Transfer'
        ? `${formattedAmount} moved from ${account} to ${toAccount}.`
        : type === 'Income'
          ? `${formattedAmount} added to ${account}.`
          : `${formattedAmount} recorded for ${finalCategory} from ${account}.`;
      const toastTitle = params?.id
        ? 'Transaction updated'
        : type === 'Transfer' ? 'Transfer complete' : `${type} recorded`;

      if (spikeNotifications.length > 0) {
        showTransactionToast({
          kind: 'spending_spike',
          title: 'Spending higher than usual',
          messages: [...spikeNotifications.map((notification) => notification.message), ...budgetAlerts.map((notification) => notification.message)],
        });
      } else if (budgetAlerts.length > 0) {
        const advisorNotification = budgetAlerts
          .filter((notification) => notification.threshold >= 90 && notification.advisor_conversation_id)
          .sort((a, b) => b.threshold - a.threshold)[0];
        const highestBudgetAlert = [...budgetAlerts].sort((a, b) => b.threshold - a.threshold)[0];
        showTransactionToast({
          kind: 'budget',
          title: toastTitle,
          threshold: highestBudgetAlert.threshold,
          percentage_used: highestBudgetAlert.percentage_used,
          level: highestBudgetAlert.level,
          messages: [transactionSummary, ...new Set(budgetAlerts.map((notification) => notification.message))],
          advisorConversationId: advisorNotification?.advisor_conversation_id,
        });
      } else {
        showTransactionToast({
          kind: 'success',
          title: toastTitle,
          messages: [transactionSummary],
        });
      }
      Keyboard.dismiss();
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)' as never);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "INSUFFICIENT_BALANCE") {
        const transactionLabel = type === "Transfer" ? "transfer" : "expense";
        Alert.alert(
          "Not enough account balance",
          `This account does not have enough available balance for this ${transactionLabel}. Add funds, choose another account, or lower the amount.`
        );
      } else if (code === "TRANSACTION_TEMPORARY_FAILURE") {
        Alert.alert("Couldn't save transaction", "Please check your connection and try again.");
      } else {
        Alert.alert("Couldn't save transaction", code || "Please review the details and try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamic emoji getters for the input rows
  const selectedAcc = accounts.find(a => a.name === account);
  const accEmoji = selectedAcc ? getAccountDisplayEmoji(selectedAcc.icon, selectedAcc.name) : null;

  const selectedToAcc = accounts.find(a => a.name === toAccount);
  const toAccEmoji = selectedToAcc ? getAccountDisplayEmoji(selectedToAcc.icon, selectedToAcc.name) : null;

  const selectedCat = categories.find((c: any) => c.name === category && c.type === type.toLowerCase());
  const catEmoji = selectedCat ? getDisplayEmoji(selectedCat.icon, getCategoryEmoji(selectedCat.name, type.toLowerCase())) : null;

  const accountOptionsFor = (target: 'from' | 'to') => {
    if (type !== 'Transfer') return accounts;
    const exclude = target === 'from' ? toAccount : account;
    return accounts.filter((acc) => acc.name !== exclude);
  };

  const handleCategoryCreated = (created: { name: string }) => {
    setCategory(created.name);
    setIsQuickAddCategoryVisible(false);
    setIsCatModalVisible(false);
    void fetchTransactions(false);
  };

  const openQuickAddAccount = () => {
    setIsAccModalVisible(false);
    router.push('/accounts');
  };

  // ---- derived display values (presentation only) ----
  const accent = getActiveColor();
  const tint = getActiveTint();
  const amountInvalid = attempted && !isValidAmount(amount);
  const categoryInvalid = attempted && type !== 'Transfer' && category === 'Select Category';
  const accountInvalid = attempted && !account;
  const amountPrompt = type === 'Income' ? 'How much did you receive?' : type === 'Transfer' ? 'How much are you moving?' : 'How much did you spend?';
  const saveLabel = params?.id ? 'Save changes' : type === 'Transfer' ? 'Make transfer' : type === 'Income' ? 'Add income' : 'Add expense';
  const activeAccountName = selectingTarget === 'from' ? account : toAccount;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: insets.top + 10 }]}>
        <View style={styles.headerSide}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIconButton} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{params && params.id ? 'Edit Transaction' : 'New Transaction'}</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.selectorContainer}>
        {(['Income', 'Expense', 'Transfer'] as TransactionType[]).map((t) => {
          const tColor = t === 'Income' ? INCOME : t === 'Expense' ? EXPENSE : TRANSFER;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.selectorItem, type === t && [styles.selectorItemActive, { backgroundColor: tColor }]]}
              activeOpacity={0.85}
              onPress={() => {
                setType(t);
                setAttempted(false);
                if (t === 'Transfer') setCategory('Transfer'); else setCategory('Select Category');
              }}
            >
              <Text style={[styles.selectorText, type === t && { color: 'white' }]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.amountSection}>
            <Text style={styles.amountPrompt}>{amountPrompt}</Text>
            <View style={styles.amountInputRow}>
              <Text style={[styles.pesoSign, { color: accent }]}>₱</Text>
              <TextInput
                style={[styles.amountInput, { color: accent, fontSize: amountFontSize, width: amountInputWidth }]}
                placeholder="0.00"
                placeholderTextColor="#A2B5B0"
                keyboardType="decimal-pad"
                autoFocus={!params?.id}
                value={amount}
                onChangeText={handleAmountChange}
                onFocus={handleAmountFocus}
                onBlur={handleAmountBlur}
              />
            </View>
            <View style={[styles.amountUnderline, { backgroundColor: amountInvalid ? EXPENSE : tint }]} />
            {amountInvalid && <Text style={styles.amountError}>Enter a valid positive amount with up to 2 decimal places.</Text>}

            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((value) => (
                <TouchableOpacity key={value} style={[styles.quickChip, { backgroundColor: tint }]} onPress={() => addQuickAmount(value)} activeOpacity={0.8}>
                  <Text style={[styles.quickChipText, { color: accent }]}>+₱{value.toLocaleString('en-US')}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {!params?.id && type === 'Expense' && (
              <TouchableOpacity onPress={() => setIsScannerVisible(true)} style={styles.scanPill} activeOpacity={0.8}>
                <Ionicons name="scan-outline" size={16} color={EXPENSE} />
                <Text style={styles.scanPillText}>Scan a receipt</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <InputRow
              label="Date"
              value={prettyDate(date)}
              iconName="calendar-outline"
              tint={tint}
              accent={accent}
              onPress={() => { setTempDate(dateFromIso(date)); setShowDatePicker(true); }}
            />

            {showDatePicker && (Platform.OS === 'ios' ? (
              <Modal visible={showDatePicker} animationType="slide" transparent={true} onRequestClose={() => setShowDatePicker(false)}>
                <View style={styles.pickerModalOverlay}>
                  <View style={styles.pickerModalContainer}>
                    <View style={styles.pickerHeader}>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}><Text style={styles.pickerCancelText}>Cancel</Text></TouchableOpacity>
                      <Text style={styles.pickerHeaderTitle}>Select Date</Text>
                      <TouchableOpacity onPress={() => { setDate(formatLocalDate(tempDate)); setShowDatePicker(false); }}><Text style={styles.pickerDoneText}>Done</Text></TouchableOpacity>
                    </View>
                    <DateTimePicker value={tempDate} mode="date" display="spinner" themeVariant="light" maximumDate={new Date()} onValueChange={(_event, selectedDate) => { if (selectedDate) setTempDate(selectedDate); }} />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker value={dateFromIso(date)} mode="date" display="default" maximumDate={new Date()} onValueChange={(_event, selectedDate) => { if (selectedDate) setDate(formatLocalDate(selectedDate)); }} onDismiss={() => setShowDatePicker(false)} />
            ))}

            <InputRow
              label={type === 'Transfer' ? 'From' : 'Account'}
              value={account || 'Select account'}
              placeholder={!account}
              invalid={accountInvalid}
              iconName="wallet-outline"
              emoji={accEmoji}
              tint={tint}
              accent={accent}
              onPress={() => { setSelectingTarget('from'); setIsAccModalVisible(true); }}
            />
            {type === 'Transfer' && (
              <InputRow
                label="To"
                value={toAccount || 'Select account'}
                placeholder={!toAccount}
                invalid={attempted && !toAccount}
                iconName="swap-horizontal-outline"
                emoji={toAccEmoji}
                tint={tint}
                accent={accent}
                onPress={() => { setSelectingTarget('to'); setIsAccModalVisible(true); }}
              />
            )}
            {type !== 'Transfer' && (
              <InputRow
                label="Category"
                value={category}
                placeholder={category === 'Select Category'}
                invalid={categoryInvalid}
                iconName="grid-outline"
                emoji={catEmoji}
                tint={tint}
                accent={accent}
                onPress={() => setIsCatModalVisible(true)}
              />
            )}

            <View style={[styles.inputRow, styles.inputRowLast]}>
              <View style={styles.rowLabelContainer}>
                <View style={[styles.rowIconChip, { backgroundColor: tint }]}>
                  <Ionicons name="pencil-outline" size={17} color={accent} />
                </View>
                <Text style={styles.rowLabel}>Note</Text>
              </View>
              <TextInput style={styles.noteInput} placeholder="Optional" placeholderTextColor="#A2B5B0" value={note} onChangeText={setNote} textAlign="right" returnKeyType="done" />
            </View>
          </View>

          {type === 'Transfer' && (
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={16} color={SAGE} />
              <Text style={styles.hintText}>Transfers move money between your accounts and don’t count as income or expense.</Text>
            </View>
          )}
        </ScrollView>

        {/* Primary action lives at the bottom, within thumb reach and above the keyboard */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleSave} disabled={isSaving} activeOpacity={0.88} style={[styles.saveButton, { backgroundColor: accent, opacity: isSaving ? 0.6 : 1 }]}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>{saveLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* CATEGORY SHEET */}
      <Modal visible={isCatModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsCatModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsCatModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select category</Text>
              <TouchableOpacity
                style={styles.quickAddCategoryButton}
                onPress={() => {
                  setIsCatModalVisible(false);
                  setIsQuickAddCategoryVisible(true);
                }}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.quickAddCategoryButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
            {displayedCategories.length === 0 ? (
              <View style={styles.emptyModalState}>
                <Ionicons name="folder-open-outline" size={30} color={SAGE} />
                <Text style={styles.emptyModalText}>No {type.toLowerCase()} categories available.</Text>
              </View>
            ) : (
              <FlatList
                data={displayedCategories}
                keyExtractor={(item: any) => item.id || item.name}
                numColumns={3}
                style={{ flexGrow: 0 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }: any) => {
                  const selected = item.name === category;
                  return (
                    <TouchableOpacity style={styles.categoryGridItem} onPress={() => { setCategory(item.name); setIsCatModalVisible(false); }} activeOpacity={0.8}>
                      <View style={[styles.iconCircle, { backgroundColor: tint }, selected && { borderColor: accent, borderWidth: 2 }]}>
                        <Text style={{ fontSize: 24 }}>
                          {getDisplayEmoji(item.icon, getCategoryEmoji(item.name, type.toLowerCase()))}
                        </Text>
                        {selected && (
                          <View style={[styles.selectedBadge, { backgroundColor: accent }]}>
                            <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                      <Text style={[styles.categoryText, selected && { color: accent }]} numberOfLines={2}>{item.name}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <TouchableOpacity onPress={() => setIsCatModalVisible(false)} style={styles.closeModalButton}>
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <QuickAddCategoryModal
        visible={isQuickAddCategoryVisible}
        type={type.toLowerCase() as 'expense' | 'income'}
        onClose={() => {
          setIsQuickAddCategoryVisible(false);
          setIsCatModalVisible(true);
        }}
        onCreated={handleCategoryCreated}
      />

      {/* ACCOUNT SHEET */}
      <Modal visible={isAccModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsAccModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsAccModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { marginBottom: 12 }]}>{type === 'Transfer' ? (selectingTarget === 'from' ? 'Transfer from' : 'Transfer to') : 'Select account'}</Text>
            <TouchableOpacity onPress={openQuickAddAccount} style={styles.quickAddAccountButton} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={19} color="#FFFFFF" />
              <Text style={styles.quickAddAccountButtonText}>Add account</Text>
            </TouchableOpacity>
            {accountOptionsFor(selectingTarget).length === 0 ? (
              <View style={styles.emptyAccountState}>
                <Ionicons name="wallet-outline" size={27} color={SAGE} />
                <Text style={styles.emptyAccountStateText}>
                  {type === 'Transfer' && accounts.length > 0
                    ? 'You need a second account to make a transfer. Add one above, then choose it here.'
                    : 'You do not have an account available yet. Add one above to record this transaction.'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
                {accountOptionsFor(selectingTarget).map((acc) => {
                  const selected = acc.name === activeAccountName;
                  return (
                    <TouchableOpacity key={acc.id} style={styles.accOption} activeOpacity={0.8} onPress={() => { selectingTarget === 'from' ? setAccount(acc.name) : setToAccount(acc.name); setIsAccModalVisible(false); }}>
                      <View style={[styles.accIconChip, { backgroundColor: tint }]}>
                        <Text style={{ fontSize: 18 }}>
                          {getAccountDisplayEmoji(acc.icon, acc.name)}
                        </Text>
                      </View>
                      <View style={styles.accOptionDetails}>
                        <Text style={[styles.accOptionText, selected && { color: accent }]}>{acc.name}</Text>
                        <Text style={styles.accBalanceText}>
                          {selectingTarget === 'from' && type !== 'Income' && !params?.id ? 'Available' : 'Current balance'}: ₱{getAccountBalance(acc.name).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={22} color={accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity onPress={() => { setIsAccModalVisible(false); router.push('/accounts'); }} style={styles.manageAccountsButton}>
              <Ionicons name="settings-outline" size={18} color={DEEP_GREEN} />
              <Text style={styles.manageAccountsText}>Manage my accounts</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsAccModalVisible(false)} style={styles.closeModalButton}>
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ReceiptScannerModal
        visible={isScannerVisible}
        onClose={() => setIsScannerVisible(false)}
        categories={categories}
        userId={scannerUserId}
        onCategoryCreated={() => { void fetchTransactions(false); }}
        onScanComplete={(data) => {
          setAmount(data.amount);
          setCategory(data.category);
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

  // Header: equal-width side slots keep the title centered on every tab
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  headerSide: { width: 60, flexDirection: 'row', alignItems: 'center' },
  headerIconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  headerTitle: { color: DEEP_GREEN, fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },

  selectorContainer: { flexDirection: 'row', backgroundColor: TRACK, borderRadius: 25, padding: 4, marginBottom: 22 },
  selectorItem: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 21 },
  selectorItemActive: { shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 },
  selectorText: { color: SAGE, fontWeight: '800', fontSize: 13 },

  form: { flex: 1 },
  formContent: { paddingBottom: 16 },

  // Amount
  amountSection: { alignItems: 'center', marginBottom: 24, marginTop: 4 },
  amountPrompt: { color: SAGE, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  amountInputRow: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  pesoSign: { fontSize: 38, fontWeight: '300', marginTop: 8, marginRight: 8 },
  amountInput: { flexGrow: 0, flexShrink: 1, fontWeight: '300', textAlign: 'left', paddingHorizontal: 0 },
  amountUnderline: { height: 3, width: 140, borderRadius: 2, marginTop: 2 },
  amountError: { color: EXPENSE, fontSize: 12, fontWeight: '700', marginTop: 8 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  quickChipText: { fontSize: 13, fontWeight: '800' },
  scanPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(255, 98, 89, 0.35)' },
  scanPillText: { color: DEEP_GREEN, fontSize: 13, fontWeight: '800' },

  // Form card
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 10, overflow: 'hidden', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: TRACK },
  inputRowLast: { borderBottomWidth: 0 },
  rowLabelContainer: { flexDirection: 'row', alignItems: 'center' },
  rowIconChip: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowLabel: { color: DEEP_GREEN, fontSize: 14, fontWeight: '700' },
  rowValueContainer: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginLeft: 12 },
  rowValue: { color: DEEP_GREEN, fontSize: 15, marginRight: 6, fontWeight: '800', flexShrink: 1 },
  rowValuePlaceholder: { color: '#A2B5B0', fontWeight: '500' },
  noteInput: { color: DEEP_GREEN, fontSize: 15, flex: 1, marginLeft: 20, fontWeight: '600' },

  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingHorizontal: 6 },
  hintText: { flex: 1, color: SAGE, fontSize: 12, fontWeight: '600', lineHeight: 17 },

  // Bottom save button
  footer: { paddingTop: 10, paddingBottom: 16 },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 18, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 4 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

  // Bottom sheets (category + account pickers)
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(28, 60, 54, 0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30, maxHeight: '80%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: TRACK, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  quickAddCategoryButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: DEEP_GREEN, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  quickAddCategoryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  categoryGridItem: { flex: 1 / 3, alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  iconCircle: { width: 58, height: 58, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 2, borderColor: 'transparent' },
  selectedBadge: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  categoryText: { color: DEEP_GREEN, fontSize: 12, textAlign: 'center', fontWeight: '700' },
  emptyModalState: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyModalText: { color: SAGE, fontSize: 13, fontWeight: '500' },
  closeModalButton: { marginTop: 10, alignItems: 'center', paddingVertical: 13, backgroundColor: CREAM, borderRadius: 16 },
  closeModalText: { color: DEEP_GREEN, fontWeight: '700', fontSize: 15 },

  accOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: TRACK },
  accIconChip: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  accOptionText: { flex: 1, color: DEEP_GREEN, fontSize: 15, fontWeight: '800' },
  accOptionDetails: { flex: 1 },
  accBalanceText: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 3 },
  emptyAccountState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 22, gap: 8 },
  emptyAccountStateText: { color: SAGE, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  quickAddAccountButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DEEP_GREEN, borderRadius: 14, paddingVertical: 12, marginBottom: 10 },
  quickAddAccountButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  manageAccountsButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(237, 178, 50, 0.16)' },
  manageAccountsText: { color: DEEP_GREEN, fontWeight: '800' },

  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(28, 60, 54, 0.35)', justifyContent: 'flex-end' },
  pickerModalContainer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingBottom: 40, width: '100%', alignItems: 'center' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 0.5, borderBottomColor: TRACK, width: '100%' },
  pickerHeaderTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800' },
  pickerCancelText: { color: SAGE, fontSize: 15, fontWeight: '600' },
  pickerDoneText: { color: TEAL, fontSize: 15, fontWeight: '800' },
});
