import React, { useState } from 'react';
import { 
  View, TextInput, Alert, StyleSheet, Text, ScrollView, 
  ActivityIndicator, TouchableOpacity, StatusBar, Image, 
  KeyboardAvoidingView, Platform 
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

// ---- FINAI BRAND TOKENS (matches getstarted.tsx exactly) ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  
  const { loginUser } = useAuth(); 

  const handleLogin = async () => {
    const cleanedEmail = email.trim().toLowerCase();

    if (!cleanedEmail || !password) {
      Alert.alert("Error", "Input mo email at password paps!");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: cleanedEmail, 
          password: password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // CHANGED: now also passes data.token through. It'll simply be undefined
        // for non-admin logins (main.py only issues one when role === "admin"),
        // which loginUser() already handles by skipping the AsyncStorage write.
        await loginUser({
          id: String(data.user_id),
          name: data.name,
          email: cleanedEmail,
          role: data.role,
          token: data.token,
        });

        // Smart Redirection
        if (data.role === 'admin') {
          router.replace('/(admin)/admin-dashboard'); 
        } else {
          // (unchanged) backend now returns a real has_pin field.
          if (!data.has_pin) {
            router.replace('/setup-pin');
          } else {
            router.replace('/verify-pin');
          }
        }
        
      } else {
        const errorMessage = typeof data.detail === 'string' 
          ? data.detail 
          : JSON.stringify(data.detail || "Mali yata credentials mo paps.");
        
        Alert.alert("Login Failed", errorMessage);
      }
    } catch (e) {
      console.log("Network Error:", e);
      Alert.alert("Network Error", "Check mo backend server o IP sa config.js paps!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainContainer}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Image source={require('../assets/images/squirrel_logoo.png')} style={styles.logo} resizeMode="contain" />
            </View>
          </View>

          <View style={styles.loginCard}>
            <Text style={styles.helloText}>hello!</Text>

            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person" size={22} color={SAGE} style={styles.inputIcon} />
                <TextInput 
                  placeholder="Username or Email Address" 
                  placeholderTextColor={SAGE}
                  style={styles.input} 
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed" size={22} color={SAGE} style={styles.inputIcon} />
                <TextInput 
                  placeholder="Password" 
                  placeholderTextColor={SAGE}
                  style={styles.input} 
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={SAGE} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.loginButtonText}>Log In</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.replace('/signup')} style={styles.footer} disabled={loading}>
            <Text style={styles.footerText}>No account yet? <Text style={styles.boldLink}>Sign Up</Text></Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
  logoSection: { alignItems: 'center', marginBottom: 30 },
  logoCircle: { width: 120, height: 120, backgroundColor: 'white', borderRadius: 60, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
  logo: { width: 120, height: 120 },
  loginCard: { backgroundColor: 'white', marginHorizontal: 30, borderRadius: 45, padding: 35, alignItems: 'center', elevation: 5, shadowColor: DEEP_GREEN, shadowOpacity: 0.15, shadowRadius: 15 },
  helloText: { fontSize: 48, fontWeight: '900', color: GOLD, marginBottom: 30, fontStyle: 'italic' },
  inputGroup: { width: '100%', marginBottom: 30 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: TEAL, borderRadius: 30, paddingHorizontal: 15, height: 60, marginBottom: 15 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: DEEP_GREEN, fontSize: 15 },
  loginButton: { backgroundColor: DEEP_GREEN, width: '100%', height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  loginButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  footer: { marginTop: 25, alignItems: 'center' },
  footerText: { color: 'white', fontSize: 14 },
  boldLink: { fontWeight: 'bold', textDecorationLine: 'underline', color: GOLD }
});