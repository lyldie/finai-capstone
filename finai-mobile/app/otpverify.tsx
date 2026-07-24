import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, Alert, StatusBar, 
  Pressable, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Keyboard
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 👈 1. Inimport natin ito paps!
import { API_URL } from '../config'; // 👈 2. Ginamit na natin yung central config mo para malinis!

export default function OtpVerifyScreen() {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  
  const { email } = useLocalSearchParams(); 

  const handleVerify = async () => {
    Keyboard.dismiss();

    if (otp.length !== 6) {
      Alert.alert("Teka lang!", "6 digits dapat yung code paps.");
      return;
    }

    setLoading(true);
    try {
      const targetEmail = Array.isArray(email) ? email[0] : email;

      const response = await fetch(`${API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, otp: otp }),
      });

      const data = await response.json();

      if (response.ok) {
        // 👈 3. DITO ANG SELYADO NA LUNAS PAPS! 
        // Isinesave natin yung user_id na galing sa backend response mo (hal. data.user_id)
        if (data.user_id) {
          await AsyncStorage.setItem('user_id', data.user_id);
        } else if (data.id) {
          // Fallback kung sakaling "id" o "_id" ang pangalan ng field sa backend response mo
          await AsyncStorage.setItem('user_id', data.id);
        }

        Alert.alert("Success! ✅", "Verified na ang account mo.", [
          { text: "G", onPress: () => router.replace('/setup-pin') }
        ]);
      } else {
        Alert.alert("Mali paps!", data.detail || "Check mo ulit yung code sa email.");
      }
    } catch (e) {
      Alert.alert("Connection Error", "Hindi maka-connect sa server. Check your IP!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#1c3c36', '#4c8479']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView behavior="padding" style={styles.content}>
        <Text style={styles.title}>OTP Verification</Text>
        <Text style={styles.subtitle}>Pakisulat yung 6-digit code na sinend namin sa:{"\n"}
          <Text style={{fontWeight: 'bold', color: '#edb232'}}>{email}</Text>
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
          keyboardType="default"
          autoCapitalize="characters"
          maxLength={6}
          value={otp}
          onChangeText={(text) => setOtp(text.toUpperCase())}
          autoFocus={true}
        />

        <TouchableOpacity 
            style={[styles.btn, { opacity: otp.length === 6 ? 1 : 0.6 }]} 
            onPress={handleVerify}
            disabled={loading || otp.length < 6}
        >
          {loading ? <ActivityIndicator color="#1c3c36" /> : <Text style={styles.btnText}>VERIFY CODE</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => router.replace('/signup')} style={{marginTop: 20}}>
          <Text style={{color: '#fff', opacity: 0.7}}>Wrong email? <Text style={{fontWeight: 'bold'}}>Back to Signup</Text></Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
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
    boxActive: { borderColor: '#edb232' },
    boxText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    btn: { backgroundColor: '#edb232', width: '100%', height: 55, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
    btnText: { color: '#1c3c36', fontWeight: 'bold', fontSize: 16 }
});