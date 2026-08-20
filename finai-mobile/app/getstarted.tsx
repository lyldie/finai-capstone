// app/getstarted.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Image, Dimensions, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'; 
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

export default function GetStartedScreen() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  // 👈 [NEW] Smart Routing: I-check agad kung luma o bagong user
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const userId = await AsyncStorage.getItem('user_id');
        const hasSeenIntro = await AsyncStorage.getItem('has_seen_intro');

        // 1. Kung may naka-login na user, rekta na sa PIN Verification!
        if (userId) {
          router.replace('/pin-login');
          return;
        }

        // 2. Kung nakita na niya 'to dati pero hindi pa nag-login, rekta na sa Login page!
        if (hasSeenIntro === 'true') {
          router.replace('/login');
          return;
        }
      } catch (error) {
        console.log("Error checking app launch status:", error);
      } finally {
        // Kapag tapos na mag-check at wala pang record, ipakita ang Get Started UI
        setIsChecking(false); 
      }
    };

    checkFirstLaunch();
  }, []);

  const handleGetStarted = async () => {
    // Sine-save natin 'to para hindi na paulit-ulit ang intro
    await AsyncStorage.setItem('has_seen_intro', 'true');
    router.replace('/signup');
  };

  // 👈 [NEW] Habang nagche-check sa background, pakitaan ng loading imbes na mag-flicker
  if (isChecking) {
    return (
      <View style={[styles.container, { backgroundColor: '#1c3c36', justifyContent: 'center' }]}>
         <ActivityIndicator size="large" color="#edb232" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1c3c36', '#3D7D6C']} 
        start={{ x: 0, y: 0 }}   
        end={{ x: 1, y: 0 }}     
        style={styles.container}
      >
        <View style={styles.contentContainer}>
          
          <View style={styles.logoCircle}>
            <Image 
                source={require('../assets/images/squirrel_logoo.png')} 
                style={styles.squirrelImage}
                resizeMode="contain" 
            />
          </View>

          <Text style={styles.appName}>FINAI</Text>
          <Text style={styles.tagline}>NA SOBRANG FINE</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            activeOpacity={0.8} 
            style={styles.button} 
            onPress={handleGetStarted}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 120, 
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50, 
  },
  logoCircle: {
    width: 130, 
    height: 130,
    borderRadius: 65, // 👈 [FIX] Dapat exactly half ng width/height (130 / 2 = 65)
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30, 
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden', // 👈 [NEW] Para hindi lumagpas sa bilog yung image kung malaki man
  },
  squirrelImage: {
    width: '80%', // 👈 [NEW] Mas safe ang percentage para laging fit sa loob ng circle
    height: '80%', 
  },
  appName: {
    color: '#edb232', 
    fontSize: 56, 
    fontWeight: '900',
    letterSpacing: 8,
    textTransform: 'uppercase',
  },
  tagline: {
    color: 'white',
    fontSize: 14,
    fontWeight: '300',
    marginTop: 5,
    opacity: 0.8,
  },
  buttonContainer: {
    paddingHorizontal: 40,
  },
  button: {
    backgroundColor: 'white',
    paddingVertical: 18,
    borderRadius: 35,
    alignItems: 'center',
    elevation: 5,
  },
  buttonText: {
    color: '#1c3c36', 
    fontSize: 18,
    fontWeight: '700',
  },
});