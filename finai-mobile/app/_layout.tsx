import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

// Context Providers
import { TransactionProvider } from '../context/TransactionContext';
import { AuthProvider } from '../context/AuthContext';
import TransactionToastHost from '../components/TransactionToastHost';
import OfflineStatusBanner from '../components/OfflineStatusBanner';
import { FinAIAlertHost } from '../utils/FinAIAlert';
import { NetworkStatusProvider } from '../context/NetworkStatusContext';
import { WalkthroughProvider } from '../context/WalkthroughContext';

export { ErrorBoundary } from 'expo-router';

function AppShell() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineStatusBanner />
      <Stack screenOptions={{ headerShown: false }} initialRouteName="getstarted">
        <Stack.Screen name="index" />
        <Stack.Screen name="getstarted" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="setup-pin" />
        <Stack.Screen name="verify-pin" />
        <Stack.Screen name="pin-login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="plan-ahead" options={{ presentation: 'card' }} />
        <Stack.Screen name="fixed-bills" options={{ presentation: 'card' }} />
        <Stack.Screen name="category-forecast" options={{ presentation: 'card' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <TransactionToastHost />
      <FinAIAlertHost />
    </View>
  );
}

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
    <SafeAreaProvider>
      <AuthProvider>
        <NetworkStatusProvider>
          <WalkthroughProvider>
            <TransactionProvider>
              <AppShell />
            </TransactionProvider>
          </WalkthroughProvider>
        </NetworkStatusProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
