import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, SafeAreaView, Alert, Modal, TextInput
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';
import { getIcon } from '../../utils/iconHelper';
import { useAuth } from '../../context/AuthContext';

// ---- FINAI BRAND TOKENS (unchanged palette) ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const BG = '#f4f7f6';
const DANGER = '#c62828';

interface Account {
  id: string;
  name: string;
  initial_balance?: number;
  icon?: string;
  is_archived?: boolean;
}

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'active' | 'archived'>('active');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [newName, setNewName] = useState('');

  const router = useRouter();
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      fetchAccounts(view);
    }, [view])
  );

  const fetchAccounts = async (which: 'active' | 'archived') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/accounts/?archived=${which === 'archived'}`);
      const data = await response.json();
      // Templates-only view: this screen is the admin preset manager, so
      // only account_role === "admin" rows belong here even though the
      // unscoped GET can also include null-user_id rows.
      setAccounts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const archiveAccount = async (id: string) => {
    Alert.alert("Archive Account", "This will hide it from active use. You can restore it anytime from the Archived tab.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive", style: "destructive",
        onPress: async () => {
          const response = await fetch(`${API_URL}/api/accounts/${id}/archive`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${user?.token}` },
          });
          if (response.ok) fetchAccounts(view);
          else if (response.status === 401) Alert.alert("Session Expired", "Please log in again.");
          else Alert.alert("Error", "Couldn't archive this account.");
        }
      }
    ]);
  };

  const restoreAccount = async (id: string) => {
    const response = await fetch(`${API_URL}/api/accounts/${id}/restore`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user?.token}` },
    });
    if (response.ok) fetchAccounts(view);
    else if (response.status === 401) Alert.alert("Session Expired", "Please log in again.");
    else Alert.alert("Error", "Couldn't restore this account.");
  };

  const openEditModal = (item: Account) => {
    setEditingAccount(item);
    setNewName(item.name);
    setModalVisible(true);
  };

  const updateAccount = async () => {
    if (!editingAccount || !editingAccount.id) return;
    try {
      const response = await fetch(`${API_URL}/api/accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          name: newName,
          initial_balance: editingAccount.initial_balance || 0.0,
          icon: editingAccount.icon || "wallet"
        }),
      });
      if (response.ok) {
        setModalVisible(false);
        fetchAccounts(view);
      } else if (response.status === 401) {
        Alert.alert("Session Expired", "Please log in again.");
      } else {
        Alert.alert("Error", "Hindi ma-update ang account.");
      }
    } catch (error) {
      Alert.alert("Error", "Check connection.");
    }
  };

  const renderAccountItem = ({ item }: { item: Account }) => (
    <View style={[styles.card, item.is_archived && styles.cardArchived]}>
      <View style={styles.cardInfo}>
        <View style={[styles.iconBox, item.is_archived && styles.iconBoxArchived]}>
          <Ionicons name={getIcon(item.name) as any} size={20} color={item.is_archived ? SAGE : GOLD} />
        </View>
        <Text style={[styles.cardText, item.is_archived && styles.cardTextArchived]}>{item.name}</Text>
      </View>

      {item.is_archived ? (
        <TouchableOpacity onPress={() => restoreAccount(item.id)} style={styles.restoreBtn}>
          <Ionicons name="refresh-outline" size={16} color={TEAL} />
          <Text style={styles.restoreText}>Restore</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <TouchableOpacity onPress={() => openEditModal(item)}>
            <Ionicons name="pencil-outline" size={19} color={TEAL} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => archiveAccount(item.id)}>
            <Ionicons name="archive-outline" size={19} color={DANGER} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={DEEP_GREEN} /></TouchableOpacity>
        <Text style={styles.title}>Accounts</Text>
        <TouchableOpacity onPress={() => router.push('/(admin)/add-account')}>
          <Ionicons name="add-circle" size={36} color={GOLD} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, view === 'active' && styles.tabBtnActive]}
          onPress={() => setView('active')}
        >
          <Text style={[styles.tabText, view === 'active' && styles.tabTextActive]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, view === 'archived' && styles.tabBtnActive]}
          onPress={() => setView('archived')}
        >
          <Text style={[styles.tabText, view === 'archived' && styles.tabTextActive]}>Archived</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} />
      ) : accounts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name={view === 'active' ? 'wallet-outline' : 'archive-outline'} size={40} color={SAGE} />
          <Text style={styles.emptyText}>
            {view === 'active' ? 'No account presets yet.' : 'Nothing archived right now.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item, index) => item.id ? item.id : index.toString()}
          renderItem={renderAccountItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Account</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Account Name"
              placeholderTextColor={SAGE}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={updateAccount}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ marginTop: 15 }}>
              <Text style={{ color: SAGE, textAlign: 'center' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 20, paddingBottom: 10 },
  title: { fontSize: 30, fontWeight: '900', color: DEEP_GREEN, fontStyle: 'italic' },
  tabRow: { flexDirection: 'row', marginHorizontal: 25, marginBottom: 16, backgroundColor: '#e9efec', borderRadius: 14, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  tabBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '700', color: SAGE },
  tabTextActive: { color: DEEP_GREEN },
  listContent: { paddingHorizontal: 25, paddingBottom: 30 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText: { color: SAGE, fontSize: 14, fontWeight: '500' },
  card: {
    backgroundColor: '#ffffff', padding: 16, borderRadius: 18, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardArchived: { backgroundColor: '#f7f7f7', shadowOpacity: 0 },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  iconBox: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#fff3da', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  iconBoxArchived: { backgroundColor: '#ebebeb' },
  cardText: { fontSize: 16, fontWeight: '700', color: DEEP_GREEN, flexShrink: 1 },
  cardTextArchived: { color: SAGE },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eaf3f0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  restoreText: { color: TEAL, fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 22, width: '85%' },
  modalTitle: { fontSize: 19, fontWeight: '800', marginBottom: 18, color: DEEP_GREEN },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 14, marginBottom: 18, borderWidth: 1, borderColor: '#eee', color: DEEP_GREEN },
  saveBtn: { backgroundColor: TEAL, padding: 15, borderRadius: 14, alignItems: 'center' },
});