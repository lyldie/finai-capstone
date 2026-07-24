import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  SafeAreaView, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';

export default function AddCategoryScreen() {
  const [name, setName] = useState('');
  const [type, setType] = useState('expense'); // Default to expense
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    if (!name) {
      Alert.alert("Error", "Lagyan mo ng pangalan ang category, paps!");
      return;
    }

    // AUTO-ASSIGN LOGIC:
    // Dito natin tinutukoy yung icon base sa type. 
    // Hindi na kailangang i-input ng user!
    const autoIcon = type === 'income' ? 'trending-up' : 'trending-down';

    setLoading(true);
    try {
      // Sa loob ng handleSave:
const response = await fetch(`${API_URL}/api/categories/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    name: name, 
    type: type, 
    icon: autoIcon,
    category_role: "admin",
    user_id: null
  }),
});

      if (response.ok) {
        Alert.alert("Success", "Added na paps!");
        router.back(); 
      } else {
        Alert.alert("Error", "Hindi ma-save, check backend logs.");
      }
    } catch (error) {
      Alert.alert("Network Error", "Check mo server connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.content}
      >
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1c3c36" />
          </TouchableOpacity>
          <Text style={styles.title}>New Category</Text>
        </View>

        {/* FORM */}
        <View style={styles.form}>
          <Text style={styles.label}>Category Name</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g. Groceries" 
            value={name} 
            onChangeText={setName} 
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeContainer}>
            <TouchableOpacity 
              style={[styles.typeBtn, type === 'income' && styles.incomeActive]} 
              onPress={() => setType('income')}
            >
              <Text style={type === 'income' ? styles.btnTextActive : styles.btnText}>Income</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeBtn, type === 'expense' && styles.expenseActive]} 
              onPress={() => setType('expense')}
            >
              <Text style={type === 'expense' ? styles.btnTextActive : styles.btnText}>Expense</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.saveBtnText}>Save Category</Text>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  content: { flex: 1, padding: 25 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  title: { fontSize: 28, fontWeight: '900', color: '#1c3c36', marginLeft: 15 },
  form: { 
    backgroundColor: 'white', 
    padding: 20, 
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    elevation: 3
  },
  label: { fontSize: 14, fontWeight: '700', color: '#8BA19D', marginBottom: 8 },
  input: { 
    backgroundColor: '#f9f9f9', 
    padding: 15, 
    borderRadius: 20, 
    fontSize: 16, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: '#eee' 
  },
  typeContainer: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  typeBtn: { 
    flex: 1, 
    padding: 15, 
    borderRadius: 20, 
    backgroundColor: '#fff', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#eee' 
  },
  incomeActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  expenseActive: { backgroundColor: '#c62828', borderColor: '#c62828' },
  btnText: { fontWeight: '600', color: '#333' },
  btnTextActive: { fontWeight: '700', color: 'white' },
  saveBtn: { backgroundColor: '#3D7D6C', padding: 20, borderRadius: 30, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});