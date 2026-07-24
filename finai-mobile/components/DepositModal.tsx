import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TextInput, TouchableOpacity, Keyboard, TouchableWithoutFeedback, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const FINAI_DEEP_GREEN = '#144A3D';
const FINAI_SAGE = '#8A9A86';
const FINAI_LIGHT_BG = '#F4F7F6';

export default function DepositModal({ 
  visible, 
  onClose, 
  selectedGoal, 
  accounts, 
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

  const handleConfirm = async () => {
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
            <Text style={styles.modalTitle}>Deposit sa {selectedGoal?.target_name}</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="₱ 0.00"
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
                color={FINAI_DEEP_GREEN} 
              />
            </TouchableOpacity>

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
              style={styles.confirmBtn} 
              onPress={handleConfirm} 
              disabled={isSubmitting || !selectedAccount}
            >
              {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>I-hulog</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={{color: FINAI_SAGE}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: FINAI_DEEP_GREEN, marginBottom: 15 },
  modalInput: { borderWidth: 1, borderColor: '#EBF0EE', borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 15, backgroundColor: FINAI_LIGHT_BG },
  label: { fontSize: 12, color: FINAI_SAGE, marginBottom: 6, fontWeight: '600' },
  
  // Dropdown Styles
  dropdownTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#EBF0EE', borderRadius: 12, padding: 15, backgroundColor: '#FFF', marginBottom: 4 },
  dropdownTriggerActive: { borderColor: FINAI_DEEP_GREEN },
  dropdownPlaceholderText: { color: FINAI_SAGE, fontSize: 15 },
  dropdownSelectedText: { color: FINAI_DEEP_GREEN, fontWeight: 'bold', fontSize: 15 },
  dropdownMenu: { borderWidth: 1, borderColor: '#EBF0EE', borderRadius: 12, backgroundColor: '#FFF', marginTop: 2, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#F4F7F6' },
  dropdownItemActive: { backgroundColor: '#E8EFEF' },
  dropdownItemText: { color: FINAI_DEEP_GREEN, fontSize: 15, fontWeight: '500' },
  dropdownItemTextActive: { fontWeight: 'bold' },
  noAccountText: { padding: 14, color: FINAI_SAGE, fontSize: 13, fontStyle: 'italic' },
  
  // Action Buttons
  confirmBtn: { backgroundColor: FINAI_DEEP_GREEN, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20, shadowColor: FINAI_DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 3 },
  confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: { alignItems: 'center', marginTop: 15 }
});