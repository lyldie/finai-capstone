import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TextInput, TouchableOpacity, Keyboard, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Alert } from '../utils/FinAIAlert';
import { Ionicons } from '@expo/vector-icons';
import { hasSubCentPrecision } from '../utils/money';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const EXPENSE = '#FF6259';

export default function DepositModal({ 
  visible, 
  onClose, 
  selectedGoal, 
  accounts, 
  getAccountBalance,
  depositToGoal,
  withdrawFromGoal,
  mode = 'deposit',
}: any) {
  const [depositAmount, setDepositAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // I-reset ang states kapag binuksan o isinara ang modal
  useEffect(() => {
    if (!visible) {
      setDepositAmount('');
      setSelectedAccount('');
      setIsDropdownOpen(false);
    }
  }, [visible]);

  // NEW: live preview of the selected account's balance, using the getAccountBalance
  // function that was already being passed down but never actually used.
  const accountBalance = selectedAccount && typeof getAccountBalance === 'function'
    ? getAccountBalance(selectedAccount)
    : null;
  const selectedAccountBalance = mode === 'deposit' ? accountBalance : Number(selectedGoal?.current_savings || 0);
  const parsedAmount = parseFloat(depositAmount) || 0;
  const exceedsBalance = selectedAccountBalance !== null && parsedAmount > selectedAccountBalance;

  const handleConfirm = async () => {
    if (!selectedGoal || !selectedGoal.id) {
      Alert.alert('Choose a goal', 'Select a goal to continue.');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (hasSubCentPrecision(depositAmount)) {
      Alert.alert('Too many decimal places', 'Amounts can be entered to the nearest centavo (up to 2 decimal places).');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    if (!selectedAccount) {
      Alert.alert('Choose an account', mode === 'deposit' ? 'Select the account to contribute from.' : 'Select the account to receive the withdrawal.');
      return;
    }
    
    setIsSubmitting(true);
    const success = mode === 'deposit'
      ? await depositToGoal(selectedGoal.id, amount, selectedAccount)
      : await withdrawFromGoal(selectedGoal.id, amount, selectedAccount);
    setIsSubmitting(false);

    if (success) {
      Alert.alert(
        mode === 'deposit' ? (success === 'synced' ? 'Contribution added' : 'Saved on this device') : (success === 'synced' ? 'Withdrawal completed' : 'Saved on this device'),
        success === 'synced'
          ? (mode === 'deposit' ? `₱${amount.toLocaleString()} was added to your goal.` : `₱${amount.toLocaleString()} was returned to ${selectedAccount}.`)
          : (mode === 'deposit' ? `₱${amount.toLocaleString()} is reflected in your goal and wallet here. It will sync when you are online.` : `₱${amount.toLocaleString()} is reflected in your goal and ${selectedAccount} account here. It will sync when you are online.`),
      );
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { Keyboard.dismiss(); setIsDropdownOpen(false); }} accessibilityRole="button" accessibilityLabel="Close account picker" />
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{mode === 'deposit' ? 'Add to' : 'Withdraw from'} {selectedGoal?.target_name || 'goal'}</Text>
            
            <TextInput
              style={[styles.modalInput, exceedsBalance && styles.modalInputWarning]}
              placeholder="₱ 0.00"
              placeholderTextColor="#A2B5B0"
              keyboardType="numeric"
              value={depositAmount}
              onChangeText={setDepositAmount}
              blurOnSubmit={true}
              onSubmitEditing={Keyboard.dismiss}
            />

            <Text style={styles.label}>{mode === 'deposit' ? 'Contribute from account:' : 'Return funds to account:'}</Text>
            
            {/* DROPDOWN TRIGGER */}
            <TouchableOpacity 
              style={[styles.dropdownTrigger, isDropdownOpen && styles.dropdownTriggerActive]} 
              onPress={() => {
                Keyboard.dismiss();
                setIsDropdownOpen(!isDropdownOpen);
              }}
            >
              <Text style={selectedAccount ? styles.dropdownSelectedText : styles.dropdownPlaceholderText}>
                {selectedAccount || "Choose an account..."}
              </Text>
              <Ionicons 
                name={isDropdownOpen ? "chevron-up" : "chevron-down"} 
                size={18} 
                color={DEEP_GREEN} 
              />
            </TouchableOpacity>

            {/* NEW: live balance preview for whichever account is currently selected */}
            {selectedAccount && selectedAccountBalance !== null && (
              <Text style={[styles.balancePreview, exceedsBalance && styles.balancePreviewWarning]}>
                {mode === 'deposit' ? 'Available in account' : 'Available in goal'}: ₱{selectedAccountBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                {exceedsBalance ? ' - insufficient balance' : ''}
              </Text>
            )}

            {/* DROPDOWN OPTIONS LIST */}
            {isDropdownOpen && (
              <View style={styles.dropdownMenu}>
                {accounts && accounts.length > 0 ? (
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled={true}>
                    {accounts.map((acc: any) => (
                      <TouchableOpacity 
                        key={acc.id} 
                        style={[
                          styles.dropdownItem, 
                          selectedAccount === acc.name && styles.dropdownItemActive
                        ]}
                        onPress={() => {
                          setSelectedAccount(acc.name);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <Text style={[
                          styles.dropdownItemText,
                          selectedAccount === acc.name && styles.dropdownItemTextActive
                        ]}>
                          {acc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.noAccountText}>No active accounts available.</Text>
                )}
              </View>
            )}

            {/* MAIN ACTION BUTTON */}
            <TouchableOpacity 
              style={[styles.confirmBtn, (!selectedAccount || !depositAmount) && { opacity: 0.6 }]} 
              onPress={handleConfirm} 
              disabled={isSubmitting || !selectedAccount || !depositAmount}
            >
              {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>{mode === 'deposit' ? 'Add contribution' : 'Withdraw savings'}</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={{color: SAGE}}>Cancel</Text>
            </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(28, 60, 54, 0.45)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 22, padding: 24, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DEEP_GREEN, marginBottom: 15 },
  modalInput: { borderWidth: 1, borderColor: '#ECE7DD', borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 6, backgroundColor: CREAM, color: DEEP_GREEN },
  modalInputWarning: { borderColor: EXPENSE },
  balancePreview: { fontSize: 12, color: SAGE, fontWeight: '600', marginBottom: 15 },
  balancePreviewWarning: { color: EXPENSE, fontWeight: '700' },
  label: { fontSize: 12, color: SAGE, marginBottom: 6, fontWeight: '600' },
  
  // Dropdown Styles
  dropdownTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ECE7DD', borderRadius: 12, padding: 15, backgroundColor: '#FFF', marginBottom: 4 },
  dropdownTriggerActive: { borderColor: DEEP_GREEN },
  dropdownPlaceholderText: { color: SAGE, fontSize: 15 },
  dropdownSelectedText: { color: DEEP_GREEN, fontWeight: 'bold', fontSize: 15 },
  dropdownMenu: { borderWidth: 1, borderColor: '#ECE7DD', borderRadius: 12, backgroundColor: '#FFF', marginTop: 2, marginBottom: 10, overflow: 'hidden', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: CREAM },
  dropdownItemActive: { backgroundColor: 'rgba(237, 178, 50, 0.12)' },
  dropdownItemText: { color: DEEP_GREEN, fontSize: 15, fontWeight: '500' },
  dropdownItemTextActive: { fontWeight: 'bold' },
  noAccountText: { padding: 14, color: SAGE, fontSize: 13, fontStyle: 'italic' },
  
  // Action Buttons
  confirmBtn: { backgroundColor: DEEP_GREEN, padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 20, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: { alignItems: 'center', marginTop: 15 }
});
