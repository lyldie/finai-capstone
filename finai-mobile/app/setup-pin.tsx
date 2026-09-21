import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, TextInput, 
  Alert, StatusBar, Platform, KeyboardAvoidingView, ScrollView, Pressable, ActivityIndicator, Keyboard 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const CREAM = '#FAF7F2';

export default function SetupPinScreen() {
  const [pin, setPin] = useState('');
  const [income, setIncome] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDate, setGoalDate] = useState(''); 
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<TextInput>(null); 
  const router = useRouter();
  
  const { user } = useAuth();

  const handleConfirmPinAndSetup = async () => {
    Keyboard.dismiss();

    if (pin.length !== 4) {
      Alert.alert("Wait lang paps!", "Kailangan 4 digits ang PIN mo para safe.");
      return;
    }

    if (!income.trim() || !goalName.trim() || !goalAmount.trim() || !goalDate.trim()) {
      Alert.alert("Kulang paps!", "Paki-sagutan ang Monthly Income at Goal details para may baseline si FinAi.");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(goalDate.trim())) {
      Alert.alert("Invalid Date", "Paki-sulat ang Target Date sa format na YYYY-MM-DD (Halimbawa: 2026-12-31).");
      return;
    }

    const parsedTargetDate = new Date(goalDate.trim());
    if (isNaN(parsedTargetDate.getTime())) {
      Alert.alert("Invalid Date", "Hindi yata totoong petsa 'yan paps.");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedTargetDate <= today) {
      Alert.alert("Invalid Date", "Dapat sa future ang target date mo paps, lagpas sa araw na ito!");
      return;
    }

    const parsedIncome = parseFloat(income);
    const parsedGoalAmount = parseFloat(goalAmount);

    if (isNaN(parsedIncome) || parsedIncome <= 0) {
      Alert.alert("Invalid Amount", "Paki-check ang Monthly Income mo paps.");
      return;
    }

    if (isNaN(parsedGoalAmount) || parsedGoalAmount <= 0) {
      Alert.alert("Invalid Amount", "Paki-check ang Target Savings Amount mo paps.");
      return;
    }

    setLoading(true);

    try {
      const userId = user?.id || await AsyncStorage.getItem('user_id');
      if (!userId) {
        Alert.alert("Session Error", "Hindi mahanap ang user session. Subukang mag-register ulit paps.");
        router.replace('/signup');
        return;
      }

      const payload = {
        user_id: userId,
        pin: pin,
        monthly_income: parsedIncome,
        target_name: goalName.trim(),
        target_amount: parsedGoalAmount,
        target_date: goalDate.trim()
      };

      const response = await fetch(`${API_URL}/initial-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const res = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('user_pin', pin);

        Alert.alert(
          "Setup Complete! 🚀🛡️", 
          "Selyado na ang security at financial profile mo paps. Pwede ka nang mag-login!", 
          [
            { 
              text: "Let's Go!", 
              onPress: () => router.replace('/login') 
            }
          ]
        );
      } else {
        Alert.alert("Backend Error", res.detail || "May mali sa pagsisave ng profile setup paps.");
      }

    } catch (error) {
      console.error(error);
      Alert.alert("Connection Error", "Hindi maabot ang server. Siguraduhing tumatakbo ang backend paps.");
    } finally {
      setLoading(false);
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const isFormComplete = pin.length === 4 && income && goalName && goalAmount && goalDate;

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }} 
        bounces={true} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        
        <LinearGradient
          colors={[DEEP_GREEN, TEAL]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.headerText}>Account{"\n"}Onboarding</Text>
          <Ionicons name="rocket-outline" size={80} color="rgba(255,255,255,0.2)" style={styles.headerIcon} />
        </LinearGradient>

        <View style={styles.content}>
          
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🔒 SECURITY LOCK</Text>
            <Text style={styles.instruction}>Enter a 4-digit PIN to secure your wallet</Text>
            
            <Pressable style={styles.pinWrapper} onPress={focusInput} disabled={loading}>
              <View style={styles.pinContainer}>
                {[...Array(4)].map((_, i) => (
                  <View key={i} style={[styles.dot, pin.length > i && styles.dotActive]} />
                ))}
              </View>
            </Pressable>

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              maxLength={4}
              value={pin}
              onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ''))}
              autoFocus={true}
              editable={!loading}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>💰 MONTHLY BASELINE</Text>
            <Text style={styles.label}>Magkano ang monthly income mo paps?</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 25000"
              placeholderTextColor={SAGE}
              keyboardType="numeric"
              value={income}
              onChangeText={setIncome}
              editable={!loading}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎯 FIRST FINANCIAL GOAL</Text>
            
            <Text style={styles.label}>Target Name (Ano ang pinag-iipunan mo?)</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. Emergency Fund / Laptop"
              placeholderTextColor={SAGE}
              value={goalName}
              onChangeText={setGoalName}
              editable={!loading}
            />

            <Text style={styles.label}>Target Savings Amount (Magkano ang target ipon?)</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 15000"
              placeholderTextColor={SAGE}
              keyboardType="numeric"
              value={goalAmount}
              onChangeText={setGoalAmount}
              editable={!loading}
            />

            <Text style={styles.label}>Target Date (Kailan mo gustong makamit? YYYY-MM-DD)</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 2026-12-31"
              placeholderTextColor={SAGE}
              value={goalDate}
              onChangeText={setGoalDate}
              editable={!loading}
            />
          </View>

          <View style={styles.buttonWrapper}>
            <TouchableOpacity 
              style={[styles.button, (!isFormComplete || loading) && { opacity: 0.5 }]}
              onPress={handleConfirmPinAndSetup}
              disabled={!isFormComplete || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>SAVE PROFILE SETUP</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.footerNote}>PIN, Income baseline, at initial Goal ay pasok sa FinAi scope paps.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: {
    height: 220,
    borderBottomRightRadius: 80,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 50,
  },
  headerText: { color: '#fff', fontSize: 34, fontWeight: '900' },
  headerIcon: { position: 'absolute', right: 20, bottom: 20 },
  content: { 
    flex: 1, 
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: DEEP_GREEN, marginBottom: 15, letterSpacing: 1 },
  instruction: { fontSize: 14, color: SAGE, marginBottom: 10, fontWeight: '500' },
  pinWrapper: { paddingVertical: 10, alignItems: 'center' },
  pinContainer: { flexDirection: 'row', gap: 25 },
  dot: { 
    width: 20, 
    height: 20, 
    borderRadius: 10, 
    borderWidth: 2, 
    borderColor: TEAL 
  },
  dotActive: { 
    backgroundColor: GOLD, 
    borderColor: GOLD,
    transform: [{ scale: 1.2 }] 
  },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  label: { fontSize: 12, color: SAGE, marginBottom: 6, fontWeight: '600' },
  inputField: {
    backgroundColor: CREAM,
    color: DEEP_GREEN,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  buttonWrapper: { width: '100%', alignItems: 'center', marginTop: 10 },
  button: { 
    backgroundColor: DEEP_GREEN, 
    width: '100%', 
    paddingVertical: 18, 
    borderRadius: 35, 
    alignItems: 'center',
    elevation: 4,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  footerNote: { marginTop: 15, color: SAGE, fontSize: 11, textAlign: 'center' }
});