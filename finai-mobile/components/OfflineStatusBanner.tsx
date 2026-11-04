import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import { useTransactions } from '../context/TransactionContext';
import { userFacingError } from '../utils/userFacingError';

export default function OfflineStatusBanner() {
  const segments = useSegments();
  const { user } = useAuth();
  const { isOnline, checking, checkNow } = useNetworkStatus();
  const { pendingTransactionCount, syncPendingTransactions } = useTransactions();
  const appPage = segments[0] === '(tabs)' || ['plan-ahead', 'category-forecast', 'chat', 'messages'].includes(segments[0] || '');
  const offline = isOnline === false;
  if (!user || !appPage || (!offline && !(isOnline && pendingTransactionCount > 0))) return null;

  const syncNow = async () => {
    try {
      const synced = await syncPendingTransactions();
      if (synced < pendingTransactionCount) {
        Alert.alert(
          synced > 0 ? 'Some changes need review' : 'Sync paused',
          `${synced > 0 ? `${synced} change${synced === 1 ? '' : 's'} synced. ` : ''}Open Transactions → Review saved changes to retry or remove a rejected change.`,
        );
      }
    } catch (error) {
      Alert.alert('Sync paused', userFacingError(error, 'Your changes remain saved on this device. Try again when the connection is stable.'));
    }
  };

  const showOfflineDetails = () => Alert.alert(
    offline ? 'Using FinAI offline' : 'Changes waiting to sync',
    offline
      ? 'You can view saved transactions and Insights, and add, edit, or archive transactions, budgets, and goals. Changes stay on this device and sync when the connection returns.\n\nNeeds internet: receipt scanning, Finn chat and new Plan Ahead analysis, changing account details or PIN/password, cloud backup/restore, and server/email notifications. Open Plan Ahead to see your last saved forecast. Offline access requires a previous online sign-in and data load.'
      : 'Your changes are still stored on this device. FinAI will sync them automatically, or you can tap Sync now. If syncing pauses, open Transactions to review pending changes.',
    [{ text: 'Got it' }],
  );

  return (
    <View style={[styles.banner, offline ? styles.offline : styles.pending]} accessibilityLiveRegion="polite">
      <Ionicons name={offline ? 'cloud-offline-outline' : 'cloud-upload-outline'} size={17} color={offline ? '#6A4B0B' : '#315D4D'} />
      <TouchableOpacity style={styles.copy} onPress={showOfflineDetails} accessibilityRole="button" accessibilityLabel="Read what works offline">
        <Text style={styles.title}>{offline ? `Offline mode${pendingTransactionCount ? ` · ${pendingTransactionCount} changes waiting` : ''}` : `${pendingTransactionCount} ${pendingTransactionCount === 1 ? 'change' : 'changes'} waiting to sync`}</Text>
        <Text style={styles.subtitle}>{offline ? 'Changes stay on this device · Tap for details' : 'Connection restored · Sync automatically or tap Sync now'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => offline ? void checkNow() : void syncNow()} disabled={checking} accessibilityRole="button" accessibilityLabel={offline ? 'Check connection' : 'Sync saved changes'}>
        <Text style={styles.check}>{offline ? (checking ? 'Checking…' : 'Check') : 'Sync now'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1 }, offline: { backgroundColor: '#FFF1C9', borderBottomColor: '#E8D59D' }, pending: { backgroundColor: '#E4F1EB', borderBottomColor: '#C9DED3' },
  copy: { flex: 1 }, title: { color: '#59420E', fontSize: 12, fontWeight: '800' }, subtitle: { color: '#725D2B', fontSize: 10, marginTop: 1 },
  check: { color: '#315D4D', fontSize: 12, fontWeight: '800', padding: 7 },
});
