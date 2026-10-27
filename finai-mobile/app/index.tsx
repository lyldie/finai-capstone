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
      try {
        const [savedPin, userId, token] = await Promise.all([
          getSecureItem('user_pin'),
          AsyncStorage.getItem('user_id'),
          getSecureItem('user_token'),
        ]);

        if (!userId || !token) {
          if (active) setRootScreen('/getstarted');
          return;
        }

        const response = await fetch(`${API_URL}/api/users/me/session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401 || response.status === 403) {
          await logoutUser();
          if (active) setRootScreen('/login?session=unavailable');
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
        const savedRole = await AsyncStorage.getItem('user_role');
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
