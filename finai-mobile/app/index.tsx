import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { getSecureItem } from '../utils/secureStorage';


export default function Index() {
  const [rootScreen, setRootScreen] = useState<string | null>(null);
  const { isLoading: authLoading, logoutUser } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    const checkUserStatus = async () => {
      let savedRole: string | null = null;
      try {
        // If Android recreated the app while email verification was pending,
        // resume that flow before sending an unauthenticated user to welcome.
        const signupDraft = await AsyncStorage.getItem('@finai_signup_draft');
        if (signupDraft) {
          try {
            const draft = JSON.parse(signupDraft);
            if (typeof draft.verificationEmail === 'string' && draft.verificationEmail.trim()) {
              if (active) setRootScreen(`/otpverify?email=${encodeURIComponent(draft.verificationEmail.trim())}`);
              return;
            }
          } catch { /* Ignore an invalid local signup draft. */ }
        }

        const [savedPin, userId, token] = await Promise.all([
          getSecureItem('user_pin'),
          AsyncStorage.getItem('user_id'),
          getSecureItem('user_token'),
        ]);

        if (!userId) {
          if (active) setRootScreen('/getstarted');
          return;
        }

        savedRole = await AsyncStorage.getItem('user_role');
        // A regular user with a locally saved PIN can still unlock this device
        // when the session token is missing. Admin access remains online-only.
        if (!token) {
          if (savedRole !== 'admin' && savedPin) {
            if (active) setRootScreen('/pin-login');
          } else if (active) {
            setRootScreen('/login?session=unavailable');
          }
          return;
        }

        const response = await fetch(`${API_URL}/api/users/me/session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401 || response.status === 403) {
          // Access tokens expire after 12 hours. Keep a regular user's local
          // PIN and offline cache so PIN verification can renew the session
          // online or unlock saved data offline. Admin access stays online-only.
          if (savedRole !== 'admin' && savedPin) {
            if (active) setRootScreen('/pin-login');
          } else {
            await logoutUser();
            if (active) setRootScreen('/login?session=unavailable');
          }
          return;
        }
        if (!response.ok) throw new Error('Could not verify this session.');

        const session = await response.json();
        if (session.role === 'admin') {
          if (active) setRootScreen('/(admin)/admin-dashboard');
        } else if (session.has_pin) {
          if (active) setRootScreen('/pin-login');
        } else if (active) setRootScreen('/setup-pin');
      } catch {
        // Admin access is never granted from a cached local role while offline.
        // Regular users can still unlock their locally stored PIN for offline viewing.
        if (savedRole === 'admin') {
          if (active) setRootScreen('/login?session=unavailable');
        } else if (await getSecureItem('user_pin')) {
          if (active) setRootScreen('/pin-login');
        } else if (active) {
          setRootScreen('/login?session=unavailable');
        }
      }
    };

    void checkUserStatus();
    return () => { active = false; };
  }, [authLoading, logoutUser]);

  if (!rootScreen) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1c3c36' }}>
        <ActivityIndicator size="large" color="#edb232" />
      </View>
    );
  }

  return <Redirect href={rootScreen as any} />;
}
