import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, SafeAreaView
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#8BA19D';
const BG = '#f4f7f6';

interface AuditLog {
  id: string;
  action: string;
  admin_name: string;
  timestamp: string;
}

export default function AuditLogsScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [])
  );

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/logs/`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (response.status === 401) {
        setLogs([]);
        return;
      }
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  // Small visual language so the timeline reads at a glance -- archive
  // actions get a muted amber dot, everything else keeps the brand teal.
  const dotColorFor = (action: string) => (action.toLowerCase().includes('archiv') ? '#edb232' : TEAL);

  const renderLogItem = ({ item, index }: { item: AuditLog, index: number }) => (
    <View style={styles.logItem}>
      <View style={styles.timelineContainer}>
        <View style={[styles.timelineDot, { backgroundColor: dotColorFor(item.action) }]} />
        {index !== logs.length - 1 && <View style={styles.timelineLine} />}
      </View>

      <View style={styles.card}>
        <Text style={styles.actionText}>{item.action}</Text>
        <View style={styles.detailsRow}>
          <Ionicons name="person-circle-outline" size={14} color={SAGE} />
          <Text style={styles.adminText}>{item.admin_name}</Text>
          <Text style={styles.dotSeparator}>•</Text>
          <Ionicons name="time-outline" size={14} color={SAGE} />
          <Text style={styles.timeText}>{formatDate(item.timestamp)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={styles.title}>Audit Logs</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} />
      ) : logs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={40} color={SAGE} />
          <Text style={styles.emptyText}>No activity recorded yet.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: DEEP_GREEN },
  listContent: { paddingHorizontal: 25, paddingBottom: 30 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText: { color: SAGE, fontSize: 14, fontWeight: '500' },
  logItem: { flexDirection: 'row', marginBottom: 14 },
  timelineContainer: { alignItems: 'center', marginRight: 14, width: 18 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, zIndex: 2 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#d7e0dc', marginTop: -2, marginBottom: -14 },
  card: {
    flex: 1, backgroundColor: '#ffffff', padding: 16, borderRadius: 16,
    shadowColor: DEEP_GREEN, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  actionText: { fontSize: 15, fontWeight: '700', color: DEEP_GREEN, marginBottom: 8 },
  detailsRow: { flexDirection: 'row', alignItems: 'center' },
  adminText: { fontSize: 12, color: SAGE, marginLeft: 4 },
  timeText: { fontSize: 12, color: SAGE, marginLeft: 4 },
  dotSeparator: { marginHorizontal: 6, color: SAGE, fontSize: 12 },
});