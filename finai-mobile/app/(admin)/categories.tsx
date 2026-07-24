import React, { useState, useCallback } from 'react';
import { 
  View, Text, SectionList, TouchableOpacity, StyleSheet, 
  ActivityIndicator, StatusBar, SafeAreaView, Alert, Modal, TextInput 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getIcon } from '../../utils/iconHelper';
import { API_URL } from '../../config';

interface Category {
  _id: string;
  id?: string;
  name: string;
  type: string;
  icon?: string;
}

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('expense');

  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchCategories();
    }, [])
  );

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/categories/`);
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (id: string) => {
    Alert.alert("Delete Category", "Sigurado ka bang i-de-delete mo 'to, paps?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          const response = await fetch(`${API_URL}/api/categories/${id}`, { method: 'DELETE' });
          if (response.ok) fetchCategories();
          else Alert.alert("Error", "Hindi ma-delete.");
        }
      }
    ]);
  };

  const openEditModal = (item: Category) => {
    setEditingCategory(item);
    setNewName(item.name);
    setNewType(item.type);
    setModalVisible(true);
  };

  // Siguraduhin na 'id' ang gamit sa fetch URL
  const updateCategory = async () => {
    if (!editingCategory) return;
    
    // I-handle kung alin ang gagamitin: .id ang priority
    const catId = editingCategory.id || editingCategory._id;

    try {
      const response = await fetch(`${API_URL}/api/categories/${catId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newName, 
          type: newType, 
          icon: editingCategory.icon 
        }),
      });
      // ... etc
      if (response.ok) {
        setModalVisible(false);
        fetchCategories();
      } else Alert.alert("Error", "Hindi ma-update.");
    } catch (error) {
      Alert.alert("Error", "Check connection.");
    }
  };

  const sections = [
    { title: 'INCOME', data: categories.filter(c => c.type === 'income') },
    { title: 'EXPENSE', data: categories.filter(c => c.type === 'expense') },
  ].filter(section => section.data.length > 0);

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <View style={[styles.iconBox, { backgroundColor: item.type === 'income' ? '#e8f5e9' : '#ffebee' }]}>
          <Ionicons 
            name={getIcon(item.name) as any} 
            size={20} 
            color={item.type === 'income' ? "#2e7d32" : "#c62828"} 
          />
        </View>
        <Text style={styles.cardText}>{item.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 15 }}>
        <TouchableOpacity onPress={() => openEditModal(item)}><Ionicons name="pencil-outline" size={20} color="#3D7D6C" /></TouchableOpacity>
        <TouchableOpacity onPress={() => deleteCategory(item._id || item.id || "")}><Ionicons name="trash-outline" size={20} color="#c62828" /></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#1c3c36" /></TouchableOpacity>
        <Text style={styles.title}>Categories</Text>
        <TouchableOpacity onPress={() => router.push('/(admin)/add-category')}><Ionicons name="add-circle" size={38} color="#edb232" /></TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#3D7D6C" style={{flex: 1}} /> : (
        <SectionList
          sections={sections}
          // Paps, ito ang pinaka-stable na keyExtractor para sa panel defense:
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
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Category Name" />
            <TouchableOpacity style={styles.saveBtn} onPress={updateCategory}><Text style={{color: 'white', fontWeight: 'bold'}}>Save Changes</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{marginTop: 15}}><Text style={{color: '#8BA19D', textAlign: 'center'}}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25 },
  title: { fontSize: 32, fontWeight: '900', color: '#1c3c36', fontStyle: 'italic' },
  listContent: { paddingHorizontal: 25, paddingBottom: 40 },
  sectionHeader: { fontSize: 14, fontWeight: '800', color: '#8BA19D', marginTop: 20, marginBottom: 10, paddingLeft: 5 },
  card: { backgroundColor: '#ffffff', padding: 16, borderRadius: 20, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  cardInfo: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardText: { fontSize: 16, fontWeight: '600', color: '#1c3c36' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 20, width: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#1c3c36' },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 15, marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
  saveBtn: { backgroundColor: '#3D7D6C', padding: 15, borderRadius: 15, alignItems: 'center' }
});