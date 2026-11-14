import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, StatusBar, Pressable, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Keyboard, Platform, Modal, InteractionManager } from 'react-native';
import { Alert } from '../utils/FinAIAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { userFacingError } from '../utils/userFacingError';
import { useAuth } from '../context/AuthContext';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';

export default function OtpVerifyScreen() {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [verified, setVerified] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  
  const { email } = useLocalSearchParams(); 
  const targetEmail = Array.isArray(email) ? email[0] : (email || '');

  const { loginUser } = useAuth(); 

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Wait until the route transition has finished before opening the Android
  // keyboard; autoFocus during navigation can be lost on some devices/IME apps.
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => inputRef.current?.focus(), 150);
    });
    return () => {
      interaction.cancel();
      if (timer) clearTimeout(timer);
    };
  }, []));

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
        await AsyncStorage.removeItem('@finai_signup_draft').catch(() => undefined);
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
        Alert.alert('Verification failed', userFacingError(data.detail, 'Check the code in your email and try again.'));
      }
    } catch (e) {
      Alert.alert('Connection error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Missing email', 'Return to registration and enter your email address.');
      router.replace('/signup');
      return;
    }

    setResending(true);
    try {
      const response = await fetch(`${API_URL}/resend-registration-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(userFacingError(data.detail, 'Could not send another code. Please try again shortly.'));
      setOtp('');
      setResendCooldown(30);
      Alert.alert('Check your email', 'A new code was sent for your pending registration. Use the latest code; earlier codes no longer work.');
    } catch (error) {
      Alert.alert('Could not resend code', userFacingError(error, 'Check your connection and try again.'));
    } finally {
      setResending(false);
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
          <View pointerEvents="none" style={styles.otpBoxes}>
            {[...Array(6)].map((_, i) => (
              <View key={i} style={[styles.box, otp.length > i && styles.boxActive]}>
                <Text style={styles.boxText}>{otp[i] || ""}</Text>
              </View>
            ))}
          </View>
          <TextInput
            ref={inputRef}
            style={styles.otpInput}
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            caretHidden
            editable={!loading}
            accessibilityLabel="6-digit email verification code"
          />
        </Pressable>

        <TouchableOpacity 
            style={[styles.btn, { opacity: (otp.length === 6 && !loading) ? 1 : 0.6 }]} 
            onPress={handleVerify}
            disabled={loading || otp.length < 6}
            activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color={DEEP_GREEN} /> : <Text style={styles.btnText}>VERIFY CODE</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { void handleResend(); }}
          disabled={loading || resending || resendCooldown > 0}
          style={styles.resendButton}
          accessibilityRole="button"
          accessibilityLabel={resendCooldown > 0 ? `Resend verification code in ${resendCooldown} seconds` : 'Resend verification code'}
        >
          {resending
            ? <ActivityIndicator color={GOLD} size="small" />
            : <Text style={[styles.resendText, (loading || resendCooldown > 0) && styles.resendDisabled]}>
                Didn’t receive a code? {resendCooldown > 0 ? `Send again in ${resendCooldown}s` : 'Send code again'}
              </Text>}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={async () => {
          const raw = await AsyncStorage.getItem('@finai_signup_draft').catch(() => null);
          if (raw) {
            try {
              const draft = JSON.parse(raw);
              draft.verificationEmail = null;
              await AsyncStorage.setItem('@finai_signup_draft', JSON.stringify(draft));
            } catch { await AsyncStorage.removeItem('@finai_signup_draft').catch(() => undefined); }
          }
          router.replace('/signup');
        }} style={{marginTop: 25}} disabled={loading}>
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
    otpContainer: { position: 'relative', alignSelf: 'stretch', minHeight: 55, justifyContent: 'center' },
    otpBoxes: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
    otpInput: { ...StyleSheet.absoluteFill, opacity: 0, color: 'transparent', backgroundColor: 'transparent' },
    resendButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', marginTop: 12, paddingHorizontal: 8 },
    resendText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
    resendDisabled: { opacity: 0.65 },
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
