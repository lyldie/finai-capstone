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

    const incomeText = income.trim();
    const parsedIncome = incomeText ? Number(incomeText) : null;
    if (parsedIncome !== null && (!Number.isFinite(parsedIncome) || parsedIncome < 0)) {
      Alert.alert("Invalid Amount", "Enter a valid monthly amount, or leave it blank for now.");
      return;
    }

    const goalValues = [goalName.trim(), goalAmount.trim(), goalDate.trim()];
    const goalProvided = goalValues.some(Boolean);
    if (goalProvided && !goalValues.every(Boolean)) {
      Alert.alert("Goal details incomplete", "To add a goal now, fill in its name, target amount, and target date. Otherwise, leave all three blank and add a goal later.");
      return;
    }

    let parsedGoalAmount: number | undefined;
    if (goalProvided) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(goalDate.trim())) {
        Alert.alert("Invalid Date", "Use YYYY-MM-DD for the target date, for example 2026-12-31.");
        return;
      }

      const [year, month, day] = goalDate.trim().split('-').map(Number);
      const parsedTargetDate = new Date(year, month - 1, day);
      if (parsedTargetDate.getFullYear() !== year || parsedTargetDate.getMonth() !== month - 1 || parsedTargetDate.getDate() !== day) {
        Alert.alert("Invalid Date", "Enter a real calendar date.");
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedTargetDate <= today) {
        Alert.alert("Invalid Date", "Choose a target date in the future.");
        return;
      }

      parsedGoalAmount = Number(goalAmount);
      if (!Number.isFinite(parsedGoalAmount) || parsedGoalAmount <= 0) {
        Alert.alert("Invalid Amount", "Enter a target amount greater than zero.");
        return;
      }
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
        ...(goalProvided ? {
          target_name: goalName.trim(),
          target_amount: parsedGoalAmount,
          target_date: goalDate.trim(),
        } : {}),
      };

      const response = await fetch(`${API_URL}/initial-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify(payload)
      });

      const res = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('user_pin', pin);

        Alert.alert(
          "Setup Complete! 🚀🛡️", 
          "Your app PIN is set. You can add or update your optional money baseline and savings goals later.", 
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

  const isFormComplete = pin.length === 4;

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
            <Text style={styles.instruction}>Set a 4-digit PIN to lock this app. This is separate from your account password and bank PIN.</Text>
            
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
            <Text style={styles.sectionTitle}>💰 MONTHLY MONEY AVAILABLE · OPTIONAL</Text>
            <Text style={styles.label}>About how much money do you usually have available each month?</Text>
            <Text style={styles.fieldHint}>Include salary, allowance, family support, or other money. If it varies, enter a typical estimate. Leave blank if you prefer not to estimate or share; enter 0 if you usually have none. You can update this later.</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 25000 or leave blank"
              placeholderTextColor={SAGE}
              keyboardType="decimal-pad"
              value={income}
              onChangeText={setIncome}
              editable={!loading}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎯 FIRST FINANCIAL GOAL · OPTIONAL</Text>
            <Text style={styles.fieldHint}>You can set a savings goal now or add one later from Insights.</Text>
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
                <Text style={styles.buttonText}>SAVE AND CONTINUE</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.footerNote}>Your PIN is required. Monthly money details and a first goal are optional and can be added later.</Text>
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
  fieldHint: { fontSize: 12, color: SAGE, lineHeight: 17, marginBottom: 12 },
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
