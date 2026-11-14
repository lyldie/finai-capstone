import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Alert } from '../utils/FinAIAlert';
import Svg, { Path } from 'react-native-svg';
import { isExpoGo } from '../utils/runtime';

type Props = {
  disabled?: boolean;
  onGoogleAccountSelected?: () => Promise<boolean>;
  onIdToken: (idToken: string) => Promise<void>;
};

export default function GoogleSignInButton({ disabled = false, onGoogleAccountSelected, onIdToken }: Props) {
  const [loading, setLoading] = useState(false);

  // Expo Go does not include this native module. Keep the email/password flow
  // usable there, while leaving Google Sign-In available in app builds.
  if (isExpoGo) return null;

  const handlePress = async () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
    if (!webClientId) {
      Alert.alert('Google sign-in unavailable', 'Google OAuth setup is not complete yet. You can still use email and password.');
      return;
    }

    setLoading(true);
    try {
      // Require only when the user taps the button so Expo Go never evaluates
      // the missing native module during route startup.
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId, ...(iosClientId ? { iosClientId } : {}) });
      // FinAI logout does not clear the native Google Sign-In session. Clear
      // that app session before interactive sign-in so the user can choose
      // which Google account to use on both Login and Sign Up.
      if (GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled') return;
      const idToken = result.data.idToken;
      if (!idToken) throw new Error('Google did not return a sign-in token. Please try again.');
      if (onGoogleAccountSelected && !(await onGoogleAccountSelected())) return;
      await onIdToken(idToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign in with Google. Please try again.';
      Alert.alert('Google sign-in failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, (disabled || loading) && styles.disabled]}
      onPress={() => { void handlePress(); }}
      disabled={disabled || loading}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      {loading ? <ActivityIndicator color="#1c3c36" /> : <>
        <Svg width={20} height={20} viewBox="0 0 48 48" accessibilityLabel="Google">
          <Path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
          <Path fill="#FF3D00" d="M24 44c5.5 0 10.2-1.8 13.6-4.9L31 34c-1.8 1.2-4.1 1.9-7 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
          <Path fill="#4CAF50" d="M12.6 27.5a12 12 0 0 1 0-7V15H5.8a20 20 0 0 0 0 18l6.8-5.5Z" />
          <Path fill="#1976D2" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.9-5.9C34.2 6.1 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.5C14.2 15.7 18.7 12.1 24 12.1Z" />
        </Svg>
        <Text style={styles.label}>Continue with Google</Text>
      </>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    width: '100%',
    borderRadius: 28,
    borderWidth: 1.3,
    borderColor: '#D6E0DC',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: { color: '#26332F', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.62 },
});
