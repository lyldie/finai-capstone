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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

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
        // Safe storage ng user session details
        if (data.user_id) {
          await AsyncStorage.setItem('user_id', String(data.user_id));
        }
        if (data.name) {
          await AsyncStorage.setItem('user_name', data.name);
        }
        await AsyncStorage.setItem('user_email', cleanedEmail); 
        
        if (data.role) {
          await AsyncStorage.setItem('user_role', data.role);
        }

        // [INTEGRATED LOGIC]: Smart Redirection
        if (data.role === 'admin') {
          router.replace('/(admin)/admin-dashboard'); 
        } else {
          // Kung walang naisave na local PIN o sinabi ng backend na wala pang setup
          const savedPin = await AsyncStorage.getItem('user_pin');
          if (data.has_pin === false || (!savedPin && data.is_setup_complete === false)) {
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
    <LinearGradient colors={['#1c3c36', '#4c8479']} style={styles.mainContainer}>
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
                <Ionicons name="person" size={22} color="#8BA19D" style={styles.inputIcon} />
                <TextInput 
                  placeholder="Username or Email Address" 
                  placeholderTextColor="#8BA19D"
                  style={styles.input} 
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed" size={22} color="#8BA19D" style={styles.inputIcon} />
                <TextInput 
                  placeholder="Password" 
                  placeholderTextColor="#8BA19D"
                  style={styles.input} 
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#8BA19D" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.loginButtonText}>Log In</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.replace('/signup')} style={styles.footer}>
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
  logo: { width: 80, height: 80 },
  loginCard: { backgroundColor: 'white', marginHorizontal: 30, borderRadius: 45, padding: 35, alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15 },
  helloText: { fontSize: 48, fontWeight: '900', color: '#edb232', marginBottom: 30, fontStyle: 'italic' },
  inputGroup: { width: '100%', marginBottom: 30 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#3D7D6C', borderRadius: 30, paddingHorizontal: 15, height: 60, marginBottom: 15 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#333', fontSize: 15 },
  loginButton: { backgroundColor: '#3D7D6C', width: '100%', height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  loginButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  footer: { marginTop: 25, alignItems: 'center' },
  footerText: { color: 'white', fontSize: 14 },
  boldLink: { fontWeight: 'bold', textDecorationLine: 'underline' }
});