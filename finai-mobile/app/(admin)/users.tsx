import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, SafeAreaView, Alert
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#8BA19D';
const BG = '#f4f7f6';
const DANGER = '#c62828';
const ADMIN_BLUE = '#1976d2';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_archived?: boolean;
}

export default function UsersManagementScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const router = useRouter();
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      fetchUsers(view);
    }, [view])
  );

  const fetchUsers = async (which: 'active' | 'archived') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/?archived=${which === 'archived'}`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (response.status === 401) {
        Alert.alert("Session Expired", "Please log in again.");
        setUsers([]);
        return;
      }
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const archiveUser = (id: string, name: string) => {
    Alert.alert("Archive User", `${name} will be blocked from logging in, but their data (transactions, goals) stays intact and can be restored anytime.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive", style: "destructive",
        onPress: async () => {
          const response = await fetch(`${API_URL}/api/users/${id}/archive`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${user?.token}` },
          });
          if (response.ok) {
            fetchUsers(view);
          } else if (response.status === 401) {
            Alert.alert("Session Expired", "Please log in again.");
          } else if (response.status === 403) {
            Alert.alert("Not Allowed", "Admin accounts cannot be archived this way.");
          } else {
            Alert.alert("Error", "Couldn't archive this user.");
          }
        }
      }
    ]);
  };

  const restoreUser = async (id: string) => {
    const response = await fetch(`${API_URL}/api/users/${id}/restore`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user?.token}` },
    });
    if (response.ok) fetchUsers(view);
    else if (response.status === 401) Alert.alert("Session Expired", "Please log in again.");
    else Alert.alert("Error", "Couldn't restore this user.");
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={[styles.card, item.is_archived && styles.cardArchived]}>
      <View style={styles.cardInfo}>
        <View style={[
          styles.iconBox,
          { backgroundColor: item.is_archived ? '#ebebeb' : (item.role === 'admin' ? '#e3f2fd' : '#e8f5e9') }
        ]}>
          <Ionicons
            name={item.role === 'admin' ? "shield-checkmark" : "person"}
            size={20}
            color={item.is_archived ? SAGE : (item.role === 'admin' ? ADMIN_BLUE : '#2e7d32')}
          />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.cardTitle, item.is_archived && styles.cardTextArchived]}>{item.name}</Text>
          <Text style={styles.cardSubtitle}>{item.email}</Text>
        </View>
      </View>

      {item.is_archived ? (
        <TouchableOpacity onPress={() => restoreUser(item.id)} style={styles.restoreBtn}>
          <Ionicons name="refresh-outline" size={16} color={TEAL} />
          <Text style={styles.restoreText}>Restore</Text>
        </TouchableOpacity>
      ) : item.role !== 'admin' ? (
        <TouchableOpacity onPress={() => archiveUser(item.id, item.name)} style={styles.archiveBtn}>
          <Ionicons name="archive-outline" size={18} color={DANGER} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={styles.title}>User Management</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, view === 'active' && styles.tabBtnActive]}
          onPress={() => setView('active')}
        >
          <Text style={[styles.tabText, view === 'active' && styles.tabTextActive]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, view === 'archived' && styles.tabBtnActive]}
          onPress={() => setView('archived')}
        >
          <Text style={[styles.tabText, view === 'archived' && styles.tabTextActive]}>Archived</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} />
      ) : users.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name={view === 'active' ? 'people-outline' : 'archive-outline'} size={40} color={SAGE} />
          <Text style={styles.emptyText}>
            {view === 'active' ? 'No registered users yet.' : 'No archived users right now.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 20, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: '900', color: DEEP_GREEN },
  tabRow: { flexDirection: 'row', marginHorizontal: 25, marginBottom: 16, backgroundColor: '#e9efec', borderRadius: 14, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  tabBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '700', color: SAGE },
  tabTextActive: { color: DEEP_GREEN },
  listContent: { paddingHorizontal: 25, paddingBottom: 30 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText: { color: SAGE, fontSize: 14, fontWeight: '500' },
  card: {
    backgroundColor: '#ffffff', padding: 18, borderRadius: 18, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardArchived: { backgroundColor: '#f7f7f7', shadowOpacity: 0 },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: DEEP_GREEN },
  cardTextArchived: { color: SAGE },
  cardSubtitle: { fontSize: 12, color: SAGE, marginTop: 2 },
  archiveBtn: { padding: 8, backgroundColor: '#ffebee', borderRadius: 10 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eaf3f0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  restoreText: { color: TEAL, fontWeight: '700', fontSize: 12 },
});