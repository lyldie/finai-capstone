import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTransactions, AppNotification } from '../../context/TransactionContext';

const GREEN = '#144A3D';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, isLoading, fetchTransactions, markNotificationRead } = useTransactions();

  useFocusEffect(useCallback(() => { fetchTransactions(); }, [fetchTransactions]));

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[styles.item, !item.is_read && styles.unread]}
      onPress={() => markNotificationRead(item.id)}
      activeOpacity={0.75}
    >
      <View style={[styles.icon, item.level === 'warning' ? styles.warning : styles.critical]}>
        <Ionicons name={item.level === 'warning' ? 'warning-outline' : 'alert-circle-outline'} size={21} color={item.level === 'warning' ? '#B45309' : '#B91C1C'} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{item.threshold}% budget alert</Text>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      {!item.is_read && <View style={styles.dot} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={GREEN} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.back} />
      </View>
      {isLoading ? <ActivityIndicator color={GREEN} style={styles.loader} /> : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={notifications.length ? styles.list : styles.empty}
          ListEmptyComponent={<View style={styles.emptyContent}><Ionicons name="notifications-off-outline" size={44} color="#8A9A86" /><Text style={styles.emptyTitle}>No budget alerts yet</Text><Text style={styles.emptyText}>We will notify you when a budget reaches 70%, 90%, or 100%.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F8' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E6ECE9' }, back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#F0F4F2' }, headerTitle: { color: GREEN, fontSize: 18, fontWeight: '800' }, loader: { marginTop: 40 }, list: { padding: 16 }, item: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6ECE9', borderRadius: 16, padding: 14, marginBottom: 10 }, unread: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }, icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, warning: { backgroundColor: '#FEF3C7' }, critical: { backgroundColor: '#FEE2E2' }, content: { flex: 1 }, title: { color: GREEN, fontWeight: '800', fontSize: 14, marginBottom: 4 }, message: { color: '#58706B', fontSize: 13, lineHeight: 18 }, date: { color: '#8A9A86', fontSize: 11, marginTop: 8 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginLeft: 8, marginTop: 4 }, empty: { flexGrow: 1, justifyContent: 'center', padding: 32 }, emptyContent: { alignItems: 'center' }, emptyTitle: { color: GREEN, fontSize: 17, fontWeight: '800', marginTop: 14 }, emptyText: { color: '#58706B', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
