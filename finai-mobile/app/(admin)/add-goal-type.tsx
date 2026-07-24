import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  SafeAreaView, Alert, StatusBar 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';

export default function AddGoalTypeScreen() {
  const [name, setName] = useState('');
  const router = useRouter();

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Lagyan mo ng pangalan ang goal type, paps!");
      return;
    }

    try {
      // Nagpadala lang tayo ng 'name', automatic na ang icon base sa name
      const response = await fetch(`${API_URL}/api/goal-types/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        router.back();
      } else {
        Alert.alert("Error", "Hindi ma-save, paps.");
      }
    } catch (error) {
      Alert.alert("Error", "Check mo yung connection mo.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1c3c36" />
        </TouchableOpacity>
        <Text style={styles.title}>Add Goal Type</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Goal Type Name</Text>
        <TextInput 
          style={styles.input} 
          placeholder="e.g. Savings, Travel, Gadget"
          value={name}
          onChangeText={setName}
        />
        
        <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
          <Text style={styles.saveBtnText}>Save Goal Type</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25 },
  title: { fontSize: 24, fontWeight: '900', color: '#1c3c36' },
  form: { padding: 25 },
  label: { fontSize: 14, fontWeight: '700', color: '#8BA19D', marginBottom: 8 },
  input: { backgroundColor: '#ffffff', padding: 15, borderRadius: 15, marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
  saveBtn: { backgroundColor: '#3D7D6C', padding: 18, borderRadius: 15, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});