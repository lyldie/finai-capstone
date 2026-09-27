import React, { useState, useCallback } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, SafeAreaView, Alert, Modal, TextInput
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const BG = '#f4f7f6';
const DANGER = '#c62828';
const INCOME_TINT = '#e8f5e9';
const EXPENSE_TINT = '#ffebee';

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
      const response = await fetch(`${API_URL}/api/categories/?archived=${which === 'archived'}`);
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

  const openEditModal = (item: Category) => {
    setEditingCategory(item);
    setNewName(item.name);
    setNewType(item.type);
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
          icon: editingCategory.icon,
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
    { title: 'INCOME', data: categories.filter(c => c.type === 'income') },
    { title: 'EXPENSE', data: categories.filter(c => c.type === 'expense') },
  ].filter(section => section.data.length > 0);

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <View style={[styles.card, item.is_archived && styles.cardArchived]}>
      <View style={styles.cardInfo}>
        <View style={[
          styles.iconBox,
          { backgroundColor: item.is_archived ? '#ebebeb' : (item.type === 'income' ? INCOME_TINT : EXPENSE_TINT) }
        ]}>
          <Text style={styles.emoji}>{item.icon || getCategoryEmoji(item.name, item.type)}</Text>
        </View>
        <Text style={[styles.cardText, item.is_archived && styles.cardTextArchived]}>{item.name}</Text>
      </View>

      {item.is_archived ? (
        <TouchableOpacity onPress={() => restoreCategory(item._id || item.id || "")} style={styles.restoreBtn}>
          <Ionicons name="refresh-outline" size={16} color={TEAL} />
          <Text style={styles.restoreText}>Restore</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <TouchableOpacity onPress={() => openEditModal(item)}>
            <Ionicons name="pencil-outline" size={19} color={TEAL} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => archiveCategory(item._id || item.id || "")}>
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
        <Text style={styles.title}>Categories</Text>
        <TouchableOpacity onPress={() => router.push('/(admin)/add-category')}>
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
      ) : sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name={view === 'active' ? 'pricetags-outline' : 'archive-outline'} size={40} color={SAGE} />
          <Text style={styles.emptyText}>
            {view === 'active' ? 'No category presets yet.' : 'Nothing archived right now.'}
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
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Category</Text>
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
  tabRow: { flexDirection: 'row', marginHorizontal: 25, marginBottom: 12, backgroundColor: '#e9efec', borderRadius: 14, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  tabBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '700', color: SAGE },
  tabTextActive: { color: DEEP_GREEN },
  listContent: { paddingHorizontal: 25, paddingBottom: 30 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText: { color: SAGE, fontSize: 14, fontWeight: '500' },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: SAGE, marginTop: 18, marginBottom: 8, paddingLeft: 4, letterSpacing: 0.5 },
  card: {
    backgroundColor: '#ffffff', padding: 16, borderRadius: 18, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardArchived: { backgroundColor: '#f7f7f7', shadowOpacity: 0 },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  iconBox: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  emoji: { fontSize: 20 },
  cardText: { fontSize: 16, fontWeight: '700', color: DEEP_GREEN, flexShrink: 1 },
  cardTextArchived: { color: SAGE },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eaf3f0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  restoreText: { color: TEAL, fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 22, width: '85%' },
  modalTitle: { fontSize: 19, fontWeight: '800', marginBottom: 18, color: DEEP_GREEN },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 14, marginBottom: 18, borderWidth: 1, borderColor: '#eee', color: DEEP_GREEN },
  saveBtn: { backgroundColor: TEAL, padding: 15, borderRadius: 14, alignItems: 'center' },
  typeContainer: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
  incomeActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  expenseActive: { backgroundColor: DANGER, borderColor: DANGER },
  btnText: { fontWeight: '600', color: '#333' },
  btnTextActive: { fontWeight: '700', color: 'white' },
});