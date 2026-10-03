import React, { useCallback, useState } from 'react';
import { 
  ActivityIndicator, Alert, FlatList, Modal, StyleSheet, 
  Text, TextInput, TouchableOpacity, View, StatusBar, SafeAreaView, KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../config';
import { Account } from '../context/TransactionContext';

// Import natin ang emoji helper
import { getAccountEmoji } from '../utils/accountEmoji';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const BG = '#F4F7F6';
const ACCOUNT_TINT = '#FFF9E6';
const DANGER = '#EF4444';

type AccountTemplate = Pick<Account, 'id' | 'name' | 'icon'>;

export default function PersonalAccountsScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<AccountTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // States para sa CRUD (Add or Edit)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AccountTemplate | null>(null);
  const [accountName, setAccountName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      const [accountResponse, templateResponse] = await Promise.all([
        fetch(`${API_URL}/api/accounts/user/${userId}`),
        fetch(`${API_URL}/api/accounts/templates`),
      ]);
      setAccounts(accountResponse.ok ? await accountResponse.json() : []);
      setTemplates(templateResponse.ok ? await templateResponse.json() : []);
    } catch (error) {
      console.error('Personal account fetch failed:', error);
      Alert.alert('Unable to load accounts', 'Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAccounts(); }, [loadAccounts]));

  // Buksan ang Modal para sa paggawa ng bagong account (CREATE)
  const openAddModal = () => {
    setEditingAccount(null);
    setSelectedTemplate(templates[0] || null);
    setAccountName(templates[0]?.name || '');
    setOpeningBalance('0');
    setIsModalVisible(true);
  };

  // Buksan ang Modal para sa pag-edit ng kasalukuyang account (UPDATE)
  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setAccountName(account.name);
    setOpeningBalance(String(account.initial_balance || 0));
    
    // Hanapin kung may tumutugmang template o gamitin ang icon niya
    const matchedTemplate = templates.find(t => t.name.toLowerCase() === account.name.toLowerCase()) || templates[0] || null;
    setSelectedTemplate(matchedTemplate);
    setIsModalVisible(true);
  };

  const selectTemplate = (template: AccountTemplate) => {
    setSelectedTemplate(template);
    setAccountName(template.name);
  };

  // Save Account (Gumagana pareho sa CREATE at UPDATE)
  const saveAccount = async () => {
    const name = accountName.trim();
    const initialBalance = Number(openingBalance);
    
    if (!selectedTemplate && !editingAccount) { 
      Alert.alert('Account type required', 'Pumili muna ng account template.'); 
      return; 
    }
    if (!name) { 
      Alert.alert('Account name required', 'Bigyan ng pangalan ang personal account mo.'); 
      return; 
    }
    if (!Number.isFinite(initialBalance) || initialBalance < 0) { 
      Alert.alert('Invalid opening balance', 'Maglagay ng zero o positibong halaga.'); 
      return; 
    }
    
    // I-check kung may duplicate name (maliban kung sarili niya ang ini-edit)
    if (accounts.some((account) => account.name.toLowerCase() === name.toLowerCase() && account.id !== editingAccount?.id)) { 
      Alert.alert('Duplicate account', 'Mayroon nang ganitong pangalan ng account.'); 
      return; 
    }

    setIsSaving(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) throw new Error('Your session has expired. Please log in again.');

      const url = editingAccount ? `${API_URL}/api/accounts/${editingAccount.id}` : `${API_URL}/api/accounts/`;
      const method = editingAccount ? 'PUT' : 'POST';

      const payload = editingAccount ? {
        name,
        initial_balance: initialBalance,
        icon: editingAccount.icon || getAccountEmoji(name),
        user_id: userId
      } : {
        name,
        initial_balance: initialBalance,
        icon: selectedTemplate?.icon || getAccountEmoji(name),
        user_id: userId,
        parent_template_id: selectedTemplate?.id,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Unable to save account.');

      setIsModalVisible(false);
      await loadAccounts();
    } catch (error: any) {
      Alert.alert('Unable to save account', error.message || 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // DELETE Account (DELETE)
  const deleteAccount = (account: Account) => {
    Alert.alert('Delete account?', 'Hindi maaaring mabura ang mga account na may kasaysayan na ng transaksyon.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const response = await fetch(`${API_URL}/api/accounts/${account.id}`, { method: 'DELETE' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) Alert.alert('Cannot delete account', result.detail || 'Please try again.');
        else loadAccounts();
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Modern Gradient Header */}
      <LinearGradient colors={[TEAL, DEEP_GREEN]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>My Accounts</Text>
          <TouchableOpacity onPress={openAddModal} style={styles.addBtnHeader}>
            <Ionicons name="add" size={24} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Manage your manual payment accounts and opening balances.</Text>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={TEAL} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={accounts.length ? styles.list : styles.emptyList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="wallet-outline" size={42} color={GOLD} />
              </View>
              <Text style={styles.emptyTitle}>No personal accounts yet</Text>
              <Text style={styles.emptyText}>Add an account from an administrator-approved type before recording transactions.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={openAddModal}>
                <Text style={styles.primaryButtonText}>Add New Account</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.accountCard}>
              <View style={styles.cardInfo}>
                <View style={styles.accountIconBox}>
                  <Text style={{ fontSize: 24 }}>{item.icon || getAccountEmoji(item.name)}</Text>
                </View>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.accountName}>{item.name}</Text>
                  <Text style={styles.openingBalance}>
                    Opening balance: ₱{Number(item.initial_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              {/* Action Buttons: Edit and Delete */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity onPress={() => openEditModal(item)} style={styles.editBtn}>
                  <Ionicons name="pencil-outline" size={18} color={TEAL} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteAccount(item)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color={DANGER} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add / Edit Account Modal */}
      <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={() => setIsModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingAccount ? 'Edit Account' : 'Add Personal Account'}</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={DEEP_GREEN} />
              </TouchableOpacity>
            </View>
            
            {!editingAccount && (
              <>
                <Text style={styles.label}>Select Account Preset</Text>
                <View style={styles.templateList}>
                  {templates.map((template) => (
                    <TouchableOpacity 
                      key={template.id} 
                      style={[styles.template, selectedTemplate?.id === template.id && styles.templateSelected]} 
                      onPress={() => selectTemplate(template)}
                    >
                      <Text style={{ fontSize: 16 }}>{template.icon || getAccountEmoji(template.name)}</Text>
                      <Text style={[styles.templateText, selectedTemplate?.id === template.id && styles.templateTextSelected]}>
                        {template.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            
            <Text style={styles.label}>Personal Account Name</Text>
            <TextInput 
              value={accountName} 
              onChangeText={setAccountName} 
              placeholder="e.g., My Personal GCash" 
              placeholderTextColor={SAGE} 
              style={styles.input} 
              maxLength={40} 
            />
            
            <Text style={styles.label}>Opening Balance</Text>
            <TextInput 
              value={openingBalance} 
              onChangeText={(value) => setOpeningBalance(value.replace(/[^0-9.]/g, ''))} 
              placeholder="0.00" 
              placeholderTextColor={SAGE} 
              keyboardType="decimal-pad" 
              style={styles.input} 
            />
            
            <TouchableOpacity 
              style={[styles.primaryButton, isSaving && styles.disabledButton, { marginTop: 25 }]} 
              onPress={saveAccount} 
              disabled={isSaving}
            >
              {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{editingAccount ? 'Update Account' : 'Save Account'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 25, 
    paddingBottom: 25, 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30, 
    elevation: 6,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  backBtn: { padding: 8, backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  addBtnHeader: { width: 38, height: 38, borderRadius: 12, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  subtitle: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 13, fontWeight: '500', paddingLeft: 4 },
  
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  list: { padding: 20, paddingTop: 20, paddingBottom: 40 },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 30 },
  
  emptyState: { alignItems: 'center', paddingBottom: 50 },
  emptyIconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: ACCOUNT_TINT, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  emptyTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: SAGE, textAlign: 'center', lineHeight: 22, marginBottom: 25, fontSize: 13, paddingHorizontal: 10 },
  
  accountCard: { 
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    shadowColor: DEEP_GREEN, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flex: 1 },
  accountIconBox: { width: 50, height: 50, borderRadius: 16, backgroundColor: ACCOUNT_TINT, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  accountName: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800', marginBottom: 3 },
  openingBalance: { color: SAGE, fontSize: 12, fontWeight: '600' },
  
  actionButtonsRow: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 10, backgroundColor: '#E0F2FE', borderRadius: 12 },
  deleteBtn: { padding: 10, backgroundColor: '#FFEDED', borderRadius: 12 },
  
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28, 60, 54, 0.5)' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 25, paddingBottom: Platform.OS === 'ios' ? 40 : 30, borderTopLeftRadius: 30, borderTopRightRadius: 30, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: DEEP_GREEN, fontWeight: '900', fontSize: 20 },
  closeBtn: { padding: 6, backgroundColor: '#F4F7F6', borderRadius: 12 },
  
  label: { color: DEEP_GREEN, fontSize: 13, fontWeight: '800', marginTop: 15, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  templateList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 5 },
  template: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  templateSelected: { backgroundColor: '#E8F5E9', borderColor: TEAL },
  templateText: { color: SAGE, fontWeight: '700', fontSize: 14 },
  templateTextSelected: { color: TEAL, fontWeight: '800' },
  
  parserContainer: { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', borderWidth: 1, borderRadius: 16, padding: 16, color: DEEP_GREEN, fontSize: 15, fontWeight: '600' },
  
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: TEAL, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, elevation: 2, shadowColor: TEAL, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  disabledButton: { opacity: 0.7 },
});