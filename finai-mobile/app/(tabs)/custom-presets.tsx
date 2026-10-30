import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Modal, TextInput, Alert, ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import EmojiPicker, { getDisplayEmoji } from '../../components/EmojiPicker';
import { getSecureItem } from '../../utils/secureStorage';


const GREEN = '#144A3D';
const API_BASE_URL = `${API_URL}/api`;

// 🛠️ MGA SAFE AT LITERAL NA EMOJI HELPERS PARA SIGURADONG EMOJI ANG LALABAS
export default function CustomPresetsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  
  const [categories, setCategories] = useState<any[]>([]);

  const [isModalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); 
  const [newItemName, setNewItemName] = useState('');
  const [newCatType, setNewCatType] = useState('expense'); 
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
      setNewEmoji(getCategoryEmoji(newItemName || 'category', newCatType));
    }
  }, [newItemName, newCatType, emojiTouched]);

  const fetchData = async (isSilent = false) => {
    if (!user?.id) {
      setCategories([]);
      setIsLoading(false);
      return;
    }
    if (!isSilent) setIsLoading(true); 
    
    try {
      const token = await getSecureItem('user_token');
      const headers = { Authorization: `Bearer ${token || ''}` };
      const catRes = await fetch(`${API_BASE_URL}/categories/?user_id=${encodeURIComponent(user.id)}`, { headers });
      const catData = await readListResponse(catRes, 'Categories');
      const userCategories = catData.filter((item: any) => item.category_role === 'user' && item.user_id === user.id);
      setCategories(userCategories);

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
      setNewCatType(item.type);
      setNewEmoji(getDisplayEmoji(item.icon, getCategoryEmoji(item.name, item.type)));
      setEmojiTouched(true); 
    } else {
      setEditingId(null);
      setNewItemName('');
      setNewCatType('expense');
      setNewEmoji('🍔');
      setEmojiTouched(false); 
    }
    setModalVisible(true);
  };

  const handleSaveItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Name required', 'Enter a name for this item.');
      return;
    }
    const endpoint = 'categories';
    const method = editingId ? 'PUT' : 'POST'; 
    const url = editingId ? `${API_BASE_URL}/${endpoint}/${editingId}` : `${API_BASE_URL}/${endpoint}/`;

    const fallbackEmoji = getCategoryEmoji(newItemName, newCatType);
    const finalEmoji = getDisplayEmoji(newEmoji, fallbackEmoji);

    const payload = { name: newItemName, type: newCatType, user_id: user?.id, icon: finalEmoji };

    try {
      const token = await getSecureItem('user_token');
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setModalVisible(false);
        fetchData(true); 
      } else {
        const itemLabel = 'category';
        let message = `We couldn’t save this ${itemLabel}. Please try again.`;

        if (res.status === 401) {
          message = 'Your session may have expired. Please sign in again, then retry.';
        } else if (res.status === 403) {
          message = `You don’t have permission to change this ${itemLabel}.`;
        } else if (res.status === 404 && editingId) {
          message = `This ${itemLabel} could not be found. Refresh the list and try again.`;
        } else if (res.status === 409) {
          const responseData = await res.json().catch(() => ({}));
          message = typeof responseData.detail === 'string'
            ? responseData.detail
            : `A ${itemLabel} with this name already exists. Choose a different name.`;
        } else if (res.status === 422) {
          message = 'Please check the category name and type, then try again.';
        } else if (res.status >= 500) {
          message = `FinAI couldn’t save your ${itemLabel} right now. Please try again in a moment.`;
        }

        Alert.alert(`Couldn’t save ${itemLabel}`, message);
      }
    } catch (error) {
      const itemLabel = 'category';
      Alert.alert(
        `Couldn’t save ${itemLabel}`,
        'We couldn’t reach FinAI. Check your internet connection and try again.'
      );
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete item', 'Are you sure? This action cannot be undone.', [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          const endpoint = 'categories';
          try {
            const token = await getSecureItem('user_token');
            const res = await fetch(`${API_BASE_URL}/${endpoint}/${id}?user_id=${user?.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token || ''}` } });
            if (res.ok) {
              fetchData(true); 
            } else {
              const errorData = await res.json().catch(() => ({}));
          const itemLabel = 'category';
              const message = res.status === 404
                ? `This ${itemLabel} may already have been removed. Refresh the list and try again.`
                : res.status === 401
                  ? 'Your session may have expired. Please sign in again, then retry.'
                  : typeof errorData.detail === 'string'
                    ? errorData.detail
                    : `We couldn’t delete this ${itemLabel}. Please try again.`;
              Alert.alert(`Couldn’t delete ${itemLabel}`, message);
            }
          } catch (error) {
            const itemLabel = 'category';
            Alert.alert(`Couldn’t delete ${itemLabel}`, 'We couldn’t reach FinAI. Check your internet connection and try again.');
          }
        }
      }
    ]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const displayEmoji = getDisplayEmoji(item.icon, getCategoryEmoji(item.name, item.type));

    return (
      <View style={styles.listItem}>
        <View style={[styles.iconBox, { backgroundColor: item.type === 'income' ? '#e8f5e9' : '#ffebee' }]}>
          <Text style={styles.emoji}>{displayEmoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemSub}>
            {`Type: ${item.type.toUpperCase()}`}
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
        <Text style={styles.headerTitle}>Custom Categories</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <Text style={[styles.sectionDesc, { marginTop: 16, marginBottom: 12 }]}>Manage your personal income and expense categories.</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scrollContent}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.sectionDesc}>You have not created any custom categories yet. Select '+' to add one.</Text>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => openModal()}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { Keyboard.dismiss(); setModalVisible(false); }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit' : 'Add'} Category</Text>
            
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <EmojiPicker
                value={newEmoji}
                onChange={(value) => { setEmojiTouched(true); setNewEmoji(value); }}
                fallback={getCategoryEmoji(newItemName, newCatType)}
                context={newCatType === 'income' ? 'income' : 'expense'}
                tint={newCatType === 'income' ? '#e8f5e9' : '#ffebee'}
                accessibilityLabel="Choose category emoji"
              />
              <Text style={styles.previewHint}>Choose a recognizable icon</Text>
              {emojiTouched && (
                <TouchableOpacity onPress={() => {
                  setEmojiTouched(false);
                  setNewEmoji(getCategoryEmoji(newItemName, newCatType));
                }}>
                  <Text style={[styles.previewHint, { color: GREEN, marginTop: 4, fontWeight: '700' }]}>Reset icon</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ width: '100%', marginBottom: 20 }}>
              <Text style={styles.fieldLabel}>Category name</Text>
              <TextInput
              style={[styles.inputField, { width: '100%', marginBottom: 12, paddingHorizontal: 15 }]}
              placeholder="e.g. Groceries"
              placeholderTextColor="#8A9A86"
              value={newItemName}
              onChangeText={setNewItemName}
              />
            </View>

            <>
              <View style={styles.radioGroup}>
                <TouchableOpacity style={[styles.radioBtn, newCatType === 'expense' && styles.radioBtnActive]} onPress={() => setNewCatType('expense')}>
                  <Text style={[styles.radioText, newCatType === 'expense' && styles.radioTextActive]}>Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.radioBtn, newCatType === 'income' && styles.radioBtnActive]} onPress={() => setNewCatType('income')}>
                  <Text style={[styles.radioText, newCatType === 'income' && styles.radioTextActive]}>Income</Text>
                </TouchableOpacity>
              </View>
            </>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem}>
                <Text style={styles.saveBtnText}>{editingId ? 'Update' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
            </ScrollView>
          </KeyboardAvoidingView>
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
  modalKeyboard: { flex: 1, width: '100%', justifyContent: 'center' },
  modalScroll: { flexGrow: 0, maxHeight: '100%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  modalContent: { backgroundColor: '#FFFFFF', width: '90%', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#142D2A', marginBottom: 20 },
  fieldLabel: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '700', color: '#58706B', marginBottom: 6 },
  fieldLabelRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldHint: { fontSize: 12, lineHeight: 17, color: '#7C9A95', marginTop: -12, marginBottom: 8 },
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
