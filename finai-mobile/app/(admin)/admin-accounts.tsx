import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, SafeAreaView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

const GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#8BA19D';
const RED = '#EF4444';

interface AdminAccount {
  id: string;
  name: string;
  email: string;
  is_archived: boolean;
  is_super_admin: boolean;
}

export default function AdminAccountsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loadAccounts = async () => {
    if (!user?.token) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/admin-accounts?archived=${view === 'archived'}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not load administrator accounts.');
      }
      setAccounts(Array.isArray(data) ? data : []);
    } catch (error) {
      setAccounts([]);
      Alert.alert('Could not load accounts', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { void loadAccounts(); }, [view, user?.token]));

  const openCreate = () => {
    setEditing(null);
    setName('');
    setEmail('');
    setPassword('');
    setModalVisible(true);
  };

  const openEdit = (account: AdminAccount) => {
    setEditing(account);
    setName(account.name);
    setEmail(account.email);
    setPassword('');
    setModalVisible(true);
  };

  const saveAccount = async () => {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert('Check the details', 'Enter a name and a valid email address.');
      return;
    }
    if ((!editing || password) && (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password))) {
      Alert.alert('Choose a stronger password', 'Use at least 10 characters, uppercase and lowercase letters, and a number.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        editing
          ? `${API_URL}/api/users/admin-accounts/${editing.id}`
          : `${API_URL}/api/users/admin-accounts`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
          body: JSON.stringify({ name: cleanName, email: cleanEmail, password: password || undefined }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not save this administrator account.');
      setModalVisible(false);
      await loadAccounts();
      Alert.alert(editing ? 'Account updated' : 'Administrator added', editing ? 'The administrator account was updated.' : 'The account was created. Share the initial password securely with its owner.');
    } catch (error) {
      Alert.alert('Could not save account', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeArchiveState = async (account: AdminAccount, action: 'archive' | 'restore') => {
    try {
      const response = await fetch(`${API_URL}/api/users/admin-accounts/${account.id}/${action}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user?.token || ''}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Could not ${action} this account.`);
      await loadAccounts();
    } catch (error) {
      Alert.alert('Action failed', error instanceof Error ? error.message : 'Check your connection and try again.');
    }
  };

  const confirmArchive = (account: AdminAccount) => Alert.alert(
    'Archive administrator?',
    `${account.name} will no longer be able to sign in. Their account can be restored later.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => { void changeArchiveState(account, 'archive'); } },
    ],
  );

  const renderAccount = ({ item }: { item: AdminAccount }) => (
    <View style={[styles.accountCard, item.is_archived && styles.archivedCard]}>
      <View style={styles.avatar}><Ionicons name="shield-checkmark" size={22} color={item.is_archived ? SAGE : TEAL} /></View>
      <View style={styles.accountInfo}>
        <Text style={styles.accountName}>{item.name}{item.is_super_admin ? ' - Super admin' : ''}</Text>
        <Text style={styles.accountEmail}>{item.email}</Text>
        <Text style={styles.roleLabel}>{item.is_archived ? 'ARCHIVED' : item.is_super_admin ? 'SUPER ADMIN' : 'ADMINISTRATOR'}</Text>
      </View>
      {!item.is_super_admin && (
        <View style={styles.actions}>
          {item.is_archived ? (
            <TouchableOpacity style={styles.restoreButton} onPress={() => { void changeArchiveState(item, 'restore'); }}>
              <Ionicons name="refresh-outline" size={17} color={TEAL} />
              <Text style={styles.restoreText}>Restore</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.iconButton} onPress={() => openEdit(item)} accessibilityLabel={`Edit ${item.name}`}>
                <Ionicons name="pencil-outline" size={18} color={TEAL} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconButton, styles.archiveIconButton]} onPress={() => confirmArchive(item)} accessibilityLabel={`Archive ${item.name}`}>
                <Ionicons name="archive-outline" size={18} color={RED} />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[TEAL, GREEN]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Admin accounts</Text>
          {view === 'active' ? (
            <TouchableOpacity onPress={openCreate} style={styles.addButton} accessibilityLabel="Add administrator">
              <Ionicons name="add" size={24} color={GREEN} />
            </TouchableOpacity>
          ) : <View style={styles.addPlaceholder} />}
        </View>
        <Text style={styles.subtitle}>Manage administrator access and account details.</Text>
        <View style={styles.tabs}>
          {(['active', 'archived'] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setView(tab)} style={[styles.tab, view === tab && styles.activeTab]}>
              <Text style={[styles.tabText, view === tab && styles.activeTabText]}>{tab === 'active' ? 'Active' : 'Archived'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {loading ? <ActivityIndicator color={TEAL} size="large" style={styles.loader} /> : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          renderItem={renderAccount}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="people-outline" size={42} color={SAGE} /><Text style={styles.emptyText}>No {view} administrator accounts.</Text></View>}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit administrator' : 'Add administrator'}</Text>
            <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" editable={!saving} />
            <TextInput style={styles.input} placeholder="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={!saving} />
            <TextInput
              style={styles.input}
              placeholder={editing ? 'New password (optional)' : 'Initial password'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!saving}
            />
            <Text style={styles.passwordHint}>10+ characters with uppercase, lowercase, and a number. Share the initial password securely.</Text>
            <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={() => { void saveAccount(); }} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{editing ? 'Save changes' : 'Create account'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)} disabled={saving} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F6' },
  header: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  addButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EDB232', alignItems: 'center', justifyContent: 'center' },
  addPlaceholder: { width: 38 },
  subtitle: { color: '#E7F1EF', fontSize: 12, marginTop: 12, marginBottom: 14 },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.16)', padding: 4, borderRadius: 13 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  activeTab: { backgroundColor: '#FFFFFF' },
  tabText: { color: '#E7F1EF', fontWeight: '700' },
  activeTabText: { color: GREEN },
  list: { padding: 16, paddingBottom: 36, flexGrow: 1 },
  loader: { flex: 1 },
  accountCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 11, elevation: 2 },
  archivedCard: { opacity: 0.72 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#E8F3F0', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  accountInfo: { flex: 1 },
  accountName: { color: GREEN, fontSize: 14, fontWeight: '800' },
  accountEmail: { color: '#647570', fontSize: 12, marginTop: 3 },
  roleLabel: { color: TEAL, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 8 },
  iconButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF4F0', alignItems: 'center', justifyContent: 'center' },
  archiveIconButton: { backgroundColor: '#FEECEC' },
  restoreButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EAF4F0', paddingHorizontal: 9, paddingVertical: 8, borderRadius: 11 },
  restoreText: { color: TEAL, fontSize: 11, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText: { color: SAGE, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,25,22,0.55)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20 },
  modalTitle: { color: GREEN, fontSize: 19, fontWeight: '900', marginBottom: 15 },
  input: { borderWidth: 1, borderColor: '#D9E3E0', backgroundColor: '#F8FAF9', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 10, color: GREEN },
  passwordHint: { color: '#6B7C77', fontSize: 11, lineHeight: 16, marginBottom: 13 },
  saveButton: { backgroundColor: TEAL, borderRadius: 13, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.65 },
  saveText: { color: '#FFFFFF', fontWeight: '800' },
  cancelButton: { alignItems: 'center', padding: 12 },
  cancelText: { color: SAGE, fontWeight: '700' },
});
