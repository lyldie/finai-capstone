import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { Account } from '../context/TransactionContext';

type AccountTemplate = Pick<Account, 'id' | 'name' | 'icon'>;

export default function PersonalAccountsScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<AccountTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
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

  const openAddModal = () => {
    setSelectedTemplate(templates[0] || null);
    setAccountName(templates[0]?.name || '');
    setOpeningBalance('0');
    setIsModalVisible(true);
  };

  const selectTemplate = (template: AccountTemplate) => {
    setSelectedTemplate(template);
    setAccountName(template.name);
  };

  const saveAccount = async () => {
    const name = accountName.trim();
    const initialBalance = Number(openingBalance);
    if (!selectedTemplate) { Alert.alert('Account type required', 'Ask the administrator to add an account-type preset first.'); return; }
    if (!name) { Alert.alert('Account name required', 'Give this personal account a name.'); return; }
    if (!Number.isFinite(initialBalance) || initialBalance < 0) { Alert.alert('Invalid opening balance', 'Use zero or a positive amount.'); return; }
    if (accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) { Alert.alert('Duplicate account', 'Use a different personal account name.'); return; }

    setIsSaving(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) throw new Error('Your session has expired. Please log in again.');
      const response = await fetch(`${API_URL}/api/accounts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          initial_balance: initialBalance,
          icon: selectedTemplate.icon || 'wallet',
          user_id: userId,
          parent_template_id: selectedTemplate.id,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Unable to create account.');
      setIsModalVisible(false);
      await loadAccounts();
    } catch (error: any) {
      Alert.alert('Unable to save account', error.message || 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAccount = (account: Account) => {
    Alert.alert('Delete account?', 'Accounts with transaction history cannot be deleted.', [
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}><Ionicons name="arrow-back" size={23} color="#142D2A" /></TouchableOpacity>
        <Text style={styles.title}>My Accounts</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.headerButton}><Ionicons name="add" size={25} color="#FFFFFF" /></TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Your manual payment accounts and opening balances.</Text>

      {isLoading ? <ActivityIndicator style={styles.loading} size="large" color="#2b5f56" /> : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={accounts.length ? styles.list : styles.emptyList}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="wallet-outline" size={42} color="#7C9A95" /><Text style={styles.emptyTitle}>No personal accounts yet</Text><Text style={styles.emptyText}>Add an account from an administrator-approved type before recording transactions.</Text><TouchableOpacity style={styles.primaryButton} onPress={openAddModal}><Text style={styles.primaryButtonText}>Add account</Text></TouchableOpacity></View>}
          renderItem={({ item }) => <View style={styles.accountCard}><View style={styles.accountIcon}><Ionicons name={(item.icon || 'wallet-outline') as any} size={23} color="#2b5f56" /></View><View style={styles.accountInfo}><Text style={styles.accountName}>{item.name}</Text><Text style={styles.openingBalance}>Opening balance: ₱{Number(item.initial_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text></View><TouchableOpacity onPress={() => deleteAccount(item)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity></View>}
        />
      )}

      <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={() => setIsModalVisible(false)}>
        <View style={styles.overlay}><View style={styles.modal}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Add personal account</Text><TouchableOpacity onPress={() => setIsModalVisible(false)}><Ionicons name="close" size={23} color="#142D2A" /></TouchableOpacity></View>
          <Text style={styles.label}>Account type</Text>
          <View style={styles.templateList}>{templates.map((template) => <TouchableOpacity key={template.id} style={[styles.template, selectedTemplate?.id === template.id && styles.templateSelected]} onPress={() => selectTemplate(template)}><Ionicons name={(template.icon || 'wallet-outline') as any} size={18} color={selectedTemplate?.id === template.id ? '#FFFFFF' : '#2b5f56'} /><Text style={[styles.templateText, selectedTemplate?.id === template.id && styles.templateTextSelected]}>{template.name}</Text></TouchableOpacity>)}</View>
          <Text style={styles.label}>Personal account name</Text>
          <TextInput value={accountName} onChangeText={setAccountName} placeholder="e.g., My GCash" placeholderTextColor="#7C9A95" style={styles.input} maxLength={40} />
          <Text style={styles.label}>Opening balance</Text>
          <TextInput value={openingBalance} onChangeText={(value) => setOpeningBalance(value.replace(/[^0-9.]/g, ''))} placeholder="0.00" placeholderTextColor="#7C9A95" keyboardType="decimal-pad" style={styles.input} />
          <TouchableOpacity style={[styles.primaryButton, isSaving && styles.disabledButton]} onPress={saveAccount} disabled={isSaving}>{isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save account</Text>}</TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F6', paddingTop: 54 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, headerButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2b5f56', alignItems: 'center', justifyContent: 'center' }, title: { color: '#142D2A', fontSize: 20, fontWeight: '800' }, subtitle: { color: '#58706B', marginHorizontal: 20, marginTop: 16, marginBottom: 14 }, loading: { flex: 1 }, list: { padding: 20, gap: 10 }, emptyList: { flexGrow: 1, justifyContent: 'center', padding: 30 }, empty: { alignItems: 'center' }, emptyTitle: { color: '#142D2A', fontSize: 18, fontWeight: '800', marginTop: 12 }, emptyText: { color: '#58706B', textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 22 }, accountCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2EAF4' }, accountIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center' }, accountInfo: { flex: 1, marginLeft: 12 }, accountName: { color: '#142D2A', fontSize: 16, fontWeight: '700' }, openingBalance: { color: '#7C9A95', fontSize: 12, marginTop: 4 }, overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,45,42,0.45)' }, modal: { backgroundColor: '#FFFFFF', padding: 20, paddingBottom: 30, borderTopLeftRadius: 26, borderTopRightRadius: 26 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, modalTitle: { color: '#142D2A', fontWeight: '800', fontSize: 19 }, label: { color: '#58706B', fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 8 }, templateList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, template: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#D7E1DF' }, templateSelected: { backgroundColor: '#2b5f56', borderColor: '#2b5f56' }, templateText: { color: '#2b5f56', fontWeight: '700', fontSize: 13 }, templateTextSelected: { color: '#FFFFFF' }, input: { backgroundColor: '#F8FAF9', borderColor: '#D7E1DF', borderWidth: 1, borderRadius: 12, padding: 13, color: '#142D2A', fontSize: 15 }, primaryButton: { marginTop: 22, minHeight: 50, borderRadius: 14, backgroundColor: '#2b5f56', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 }, primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 }, disabledButton: { opacity: 0.65 },
});
