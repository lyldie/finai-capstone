import React, { useState } from 'react';
import { 
  View, TextInput, TouchableOpacity, Alert, StyleSheet, Text, 
  ScrollView, StatusBar, Image, KeyboardAvoidingView, Platform, 
  ActivityIndicator, Keyboard 
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Checkbox } from 'expo-checkbox'; 
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../config'; 

// ---- FINAI BRAND TOKENS (matches getstarted.tsx / login.tsx exactly) ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';

export default function SignupScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRetypePassword, setShowRetypePassword] = useState(false);
  const [isAgree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const passwordChecks = [
    { label: 'At least 10 characters', valid: password.length >= 10 },
    { label: 'An uppercase and a lowercase letter', valid: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: 'At least one number', valid: /\d/.test(password) },
  ];
  const passwordStrong = passwordChecks.every((check) => check.valid);
  const passwordHasSymbol = /[^A-Za-z0-9]/.test(password);

  const handleSignup = async () => {
    Keyboard.dismiss(); // 👈 [NEW] Itago ang keyboard kapag pinindot ang signup
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanName = `${cleanFirstName} ${cleanLastName}`.trim();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Basic Empty Validation
    if (!cleanFirstName || !cleanLastName || !cleanEmail || !password || !retypePassword) {
      Alert.alert('Missing information', 'Enter your first name, last name, email, and password.');
      return;
    }
    if (cleanName.length > 100) {
      Alert.alert('Name too long', 'Your first and last name must fit within 100 characters.');
      return;
    }

    // 👈 [NEW] 2. Name Validation (Letters at spaces lang para iwas invalid data sa database)
    const nameRegex = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
    if (!nameRegex.test(cleanName)) {
      Alert.alert('Invalid name', 'Use letters, spaces, apostrophes, periods, or hyphens in your name.');
      return;
    }

    // 3. Email Format Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    // 4. Password Length Validation
    if (!passwordStrong) {
      Alert.alert('Choose a stronger password', 'Use at least 10 characters, uppercase and lowercase letters, and a number.');
      return;
    }
    // 5. Password Match Validation
    if (password !== retypePassword) {
      Alert.alert('Passwords do not match', 'Enter the same password in both password fields.');
      return;
    }

    // 6. Terms Agreement Check
    if (!isAgree) {
      Alert.alert('Terms and privacy', 'Review and accept the Terms & Privacy statement to continue.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: cleanName, 
          email: cleanEmail, 
          password: password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Verify your email',
          'We sent a verification code to your email. Check your inbox and spam folder.',
          [{ 
            text: 'Enter code',
            onPress: () => router.replace({
              pathname: '/otpverify',
              params: { email: cleanEmail }
            }) 
          }]
        );
      } else {
        Alert.alert('Registration failed', data.detail || 'We could not create your account. Please try again.');
      }
    } catch (e) {
      Alert.alert('Connection error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const showPrivacyPolicy = () => {
    Alert.alert('Data privacy', 'Registration uses your name, email, and password. After email verification, you can set your app PIN. Your monthly money baseline and first savings goal are optional and can be skipped or added later.');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.mainContainer}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Create your{"\n"}FinAI account</Text>
        </View>
        <View style={styles.logoCircle}>
             <Image source={require('../assets/images/squirrel_logoo.png')} style={styles.logo} resizeMode="contain" />
        </View>
      </LinearGradient>

      {/* 👈 [NEW] keyboardShouldPersistTaps="handled" */}
      <ScrollView 
        contentContainerStyle={styles.formContainer} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Full Name */}
        <View style={styles.inputWrapper}>
          <Ionicons name="person" size={20} color={SAGE} style={styles.icon} />
          <TextInput 
            placeholder="First name"
            placeholderTextColor={SAGE} 
            style={styles.input} 
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words" // 👈 [NEW] Auto-capitalize ng bawat salita sa pangalan
            editable={!loading} // 👈 [NEW] Naka-disable kapag nag-l-load
          />
        </View>

        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={20} color={SAGE} style={styles.icon} />
          <TextInput
            placeholder="Last name"
            placeholderTextColor={SAGE}
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            editable={!loading}
          />
        </View>

        {/* Email Address */}
        <View style={styles.inputWrapper}>
          <Ionicons name="mail" size={20} color={SAGE} style={styles.icon} />
          <TextInput 
            placeholder="Email Address" 
            placeholderTextColor={SAGE} 
            style={styles.input} 
            value={email} 
            onChangeText={setEmail} 
            keyboardType="email-address" 
            autoCapitalize="none" 
            editable={!loading}
          />
        </View>

        {/* Password with Eye Toggle */}
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed" size={20} color={SAGE} style={styles.icon} />
          <TextInput 
            placeholder="Password" 
            placeholderTextColor={SAGE} 
            style={styles.input} 
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry={!showPassword} 
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={SAGE} />
          </TouchableOpacity>
        </View>

        {!!password && (
          <View style={styles.passwordGuidance}>
            <Text style={[styles.passwordStrength, { color: passwordStrong ? TEAL : '#D14343' }]}>
              {passwordStrong ? (passwordHasSymbol ? 'Strong password' : 'Good password · a symbol adds extra strength') : 'Password needs more strength'}
            </Text>
            {passwordChecks.map((check) => (
              <View key={check.label} style={styles.passwordRule}>
                <Ionicons name={check.valid ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={check.valid ? TEAL : SAGE} />
                <Text style={[styles.passwordRuleText, check.valid && styles.passwordRulePassed]}>{check.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Retype Password with Eye Toggle */}
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed" size={20} color={SAGE} style={styles.icon} />
          <TextInput 
            placeholder="Retype Password" 
            placeholderTextColor={SAGE} 
            style={styles.input} 
            value={retypePassword} 
            onChangeText={setRetypePassword} 
            secureTextEntry={!showRetypePassword} 
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowRetypePassword(!showRetypePassword)}>
            <Ionicons name={showRetypePassword ? "eye-off" : "eye"} size={20} color={SAGE} />
          </TouchableOpacity>
        </View>

        {/* Terms Checkbox */}
        <View style={styles.checkboxContainer}>
          <Checkbox 
            value={isAgree} 
            onValueChange={setAgree} 
            color={isAgree ? DEEP_GREEN : undefined} 
            disabled={loading} // 👈 [NEW]
          />
          <Text style={styles.checkboxLabel}> I agree to <Text style={styles.boldText} onPress={showPrivacyPolicy}>Terms & Privacy</Text></Text>
        </View>

        {/* Sign Up Button */}
        <TouchableOpacity style={styles.signupButton} onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign Up</Text>}
        </TouchableOpacity>

        {/* Footer Link */}
        <TouchableOpacity onPress={() => router.replace('/login')} disabled={loading}>
          <Text style={styles.footerText}>Have an account? <Text style={styles.boldLink}>Sign In</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#fff' },
  header: { height: '32%', borderBottomRightRadius: 80, paddingHorizontal: 30, paddingTop: 50, justifyContent: 'center' },
  headerTextContainer: { marginTop: 10 },
  headerTitle: { color: 'white', fontSize: 32, fontWeight: 'bold', lineHeight: 38 },
  logoCircle: { position: 'absolute', top: 50, right: 25, width: 80, height: 80, backgroundColor: 'white', borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 8 },
  logo: { width: 60, height: 60 }, 
  formContainer: { padding: 30, paddingTop: 25 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 30, borderWidth: 1.5, borderColor: TEAL, marginBottom: 15, paddingHorizontal: 20, height: 55 },
  icon: { marginRight: 10 },
  input: { flex: 1, color: DEEP_GREEN, fontSize: 16 },
  passwordGuidance: { marginTop: -8, marginBottom: 12, marginLeft: 8 },
  passwordStrength: { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  passwordRule: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  passwordRuleText: { color: SAGE, fontSize: 11 },
  passwordRulePassed: { color: TEAL },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  checkboxLabel: { color: SAGE, fontSize: 13, marginLeft: 8 },
  boldText: { fontWeight: 'bold', color: GOLD }, 
  signupButton: { backgroundColor: DEEP_GREEN, height: 55, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  footerText: { textAlign: 'center', marginTop: 25, color: SAGE },
  boldLink: { fontWeight: 'bold', color: DEEP_GREEN }
});
