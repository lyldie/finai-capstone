import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

// Context Providers
import { TransactionProvider } from '../context/TransactionContext';
import { AuthProvider } from '../context/AuthContext';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <TransactionProvider>
        {/* Tinanggal na natin yung ThemeProvider galing react-navigation */}
        <Stack screenOptions={{ headerShown: false }} initialRouteName="getstarted">
          <Stack.Screen name="index" />
          <Stack.Screen name="getstarted" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="setup-pin" />
          <Stack.Screen name="verify-pin" />
          <Stack.Screen name="pin-login" /> 
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </TransactionProvider>
    </AuthProvider>
  );
}