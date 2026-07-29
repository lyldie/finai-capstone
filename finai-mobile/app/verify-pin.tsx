import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config'; 

export default function VerifyPinScreen() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Traffic Cop - Check role agad pagka-load
  useEffect(() => {
    const checkRoleBypass = async () => {
      const role = await AsyncStorage.getItem('user_role');
      if (role === 'admin') {
        router.replace('/(admin)/admin-dashboard');
      }
    };
    checkRoleBypass();
  }, []);

  const handlePress = (num: string) => {
    if (pin.length < 4 && !loading) setPin(prev => prev + num);
  };

  const handleDelete = () => {
    if (!loading) setPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    if (pin.length === 4) {
      checkPin();
    }
  }, [pin]);

  const checkPin = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const email = await AsyncStorage.getItem('user_email');
      if (!email) {
        Alert.alert("Error", "No user session found. Please login again.");
        router.replace('/login');
        return;
      }
      
      const payload = { 
        email: email.trim().toLowerCase(), 
        pin: pin 
      };
      
      const response = await fetch(`${API_URL}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        const role = await AsyncStorage.getItem('user_role');
        if (role === 'admin') {
          router.replace('/(admin)/admin-dashboard');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        Alert.alert("Mali paps!", data.detail || "Hindi match yung PIN mo.");
        setPin(''); 
      }
    } catch (e) {
      Alert.alert("Error", "Hindi maka-connect sa server.");
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#1c3c36', '#000']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={50} color="#edb232" />
        <Text style={styles.title}>Security Check</Text>
        <Text style={styles.subtitle}>Enter your 4-digit PIN</Text>
      </View>

      <View style={styles.dotContainer}>
        {[...Array(4)].map((_, i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotActive]} />
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color="#edb232" />
          <Text style={styles.loadingText}>Verifying PIN...</Text>
        </View>
      ) : (
        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0'].map((item, index) => (
            <TouchableOpacity 
              key={index} 
              style={[styles.key, item === '' && { opacity: 0 }]}
              onPress={() => item !== '' && handlePress(item)}
              disabled={item === '' || loading}
            >
              <Text style={styles.keyText}>{item}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.key} onPress={handleDelete} disabled={loading}>
            <Ionicons name="backspace-outline" size={28} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Button para pantay sa pin-login at walang nawawalang element */}
      <TouchableOpacity 
        style={styles.switchAccountBtn}
        onPress={() => router.replace('/login')}
      >
        <Text style={styles.switchAccountText}>Switch Account or Login via Password</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 30 },
  title: { color: 'white', fontSize: 28, fontWeight: 'bold', marginTop: 10 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  dotContainer: { flexDirection: 'row', gap: 20, marginBottom: 40 },
  dot: { width: 15, height: 15, borderRadius: 10, borderWidth: 2, borderColor: '#edb232' },
  dotActive: { backgroundColor: '#edb232' },
  loadingWrapper: { height: 240, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'white', marginTop: 10, opacity: 0.8 },
  keypad: { width: '80%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  key: { width: '30%', height: 75, justifyContent: 'center', alignItems: 'center' },
  keyText: { color: 'white', fontSize: 28, fontWeight: '600' },
  switchAccountBtn: { marginTop: 20, padding: 10 },
  switchAccountText: { color: '#edb232', fontSize: 13, textDecorationLine: 'underline' }
});