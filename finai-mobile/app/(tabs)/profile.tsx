import React, { useEffect, useState } from 'react';
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

import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../context/TransactionContext';
import { API_URL } from '../../config';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const CREAM = '#FAF7F2';
const EXPENSE = '#FF6259';

const API_BASE_URL = `${API_URL}/api/users`;
const formatBaseline = (amount: number) => `${String.fromCharCode(0x20B1)}${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProfileScreen() {
  const { user, logoutUser } = useAuth();
  const { fetchTransactions } = useTransactions();
  const router = useRouter();

  // --- MODAL STATES ---
  const [isIncomeModalVisible, setIncomeModalVisible] = useState(false);
  const [newIncome, setNewIncome] = useState('');
  const [monthlyBaseline, setMonthlyBaseline] = useState<number | null | undefined>(undefined);
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineLoadFailed, setBaselineLoadFailed] = useState(false);

  const [isPinModalVisible, setPinModalVisible] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');

  const [isPasswordModalVisible, setPasswordModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const newPasswordChecks = [
    { label: 'At least 10 characters', valid: newPassword.length >= 10 },
    { label: 'An uppercase and a lowercase letter', valid: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) },
    { label: 'At least one number', valid: /\d/.test(newPassword) },
  ];
  const newPasswordStrong = newPasswordChecks.every((check) => check.valid);
  const newPasswordHasSymbol = /[^A-Za-z0-9]/.test(newPassword);

  useEffect(() => {
    if (!user?.id || !user?.token) {
      setBaselineLoading(false);
      if (user?.id) setBaselineLoadFailed(true);
      return;
    }

    let cancelled = false;
    setBaselineLoading(true);
    fetch(`${API_BASE_URL}/me/profile`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Profile request failed');
        return response.json();
      })
      .then((profile) => {
        if (cancelled) return;
        const value = profile?.monthly_income;
        setMonthlyBaseline(typeof value === 'number' && Number.isFinite(value) ? value : null);
        setBaselineLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setBaselineLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBaselineLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.id, user?.token]);

  // --- HANDLERS ---
  const handleUpdateIncome = async () => {
    if (!newIncome.trim()) {
      Alert.alert('Amount needed', 'Enter a monthly amount, or leave your baseline unchanged.');
      return;
    }
    const parsedIncome = Number(newIncome);
    if (!Number.isFinite(parsedIncome) || parsedIncome < 0) {
      Alert.alert('Oops!', 'Enter a valid amount of zero or more.');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/${user?.id}/update-income`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({ monthly_income: parsedIncome })
      });
      
      if (response.ok) {
        setMonthlyBaseline(parsedIncome);
        setBaselineLoadFailed(false);
        Alert.alert('Success', `Monthly money budget updated to ${formatBaseline(parsedIncome)}.`);
        setIncomeModalVisible(false);
        setNewIncome('');
      } else {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Could not update baseline', typeof data.detail === 'string' ? data.detail : 'Please try again.');
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
        Alert.alert('Could not change PIN', typeof data.detail === 'string' ? data.detail : 'Check your current PIN and try again.');
      }
    } catch (error) {
      Alert.alert('Connection Error', 'Check your backend server.');
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      Alert.alert('Missing information', 'Enter your current password and a new password.');
      return;
    }
    if (!newPasswordStrong) {
      Alert.alert('Choose a stronger password', 'Use at least 10 characters, uppercase and lowercase letters, and a number.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/${user?.id}/change-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
      });
      
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        Alert.alert(
          'Success',
          data.security_notification_queued
            ? 'Password changed successfully. A security notice has been queued for your account email.'
            : 'Password changed successfully.'
        );
        setPasswordModalVisible(false);
        setOldPassword('');
        setNewPassword('');
        setShowNewPassword(false);
      } else {
        Alert.alert('Could not change password', typeof data.detail === 'string' ? data.detail : 'Check your current password and try again.');
      }
    } catch (error) {
      Alert.alert('Connection Error', 'Check your backend server.');
    }
  };

  // 1. CLOUD BACKUP & EXPORT HANDLER
  const handleCloudBackupExport = async () => {
    const targetUserId = user?.id || (user as any)?._id;
    if (!targetUserId) {
      Alert.alert('Sign-in required', 'Please sign in again to continue.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/export/backup`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      if (!response.ok) {
        throw new Error('Could not retrieve your backup from the server.');
      }

      const data = await response.json();
      const jsonString = JSON.stringify(data, null, 2);

      const fileName = `FinAI_Backup_${new Date().toISOString().split('T')[0]}.json`;
      const backupFile = new File(Paths.cache, fileName);
      backupFile.write(jsonString);

      if (await isAvailableAsync()) {
        await shareAsync(backupFile.uri);
      } else {
        Alert.alert("Success", "Your backup file has been saved.");
      }

    } catch (error) {
      console.error("Backup export error:", error);
      Alert.alert("Error", "There was a problem exporting your records.");
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
      const fileContent = await new File(fileUri).text();
      const parsedData = JSON.parse(fileContent);

      const requiredCollections = ['transactions', 'accounts', 'budgets', 'goals'];
      if (
        !parsedData ||
        typeof parsedData !== 'object' ||
        Array.isArray(parsedData) ||
        !requiredCollections.every((collection) => Array.isArray(parsedData[collection]))
      ) {
        Alert.alert('Invalid backup', 'This file is not a valid FinAI backup. Choose a backup exported from FinAI.');
        return;
      }

      if (requiredCollections.some((collection) => parsedData[collection].length > 5000)) {
        Alert.alert('Backup too large', 'This backup contains more records than FinAI can restore at once.');
        return;
      }

      Alert.alert(
        'Replace financial records?',
        'Restoring this backup replaces your current transactions, accounts, budgets, and goals with the records in this file.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore backup',
            style: 'destructive',
            onPress: () => { void submitBackupRestore(parsedData); },
          },
        ]
      );

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read the selected backup file.';
      Alert.alert('Could not open backup', message);
    }
  };

  const submitBackupRestore = async (backup: Record<string, any>) => {
    if (!user?.token) {
      Alert.alert('Login required', 'Please log in again before restoring a backup.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/export/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(backup),
      });
      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = typeof responseData.detail === 'string' ? responseData.detail : null;
        throw new Error(detail || 'The server could not restore this backup. Check that it was exported from your account.');
      }

      await fetchTransactions(false);
      Alert.alert('Restore complete', 'Your financial records were restored successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check your connection and try again.';
      Alert.alert('Restore failed', message);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => { void performLogout(); } }
    ]);
  };

  const performLogout = async () => {
    let storageClearFailed = false;
    try {
      await logoutUser();
    } catch {
      storageClearFailed = true;
    }

    router.replace('/login');
    if (storageClearFailed) {
      Alert.alert('Signed out', 'Your session was closed, but some saved session data could not be cleared.');
    }
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
            title="Update Monthly Money Budget"
            subtitle={baselineLoading
              ? 'Loading your saved baseline…'
              : baselineLoadFailed
                ? 'Could not load your current baseline · Tap to update'
                : typeof monthlyBaseline !== 'number'
                  ? 'Not set · Optional context for the AI Budget Advisor'
                  : `${formatBaseline(monthlyBaseline)} per month · Optional advisor context`}
            onPress={() => {
              setNewIncome(typeof monthlyBaseline === 'number' ? String(monthlyBaseline) : '');
              setIncomeModalVisible(true);
            }}
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
          {/* TRASH BIN SHORTCUT */}
          <MenuOption 
            icon="archive-outline" 
            title="Trash Bin"
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
            subtitle="Restore records from a JSON file"
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
            <Text style={styles.modalTitle}>Update Monthly Budget</Text>
            <Text style={styles.modalDesc}>Use your typical monthly money available, including salary, allowance, or regular support. Enter 0 if you do not have a regular amount. This is optional context for the AI Budget Advisor.</Text>
            
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
            <Text style={styles.modalDesc}>Enter your current PIN before setting a new one.</Text>
            
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
            <Text style={styles.modalDesc}>Protect your FinAI account with a strong password.</Text>
            
            <TextInput 
              style={[styles.textInputField, { marginBottom: 12 }]}
              secureTextEntry
              placeholder="Old Password"
              placeholderTextColor={SAGE}
              value={oldPassword}
              onChangeText={setOldPassword}
            />
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                secureTextEntry={!showNewPassword}
                placeholder="New Password"
                placeholderTextColor={SAGE}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <TouchableOpacity
                onPress={() => setShowNewPassword((visible) => !visible)}
                accessibilityRole="button"
                accessibilityLabel={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                <Ionicons name={showNewPassword ? 'eye-off' : 'eye'} size={20} color={SAGE} />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordGuidance}>
              <Text style={[styles.passwordStrength, { color: !newPassword ? SAGE : newPasswordStrong ? TEAL : EXPENSE }]}>
                {newPassword
                  ? newPasswordStrong
                    ? (newPasswordHasSymbol ? 'Strong password' : 'Good password · a symbol adds extra strength')
                    : 'Weak password — meet the requirements below'
                  : 'Use a strong password that is hard to guess'}
              </Text>
              {newPasswordChecks.map((check) => (
                <View key={check.label} style={styles.passwordRule}>
                  <Ionicons name={check.valid ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={check.valid ? TEAL : SAGE} />
                  <Text style={[styles.passwordRuleText, check.valid && styles.passwordRulePassed]}>{check.label}</Text>
                </View>
              ))}
            </View>

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
  passwordInputContainer: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: CREAM, borderRadius: 16, paddingHorizontal: 20, marginBottom: 8 },
  passwordInput: { flex: 1, height: 55, fontSize: 15, fontWeight: '600', color: DEEP_GREEN },
  passwordGuidance: { width: '100%', marginBottom: 16, paddingHorizontal: 4 },
  passwordStrength: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  passwordRule: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  passwordRuleText: { color: SAGE, fontSize: 11 },
  passwordRulePassed: { color: TEAL },
  modalActions: { flexDirection: 'row', width: '100%', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: CREAM, alignItems: 'center' },
  cancelBtnText: { color: SAGE, fontSize: 15, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: DEEP_GREEN, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
