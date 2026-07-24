import React, { useState, useCallback } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  ActivityIndicator, StatusBar, SafeAreaView, Alert, Modal, TextInput 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';
import { getIcon } from '../../utils/iconHelper'; // Import natin yung smart helper

interface GoalType {
  id: string;
  name: string;
}

export default function GoalTypesScreen() {
  const [goalTypes, setGoalTypes] = useState<GoalType[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoalType, setEditingGoalType] = useState<GoalType | null>(null);
  const [newName, setNewName] = useState('');

  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchGoalTypes();
    }, [])
  );

  const fetchGoalTypes = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/goal-types/`);
      const data = await response.json();
      setGoalTypes(data);
    } catch (error) {
      console.error("Error fetching goal types:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteGoalType = async (id: string) => {
    Alert.alert("Delete Goal Type", "Sigurado ka bang i-de-delete mo 'to, paps?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          const response = await fetch(`${API_URL}/api/goal-types/${id}`, { method: 'DELETE' });
          if (response.ok) fetchGoalTypes();
        }
      }
    ]);
  };

  const openEditModal = (item: GoalType) => {
    setEditingGoalType(item);
    setNewName(item.name);
    setModalVisible(true);
  };

  const updateGoalType = async () => {
    if (!editingGoalType) return;
    try {
      const response = await fetch(`${API_URL}/api/goal-types/${editingGoalType.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }), // Inalis na natin ang icon dito
      });
      if (response.ok) {
        setModalVisible(false);
        fetchGoalTypes();
      } else Alert.alert("Error", "Hindi ma-update.");
    } catch (error) {
      Alert.alert("Error", "Check connection.");
    }
  };

  const renderItem = ({ item }: { item: GoalType }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <View style={styles.iconBox}>
          {/* Dito tinatawag ang smart helper function */}
          <Ionicons name={getIcon(item.name) as any} size={20} color="#edb232" />
        </View>
        <Text style={styles.cardText}>{item.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 15 }}>
        <TouchableOpacity onPress={() => openEditModal(item)}><Ionicons name="pencil-outline" size={20} color="#3D7D6C" /></TouchableOpacity>
        <TouchableOpacity onPress={() => deleteGoalType(item.id)}><Ionicons name="trash-outline" size={20} color="#c62828" /></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#1c3c36" /></TouchableOpacity>
        <Text style={styles.title}>Goal Types</Text>
        <TouchableOpacity onPress={() => router.push('/(admin)/add-goal-type')}><Ionicons name="add-circle" size={38} color="#edb232" /></TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#3D7D6C" style={{flex: 1}} /> : (
        <FlatList
          data={goalTypes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Goal Type</Text>
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} />
            <TouchableOpacity style={styles.saveBtn} onPress={updateGoalType}><Text style={{color: 'white', fontWeight: 'bold'}}>Save Changes</Text></TouchableOpacity>
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