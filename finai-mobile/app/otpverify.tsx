import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, Alert, StatusBar, 
  Pressable, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Keyboard, Platform, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';

export default function OtpVerifyScreen() {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  
  const { email } = useLocalSearchParams(); 
  const targetEmail = Array.isArray(email) ? email[0] : (email || '');

  const { loginUser } = useAuth(); 

  const handleVerify = async () => {
    Keyboard.dismiss();

    if (otp.length !== 6) {
      Alert.alert('Invalid code', 'Enter the 6-digit verification code.');
      return;
    }

    if (!targetEmail) {
      Alert.alert('Missing email', 'Return to registration and enter your email address.');
      router.replace('/signup');
      return;
    }

    const cleanEmail = targetEmail.trim().toLowerCase();

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, otp: otp.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        const userId = data.user_id || data.id;
        
        if (userId) {
          await loginUser({
            id: String(userId),
            name: data.name || "User",
            email: cleanEmail,
            role: data.role,
            token: data.token
          });
        } else {
           await AsyncStorage.setItem('user_email', cleanEmail);
        }

        setVerified(true);
      } else {
        Alert.alert('Verification failed', data.detail || 'Check the code in your email and try again.');
      }
    } catch (e) {
      Alert.alert('Connection error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[DEEP_GREEN, TEAL]} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        <Text style={styles.title}>OTP Verification</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code we sent to:{"\n"}
          <Text style={{fontWeight: 'bold', color: GOLD}}>{targetEmail}</Text>
        </Text>

        <Pressable style={styles.otpContainer} onPress={() => inputRef.current?.focus()}>
            {[...Array(6)].map((_, i) => (
              <View key={i} style={[styles.box, otp.length > i && styles.boxActive]}>
                <Text style={styles.boxText}>{otp[i] || ""}</Text>
              </View>
            ))}
        </Pressable>

        <TextInput
          ref={inputRef}
          style={{ position: 'absolute', opacity: 0 }}
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
          autoFocus={true}
        />

        <TouchableOpacity 
            style={[styles.btn, { opacity: (otp.length === 6 && !loading) ? 1 : 0.6 }]} 
            onPress={handleVerify}
            disabled={loading || otp.length < 6}
            activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color={DEEP_GREEN} /> : <Text style={styles.btnText}>VERIFY CODE</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => router.replace('/signup')} style={{marginTop: 25}} disabled={loading}>
          <Text style={{color: '#fff', opacity: 0.8}}>Wrong email? <Text style={{fontWeight: 'bold', color: GOLD}}>Back to Signup</Text></Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      <Modal
        visible={verified}
        transparent
        animationType="fade"
        onRequestClose={() => router.replace('/setup-pin')}
      >
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={27} color={DEEP_GREEN} />
            </View>
            <Text style={styles.successTitle}>Email verified</Text>
            <Text style={styles.successMessage}>Your email address is confirmed. Continue to set your secure app PIN.</Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => { setVerified(false); router.replace('/setup-pin'); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue to set your app PIN"
            >
              <Text style={styles.successButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={17} color={DEEP_GREEN} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
    subtitle: { fontSize: 14, color: '#fff', textAlign: 'center', opacity: 0.8, marginBottom: 40 },
    otpContainer: { flexDirection: 'row', gap: 10 },
    box: { width: 45, height: 55, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
    boxActive: { borderColor: GOLD },
    boxText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    btn: { backgroundColor: GOLD, width: '100%', height: 55, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
    btnText: { color: DEEP_GREEN, fontWeight: 'bold', fontSize: 16 },
    successBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: 'rgba(10,25,22,0.62)' },
    successCard: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 25, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 8 },
    successIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF4EF', marginBottom: 14 },
    successTitle: { color: DEEP_GREEN, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    successMessage: { color: '#47645D', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
    successButton: { minHeight: 48, width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, borderRadius: 15, marginTop: 22, paddingHorizontal: 18 },
    successButtonText: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800' }
});
