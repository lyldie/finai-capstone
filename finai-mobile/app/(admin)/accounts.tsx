import React, { useState, useCallback } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  ActivityIndicator, StatusBar, SafeAreaView, Alert, Modal, TextInput 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';
import { getIcon } from '../../utils/iconHelper';

interface Account {
  id: string; // Binago natin mula _id para mag-match sa backend response
  name: string;
}

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [newName, setNewName] = useState('');

  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
    }, [])
  );

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/accounts/`);
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!id) return;
    Alert.alert("Delete Account", "Sigurado ka bang i-de-delete mo 'to, paps?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          const response = await fetch(`${API_URL}/api/accounts/${id}`, { method: 'DELETE' });
          if (response.ok) fetchAccounts();
          else Alert.alert("Error", "Hindi ma-delete.");
        }
      }
    ]);
  };

  const openEditModal = (item: Account) => {
    setEditingAccount(item);
    setNewName(item.name);
    setModalVisible(true);
  };

  const updateAccount = async () => {
    // Dito ang fix: gagamit na tayo ng .id (galing sa backend)
    if (!editingAccount || !editingAccount.id) return;

    try {
      const response = await fetch(`${API_URL}/api/accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (response.ok) {
        setModalVisible(false);
        fetchAccounts();
      } else Alert.alert("Error", "Hindi ma-update ang account.");
    } catch (error) {
      Alert.alert("Error", "Check connection.");
    }
  };

  const renderAccountItem = ({ item, index }: { item: Account, index: number }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <View style={styles.iconBox}>
          <Ionicons name={getIcon(item.name) as any} size={20} color="#edb232" />
        </View>
        <Text style={styles.cardText}>{item.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 15 }}>
        <TouchableOpacity onPress={() => openEditModal(item)}><Ionicons name="pencil-outline" size={20} color="#3D7D6C" /></TouchableOpacity>
        <TouchableOpacity onPress={() => deleteAccount(item.id)}><Ionicons name="trash-outline" size={20} color="#c62828" /></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#1c3c36" /></TouchableOpacity>
        <Text style={styles.title}>Accounts</Text>
        <TouchableOpacity onPress={() => router.push('/(admin)/add-account')}><Ionicons name="add-circle" size={38} color="#edb232" /></TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#3D7D6C" style={{flex: 1}} /> : (
        <FlatList
          data={accounts}
          // Dito ang fix sa unique key:
          keyExtractor={(item, index) => item.id ? item.id : index.toString()}
          renderItem={renderAccountItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Account</Text>
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Account Name" />
            <TouchableOpacity style={styles.saveBtn} onPress={updateAccount}><Text style={{color: 'white', fontWeight: 'bold'}}>Save Changes</Text></TouchableOpacity>
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
  listContent: { paddingHorizontal: 25 },
  card: { backgroundColor: '#ffffff', padding: 16, borderRadius: 20, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  cardInfo: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff8e1', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardText: { fontSize: 16, fontWeight: '600', color: '#1c3c36' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 20, width: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#1c3c36' },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 15, marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
  saveBtn: { backgroundColor: '#3D7D6C', padding: 15, borderRadius: 15, alignItems: 'center' }
});