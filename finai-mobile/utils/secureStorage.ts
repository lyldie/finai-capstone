import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const isSecretKey = (key: string) => ['user_token', 'user_pin', 'offline_pin_attempts', 'offline_pin_locked_until'].includes(key);

async function readNativeSecret(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

async function writeNativeSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

/** Store credentials in Keychain/Android Keystore, migrating old values once. */
export async function getSecureItem(key: string): Promise<string | null> {
  if (!isSecretKey(key) || Platform.OS === 'web') return AsyncStorage.getItem(key);
  const secureValue = await SecureStore.getItemAsync(key);
  if (secureValue !== null) return secureValue;

  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue !== null) {
    await SecureStore.setItemAsync(key, legacyValue);
    await AsyncStorage.removeItem(key);
  }
  return legacyValue;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (!isSecretKey(key) || Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
  await AsyncStorage.removeItem(key);
}

export async function removeSecureItem(key: string): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key);
  await AsyncStorage.removeItem(key);
}

export async function verifyOfflinePin(inputPin: string): Promise<{ verified: boolean; locked: boolean; retryAfterSeconds: number }> {
  const savedPin = await getSecureItem('user_pin');
  if (!savedPin) return { verified: false, locked: false, retryAfterSeconds: 0 };

  const lockedUntil = Number(await readNativeSecret('offline_pin_locked_until')) || 0;
  const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
  if (remaining > 0) return { verified: false, locked: true, retryAfterSeconds: remaining };

  if (inputPin === savedPin) {
    await Promise.all([
      removeSecureItem('offline_pin_attempts'),
      removeSecureItem('offline_pin_locked_until'),
    ]);
    return { verified: true, locked: false, retryAfterSeconds: 0 };
  }

  const attempts = (Number(await readNativeSecret('offline_pin_attempts')) || 0) + 1;
  if (attempts >= 5) {
    await writeNativeSecret('offline_pin_attempts', '0');
    await writeNativeSecret('offline_pin_locked_until', String(Date.now() + 15 * 60 * 1000));
    return { verified: false, locked: true, retryAfterSeconds: 15 * 60 };
  }
  await writeNativeSecret('offline_pin_attempts', String(attempts));
  return { verified: false, locked: false, retryAfterSeconds: 0 };
}
