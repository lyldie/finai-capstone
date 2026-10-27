import React, { useState } from 'react';
import { 
  View, TextInput, TouchableOpacity, Alert, StyleSheet, Text, 
  ScrollView, StatusBar, Image, KeyboardAvoidingView, Platform, Modal,
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
  const [openDocument, setOpenDocument] = useState<'terms' | 'privacy' | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
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
        setVerificationEmail(cleanEmail);
      } else {
        Alert.alert('Registration failed', data.detail || 'We could not create your account. Please try again.');
      }
    } catch (e) {
      Alert.alert('Connection error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
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

        <View style={styles.privacySummaryCard}>
          <Ionicons name="shield-checkmark-outline" size={19} color={TEAL} />
          <Text style={styles.privacySummaryText}>
            Receipt images are sent to Google Gemini for scanning. The AI Budget Advisor may send an aggregated summary of your financial activity to Google Gemini or Groq to prepare recommendations.
          </Text>
        </View>

        {/* Terms agreement and privacy notice acknowledgement */}
        <View style={styles.checkboxContainer}>
          <Checkbox 
            value={isAgree} 
            onValueChange={setAgree} 
            color={isAgree ? DEEP_GREEN : undefined} 
            disabled={loading} // 👈 [NEW]
          />
          <Text style={styles.checkboxLabel}>
            I agree to the{' '}
            <Text accessibilityRole="link" style={styles.policyLink} onPress={() => setOpenDocument('terms')}>Terms of Use</Text>
            {' '}and acknowledge the{' '}
            <Text accessibilityRole="link" style={styles.policyLink} onPress={() => setOpenDocument('privacy')}>Privacy Notice</Text>.
          </Text>
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

      <Modal visible={openDocument !== null} transparent animationType="slide" onRequestClose={() => setOpenDocument(null)}>
        <View style={styles.documentBackdrop}>
          <View style={styles.documentSheet}>
            <View style={styles.documentHeader}>
              <View style={styles.documentTitleWrap}>
                <Text style={styles.documentEyebrow}>FINAI ACCOUNT</Text>
                <Text style={styles.documentTitle}>{openDocument === 'privacy' ? 'Privacy Notice' : 'Terms of Use'}</Text>
              </View>
              <TouchableOpacity style={styles.documentCloseButton} onPress={() => setOpenDocument(null)} accessibilityRole="button" accessibilityLabel="Close document">
                <Ionicons name="close" size={21} color={DEEP_GREEN} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.documentScroll} contentContainerStyle={styles.documentContent} showsVerticalScrollIndicator>
              {openDocument === 'privacy' ? (
                <>
                  <Text style={styles.documentIntro}>This notice summarizes how the current FinAI capstone app handles information you provide.</Text>
                  <Text style={styles.documentSectionTitle}>Information used</Text>
                  <Text style={styles.documentBody}>FinAI uses your name and email to create and verify your account. Your password and app PIN are stored by the backend as one-way hashes. If you use the app, it also processes financial information you enter, such as income baseline, transactions, budgets, and savings goals. Receipt images you submit are sent for scanning.</Text>
                  <Text style={styles.documentSectionTitle}>Why it is used</Text>
                  <Text style={styles.documentBody}>Your information is used to operate your account, record and display your finances, calculate budgets and insights, scan receipts, and prepare advisor recommendations.</Text>
                  <Text style={styles.documentSectionTitle}>AI services</Text>
                  <Text style={styles.documentBody}>Receipt images are sent to Google Gemini to extract visible receipt details. For AI Budget Advisor recommendations, an aggregated summary of active transactions, budgets, and goals may be sent to Google Gemini or Groq. The advisor summary excludes transaction notes and descriptions. AI results can be incomplete or incorrect, so review receipt details and recommendations.</Text>
                  <Text style={styles.documentSectionTitle}>Storage and choices</Text>
                  <Text style={styles.documentBody}>FinAI stores account and financial records in its backend database. You can review or edit information through available app features. This signup screen does not specify a data-retention period or provide a self-service account-deletion process. For questions or requests about your information, contact the FinAI project team through the contact channel provided with the study.</Text>
                  <Text style={styles.documentFootnote}>This notice describes the current capstone build. The project team should confirm its retention period, privacy contact, and study data-handling process before distributing the app to survey participants.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.documentIntro}>By creating a FinAI account, you agree to use the app responsibly under these prototype terms.</Text>
                  <Text style={styles.documentSectionTitle}>Your account</Text>
                  <Text style={styles.documentBody}>Provide an email address you can access, complete email verification, and keep your password and app PIN private. You are responsible for checking that information you enter is accurate.</Text>
                  <Text style={styles.documentSectionTitle}>Financial information and AI results</Text>
                  <Text style={styles.documentBody}>FinAI provides tools for recording and understanding personal finances. Forecasts, receipt extraction, and AI recommendations are estimates or suggestions based on available records. Check the figures before saving them and consider your circumstances before acting on a recommendation.</Text>
                  <Text style={styles.documentSectionTitle}>Service limits</Text>
                  <Text style={styles.documentBody}>FinAI is a capstone project and may have errors, interruptions, or incomplete data. It is an informational budgeting tool, not professional financial, tax, or legal advice. Keep your own records for important decisions.</Text>
                  <Text style={styles.documentFootnote}>These prototype terms summarize expected app use; they are not a substitute for terms reviewed and approved for a public commercial service.</Text>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.documentDoneButton} onPress={() => setOpenDocument(null)} accessibilityRole="button">
              <Text style={styles.documentDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!verificationEmail} transparent animationType="fade" onRequestClose={() => setVerificationEmail(null)}>
        <View style={styles.noticeBackdrop}>
          <View style={styles.noticeCard}>
            <View style={styles.noticeIcon}><Ionicons name="mail-outline" size={26} color={TEAL} /></View>
            <Text style={styles.noticeTitle}>Check your email</Text>
            <Text style={styles.noticeMessage}>We sent a 6-digit verification code to</Text>
            <Text style={styles.noticeEmail}>{verificationEmail}</Text>
            <Text style={styles.noticeHint}>Check your inbox and spam folder, then enter the code to verify your account.</Text>
            <TouchableOpacity
              style={styles.noticeButton}
              onPress={() => {
                const destination = verificationEmail;
                setVerificationEmail(null);
                if (destination) router.replace({ pathname: '/otpverify', params: { email: destination } });
              }}
              accessibilityRole="button"
              accessibilityLabel="Enter email verification code"
              activeOpacity={0.85}
            >
              <Text style={styles.noticeButtonText}>Enter code</Text>
              <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#fff' },
  header: { height: '32%', borderBottomRightRadius: 80, paddingHorizontal: 30, paddingTop: 50, justifyContent: 'center' },
  headerTextContainer: { marginTop: 10 },
  headerTitle: { color: 'white', fontSize: 32, fontWeight: 'bold', lineHeight: 38 },
  logoCircle: { position: 'absolute', top: 50, right: 25, width: 80, height: 80, backgroundColor: 'white', borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 8 },
  logo: { width: 100, height: 100 }, 
  formContainer: { padding: 30, paddingTop: 25 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 30, borderWidth: 1.5, borderColor: TEAL, marginBottom: 15, paddingHorizontal: 20, height: 55 },
  icon: { marginRight: 10 },
  input: { flex: 1, color: DEEP_GREEN, fontSize: 16 },
  passwordGuidance: { marginTop: -8, marginBottom: 12, marginLeft: 8 },
  passwordStrength: { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  passwordRule: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  passwordRuleText: { color: SAGE, fontSize: 11 },
  passwordRulePassed: { color: TEAL },
  privacySummaryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, marginTop: 2, marginBottom: 5, borderRadius: 14, backgroundColor: '#EAF4EF' },
  privacySummaryText: { flex: 1, color: DEEP_GREEN, fontSize: 11, lineHeight: 16 },
  checkboxContainer: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 10 },
  checkboxLabel: { color: SAGE, fontSize: 13, lineHeight: 19, marginLeft: 8, flex: 1 },
  policyLink: { fontWeight: '800', color: TEAL, textDecorationLine: 'underline' },
  signupButton: { backgroundColor: DEEP_GREEN, height: 55, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  footerText: { textAlign: 'center', marginTop: 25, color: SAGE },
  boldLink: { fontWeight: 'bold', color: DEEP_GREEN },
  documentBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,32,29,0.55)' },
  documentSheet: { maxHeight: '90%', backgroundColor: '#FAF7F2', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === 'ios' ? 28 : 20 },
  documentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E4DED4' },
  documentTitleWrap: { flex: 1 },
  documentEyebrow: { color: TEAL, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  documentTitle: { color: DEEP_GREEN, fontSize: 22, fontWeight: '900', marginTop: 3 },
  documentCloseButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  documentScroll: { flexShrink: 1 },
  documentContent: { paddingTop: 8, paddingBottom: 14 },
  documentIntro: { color: DEEP_GREEN, fontSize: 14, lineHeight: 21, fontWeight: '700', marginTop: 8 },
  documentSectionTitle: { color: DEEP_GREEN, fontSize: 14, lineHeight: 19, fontWeight: '900', marginTop: 18 },
  documentBody: { color: '#47645D', fontSize: 13, lineHeight: 20, marginTop: 5 },
  documentFootnote: { color: '#7C6A42', fontSize: 11, lineHeight: 17, marginTop: 18, padding: 11, borderRadius: 12, backgroundColor: '#FFF8EC' },
  documentDoneButton: { minHeight: 48, backgroundColor: DEEP_GREEN, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  documentDoneText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  noticeBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: 'rgba(10,25,22,0.62)' },
  noticeCard: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 8 },
  noticeIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF4EF', marginBottom: 13 },
  noticeTitle: { color: DEEP_GREEN, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  noticeMessage: { color: '#47645D', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  noticeEmail: { color: DEEP_GREEN, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center', marginTop: 3 },
  noticeHint: { color: '#607B74', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  noticeButton: { minHeight: 48, width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: DEEP_GREEN, borderRadius: 15, marginTop: 20, paddingHorizontal: 18 },
  noticeButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }
});
