import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext'; // 👈 [NEW] Import natin ang AuthContext

export default function PinLoginScreen() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 👈 [NEW] Kunin ang user data at logout function
  const { user, logoutUser } = useAuth();

  // Traffic Cop: Direct bypass check kapag admin o kapag valid na session
  useEffect(() => {
    const checkRoleBypass = async () => {
      // Mas magandang basahin direkta sa session para mabilis
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
      verifyPin();
    }
  }, [pin]);

  const verifyPin = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // 👈 [NEW] Mas reliable: kunin muna sa context bago sa storage
      const email = user?.email || await AsyncStorage.getItem('user_email');
      const savedPin = await AsyncStorage.getItem('user_pin');

      // 1. Backend Verification (Primary)
      if (email) {
        const response = await fetch(`${API_URL}/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), pin: pin }),
        });

        const data = await response.json();

        if (response.ok) {
          const role = user?.role || await AsyncStorage.getItem('user_role');
          if (role === 'admin') {
            router.replace('/(admin)/admin-dashboard');
          } else {
            router.replace('/(tabs)');
          }
          return;
        } else {
          Alert.alert("Mali paps!", data.detail || "Hindi match ang PIN mo.");
          setPin('');
          setLoading(false); // 👈 [NEW] Kailangan itigil ang loading kung mali ang PIN sa backend
          return;
        }
      }

      // 2. Offline Fallback Verification (Kapag walang email record sa session)
      if (savedPin && pin === savedPin) {
        const role = await AsyncStorage.getItem('user_role');
        if (role === 'admin') {
          router.replace('/(admin)/admin-dashboard');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        Alert.alert("Mali paps!", "Hindi match ang PIN mo o kailangang mag-login ulit.");
        setPin('');
      }

    } catch (e) {
      // 3. Network Failure Fallback (Kapag offline / walang internet)
      const savedPin = await AsyncStorage.getItem('user_pin');
      if (savedPin && pin === savedPin) {
        const role = await AsyncStorage.getItem('user_role');
        if (role === 'admin') {
          router.replace('/(admin)/admin-dashboard');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        Alert.alert("Error", "Hindi maka-connect sa server at hindi match ang local PIN.");
        setPin('');
      }
    } finally {
      setLoading(false);
    }
  };

  // 👈 [NEW] Proper Switch Account Logic
  const handleSwitchAccount = async () => {
    Alert.alert("Switch Account", "Sigurado ka bang gusto mong mag-log out at gumamit ng ibang account?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Yes, Log out", 
        style: "destructive",
        onPress: async () => {
          await logoutUser(); // Binubura lahat ng session data (PIN, Email, etc.)
          router.replace('/login');
        }
      }
    ]);
  };

  return (
    <LinearGradient colors={['#1c3c36', '#000']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Ionicons name="lock-closed" size={50} color="#edb232" />
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.subtitle}>Enter PIN to unlock</Text>
      </View>

      <View style={styles.dotContainer}>
        {[...Array(4)].map((_, i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotActive]} />
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color="#edb232" />
          <Text style={styles.loadingText}>Unlocking FinAi...</Text>
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

      {/* 👈 [NEW] Tinawag na natin yung tamang Switch Account function */}
      <TouchableOpacity 
        style={styles.switchAccountBtn}
        onPress={handleSwitchAccount}
        disabled={loading}
      >
        <Text style={styles.switchAccountText}>Switch Account or Login via Password</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 30 },
  title: { color: 'white', fontSize: 26, fontWeight: 'bold', marginTop: 10 },
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