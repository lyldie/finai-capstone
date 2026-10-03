import React, { useState, useCallback } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, SafeAreaView, Alert, Modal, TextInput, Dimensions
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const BG = '#F4F7F6';
const DANGER = '#EF4444';
const INCOME_TINT = '#E8F5E9';
const EXPENSE_TINT = '#FFEBEE';

interface Category {
  _id: string;
  id?: string;
  name: string;
  type: string;
  icon?: string;
  is_archived?: boolean;
}

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'active' | 'archived'>('active');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('expense');
  
  const [editEmoji, setEditEmoji] = useState('');
  const [emojiTouched, setEmojiTouched] = useState(false);

  const router = useRouter();
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      fetchCategories(view);
    }, [view])
  );

  const fetchCategories = async (which: 'active' | 'archived') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/categories/?archived=${which === 'archived'}`, { headers: { Authorization: `Bearer ${user?.token || ''}` } });
      const data = await response.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const archiveCategory = async (id: string) => {
    Alert.alert("Archive Category", "This will hide it from active use. You can restore it anytime from the Archived tab.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive", style: "destructive",
        onPress: async () => {
          const response = await fetch(`${API_URL}/api/categories/${id}/archive`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${user?.token}` },
          });
          if (response.ok) fetchCategories(view);
          else if (response.status === 401) Alert.alert("Session Expired", "Please log in again.");
          else Alert.alert("Error", "Couldn't archive this category.");
        }
      }
    ]);
  };

  const restoreCategory = async (id: string) => {
    const response = await fetch(`${API_URL}/api/categories/${id}/restore`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user?.token}` },
    });
    if (response.ok) fetchCategories(view);
    else if (response.status === 401) Alert.alert("Session Expired", "Please log in again.");
    else Alert.alert("Error", "Couldn't restore this category.");
  };

  // 👈 BAGONG IDINAGDAG: Permanent Delete handler para sa mga na-archive na Categories
  const permanentDeleteCategory = async (id: string) => {
    Alert.alert(
      "Permanent Delete",
      "Sigurado ka bang gusto mong burahin nang tuluyan ang kategoryang ito? Hindi na ito mababawi.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Permanently",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/categories/admin/${id}/permanent`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${user?.token}` },
              });
              
              if (response.ok) {
                fetchCategories(view);
              } else {
                const data = await response.json().catch(() => ({}));
                if (response.status === 401) {
                  Alert.alert("Session Expired", "Please log in again.");
                } else {
                  Alert.alert("Hindi Mabura", data.detail || "May mga active transactions pang gumagamit sa kategoryang ito.");
                }
              }
            } catch (error) {
              Alert.alert("Error", "Check connection.");
            }
          }
        }
      ]
    );
  };

  const openEditModal = (item: Category) => {
    setEditingCategory(item);
    setNewName(item.name);
    setNewType(item.type);
    setEditEmoji(item.icon || getCategoryEmoji(item.name, item.type));
    setEmojiTouched(false);
    setModalVisible(true);
  };

  const updateCategory = async () => {
    if (!editingCategory) return;
    const catId = editingCategory.id || editingCategory._id;
    try {
      const response = await fetch(`${API_URL}/api/categories/${catId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          name: newName,
          type: newType,
          icon: editEmoji.trim() || undefined,
          category_role: 'admin'
        }),
      });
      if (response.ok) {
        setModalVisible(false);
        fetchCategories(view);
      } else if (response.status === 401) {
        Alert.alert("Session Expired", "Please log in again.");
      } else {
        Alert.alert("Error", "Hindi ma-update.");
      }
    } catch (error) {
      Alert.alert("Error", "Check connection.");
    }
  };

  const sections = [
    { title: 'INCOME CATEGORIES', data: categories.filter(c => c.type === 'income') },
    { title: 'EXPENSE CATEGORIES', data: categories.filter(c => c.type === 'expense') },
  ].filter(section => section.data.length > 0);

  const renderCategoryItem = ({ item }: { item: Category }) => {
    const itemId = item._id || item.id || "";
    return (
      <View style={[styles.card, item.is_archived && styles.cardArchived]}>
        <View style={styles.cardInfo}>
          <View style={[
            styles.iconBox,
            { backgroundColor: item.is_archived ? '#E5E7EB' : (item.type === 'income' ? INCOME_TINT : EXPENSE_TINT) }
          ]}>
            <Text style={styles.emoji}>{item.icon || getCategoryEmoji(item.name, item.type)}</Text>
          </View>
          <View>
            <Text style={[styles.cardText, item.is_archived && styles.cardTextArchived]}>{item.name}</Text>
            <Text style={styles.cardTypeLabel}>{item.type.toUpperCase()}</Text>
          </View>
        </View>

        {item.is_archived ? (
          /* 👈 SA ARCHIVED TAB: May Restore pati Permanent Delete button na rin */
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity onPress={() => restoreCategory(itemId)} style={styles.restoreBtn}>
              <Ionicons name="refresh-outline" size={15} color={TEAL} />
              <Text style={styles.restoreText}>Restore</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => permanentDeleteCategory(itemId)} style={[styles.actionIconBtn, { backgroundColor: '#FFEDED' }]}>
              <Ionicons name="trash-outline" size={17} color={DANGER} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionIconBtn}>
              <Ionicons name="pencil-outline" size={17} color={TEAL} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => archiveCategory(itemId)} style={[styles.actionIconBtn, { backgroundColor: '#FFEDED' }]}>
              <Ionicons name="archive-outline" size={17} color={DANGER} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Modern Header Banner */}
      <LinearGradient colors={[TEAL, DEEP_GREEN]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Categories</Text>
          <TouchableOpacity onPress={() => router.push('/(admin)/add-category')} style={styles.addBtnHeader}>
            <Ionicons name="add" size={24} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>

        {/* Floating Tab Row */}
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
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} />
      ) : sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name={view === 'active' ? 'pricetags-outline' : 'archive-outline'} size={48} color={SAGE} />
          <Text style={styles.emptyText}>
            {view === 'active' ? 'No category presets found.' : 'Nothing archived right now.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item._id || item.id || 'cat'}-${index}`}
          renderItem={renderCategoryItem}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Category</Text>

            <View style={styles.previewRow}>
              <TextInput
                style={[styles.previewCircle, { backgroundColor: newType === 'income' ? INCOME_TINT : EXPENSE_TINT }]}
                value={editEmoji}
                onChangeText={(text) => {
                  setEmojiTouched(true);
                  setEditEmoji(text.slice(-2));
                }}
                maxLength={4}
                textAlign="center"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.previewHint}>Tap icon to change emoji</Text>
                {emojiTouched && (
                  <TouchableOpacity onPress={() => {
                    setEmojiTouched(false);
                    setEditEmoji(editingCategory?.icon || getCategoryEmoji(newName, newType));
                  }}>
                    <Text style={styles.resetLink}>Reset icon</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Category Name"
              placeholderTextColor={SAGE}
            />

            <View style={styles.typeContainer}>
              <TouchableOpacity
                style={[styles.typeBtn, newType === 'income' && styles.incomeActive]}
                onPress={() => setNewType('income')}
              >
                <Text style={newType === 'income' ? styles.btnTextActive : styles.btnText}>Income</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, newType === 'expense' && styles.expenseActive]}
                onPress={() => setNewType('expense')}
              >
                <Text style={newType === 'expense' ? styles.btnTextActive : styles.btnText}>Expense</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={updateCategory}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ marginTop: 15 }}>
              <Text style={{ color: SAGE, textAlign: 'center', fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 30, 
    paddingBottom: 20, 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30, 
    elevation: 6,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backBtn: { padding: 8, backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 12 },
  title: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  addBtnHeader: { width: 38, height: 38, borderRadius: 12, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  
  tabRow: { flexDirection: 'row', backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 14, padding: 4, marginTop: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  tabBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#E0F2FE' },
  tabTextActive: { color: DEEP_GREEN, fontWeight: '900' },

  listContent: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  emptyText: { color: SAGE, fontSize: 14, fontWeight: '600' },
  
  sectionHeader: { fontSize: 12, fontWeight: '900', color: SAGE, marginTop: 20, marginBottom: 10, paddingLeft: 4, letterSpacing: 1 },
  
  card: {
    backgroundColor: '#ffffff', padding: 16, borderRadius: 20, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardArchived: { backgroundColor: '#FAFAFA', shadowOpacity: 0, borderWidth: 1, borderColor: '#EEEEEE' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  iconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  emoji: { fontSize: 22 },
  cardText: { fontSize: 16, fontWeight: '800', color: DEEP_GREEN, flexShrink: 1, marginBottom: 2 },
  cardTypeLabel: { fontSize: 10, fontWeight: '700', color: SAGE, letterSpacing: 0.5 },
  cardTextArchived: { color: SAGE },

  actionButtonsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionIconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center' },

  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  restoreText: { color: TEAL, fontWeight: '800', fontSize: 12 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(28, 60, 54, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 26, width: '88%', elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20, color: DEEP_GREEN },
  
  previewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  previewCircle: { width: 54, height: 54, borderRadius: 16, marginRight: 14, fontSize: 26, padding: 0 },
  previewHint: { fontSize: 12, color: SAGE, fontWeight: '600' },
  resetLink: { fontSize: 11, color: TEAL, fontWeight: '800', marginTop: 3 },
  
  input: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, marginBottom: 18, borderWidth: 1, borderColor: '#E5E7EB', color: DEEP_GREEN, fontWeight: '600' },
  saveBtn: { backgroundColor: TEAL, padding: 16, borderRadius: 16, alignItems: 'center', elevation: 2 },
  
  typeContainer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  typeBtn: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: '#F9FAFB', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  incomeActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  expenseActive: { backgroundColor: DANGER, borderColor: DANGER },
  btnText: { fontWeight: '700', color: '#4B5563' },
  btnTextActive: { fontWeight: '800', color: 'white' },
});
