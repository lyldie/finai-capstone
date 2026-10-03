import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, SafeAreaView
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#8BA19D';
const BG = '#F4F7F6';

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

  const dotColorFor = (action: string) => (action.toLowerCase().includes('archiv') ? '#EDB232' : TEAL);

  const renderLogItem = ({ item, index }: { item: AuditLog, index: number }) => (
    <View style={styles.logItem}>
      <View style={styles.timelineContainer}>
        <View style={[styles.timelineDot, { backgroundColor: dotColorFor(item.action) }]} />
        {index !== logs.length - 1 && <View style={styles.timelineLine} />}
      </View>

      <View style={styles.card}>
        <Text style={styles.actionText}>{item.action}</Text>
        <View style={styles.detailsRow}>
          <View style={styles.detailPill}>
            <Ionicons name="person-circle" size={14} color={TEAL} />
            <Text style={styles.adminText}>{item.admin_name}</Text>
          </View>
          <View style={styles.detailPill}>
            <Ionicons name="time" size={14} color={SAGE} />
            <Text style={styles.timeText}>{formatDate(item.timestamp)}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <LinearGradient colors={[TEAL, DEEP_GREEN]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>System Audit Logs</Text>
          <View style={{ width: 38 }} />
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} />
      ) : logs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={SAGE} />
          <Text style={styles.emptyText}>No activity recorded yet.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 30, 
    paddingBottom: 25, 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30, 
    elevation: 6,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { padding: 8, backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  
  listContent: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 40 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  emptyText: { color: SAGE, fontSize: 14, fontWeight: '600' },
  
  logItem: { flexDirection: 'row', marginBottom: 16 },
  timelineContainer: { alignItems: 'center', marginRight: 16, width: 18, marginTop: 4 },
  timelineDot: { width: 14, height: 14, borderRadius: 7, zIndex: 2, borderWidth: 3, borderColor: '#FFFFFF', elevation: 2 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#D1D5DB', marginTop: -4, marginBottom: -20 },
  
  card: {
    flex: 1, backgroundColor: '#ffffff', padding: 18, borderRadius: 20,
    shadowColor: DEEP_GREEN, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  actionText: { fontSize: 15, fontWeight: '800', color: DEEP_GREEN, marginBottom: 12, lineHeight: 22 },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  
  detailPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  adminText: { fontSize: 11, color: DEEP_GREEN, fontWeight: '700' },
  timeText: { fontSize: 11, color: SAGE, fontWeight: '600' },
});