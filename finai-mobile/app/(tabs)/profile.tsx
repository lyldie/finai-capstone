import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, TextInput, Alert, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';

const GREEN = '#144A3D';

export default function ProfileScreen() {
  const { user, logoutUser } = useAuth();
  const router = useRouter();

  // Modal States
  const [isIncomeModalVisible, setIncomeModalVisible] = useState(false);
  const [newIncome, setNewIncome] = useState('');

  const handleUpdateIncome = () => {
    if (!newIncome || isNaN(Number(newIncome))) {
      Alert.alert('Oops!', 'Maglagay ng tamang amount paps.');
      return;
    }
    // TODO: Ikokonekta natin ito sa backend next session!
    Alert.alert('Success', `Monthly income updated to ₱${newIncome}!`);
    setIncomeModalVisible(false);
    setNewIncome('');
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
            onPress={() => Alert.alert('Coming Soon', 'Dito natin ilalagay ang Custom Categories UI next session!')} 
          />
        </View>

        {/* SECURITY SETTINGS */}
        <Text style={styles.sectionTitle}>Security & Access</Text>
        <View style={styles.cardGroup}>
          <MenuOption 
            icon="keypad-outline" 
            title="Change App PIN" 
            subtitle="Update your 4-digit lock code"
            onPress={() => Alert.alert('Security', 'Navigate to Change PIN Screen')} 
          />
          <View style={styles.divider} />
          <MenuOption 
            icon="lock-closed-outline" 
            title="Change Password" 
            subtitle="Update your account password"
            onPress={() => Alert.alert('Security', 'Navigate to Change Password Screen')} 
          />
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* INCOME UPDATE MODAL */}
      <Modal visible={isIncomeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Monthly Income</Text>
            <Text style={styles.modalDesc}>Ito ang gagamitin ng AI Budget Advisor bilang basehan ng iyong cash flow.</Text>
            
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>₱</Text>
              <TextInput 
                style={styles.incomeInput}
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
  incomeInput: { flex: 1, height: 60, fontSize: 24, fontWeight: '700', color: '#142D2A' },
  modalActions: { flexDirection: 'row', width: '100%', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#F0F4F2', alignItems: 'center' },
  cancelBtnText: { color: '#58706B', fontSize: 15, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});