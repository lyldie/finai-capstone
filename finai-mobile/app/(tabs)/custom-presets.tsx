import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Modal, TextInput, Alert, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { getAccountDisplayEmoji, getAccountEmoji } from '../../utils/accountEmoji';
import EmojiPicker, { getDisplayEmoji } from '../../components/EmojiPicker';

const GREEN = '#144A3D';
const API_BASE_URL = `${API_URL}/api`;
const ACCOUNT_TINT = '#fff3da';

// 🛠️ MGA SAFE AT LITERAL NA EMOJI HELPERS PARA SIGURADONG EMOJI ANG LALABAS
export default function CustomPresetsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('categories'); 
  const [isLoading, setIsLoading] = useState(true);
  
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [isModalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); 
  const [newItemName, setNewItemName] = useState('');
  const [newCatType, setNewCatType] = useState('expense'); 
  const [newAccBalance, setNewAccBalance] = useState('');
  const [newEmoji, setNewEmoji] = useState('🍔');            
  const [emojiTouched, setEmojiTouched] = useState(false); 

  const readListResponse = async (response: Response, resourceName: string): Promise<any[]> => {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : `Request failed (${response.status}).`;
      throw new Error(`${resourceName}: ${detail}`);
    }
    if (!Array.isArray(data)) {
      throw new Error(`${resourceName}: the server returned an unexpected response.`);
    }
    return data;
  };

  useEffect(() => {
    if (!emojiTouched) {
      if (activeTab === 'categories') {
        setNewEmoji(getCategoryEmoji(newItemName || 'category', newCatType));
      } else {
        setNewEmoji(getAccountEmoji(newItemName || 'account'));
      }
    }
  }, [newItemName, newCatType, emojiTouched, activeTab]);

  const fetchData = async (isSilent = false) => {
    if (!user?.id) {
      setCategories([]);
      setAccounts([]);
      setIsLoading(false);
      return;
    }
    if (!isSilent) setIsLoading(true); 
    
    try {
      const token = await AsyncStorage.getItem('user_token');
      const headers = { Authorization: `Bearer ${token || ''}` };
      const catRes = await fetch(`${API_BASE_URL}/categories/?user_id=${encodeURIComponent(user.id)}`, { headers });
      const catData = await readListResponse(catRes, 'Categories');
      const userCategories = catData.filter((item: any) => item.category_role === 'user' && item.user_id === user.id);
      setCategories(userCategories);

      const accRes = await fetch(`${API_BASE_URL}/accounts/?user_id=${encodeURIComponent(user.id)}`, { headers });
      const accData = await readListResponse(accRes, 'Accounts');
      const userAccounts = accData.filter((item: any) => item.account_role === 'user' && item.user_id === user.id);
      setAccounts(userAccounts);
    } catch (error) {
      console.error(error);
      Alert.alert('Could not load custom presets', 'Please check your connection and try again.');
    } finally {
      if (!isSilent) setIsLoading(false); 
    }
  };

  useEffect(() => { fetchData(); }, [user?.id]);

  const openModal = (item: any = null) => {
    if (item) {
      setEditingId(item.id);
      setNewItemName(item.name);
      if (activeTab === 'categories') {
        setNewCatType(item.type);
        setNewEmoji(getDisplayEmoji(item.icon, getCategoryEmoji(item.name, item.type)));
      } else {
        setNewAccBalance(item.initial_balance.toString());
        setNewEmoji(getAccountDisplayEmoji(item.icon, item.name));
      }
      setEmojiTouched(true); 
    } else {
      setEditingId(null);
      setNewItemName('');
      setNewAccBalance('');
      setNewCatType('expense');
      setNewEmoji(activeTab === 'categories' ? '🍔' : '💳');
      setEmojiTouched(false); 
    }
    setModalVisible(true);
  };

  const handleSaveItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Name required', 'Enter a name for this item.');
      return;
    }

    const endpoint = activeTab === 'categories' ? 'categories' : 'accounts';
    const method = editingId ? 'PUT' : 'POST'; 
    const url = editingId ? `${API_BASE_URL}/${endpoint}/${editingId}` : `${API_BASE_URL}/${endpoint}/`;

    const fallbackEmoji = activeTab === 'categories' ? getCategoryEmoji(newItemName, newCatType) : getAccountEmoji(newItemName);
    const finalEmoji = getDisplayEmoji(newEmoji, fallbackEmoji);

    const payload = activeTab === 'categories' 
      ? { name: newItemName, type: newCatType, user_id: user?.id, icon: finalEmoji } 
      : { name: newItemName, initial_balance: parseFloat(newAccBalance) || 0.0, user_id: user?.id, icon: finalEmoji };

    try {
      const token = await AsyncStorage.getItem('user_token');
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setModalVisible(false);
        fetchData(true); 
      } else {
        Alert.alert('Error', 'Failed to save data. Check backend endpoints.');
      }
    } catch (error) {
      Alert.alert('Could not save item', 'Check your connection and try again.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete item', 'Are you sure? This action cannot be undone.', [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          const endpoint = activeTab === 'categories' ? 'categories' : 'accounts';
          try {
            const token = await AsyncStorage.getItem('user_token');
            const res = await fetch(`${API_BASE_URL}/${endpoint}/${id}?user_id=${user?.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token || ''}` } });
            if (res.ok) {
              fetchData(true); 
            } else {
              const errorData = await res.json().catch(() => ({}));
              Alert.alert('Could not delete item', errorData.detail || 'Please try again.');
            }
          } catch (error) {
            Alert.alert('Error', 'Network connection failed.');
          }
        }
      }
    ]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const displayEmoji = activeTab === 'categories'
      ? getDisplayEmoji(item.icon, getCategoryEmoji(item.name, item.type))
      : getAccountDisplayEmoji(item.icon, item.name);

    return (
      <View style={styles.listItem}>
        <View style={[styles.iconBox, { backgroundColor: activeTab === 'categories' ? (item.type === 'income' ? '#e8f5e9' : '#ffebee') : ACCOUNT_TINT }]}>
          <Text style={styles.emoji}>{displayEmoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemSub}>
            {activeTab === 'categories' ? `Type: ${item.type.toUpperCase()}` : `Balance: ₱${item.initial_balance}`}
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={() => openModal(item)} style={styles.actionIcon}>
            <Ionicons name="pencil-outline" size={20} color="#58706B" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionIcon}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9F8" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#142D2A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Custom Presets</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'categories' && styles.activeTab]} onPress={() => setActiveTab('categories')}>
          <Text style={[styles.tabText, activeTab === 'categories' && styles.activeTabText]}>Categories</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'accounts' && styles.activeTab]} onPress={() => setActiveTab('accounts')}>
          <Text style={[styles.tabText, activeTab === 'accounts' && styles.activeTabText]}>Accounts</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={activeTab === 'categories' ? categories : accounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scrollContent}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.sectionDesc}>You have not created any custom {activeTab} yet. Select '+' to add one.</Text>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => openModal()}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit' : 'Add Custom'} {activeTab === 'categories' ? 'Category' : 'Account'}</Text>
            
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <EmojiPicker
                value={newEmoji}
                onChange={(value) => { setEmojiTouched(true); setNewEmoji(value); }}
                fallback={activeTab === 'categories' ? getCategoryEmoji(newItemName, newCatType) : getAccountEmoji(newItemName)}
                context={activeTab === 'accounts' ? 'account' : newCatType === 'income' ? 'income' : 'expense'}
                tint={activeTab === 'categories' ? (newCatType === 'income' ? '#e8f5e9' : '#ffebee') : ACCOUNT_TINT}
                accessibilityLabel={activeTab === 'categories' ? 'Choose category emoji' : 'Choose account emoji'}
              />
              <Text style={styles.previewHint}>Choose a recognizable icon</Text>
              {emojiTouched && (
                <TouchableOpacity onPress={() => {
                  setEmojiTouched(false);
                  if (activeTab === 'categories') setNewEmoji(getCategoryEmoji(newItemName, newCatType));
                  else setNewEmoji(getAccountEmoji(newItemName));
                }}>
                  <Text style={[styles.previewHint, { color: GREEN, marginTop: 4, fontWeight: '700' }]}>Reset icon</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput 
              style={[styles.inputField, { width: '100%', marginBottom: 12, paddingHorizontal: 15 }]}
              placeholder={`Enter ${activeTab === 'categories' ? 'Category' : 'Account'} Name`}
              value={newItemName}
              onChangeText={setNewItemName}
            />

            {activeTab === 'categories' ? (
              <View style={styles.radioGroup}>
                <TouchableOpacity style={[styles.radioBtn, newCatType === 'expense' && styles.radioBtnActive]} onPress={() => setNewCatType('expense')}>
                  <Text style={[styles.radioText, newCatType === 'expense' && styles.radioTextActive]}>Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.radioBtn, newCatType === 'income' && styles.radioBtnActive]} onPress={() => setNewCatType('income')}>
                  <Text style={[styles.radioText, newCatType === 'income' && styles.radioTextActive]}>Income</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TextInput 
                style={[styles.inputField, { width: '100%', marginBottom: 20, paddingHorizontal: 15 }]}
                placeholder="Initial Balance (e.g. 1000)"
                keyboardType="numeric"
                value={newAccBalance}
                onChangeText={setNewAccBalance}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem}>
                <Text style={styles.saveBtnText}>{editingId ? 'Update' : 'Save'}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E6ECE9' },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#142D2A' },
  tabContainer: { flexDirection: 'row', margin: 20, backgroundColor: '#E6ECE9', borderRadius: 12, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#8A9A86' },
  activeTabText: { color: GREEN, fontWeight: '800' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionDesc: { fontSize: 14, color: '#7C9A95', textAlign: 'center', marginTop: 30 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E6ECE9' },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  emoji: { fontSize: 18 },
  itemName: { fontSize: 16, fontWeight: '700', color: '#142D2A', marginBottom: 4 },
  itemSub: { fontSize: 12, color: '#8A9A86', fontWeight: '500' },
  actionButtons: { flexDirection: 'row', gap: 10 },
  actionIcon: { padding: 8, backgroundColor: '#F0F4F2', borderRadius: 8 },
  fab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', shadowColor: GREEN, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', width: '90%', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#142D2A', marginBottom: 20 },
  previewCircle: { width: 56, height: 56, borderRadius: 16, fontSize: 26, padding: 0, marginBottom: 8 },
  previewHint: { fontSize: 12, color: '#8A9A86', fontWeight: '500' },
  inputField: { height: 50, fontSize: 16, color: '#142D2A', backgroundColor: '#F7F9F8', borderWidth: 1, borderColor: '#E6ECE9', borderRadius: 12 },
  radioGroup: { flexDirection: 'row', width: '100%', gap: 10, marginBottom: 20 },
  radioBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E6ECE9', alignItems: 'center' },
  radioBtnActive: { backgroundColor: `${GREEN}15`, borderColor: GREEN },
  radioText: { fontSize: 14, fontWeight: '600', color: '#8A9A86' },
  radioTextActive: { color: GREEN },
  modalActions: { flexDirection: 'row', width: '100%', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#F0F4F2', alignItems: 'center' },
  cancelBtnText: { color: '#58706B', fontSize: 15, fontWeight: '700' },
  saveBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
