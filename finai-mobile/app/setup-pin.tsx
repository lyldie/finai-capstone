import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, TextInput, 
  Alert, StatusBar, Platform, KeyboardAvoidingView, ScrollView, Pressable 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config'; // Tiyaking tama ang import path ng config mo paps

export default function SetupPinScreen() {
  // --- EXISTING STATES ---
  const [pin, setPin] = useState('');
  const inputRef = useRef<TextInput>(null); 
  const router = useRouter();

  // --- NEW ONBOARDING STATES (Aaralin para sa scope paps!) ---
  const [income, setIncome] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDate, setGoalDate] = useState(''); // Format: YYYY-MM-DD

  const handleConfirmPinAndSetup = async () => {
    // 1. Validation para sa PIN length
    if (pin.length !== 4) {
      Alert.alert("Wait lang paps!", "Kailangan 4 digits ang PIN mo para safe.");
      return;
    }

    // 2. Validation para sa mga bagong Onboarding Fields
    if (!income || !goalName || !goalAmount || !goalDate) {
      Alert.alert("Kulang paps!", "Paki-sagutan ang Monthly Income at Goal details para may baseline baseline si FinAi.");
      return;
    }

    try {
      // 3. Hugutin ang user_id na naitabi nung nakaraang registration step
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) {
        Alert.alert("Session Error", "Hindi mahanap ang user session. Subukang mag-register ulit paps.");
        return;
      }

      // 4. Ihanda ang Solidified Payload para sa backend
      const payload = {
        user_id: userId,
        pin: pin,
        monthly_income: parseFloat(income),
        target_name: goalName,
        target_amount: parseFloat(goalAmount),
        target_date: goalDate
      };

      // 5. Fire the network request sa FastAPI natin
      const response = await fetch(`${API_URL}/initial-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const res = await response.json();

      if (response.ok) {
        // I-save ang PIN locally sa phone para sa device-lock requirements ng scope
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
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  // Tinitingnan natin kung kumpleto lahat ng forms para ma-determine kung active ang submit button
  const isFormComplete = pin.length === 4 && income && goalName && goalAmount && goalDate;

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ginawa nating true ang scroll para magkasya ang cards natin nang swabe */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={true} showsVerticalScrollIndicator={false}>
        
        {/* Header with your specific Green Gradients */}
        <LinearGradient
          colors={['#4c8479', '#2b5f56']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.headerText}>Account{"\n"}Onboarding</Text>
          <Ionicons name="rocket-outline" size={80} color="rgba(255,255,255,0.2)" style={styles.headerIcon} />
        </LinearGradient>

        <View style={styles.content}>
          
          {/* SECTION 1: SECURITY PIN CARD */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🔒 SECURITY LOCK</Text>
            <Text style={styles.instruction}>Enter a 4-digit PIN to secure your wallet</Text>
            
            <Pressable style={styles.pinWrapper} onPress={focusInput}>
              <View style={styles.pinContainer}>
                {[...Array(4)].map((_, i) => (
                  <View key={i} style={[styles.dot, pin.length > i && styles.dotActive]} />
                ))}
              </View>
            </Pressable>

            {/* Hidden Input for actual typing logic */}
            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              maxLength={4}
              value={pin}
              onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ''))}
              autoFocus={true}
            />
          </View>

          {/* SECTION 2: MONTHLY INCOME CARD */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>💰 MONTHLY BASELINE</Text>
            <Text style={styles.label}>Magkano ang monthly income mo paps?</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 25000"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={income}
              onChangeText={setIncome}
            />
          </View>

          {/* SECTION 3: FINANCIAL GOALS CARD */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎯 FIRST FINANCIAL GOAL</Text>
            
            <Text style={styles.label}>Target Name (Ano ang pinag-iipunan mo?)</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. Emergency Fund / Laptop"
              placeholderTextColor="#999"
              value={goalName}
              onChangeText={setGoalName}
            />

            <Text style={styles.label}>Target Savings Amount (Magkano ang target ipon?)</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 15000"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={goalAmount}
              onChangeText={setGoalAmount}
            />

            <Text style={styles.label}>Target Date (Kailan mo gustong makamit? YYYY-MM-DD)</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 2026-12-31"
              placeholderTextColor="#999"
              value={goalDate}
              onChangeText={setGoalDate}
            />
          </View>

          {/* SYSTEM SETUP SUBMIT BUTTON */}
          <View style={styles.buttonWrapper}>
            <TouchableOpacity 
              style={[styles.button, !isFormComplete && { opacity: 0.5 }]}
              onPress={handleConfirmPinAndSetup}
              disabled={!isFormComplete}
            >
              <Text style={styles.buttonText}>SAVE PROFILE SETUP</Text>
            </TouchableOpacity>
            <Text style={styles.footerNote}>PIN AI, Income baseline, at initial Goal ay pasok sa scope paps.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F6' }, // Ginawa nating maputi ang background para lumitaw ang Cards
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
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#2b5f56', marginBottom: 15, letterSpacing: 1 },
  instruction: { fontSize: 14, color: '#666', marginBottom: 10, fontWeight: '500' },
  pinWrapper: { paddingVertical: 10, alignItems: 'center' },
  pinContainer: { flexDirection: 'row', gap: 25 },
  dot: { 
    width: 20, 
    height: 20, 
    borderRadius: 10, 
    borderWidth: 2, 
    borderColor: '#4c8479' 
  },
  dotActive: { 
    backgroundColor: '#edb232', 
    borderColor: '#edb232',
    transform: [{ scale: 1.2 }] 
  },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  label: { fontSize: 12, color: '#555', marginBottom: 6, fontWeight: '600' },
  inputField: {
    backgroundColor: '#F0F4F3',
    color: '#333',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  buttonWrapper: { width: '100%', alignItems: 'center', marginTop: 10 },
  button: { 
    backgroundColor: '#2b5f56', 
    width: '100%', 
    paddingVertical: 18, 
    borderRadius: 35, 
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  footerNote: { marginTop: 15, color: '#999', fontSize: 11, textAlign: 'center' }
});