import FontAwesome from '@expo/vector-icons/FontAwesome';

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';

import { useFonts } from 'expo-font';

import { Stack, useRouter } from 'expo-router';

import * as SplashScreen from 'expo-splash-screen';

import { useEffect, useState } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import 'react-native-reanimated';

import { TransactionProvider } from '../context/TransactionContext';



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



  return <RootLayoutNav />;

}



function RootLayoutNav() {

  const [isReady, setIsReady] = useState(false);

  const router = useRouter();



  useEffect(() => {

    const checkAuth = async () => {

      try {

        const userId = await AsyncStorage.getItem('user_id');

        // Imbes na router.replace agad sa loob ng useEffect,

        // hayaan muna natin na mag-render yung Stack.

        // Pero dito natin i-set ang state para malaman ng app kung ano ang gagawin.

        setIsReady(true);

       

        // Timeout lang para siguradong loaded ang navigation stack

        setTimeout(() => {

          if (userId) {

            router.replace('/verify-pin');

          } else {

            router.replace('/getstarted');

          }

        }, 100);

      } catch (e) {

        setIsReady(true);

      }

    };

    checkAuth();

  }, []);



  if (!isReady) return null;



  return (

    <TransactionProvider>

      <ThemeProvider value={DefaultTheme}>

        <Stack screenOptions={{ headerShown: false }}>

          <Stack.Screen name="index" />

          <Stack.Screen name="getstarted" />

          <Stack.Screen name="login" />

          <Stack.Screen name="signup" />

          <Stack.Screen name="setup-pin" />

          <Stack.Screen name="verify-pin" />

          <Stack.Screen name="(tabs)" />

          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />

        </Stack>

      </ThemeProvider>

    </TransactionProvider>

  );

} 

