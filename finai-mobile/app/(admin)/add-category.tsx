import React, { useState, useEffect } from 'react';
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
  Platform,
  StatusBar
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import EmojiPicker from '../../components/EmojiPicker';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#8BA19D';
const DANGER = '#EF4444';
const INCOME_TINT = '#E8F5E9';
const EXPENSE_TINT = '#FFEBEE';

export default function AddCategoryScreen() {
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [emoji, setEmoji] = useState('');           
  const [emojiTouched, setEmojiTouched] = useState(false); 
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!emojiTouched) {
      setEmoji(getCategoryEmoji(name || 'category', type));
    }
  }, [name, type, emojiTouched]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for the category.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/categories/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ 
          name: name.trim(), 
          type: type,
          icon: emoji.trim() || undefined,
        }),
      });

      if (response.ok) {
        Alert.alert('Category added', 'The category was added successfully.');
        router.back(); 
      } else if (response.status === 401) {
        Alert.alert("Session Expired", "Please log in again.");
      } else {
        Alert.alert('Could not save category', 'Please try again.');
      }
    } catch (error) {
      Alert.alert("Network Error", "Check your server connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Modern Gradient Header Banner */}
      <LinearGradient colors={[TEAL, DEEP_GREEN]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>New Category</Text>
          <View style={{ width: 38 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.contentContainer}
      >
        <View style={styles.formCard}>
          
          {/* Emoji Picker Section */}
          <View style={styles.previewRow}>
            <EmojiPicker value={emoji} onChange={(value) => { setEmojiTouched(true); setEmoji(value); }} fallback={getCategoryEmoji(name || 'category', type)} context={type === 'income' ? 'income' : 'expense'} tint={type === 'income' ? INCOME_TINT : EXPENSE_TINT} accessibilityLabel="Choose category emoji" />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewHint}>Choose an icon for this category</Text>
              {emojiTouched && (
                <TouchableOpacity onPress={() => setEmojiTouched(false)}>
                  <Text style={styles.resetLink}>Reset to suggested</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.label}>Category Name</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g. Groceries, Utilities" 
            placeholderTextColor={SAGE}
            value={name} 
            onChangeText={setName} 
          />

          <Text style={styles.label}>Category Type</Text>
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
  container: { flex: 1, backgroundColor: '#F4F7F6' },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 30, 
    paddingBottom: 25, 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30, 
    elevation: 6,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { padding: 8, backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  
  contentContainer: { flex: 1, padding: 20, marginTop: -15 },
  formCard: { 
    backgroundColor: 'white', 
    padding: 24, 
    borderRadius: 26,
    shadowColor: DEEP_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4
  },
  
  previewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  previewCircle: { width: 56, height: 56, borderRadius: 18, marginRight: 16, fontSize: 26, padding: 0 },
  previewHint: { fontSize: 12, color: SAGE, fontWeight: '600' },
  resetLink: { fontSize: 11, color: TEAL, fontWeight: '800', marginTop: 4 },
  
  label: { fontSize: 13, fontWeight: '800', color: DEEP_GREEN, marginBottom: 8, letterSpacing: 0.5 },
  input: { 
    backgroundColor: '#F9FAFB', 
    padding: 16, 
    borderRadius: 16, 
    fontSize: 15, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: '#E5E7EB',
    color: DEEP_GREEN,
    fontWeight: '600'
  },
  
  typeContainer: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  typeBtn: { 
    flex: 1, 
    padding: 14, 
    borderRadius: 16, 
    backgroundColor: '#F9FAFB', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#E5E7EB' 
  },
  incomeActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  expenseActive: { backgroundColor: DANGER, borderColor: DANGER },
  btnText: { fontWeight: '700', color: '#4B5563' },
  btnTextActive: { fontWeight: '800', color: 'white' },
  
  saveBtn: { backgroundColor: TEAL, padding: 18, borderRadius: 16, alignItems: 'center', elevation: 2 },
  saveBtnText: { color: 'white', fontWeight: '800', fontSize: 16 }
});
