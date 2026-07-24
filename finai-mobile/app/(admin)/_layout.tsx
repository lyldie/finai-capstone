import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AdminLayout() {
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      const role = await AsyncStorage.getItem('user_role');
      // Kung hindi admin, kick-out agad pabalik sa login
      if (role !== 'admin') {
        router.replace('/login');
      }
    };
    checkAdmin();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="admin-dashboard" />
      {/* Dito mo rin ilalagay ang future admin pages like: */}
      {/* <Stack.Screen name="categories" /> */}
    </Stack>
  );
}