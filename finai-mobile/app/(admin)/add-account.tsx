import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  SafeAreaView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { getAccountEmoji } from '../../utils/accountEmoji';
import EmojiPicker from '../../components/EmojiPicker';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#8BA19D';
const ACCOUNT_TINT = '#FFF9E6';

export default function AddAccountScreen() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [emoji, setEmoji] = useState('💳'); 
  const [emojiTouched, setEmojiTouched] = useState(false);

  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!emojiTouched) {
      setEmoji(getAccountEmoji(name));
    }
  }, [name, emojiTouched]);

  const handleAddAccount = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Paki-fill up yung pangalan ng account, paps.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/accounts/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ 
          name: name.trim(),
          initial_balance: 0.0,
          icon: emoji.trim() || getAccountEmoji(name),
        }),
      });

      if (response.ok) {
        router.back();
      } else if (response.status === 401) {
        Alert.alert("Session Expired", "Please log in again.");
      } else {
        const errorData = await response.json();
        console.error(errorData); 
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
      <StatusBar barStyle="light-content" />
      
      {/* Modern Gradient Header Banner */}
      <LinearGradient colors={[TEAL, DEEP_GREEN]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>New Account</Text>
          <View style={{ width: 38 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.contentContainer}
      >
        <View style={styles.formCard}>
          <View style={styles.previewRow}>
            <EmojiPicker value={emoji} onChange={(value) => { setEmojiTouched(true); setEmoji(value); }} fallback={getAccountEmoji(name || 'account')} tint={ACCOUNT_TINT} accessibilityLabel="Choose account emoji" />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewHint}>Choose an icon for this account</Text>
              {emojiTouched && (
                <TouchableOpacity onPress={() => setEmojiTouched(false)}>
                  <Text style={styles.resetLink}>Reset to suggested</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.label}>Account Name</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g., BPI, GCash, Maya" 
            placeholderTextColor={SAGE}
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
  previewCircle: { width: 56, height: 56, borderRadius: 18, marginRight: 16, fontSize: 26, padding: 0, backgroundColor: ACCOUNT_TINT },
  previewHint: { fontSize: 12, color: SAGE, fontWeight: '600' },
  resetLink: { fontSize: 11, color: TEAL, fontWeight: '800', marginTop: 4 },
  
  label: { fontSize: 13, fontWeight: '800', color: DEEP_GREEN, marginBottom: 8, letterSpacing: 0.5 },
  input: { 
    backgroundColor: '#F9FAFB', 
    padding: 16, 
    borderRadius: 16, 
    fontSize: 15, 
    marginBottom: 30, 
    borderWidth: 1, 
    borderColor: '#E5E7EB',
    color: DEEP_GREEN,
    fontWeight: '600'
  },
  
  saveBtn: { backgroundColor: TEAL, padding: 18, borderRadius: 16, alignItems: 'center', elevation: 2 },
  saveBtnText: { color: 'white', fontWeight: '800', fontSize: 16 }
});
