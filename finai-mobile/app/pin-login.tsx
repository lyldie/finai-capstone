import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PinLoginScreen() {
  const [pin, setPin] = useState('');
  const router = useRouter();

  const handlePress = (num: string) => {
    if (pin.length < 4) setPin(prev => prev + num);
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    if (pin.length === 4) {
      verifyPin();
    }
  }, [pin]);

  const verifyPin = async () => {
    const savedPin = await AsyncStorage.getItem('user_pin');
    if (pin === savedPin) {
      router.replace('/(tabs)');
    } else {
      Alert.alert("Mali paps!", "Hindi match ang PIN mo.");
      setPin(''); // Reset dots
    }
  };

  return (
    <LinearGradient colors={['#1c3c36', '#000']} style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="lock-closed" size={50} color="#edb232" />
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.subtitle}>Enter PIN to unlock</Text>
      </View>

      {/* Visual Dots */}
      <View style={styles.dotContainer}>
        {[...Array(4)].map((_, i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotActive]} />
        ))}
      </View>

      {/* Custom Keypad */}
      <View style={styles.keypad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0].map((item, index) => (
          <TouchableOpacity 
            key={index} 
            style={[styles.key, item === '' && { opacity: 0 }]}
            onPress={() => item !== '' && handlePress(item.toString())}
            disabled={item === ''}
          >
            <Text style={styles.keyText}>{item}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.key} onPress={handleDelete}>
          <Ionicons name="backspace-outline" size={28} color="white" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { color: 'white', fontSize: 24, fontWeight: 'bold', marginTop: 10 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  dotContainer: { flexDirection: 'row', gap: 20, marginBottom: 50 },
  dot: { width: 15, height: 15, borderRadius: 10, borderWidth: 2, borderColor: '#edb232' },
  dotActive: { backgroundColor: '#edb232' },
  keypad: { width: '80%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  key: { width: '30%', height: 80, justifyContent: 'center', alignItems: 'center' },
  keyText: { color: 'white', fontSize: 28, fontWeight: '600' }
});