import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, TextInput, Alert, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config'; // 👈 1. IDINAGDAG NATIN ITO PARA TAWAGIN SI CONFIG.JS

const GREEN = '#144A3D';

// 👈 2. PINALITAN NATIN YUNG HARDCODED IP NG VARIABLE GALING SA CONFIG
const API_BASE_URL = `${API_URL}/api`;

export default function ProfileScreen() {
  const { user, logoutUser } = useAuth();
  const router = useRouter();

  // --- MODAL STATES ---
  const [isIncomeModalVisible, setIncomeModalVisible] = useState(false);
  const [newIncome, setNewIncome] = useState('');

  const [isPinModalVisible, setPinModalVisible] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');

  const [isPasswordModalVisible, setPasswordModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // --- HANDLERS ---
  const handleUpdateIncome = async () => {
    if (!newIncome || isNaN(Number(newIncome))) {
      Alert.alert('Oops!', 'Maglagay ng tamang amount paps.');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/${user?.id}/update-income`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_income: parseFloat(newIncome) })
      });
      
      if (response.ok) {
        Alert.alert('Success', `Monthly income updated to ₱${newIncome}!`);
        setIncomeModalVisible(false);
        setNewIncome('');
      } else {
        Alert.alert('Error', 'Hindi ma-update ang income. Subukan ulit.');
      }
    } catch (error) {
      Alert.alert('Connection Error', 'Check your backend server.');
    }
  };

  const handleChangePin = async () => {
    if (!oldPin || !newPin || newPin.length < 4) {
      Alert.alert('Oops!', 'Kumpletuhin ang form. Ang PIN dapat ay at least 4 digits.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/${user?.id}/change-pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_pin: oldPin, new_pin: newPin })
      });
      
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', 'App PIN changed successfully!');
        setPinModalVisible(false);
        setOldPin('');
        setNewPin('');
      } else {
        Alert.alert('Error', data.detail || 'Mali ang nilagay mong lumang PIN.');
      }
    } catch (error) {
      Alert.alert('Connection Error', 'Check your backend server.');
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || newPassword.length < 6) {
      Alert.alert('Oops!', 'Kumpletuhin ang form. Ang bagong password ay dapat 6 characters pataas.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/${user?.id}/change-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
      });
      
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', 'Password changed successfully!');
        setPasswordModalVisible(false);
        setOldPassword('');
        setNewPassword('');
      } else {
        Alert.alert('Error', data.detail || 'Mali ang nilagay mong lumang password.');
      }
    } catch (error) {
      Alert.alert('Connection Error', 'Check your backend server.');
    }
  };

  const handleLogout = () => {
    Alert.alert("Mag-logout", "Sigurado ka ba paps?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => logoutUser() }
    ]);
  };

  // Reusable Menu Button Component
  const MenuOption = ({ icon, title, subtitle, onPress, color = GREEN }: any) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconBox, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9F8" />
      
      {/* HEADER SECTION */}
      <View style={styles.header}>
        <View style={styles.profileAvatar}>
          <Text style={styles.avatarText}>{user?.name ? user.name.charAt(0).toUpperCase() : 'U'}</Text>
        </View>
        <Text style={styles.userName}>{user?.name || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email || 'user@email.com'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* FINANCIAL SETTINGS */}
        <Text style={styles.sectionTitle}>Financial Settings</Text>
        <View style={styles.cardGroup}>
          <MenuOption 
            icon="wallet-outline" 
            title="Update Monthly Income" 
            subtitle="Baseline for AI Budget Advisor"
            onPress={() => setIncomeModalVisible(true)} 
          />
          <View style={styles.divider} />
         <MenuOption 
            icon="grid-outline" 
            title="Custom Categories & Accounts" 
            subtitle="Manage your personal presets"
            onPress={() => router.push('/custom-presets' as any)}
          />
        </View>

        {/* SECURITY SETTINGS */}
        <Text style={styles.sectionTitle}>Security & Access</Text>
        <View style={styles.cardGroup}>
          <MenuOption 
            icon="keypad-outline" 
            title="Change App PIN" 
            subtitle="Update your 4-digit lock code"
            onPress={() => setPinModalVisible(true)} 
          />
          <View style={styles.divider} />
          <MenuOption 
            icon="lock-closed-outline" 
            title="Change Password" 
            subtitle="Update your account password"
            onPress={() => setPasswordModalVisible(true)} 
          />
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* 1. INCOME UPDATE MODAL */}
      <Modal visible={isIncomeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Monthly Income</Text>
            <Text style={styles.modalDesc}>Ito ang gagamitin ng AI Budget Advisor bilang basehan ng iyong cash flow.</Text>
            
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>₱</Text>
              <TextInput 
                style={styles.inputField}
                keyboardType="numeric"
                placeholder="0.00"
                value={newIncome}
                onChangeText={setNewIncome}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIncomeModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateIncome}>
                <Text style={styles.saveBtnText}>Save Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. CHANGE PIN MODAL */}
      <Modal visible={isPinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change App PIN</Text>
            <Text style={styles.modalDesc}>Ilagay ang iyong kasalukuyang PIN bago mag-set ng bago.</Text>
            
            <TextInput 
              style={[styles.inputField, { width: '100%', marginBottom: 12, paddingHorizontal: 15 }]}
              keyboardType="numeric"
              secureTextEntry
              placeholder="Old PIN"
              maxLength={4}
              value={oldPin}
              onChangeText={setOldPin}
            />
            <TextInput 
              style={[styles.inputField, { width: '100%', marginBottom: 24, paddingHorizontal: 15 }]}
              keyboardType="numeric"
              secureTextEntry
              placeholder="New PIN (4 digits)"
              maxLength={4}
              value={newPin}
              onChangeText={setNewPin}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPinModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleChangePin}>
                <Text style={styles.saveBtnText}>Update PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. CHANGE PASSWORD MODAL */}
      <Modal visible={isPasswordModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalDesc}>Protektahan ang iyong FinAi account gamit ang matibay na password.</Text>
            
            <TextInput 
              style={[styles.inputField, { width: '100%', marginBottom: 12, paddingHorizontal: 15 }]}
              secureTextEntry
              placeholder="Old Password"
              value={oldPassword}
              onChangeText={setOldPassword}
            />
            <TextInput 
              style={[styles.inputField, { width: '100%', marginBottom: 24, paddingHorizontal: 15 }]}
              secureTextEntry
              placeholder="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPasswordModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword}>
                <Text style={styles.saveBtnText}>Update Password</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F8' },
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: 30, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E6ECE9' },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: GREEN, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  avatarText: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  userName: { fontSize: 22, fontWeight: '800', color: '#142D2A' },
  userEmail: { fontSize: 14, color: '#7C9A95', marginTop: 4 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#7C9A95', textTransform: 'uppercase', marginBottom: 10, marginTop: 15, marginLeft: 5 },
  cardGroup: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E6ECE9', overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '700', color: '#142D2A', marginBottom: 2 },
  menuSubtitle: { fontSize: 12, color: '#8A9A86' },
  divider: { height: 1, backgroundColor: '#F0F4F2', marginLeft: 70 },
  logoutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 16, borderRadius: 16, marginTop: 30, borderWidth: 1, borderColor: '#FEE2E2' },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '700' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#142D2A', marginBottom: 8 },
  modalDesc: { fontSize: 13, color: '#7C9A95', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: '#F7F9F8', borderWidth: 1, borderColor: '#E6ECE9', borderRadius: 16, paddingHorizontal: 20, marginBottom: 24 },
  currencyPrefix: { fontSize: 24, fontWeight: '700', color: GREEN, marginRight: 10 },
  inputField: { flex: 1, height: 60, fontSize: 20, fontWeight: '700', color: '#142D2A', backgroundColor: '#F7F9F8', borderWidth: 1, borderColor: '#E6ECE9', borderRadius: 16 },
  modalActions: { flexDirection: 'row', width: '100%', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#F0F4F2', alignItems: 'center' },
  cancelBtnText: { color: '#58706B', fontSize: 15, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});