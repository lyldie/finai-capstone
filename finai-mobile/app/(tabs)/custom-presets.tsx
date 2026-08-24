import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, StatusBar, Modal, TextInput, Alert, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config'; // 👈 1. IDINAGDAG NATIN ITO PARA TAWAGIN SI CONFIG.JS

const GREEN = '#144A3D';

// 👈 2. PINALITAN NATIN YUNG HARDCODED IP NG VARIABLE GALING SA CONFIG
const API_BASE_URL = `${API_URL}/api`;

export default function CustomPresetsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' or 'accounts'
  const [isLoading, setIsLoading] = useState(true);
  
  // Data States
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Modal States
  const [isModalVisible, setModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newCatType, setNewCatType] = useState('expense'); // 'expense' or 'income'
  const [newAccBalance, setNewAccBalance] = useState('');

  // 1. FETCH DATA MULA SA BACKEND
  const fetchData = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      // Fetch Categories
      const catRes = await fetch(`${API_BASE_URL}/categories?user_id=${user.id}`);
      const catData = await catRes.json();
      // I-filter: ipakita lang yung gawa ng user
      const userCategories = catData.filter((item: any) => item.category_role === 'user' && item.user_id === user.id);
      setCategories(userCategories);

      // Fetch Accounts
      const accRes = await fetch(`${API_BASE_URL}/accounts?user_id=${user.id}`);
      const accData = await accRes.json();
      // I-filter: ipakita lang yung gawa ng user
      const userAccounts = accData.filter((item: any) => item.account_role === 'user' && item.user_id === user.id);
      setAccounts(userAccounts);

    } catch (error) {
      Alert.alert('Error', 'Hindi makuha ang data mula sa server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);


  // 2. SAVE BAGONG ITEM SA BACKEND
  const handleSaveItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Oops!', 'Paki-lagyan ng pangalan paps.');
      return;
    }

    try {
      if (activeTab === 'categories') {
        const payload = {
          name: newItemName,
          type: newCatType,
          user_id: user?.id,
          icon: 'pricetag-outline' // default icon
        };
        const res = await fetch(`${API_BASE_URL}/categories/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          Alert.alert('Success', 'Category saved!');
        }
      } else {
        const payload = {
          name: newItemName,
          initial_balance: parseFloat(newAccBalance) || 0.0,
          user_id: user?.id,
          icon: 'wallet' // default icon
        };
        const res = await fetch(`${API_BASE_URL}/accounts/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          Alert.alert('Success', 'Account saved!');
        }
      }

      // Refresh list at isara ang modal
      setModalVisible(false);
      setNewItemName('');
      setNewAccBalance('');
      fetchData(); 

    } catch (error) {
      Alert.alert('Error', 'Hindi ma-save sa backend. Check connection.');
    }
  };

  // 3. UI RENDERER PARA SA LISTAHAN
  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.listItem}>
      <View style={[styles.iconBox, { backgroundColor: `${GREEN}15` }]}>
        <Ionicons name={item.icon || "folder-outline"} size={20} color={GREEN} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemSub}>
          {activeTab === 'categories' ? `Type: ${item.type.toUpperCase()}` : `Balance: ₱${item.initial_balance}`}
        </Text>
      </View>
      {/* TODO Next Session: Pwede natin dagdagan ng Delete function dito kung gusto niyo! */}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9F8" />
      
      {/* HEADER WITH BACK BUTTON */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#142D2A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Custom Presets</Text>
        <View style={{ width: 24 }} /> 
      </View>

      {/* CUSTOM TOGGLE TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'categories' && styles.activeTab]}
          onPress={() => setActiveTab('categories')}
        >
          <Text style={[styles.tabText, activeTab === 'categories' && styles.activeTabText]}>Categories</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'accounts' && styles.activeTab]}
          onPress={() => setActiveTab('accounts')}
        >
          <Text style={[styles.tabText, activeTab === 'accounts' && styles.activeTabText]}>Accounts</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT AREA */}
      {isLoading ? (
        <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={activeTab === 'categories' ? categories : accounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scrollContent}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.sectionDesc}>
              Wala ka pang ginagawang custom {activeTab}. Pindutin ang '+' para magdagdag!
            </Text>
          }
        />
      )}

      {/* ADD NEW BUTTON */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ADD ITEM MODAL */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Custom {activeTab === 'categories' ? 'Category' : 'Account'}</Text>
            
            <TextInput 
              style={[styles.inputField, { width: '100%', marginBottom: 12, paddingHorizontal: 15 }]}
              placeholder={`Enter ${activeTab === 'categories' ? 'Category' : 'Account'} Name`}
              value={newItemName}
              onChangeText={setNewItemName}
            />

            {/* Extra inputs depende sa tab */}
            {activeTab === 'categories' ? (
              <View style={styles.radioGroup}>
                <TouchableOpacity 
                  style={[styles.radioBtn, newCatType === 'expense' && styles.radioBtnActive]}
                  onPress={() => setNewCatType('expense')}
                >
                  <Text style={[styles.radioText, newCatType === 'expense' && styles.radioTextActive]}>Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.radioBtn, newCatType === 'income' && styles.radioBtnActive]}
                  onPress={() => setNewCatType('income')}
                >
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
                <Text style={styles.saveBtnText}>Save</Text>
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
  
  // List Item Styles
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E6ECE9' },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  itemName: { fontSize: 16, fontWeight: '700', color: '#142D2A', marginBottom: 4 },
  itemSub: { fontSize: 12, color: '#8A9A86', fontWeight: '500' },

  fab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', shadowColor: GREEN, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#142D2A', marginBottom: 20 },
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