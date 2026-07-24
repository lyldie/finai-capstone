// app/getstarted.tsx
import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'; 
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window'); // Kukunin natin ang width ng screen para sa responsive sizing

export default function GetStartedScreen() {
  const router = useRouter();

  const handleGetStarted = async () => {
    // Sine-save natin 'to para hindi na paulit-ulit ang intro
    await AsyncStorage.setItem('has_seen_intro', 'true');
    router.replace('/signup');
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        // DITO ANG PAGBABAGO PAPS! Gagamitin natin yung original codes
        // pero naka-horizontal orientation.
        colors={['#1c3c36', '#3D7D6C']} // Naka-base 'to sa orihinal mong codes
        start={{ x: 0, y: 0 }}   // Magsisimula sa Top-Left (Darker)
        end={{ x: 1, y: 0 }}     // Magtatapos sa Top-Right (Lighter)
        style={styles.container}
      >
        <View style={styles.contentContainer}>
          {/* 1. Logo Container - Pinaliit natin 'to */}
          <View style={styles.logoCircle}>
            <Image 
                source={require('../assets/images/squirrel_logoo.png')} // I-check kung tama ang path paps
                style={styles.squirrelImage}
                resizeMode="contain" // Tinitiyak na hindi bansot ang squirrel
            />
          </View>

          {/* 2. APP NAME - Consistent with Premium Gold theme */}
          <Text style={styles.appName}>FINAI</Text>
          
          {/* Dagdag tagline base sa logo description */}
          <Text style={styles.tagline}>NA SOBRANG FINE</Text>
        </View>

        {/* 3. GET STARTED BUTTON - Consistent with Premium theme */}
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
    paddingVertical: 120, // Adjust spacing top & bottom
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50, // Added padding to avoid cluttering near button
  },
  // ANG PAGBABAGO SA SIZING DITO PAPS
  logoCircle: {
    width: 130, // Pinaliit natin mula 160. Mas compact na siya.
    height: 130,
    borderRadius: 70, // Half ng width/height para maging perfect circle
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30, // Spacing before the text
    // Shadow details para sa depth
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  squirrelImage: {
    width: 190, // Palakihin natin mula 110? Try muna natin 'tong size.
    height: 190, // Mas occupied na niya yung space sa loob ng bilog.
  },
  appName: {
    color: '#edb232', // Yung Premium Gold code natin
    fontSize: 56, // Bold and impact-full
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
    color: '#1c3c36', // Green text on white button
    fontSize: 18,
    fontWeight: '700',
  },
});