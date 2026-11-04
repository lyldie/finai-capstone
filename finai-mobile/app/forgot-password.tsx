import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../config';
import { userFacingError } from '../utils/userFacingError';

const GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const router = useRouter();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'reset'>('request');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (typeof params.email === 'string') setEmail(params.email);
  }, [params.email]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const passwordStrong = password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

  const requestCode = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert('Check your email', 'Enter a valid email address to continue.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(userFacingError(data.detail, 'Could not request a reset code. Try again shortly.'));
      setCode('');
      if (stage === 'request') {
        setPassword('');
        setConfirmPassword('');
        setStage('reset');
      }
      setResendCooldown(30);
    } catch (error) {
      Alert.alert('Could not request reset', userFacingError(error, 'Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\d{6}$/.test(code.trim())) {
      Alert.alert('Enter the reset code', 'Type the 6-digit code sent to your email.');
      return;
    }
    if (!passwordStrong) {
      Alert.alert('Choose a stronger password', 'Use at least 10 characters, including uppercase and lowercase letters and a number.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Enter the same new password in both fields.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, otp: code.trim(), new_password: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(userFacingError(data.detail, 'Could not reset the password. Check the code and try again.'));
      Alert.alert('Password updated', 'Sign in using your new password.', [
        { text: 'Go to sign in', onPress: () => router.replace({ pathname: '/login', params: { email: cleanEmail } }) },
      ]);
    } catch (error) {
      Alert.alert('Could not reset password', userFacingError(error, 'Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[GREEN, TEAL]} style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandIcon}><Ionicons name={stage === 'request' ? 'lock-open-outline' : 'mail-unread-outline'} size={34} color={GREEN} /></View>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>FINAI ACCOUNT</Text>
            <Text style={styles.title}>{stage === 'request' ? 'Forgot password?' : 'Create a new password'}</Text>
            <Text style={styles.description}>
              {stage === 'request'
                ? 'Enter the email linked to your account. If an account uses it, we’ll send a reset code.'
                : 'Enter the 6-digit code and choose a new password. The code expires in 10 minutes and works once.'}
            </Text>

            <Text style={styles.label}>Email address</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={19} color={SAGE} />
              <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={SAGE} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!loading && stage === 'request'} accessibilityLabel="Account email address" />
            </View>

            {stage === 'reset' && <>
              <Text style={styles.label}>Reset code</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="keypad-outline" size={19} color={SAGE} />
                <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" placeholderTextColor={SAGE} style={styles.input} keyboardType="number-pad" maxLength={6} editable={!loading} accessibilityLabel="Six digit password reset code" />
              </View>
              <Text style={styles.label}>New password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={19} color={SAGE} />
                <TextInput value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={SAGE} style={styles.input} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" editable={!loading} accessibilityLabel="New password" />
                <TouchableOpacity onPress={() => setShowPassword((value) => !value)} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide new password' : 'Show new password'}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={SAGE} /></TouchableOpacity>
              </View>
              <Text style={styles.passwordHint}>At least 10 characters, uppercase and lowercase letters, and a number.</Text>
              <Text style={styles.label}>Confirm new password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={19} color={SAGE} />
                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter new password" placeholderTextColor={SAGE} style={styles.input} secureTextEntry={!showConfirmPassword} autoCapitalize="none" autoComplete="new-password" editable={!loading} accessibilityLabel="Confirm new password" />
                <TouchableOpacity onPress={() => setShowConfirmPassword((value) => !value)} accessibilityRole="button" accessibilityLabel={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}><Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={SAGE} /></TouchableOpacity>
              </View>
              <TouchableOpacity onPress={requestCode} disabled={loading || resendCooldown > 0} style={styles.resend} accessibilityRole="button">
                <Text style={[styles.resendText, resendCooldown > 0 && styles.resendDisabled]}>
                  Didn’t receive a code? {resendCooldown > 0 ? `Send again in ${resendCooldown}s` : 'Send code again'}
                </Text>
              </TouchableOpacity>
            </>}

            <TouchableOpacity onPress={stage === 'request' ? requestCode : submitReset} disabled={loading} style={[styles.primary, loading && styles.disabled]} accessibilityRole="button">
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{stage === 'request' ? 'Send reset code' : 'Reset password'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace('/login')} disabled={loading} style={styles.back} accessibilityRole="button"><Text style={styles.backText}>Back to sign in</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22, paddingVertical: 35 },
  brandIcon: { alignSelf: 'center', width: 74, height: 74, borderRadius: 37, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 18, elevation: 6 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 28, padding: 25 },
  eyebrow: { color: TEAL, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' },
  title: { color: GREEN, fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  description: { color: '#5f716c', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 16 },
  label: { color: GREEN, fontSize: 13, fontWeight: '700', marginTop: 13, marginBottom: 7 },
  inputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#c8d8d2', borderRadius: 15, paddingHorizontal: 14, backgroundColor: '#fbfcfa' },
  input: { flex: 1, minHeight: 50, color: GREEN, fontSize: 15 },
  passwordHint: { marginTop: 6, color: '#70817c', fontSize: 11, lineHeight: 16 },
  resend: { alignSelf: 'flex-end', paddingVertical: 12 }, resendText: { color: TEAL, fontWeight: '700', fontSize: 12 }, resendDisabled: { opacity: 0.6 },
  primary: { minHeight: 52, borderRadius: 16, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  disabled: { opacity: 0.7 }, primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  back: { alignItems: 'center', paddingTop: 17 }, backText: { color: TEAL, fontSize: 14, fontWeight: '700' },
});
