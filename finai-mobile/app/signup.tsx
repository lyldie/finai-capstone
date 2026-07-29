import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Alert, StyleSheet, Text, ScrollView, StatusBar, Image, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Checkbox } from 'expo-checkbox'; 
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../config'; 

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRetypePassword, setShowRetypePassword] = useState(false);
  const [isAgree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Basic Empty Validation
    if (!cleanName || !cleanEmail || !password || !retypePassword) {
      Alert.alert("Missing Info", "Fill up mo lahat paps para swabe!");
      return;
    }

    // 2. Email Format Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("Invalid Email", "Paki-check ang email format mo paps!");
      return;
    }

    // 3. Password Length Validation
    if (password.length < 6) {
      Alert.alert("Weak Password", "Dapat at least 6 characters ang password paps.");
      return;
    }

    // 4. Password Match Validation
    if (password !== retypePassword) {
      Alert.alert("Wait lang!", "Hindi match yung password mo paps.");
      return;
    }

    // 5. Terms Agreement Check
    if (!isAgree) {
      Alert.alert("Privacy Policy", "Paki-check yung agreement paps.");
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
          "Verify Your Email 🐿️", 
          "Nag-send kami ng code sa email mo paps. Pakicheck pati spam folder!",
          [{ 
            text: "Input Code", 
            onPress: () => router.replace({
              pathname: '/otpverify',
              params: { email: cleanEmail }
            }) 
          }]
        );
      } else {
        Alert.alert("Registration Failed", data.detail || "May error paps.");
      }
    } catch (e) {
      Alert.alert("Network Error", "Check mo server connection paps!");
    } finally {
      setLoading(false);
    }
  };

  const showPrivacyPolicy = () => {
    Alert.alert("Data Privacy", "We only collect Name and Email for FinAi account creation.");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.mainContainer}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <LinearGradient colors={['#4c8479', '#2b5f56']} style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Register{"\n"}Ka Munaaa{"\n"}Sebby Ko, Okay?</Text>
        </View>
        <View style={styles.logoCircle}>
             <Image source={require('../assets/images/squirrel_logoo.png')} style={styles.logo} resizeMode="contain" />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
        {/* Full Name */}
        <View style={styles.inputWrapper}>
          <Ionicons name="person" size={20} color="#999" style={styles.icon} />
          <TextInput 
            placeholder="Full Name" 
            placeholderTextColor="#999" 
            style={styles.input} 
            value={name} 
            onChangeText={setName} 
          />
        </View>

        {/* Email Address */}
        <View style={styles.inputWrapper}>
          <Ionicons name="mail" size={20} color="#999" style={styles.icon} />
          <TextInput 
            placeholder="Email Address" 
            placeholderTextColor="#999" 
            style={styles.input} 
            value={email} 
            onChangeText={setEmail} 
            keyboardType="email-address" 
            autoCapitalize="none" 
          />
        </View>

        {/* Password with Eye Toggle */}
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed" size={20} color="#999" style={styles.icon} />
          <TextInput 
            placeholder="Password" 
            placeholderTextColor="#999" 
            style={styles.input} 
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry={!showPassword} 
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Retype Password with Eye Toggle */}
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed" size={20} color="#999" style={styles.icon} />
          <TextInput 
            placeholder="Retype Password" 
            placeholderTextColor="#999" 
            style={styles.input} 
            value={retypePassword} 
            onChangeText={setRetypePassword} 
            secureTextEntry={!showRetypePassword} 
          />
          <TouchableOpacity onPress={() => setShowRetypePassword(!showRetypePassword)}>
            <Ionicons name={showRetypePassword ? "eye-off" : "eye"} size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Terms Checkbox */}
        <View style={styles.checkboxContainer}>
          <Checkbox value={isAgree} onValueChange={setAgree} color={isAgree ? '#2b5f56' : undefined} />
          <Text style={styles.checkboxLabel}> I agree to <Text style={styles.boldText} onPress={showPrivacyPolicy}>Terms & Privacy</Text></Text>
        </View>

        {/* Sign Up Button */}
        <TouchableOpacity style={styles.signupButton} onPress={handleSignup} disabled={loading}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign Up</Text>}
        </TouchableOpacity>

        {/* Footer Link */}
        <TouchableOpacity onPress={() => router.replace('/login')}>
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
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 30, borderWidth: 1.5, borderColor: '#2b5f56', marginBottom: 15, paddingHorizontal: 20, height: 55 },
  icon: { marginRight: 10 },
  input: { flex: 1, color: '#333', fontSize: 16 },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  checkboxLabel: { color: '#666', fontSize: 13, marginLeft: 8 },
  boldText: { fontWeight: 'bold', color: '#edb232' }, 
  signupButton: { backgroundColor: '#2b5f56', height: 55, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  footerText: { textAlign: 'center', marginTop: 25, color: '#666' },
  boldLink: { fontWeight: 'bold', color: '#2b5f56' }
});