import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTransactions } from '../context/TransactionContext'; 

const FINAI_DEEP_GREEN = '#144A3D';
const FINAI_SAGE = '#8A9A86';
const FINAI_LIGHT_BG = '#F7F9F8';
const FINAI_CARD_BG = '#FFFFFF';

const PERIODS = ['Weekly', 'Monthly', 'Yearly'];

export default function SetBudgetScreen() {
  const router = useRouter();
  const { id, amount: initialAmount, categoryName, category_id } = useLocalSearchParams();
  
  const { categories, budgets, fetchTransactions, updateBudget } = useTransactions();
  
  const expenseCategories = categories?.filter((c: any) => c.type === 'expense') || [];

  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('Monthly');
  const [amount, setAmount] = useState(initialAmount as string || '');
  const [loading, setLoading] = useState(false);

  // FIX: Dito ang magic. Filter logic based on mode
  const existingBudgetCategoryIds = budgets.map(b => b.category_id);
  
  const availableCategories = expenseCategories.filter((c: any) => {
    // Kung may 'id' (Edit Mode), i-include lang natin yung current category 
    // at yung mga categories na wala pa sa budgets.
    if (id) {
      return !existingBudgetCategoryIds.includes(c.id) || c.id === category_id;
    }
    // Kung walang 'id' (Create Mode), i-filter out lahat ng may budget na
    return !existingBudgetCategoryIds.includes(c.id);
  });

  useEffect(() => {
    if (category_id) {
      const found = categories.find((c: any) => c.id === String(category_id));
      if (found) setSelectedCategory(found);
    }
  }, [category_id, categories]);

  const handleSaveBudget = async () => {
    if (!selectedCategory) {
      Alert.alert("Teka muna paps!", "Pumili ka muna ng kategorya.");
      return;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert("Teka muna paps!", "Maglagay ka naman ng tamang halaga.");
      return;
    }

    setLoading(true);
    
    if (id) {
      await updateBudget(id as string, parseFloat(amount));
      setLoading(false);
      await fetchTransactions();
      Alert.alert("Ayos paps!", "Na-update na ang budget.", [{ text: "Solid!", onPress: () => router.back() }]);
      return;
    }

    try {
      const userId = await AsyncStorage.getItem('user_id');
      const currentDate = new Date();
      const currentMonthYear = `${String(currentDate.getMonth() + 1).padStart(2, '0')}-${currentDate.getFullYear()}`;

      const payload = {
        user_id: userId,
        category_id: selectedCategory?.id, 
        amount: parseFloat(amount),
        period: selectedPeriod,
        month_year: currentMonthYear 
      };

      await axios.post('http://192.168.1.67:8000/api/budgets/set-limit', payload);
      await fetchTransactions(); 
      Alert.alert("Ayos paps! 🎉", "Ligtas at na-save na sa MongoDB.", [{ text: "Solid!", onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert("Sablay paps 😭", "Hindi maipadala ang data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={FINAI_DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>{id ? "Edit Budget" : "Set Limit"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.welcomeSection}>
          <Text style={styles.title}>{id ? "Edit Limit ✏️" : "Set Budget Limit 💰"}</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Kategorya</Text>
          {id ? (
            <View style={[styles.chip, { backgroundColor: '#EBF0EE', borderColor: '#D1D9D4' }]}>
              <Text style={{ color: FINAI_DEEP_GREEN, fontWeight: '700', fontSize: 13 }}>
                {selectedCategory?.name || categoryName}
              </Text>
            </View>
          ) : (
            <View style={styles.pickerContainer}>
              {availableCategories.map((cat: any) => (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[styles.chip, selectedCategory?.id === cat.id && styles.activeChip]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.chipText, selectedCategory?.id === cat.id && styles.activeChipText]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {!id && (
          <View style={styles.formCard}>
            <Text style={styles.label}>Siklo ng Badyet</Text>
            <View style={styles.row}>
              {PERIODS.map((p) => (
                <TouchableOpacity key={p} style={[styles.periodBtn, selectedPeriod === p && styles.activePeriodBtn]} onPress={() => setSelectedPeriod(p)}>
                  <Text style={[styles.periodText, selectedPeriod === p && styles.activePeriodText]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.formCard}>
          <Text style={styles.label}>Magkano ang Limit (₱)</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.currencySymbol}>₱</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={amount} onChangeText={setAmount} />
          </View>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{id ? "I-update Budget" : "I-save Budget Limit"}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FINAI_LIGHT_BG },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EBF0EE' },
  backButton: { padding: 8, borderRadius: 8, backgroundColor: '#F0F4F2' },
  appBarTitle: { fontSize: 16, fontWeight: '700', color: FINAI_DEEP_GREEN },
  scrollContent: { paddingBottom: 40, paddingHorizontal: 20 },
  welcomeSection: { marginVertical: 20 },
  title: { fontSize: 24, fontWeight: '800', color: FINAI_DEEP_GREEN, marginBottom: 6 },
  formCard: { backgroundColor: FINAI_CARD_BG, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EBF0EE', marginBottom: 16, elevation: 2 },
  label: { fontSize: 13, fontWeight: '700', color: FINAI_DEEP_GREEN, marginBottom: 12, textTransform: 'uppercase' },
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F0F4F2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E6ECE9' },
  activeChip: { backgroundColor: FINAI_DEEP_GREEN, borderColor: FINAI_DEEP_GREEN },
  chipText: { color: FINAI_SAGE, fontSize: 13, fontWeight: '600' },
  activeChipText: { color: '#FFF', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  periodBtn: { flex: 1, backgroundColor: '#F0F4F2', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E6ECE9' },
  activePeriodBtn: { backgroundColor: FINAI_DEEP_GREEN, borderColor: FINAI_DEEP_GREEN },
  periodText: { color: FINAI_SAGE, fontSize: 13, fontWeight: '600' },
  activePeriodText: { color: '#FFF', fontWeight: '700' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFBFB', borderRadius: 12, borderWidth: 1, borderColor: '#E6ECE9', paddingHorizontal: 14 },
  currencySymbol: { fontSize: 20, fontWeight: '700', color: FINAI_DEEP_GREEN, marginRight: 8 },
  input: { flex: 1, color: FINAI_DEEP_GREEN, paddingVertical: 14, fontSize: 18, fontWeight: '700' },
  actionContainer: { marginTop: 12 },
  saveButton: { backgroundColor: FINAI_DEEP_GREEN, paddingVertical: 16, borderRadius: 14, alignItems: 'center', elevation: 3 },
  saveButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});