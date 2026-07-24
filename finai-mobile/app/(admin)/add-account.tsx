import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  SafeAreaView, Alert, ActivityIndicator 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';

export default function AddAccountScreen() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAddAccount = async () => {
  if (!name) {
    Alert.alert("Error", "Paki-fill up yung pangalan ng account, paps.");
    return;
  }

  setLoading(true);
  try {
    const response = await fetch(`${API_URL}/api/accounts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // I-match ang payload sa AccountCreate schema
      body: JSON.stringify({ 
        name: name,
        user_id: null,        // Default null for now
        account_role: "admin" // Default admin
      }),
    });

    if (response.ok) {
      router.back();
    } else {
      const errorData = await response.json();
      console.error(errorData); // Para makita mo sa console kung bakit nag-fail
      Alert.alert("Error", "Hindi makapag-add ng account.");
    }
  } catch (error) {
    Alert.alert("Network Error", "Check mo server, paps.");
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1c3c36" />
        </TouchableOpacity>
        <Text style={styles.title}>Add Account</Text>
        <View style={{width: 24}} /> 
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Account Name</Text>
        <TextInput 
          style={styles.input} 
          placeholder="e.g., BPI, Maya" 
          value={name} 
          onChangeText={setName} 
        />

        <TouchableOpacity 
          style={[styles.saveBtn, loading && {opacity: 0.7}]} 
          onPress={handleAddAccount}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.saveBtnText}>Save Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1c3c36' },
  form: { padding: 25 },
  label: { fontSize: 16, fontWeight: '600', color: '#1c3c36', marginBottom: 10 },
  input: { backgroundColor: 'white', padding: 15, borderRadius: 15, marginBottom: 20, fontSize: 16, borderWidth: 1, borderColor: '#eee' },
  saveBtn: { backgroundColor: '#3D7D6C', padding: 18, borderRadius: 15, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});