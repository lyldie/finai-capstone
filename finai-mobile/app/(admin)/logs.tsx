import React, { useState, useCallback } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  ActivityIndicator, StatusBar, SafeAreaView 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';

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

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [])
  );

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/logs/`);
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper para mas magandang basahin ang date (e.g., 8/21/2026, 8:50 PM)
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString(); 
  };

  const renderLogItem = ({ item, index }: { item: AuditLog, index: number }) => (
    <View style={styles.logItem}>
      
      {/* TIMELINE DESIGN: Yung guhit at bilog sa gilid */}
      <View style={styles.timelineContainer}>
        <View style={styles.timelineDot} />
        {/* Wag lalagyan ng guhit sa ilalim kung ito na yung pinakahuling item */}
        {index !== logs.length - 1 && <View style={styles.timelineLine} />}
      </View>
      
      {/* LOG CARD */}
      <View style={styles.card}>
        <Text style={styles.actionText}>{item.action}</Text>
        <View style={styles.detailsRow}>
          <Ionicons name="person-circle-outline" size={14} color="#8BA19D" />
          <Text style={styles.adminText}>{item.admin_name}</Text>
          <Text style={styles.dotSeparator}>•</Text>
          <Ionicons name="time-outline" size={14} color="#8BA19D" />
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
          <Ionicons name="arrow-back" size={24} color="#1c3c36" />
        </TouchableOpacity>
        <Text style={styles.title}>Audit Logs</Text>
        <View style={{width: 24}} /> 
      </View>

      {loading ? <ActivityIndicator size="large" color="#3D7D6C" style={{flex: 1}} /> : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No recent activities recorded.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25 },
  title: { fontSize: 24, fontWeight: '900', color: '#1c3c36' },
  listContent: { paddingHorizontal: 25, paddingBottom: 40 },
  logItem: { flexDirection: 'row', marginBottom: 15 },
  timelineContainer: { alignItems: 'center', marginRight: 15, width: 20 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3D7D6C', zIndex: 2 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#c5d1ce', marginTop: -2, marginBottom: -15 },
  card: { flex: 1, backgroundColor: '#ffffff', padding: 16, borderRadius: 15, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  actionText: { fontSize: 15, fontWeight: '700', color: '#1c3c36', marginBottom: 8 },
  detailsRow: { flexDirection: 'row', alignItems: 'center' },
  adminText: { fontSize: 12, color: '#8BA19D', marginLeft: 4 },
  timeText: { fontSize: 12, color: '#8BA19D', marginLeft: 4 },
  dotSeparator: { marginHorizontal: 6, color: '#8BA19D', fontSize: 12 },
  emptyText: { textAlign: 'center', color: '#8BA19D', marginTop: 50, fontStyle: 'italic' }
});