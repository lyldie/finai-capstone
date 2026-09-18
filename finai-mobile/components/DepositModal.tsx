import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TextInput, TouchableOpacity, Keyboard, TouchableWithoutFeedback, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  depositToGoal 
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
  const selectedAccountBalance = selectedAccount && typeof getAccountBalance === 'function'
    ? getAccountBalance(selectedAccount)
    : null;
  const parsedAmount = parseFloat(depositAmount) || 0;
  const exceedsBalance = selectedAccountBalance !== null && parsedAmount > selectedAccountBalance;

  const handleConfirm = async () => {
    if (!selectedGoal || !selectedGoal.id) {
      Alert.alert("Error", "Walang napiling goal paps.");
      return;
    }

    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Teka paps! ✋", "Maglagay ka ng tamang halaga.");
      return;
    }

    if (!selectedAccount) {
      Alert.alert("Teka paps! ✋", "Pumili ka muna ng account na pagkukunan.");
      return;
    }
    
    setIsSubmitting(true);
    const success = await depositToGoal(selectedGoal.id, amount, selectedAccount);
    setIsSubmitting(false);

    if (success) {
      Alert.alert("Solid paps! 🎉", `Naitabi na ang ₱${amount.toLocaleString()}`);
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setIsDropdownOpen(false); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Deposit sa {selectedGoal?.target_name || 'Goal'}</Text>
            
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

            <Text style={styles.label}>Piliin ang Account:</Text>
            
            {/* DROPDOWN TRIGGER */}
            <TouchableOpacity 
              style={[styles.dropdownTrigger, isDropdownOpen && styles.dropdownTriggerActive]} 
              onPress={() => {
                Keyboard.dismiss();
                setIsDropdownOpen(!isDropdownOpen);
              }}
            >
              <Text style={selectedAccount ? styles.dropdownSelectedText : styles.dropdownPlaceholderText}>
                {selectedAccount || "Mamili ng Account..."}
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
                Available: ₱{selectedAccountBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                {exceedsBalance ? ' — hindi sapat ang balance' : ''}
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
                  <Text style={styles.noAccountText}>Walang active account paps...</Text>
                )}
              </View>
            )}

            {/* MAIN ACTION BUTTON */}
            <TouchableOpacity 
              style={[styles.confirmBtn, (!selectedAccount || !depositAmount) && { opacity: 0.6 }]} 
              onPress={handleConfirm} 
              disabled={isSubmitting || !selectedAccount || !depositAmount}
            >
              {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>I-hulog</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={{color: SAGE}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
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