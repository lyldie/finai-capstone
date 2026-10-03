import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, TextInput, Alert, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// File system at Sharing para sa Backup (Export)
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

// 👈 Document Picker at readAsStringAsync para sa Restore (Import)
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system';

import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const CREAM = '#FAF7F2';
const EXPENSE = '#FF6259';

const API_BASE_URL = `${API_URL}/api/users`;

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
    const parsedIncome = Number(newIncome);
    if (!newIncome || isNaN(parsedIncome) || parsedIncome <= 0) {
      Alert.alert('Oops!', 'Maglagay ng tamang amount paps.');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/${user?.id}/update-income`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({ monthly_income: parsedIncome })
      });
      
      if (response.ok) {
        Alert.alert('Success', `Monthly income updated to ₱${newIncome}!`);
        setIncomeModalVisible(false);
        setNewIncome('');
      } else {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Error', data.detail || 'Hindi ma-update ang income. Subukan ulit.');
      }
    } catch (error) {
      Alert.alert('Connection Error', 'Check your backend server.');
    }
  };

  const handleChangePin = async () => {
    if (!oldPin || !newPin || newPin.length !== 4) {
      Alert.alert('Oops!', 'Kumpletuhin ang form. Ang bagong PIN ay dapat 4 digits.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/${user?.id}/change-pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({ old_pin: oldPin, new_pin: newPin })
      });
      
      const data = await response.json();
      if (response.ok) {
        await AsyncStorage.setItem('user_pin', newPin);
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
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

  // 1. CLOUD BACKUP & EXPORT HANDLER
  const handleCloudBackupExport = async () => {
    const targetUserId = user?.id || (user as any)?._id;
    if (!targetUserId) {
      Alert.alert("Error", "Kailangan mong mag-log in ulit.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/export/backup`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      if (!response.ok) {
        throw new Error("Hindi nakuha ang data mula sa server.");
      }

      const data = await response.json();
      const jsonString = JSON.stringify(data, null, 2);

      const fileName = `FinAI_Backup_${new Date().toISOString().split('T')[0]}.json`;
      const backupFile = new File(Paths.cache, fileName);
      backupFile.write(jsonString);

      if (await isAvailableAsync()) {
        await shareAsync(backupFile.uri);
      } else {
        Alert.alert("Success", `Na-save ang backup file.`);
      }

    } catch (error) {
      console.error("Backup export error:", error);
      Alert.alert("Error", "Nagkaroon ng problema sa pag-export ng iyong mga record.");
    }
  };

  // 2. CLOUD RESTORE & IMPORT HANDLER
  const handleCloudRestoreImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContent = await readAsStringAsync(fileUri);
      const parsedData = JSON.parse(fileContent);

      if (!parsedData || !parsedData.transactions) {
        Alert.alert("Error", "Hindi wastong format ng backup file.");
        return;
      }

      const response = await fetch(`${API_URL}/api/export/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify(parsedData),
      });

      if (!response.ok) {
        throw new Error("Nabigo ang pag-restore ng data mula sa server.");
      }

      Alert.alert("Success!", "Matagumpay na naibalik at nai-import ang iyong mga financial records sa app!");

    } catch (error) {
      console.error("Restore error:", error);
      Alert.alert("Error", "Nagkaroon ng problema sa pag-import ng backup file.");
    }
  };

  const handleLogout = () => {
    Alert.alert("Mag-logout", "Sigurado ka ba paps?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => logoutUser() }
    ]);
  };

  // Reusable Menu Button Component
  const MenuOption = ({ icon, title, subtitle, onPress, color = DEEP_GREEN }: any) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.menuIconBox, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={SAGE} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DEEP_GREEN} />
      
      {/* HEADER SECTION */}
      <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.profileAvatar}>
          <Text style={styles.avatarText}>{user?.name ? user.name.charAt(0).toUpperCase() : 'U'}</Text>
        </View>
        <Text style={styles.userName}>{user?.name || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email || 'user@email.com'}</Text>
      </LinearGradient>

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
            color={TEAL}
            onPress={() => router.push('/custom-presets' as any)}
          />
        </View>

        {/* SECURITY SETTINGS & DATA MANAGEMENT */}
        <Text style={styles.sectionTitle}>Security & Data Management</Text>
        <View style={styles.cardGroup}>
          <MenuOption 
            icon="keypad-outline" 
            title="Change App PIN" 
            subtitle="Update your 4-digit lock code"
            color={GOLD}
            onPress={() => setPinModalVisible(true)} 
          />
          <View style={styles.divider} />
          <MenuOption 
            icon="lock-closed-outline" 
            title="Change Password" 
            subtitle="Update your account password"
            color={GOLD}
            onPress={() => setPasswordModalVisible(true)} 
          />
          <View style={styles.divider} />
          {/* ARCHIVE CENTER SHORTCUT */}
          <MenuOption 
            icon="archive-outline" 
            title="Archive Center & Trash Bin" 
            subtitle="Restore or manage archived records"
            color={TEAL}
            onPress={() => router.push('/archive' as any)} 
          />
          <View style={styles.divider} />
          {/* CLOUD BACKUP & EXPORT */}
          <MenuOption 
            icon="cloud-upload-outline" 
            title="Cloud Backup & Export" 
            subtitle="Export and store financial records externally"
            color={TEAL}
            onPress={handleCloudBackupExport} 
          />
          <View style={styles.divider} />
          {/* 👈 RESTORE / IMPORT BACKUP */}
          <MenuOption 
            icon="cloud-download-outline" 
            title="Restore / Import Backup" 
            subtitle="Ibalik ang mga records mula sa JSON file"
            color={TEAL}
            onPress={handleCloudRestoreImport} 
          />
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={EXPENSE} style={{ marginRight: 8 }} />
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
                style={styles.amountInputField}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={SAGE}
                value={newIncome}
                onChangeText={setNewIncome}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIncomeModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateIncome} activeOpacity={0.85}>
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
              style={[styles.textInputField, { marginBottom: 12 }]}
              keyboardType="numeric"
              secureTextEntry
              placeholder="Old PIN"
              placeholderTextColor={SAGE}
              maxLength={4}
              value={oldPin}
              onChangeText={(t) => setOldPin(t.replace(/[^0-9]/g, ''))}
            />
            <TextInput 
              style={[styles.textInputField, { marginBottom: 24 }]}
              keyboardType="numeric"
              secureTextEntry
              placeholder="New PIN (4 digits)"
              placeholderTextColor={SAGE}
              maxLength={4}
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, ''))}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPinModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleChangePin} activeOpacity={0.85}>
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
              style={[styles.textInputField, { marginBottom: 12 }]}
              secureTextEntry
              placeholder="Old Password"
              placeholderTextColor={SAGE}
              value={oldPassword}
              onChangeText={setOldPassword}
            />
            <TextInput 
              style={[styles.textInputField, { marginBottom: 24 }]}
              secureTextEntry
              placeholder="New Password"
              placeholderTextColor={SAGE}
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPasswordModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} activeOpacity={0.85}>
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
  container: { flex: 1, backgroundColor: CREAM },
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  userName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  userEmail: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: SAGE, textTransform: 'uppercase', marginBottom: 10, marginTop: 15, marginLeft: 5, letterSpacing: 0.4 },
  cardGroup: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '700', color: DEEP_GREEN, marginBottom: 2 },
  menuSubtitle: { fontSize: 12, color: SAGE },
  divider: { height: 1, backgroundColor: CREAM, marginLeft: 70 },
  logoutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255, 98, 89, 0.08)', padding: 16, borderRadius: 16, marginTop: 30 },
  logoutText: { color: EXPENSE, fontSize: 16, fontWeight: '700' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(28, 60, 54, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: DEEP_GREEN, marginBottom: 8 },
  modalDesc: { fontSize: 13, color: SAGE, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: CREAM, borderRadius: 16, paddingHorizontal: 20, marginBottom: 24 },
  currencyPrefix: { fontSize: 24, fontWeight: '700', color: DEEP_GREEN, marginRight: 10 },
  amountInputField: { flex: 1, height: 60, fontSize: 20, fontWeight: '700', color: DEEP_GREEN },
  textInputField: { width: '100%', height: 55, fontSize: 15, fontWeight: '600', color: DEEP_GREEN, backgroundColor: CREAM, borderRadius: 16, paddingHorizontal: 20 },
  modalActions: { flexDirection: 'row', width: '100%', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: CREAM, alignItems: 'center' },
  cancelBtnText: { color: SAGE, fontSize: 15, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: DEEP_GREEN, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
