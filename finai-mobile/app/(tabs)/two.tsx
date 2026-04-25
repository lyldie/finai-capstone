import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTransactions, TransactionType } from '../../context/TransactionContext'; 

export default function AddTransactionScreen() {
  const router = useRouter();
  const { addTransaction } = useTransactions(); 

  // --- STATES ---
  const [type, setType] = useState<TransactionType>('Expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('Select Category');
  const [fromAccount, setFromAccount] = useState('Cash'); // Para sa Transfer
  const [toAccount, setToAccount] = useState('GCash');   // Para sa Transfer
  const [isModalVisible, setIsModalVisible] = useState(false);

  // --- DYNAMIC CONTENT ---
  const expenseCategories = [
    { id: 'e1', name: 'Food', icon: 'fast-food-outline' },
    { id: 'e2', name: 'Transpo', icon: 'bus-outline' },
    { id: 'e3', name: 'Bills', icon: 'card-outline' },
    { id: 'e4', name: 'Shopping', icon: 'cart-outline' },
    { id: 'e5', name: 'Health', icon: 'medical-outline' },
    { id: 'e6', name: 'Others', icon: 'ellipsis-horizontal-outline' },
  ];

  const incomeCategories = [
    { id: 'i1', name: 'Salary', icon: 'cash-outline' },
    { id: 'i2', name: 'Allowance', icon: 'wallet-outline' },
    { id: 'i3', name: 'Investment', icon: 'trending-up-outline' },
    { id: 'i4', name: 'Business', icon: 'business-outline' },
    { id: 'i5', name: 'Others', icon: 'add-circle-outline' },
  ];

  const getActiveColor = () => {
    if (type === 'Income') return '#4facfe'; // Blue
    if (type === 'Expense') return '#ff4b2b'; // Red
    return '#9b59b6'; // Purple for Transfer
  };

  const handleSave = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Teka lang paps!", "Kailangan may amount ang transaction mo. 😂");
      return;
    }
    
    // Logic for saving based on type
    const finalCategory = type === 'Transfer' ? `${fromAccount} ➔ ${toAccount}` : category;
    
    if (type !== 'Transfer' && finalCategory === 'Select Category') {
      Alert.alert("Wait lang!", "Pili ka muna ng category paps.");
      return;
    }

    addTransaction(amount, finalCategory, note, type); 

    Alert.alert("Success!", `Na-record na ang iyong ${type}!`, [
      { text: "OK", onPress: () => router.back() }
    ]);
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add {type}</Text>
        <View style={{ width: 28 }} /> 
      </View>

      {/* SEGMENTED CONTROL (3 Options) */}
      <View style={styles.selectorContainer}>
        {(['Income', 'Expense', 'Transfer'] as TransactionType[]).map((t) => (
          <TouchableOpacity 
            key={t}
            style={[styles.selectorItem, type === t && { backgroundColor: getActiveColor() }]} 
            onPress={() => { setType(t); setCategory('Select Category'); }}
          >
            <Text style={[styles.selectorText, type === t && { color: 'white' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Amount</Text>
          <TextInput 
            style={[styles.amountInput, { color: getActiveColor() }]} 
            placeholder="0.00" 
            placeholderTextColor="#666"
            keyboardType="numeric"
            autoFocus={true}
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        {type === 'Transfer' ? (
          /* TRANSFER SPECIFIC FIELDS */
          <View style={styles.transferRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>From</Text>
              <TextInput style={styles.valueText} value={fromAccount} onChangeText={setFromAccount} />
            </View>
            <Ionicons name="arrow-forward" size={20} color="#666" style={{ marginTop: 20 }} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.label}>To</Text>
              <TextInput style={styles.valueText} value={toAccount} onChangeText={setToAccount} />
            </View>
          </View>
        ) : (
          /* INCOME/EXPENSE CATEGORY */
          <TouchableOpacity style={styles.inputGroup} onPress={() => setIsModalVisible(true)}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.row}>
              <Text style={[styles.valueText, category === 'Select Category' && { color: '#666' }]}>{category}</Text>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Note</Text>
          <TextInput 
            style={styles.noteInput} 
            placeholder="Optional note..." 
            placeholderTextColor="#666"
            value={note}
            onChangeText={setNote}
          />
        </View>
      </ScrollView>

      {/* MODAL FOR CATEGORIES */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <FlatList
              data={type === 'Income' ? incomeCategories : expenseCategories}
              keyExtractor={(item) => item.id}
              numColumns={3}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.categoryGridItem}
                  onPress={() => { setCategory(item.name); setIsModalVisible(false); }}
                >
                  <View style={[styles.iconCircle, { backgroundColor: getActiveColor() }]}>
                    <Ionicons name={item.icon as any} size={24} color="white" />
                  </View>
                  <Text style={styles.categoryText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.closeModalButton}>
              <Text style={{color: getActiveColor(), fontWeight: 'bold'}}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TouchableOpacity style={[styles.saveButton, { backgroundColor: getActiveColor() }]} onPress={handleSave}>
        <Text style={styles.saveButtonText}>SAVE {type.toUpperCase()}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 50, marginBottom: 20 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#1e1e1e', borderRadius: 12, padding: 4, marginBottom: 25 },
  selectorItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  selectorText: { color: '#888', fontWeight: 'bold', fontSize: 13 },
  form: { flex: 1 },
  inputGroup: { marginBottom: 25, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  transferRow: { flexDirection: 'row', marginBottom: 25, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10, alignItems: 'center' },
  label: { color: '#888', fontSize: 12, marginBottom: 5 },
  amountInput: { fontSize: 42, fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valueText: { color: 'white', fontSize: 18 },
  noteInput: { color: 'white', fontSize: 16 },
  saveButton: { padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 30, elevation: 5 },
  saveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e1e1e', padding: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '70%' },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 25, textAlign: 'center' },
  categoryGridItem: { flex: 1/3, alignItems: 'center', marginBottom: 25 },
  iconCircle: { width: 55, height: 55, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  categoryText: { color: '#ccc', fontSize: 12, textAlign: 'center' },
  closeModalButton: { padding: 15, alignItems: 'center' }
});