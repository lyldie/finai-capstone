import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, SafeAreaView, Alert
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
const DANGER = '#EF4444';
const ADMIN_BLUE = '#1976D2';

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
    Alert.alert("Archive User", `${name} will be blocked from logging in, but their data stays intact.`, [
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
          { backgroundColor: item.is_archived ? '#E5E7EB' : (item.role === 'admin' ? '#E0F2FE' : '#E8F5E9') }
        ]}>
          <Ionicons
            name={item.role === 'admin' ? "shield-checkmark" : "person"}
            size={22}
            color={item.is_archived ? SAGE : (item.role === 'admin' ? ADMIN_BLUE : '#2E7D32')}
          />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.cardTitle, item.is_archived && styles.cardTextArchived]}>{item.name}</Text>
          <Text style={styles.cardSubtitle}>{item.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: item.role === 'admin' ? '#E0F2FE' : '#F1F5F9' }]}>
            <Text style={[styles.roleText, { color: item.role === 'admin' ? ADMIN_BLUE : SAGE }]}>
              {item.role.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {item.is_archived ? (
        <TouchableOpacity onPress={() => restoreUser(item.id)} style={styles.restoreBtn}>
          <Ionicons name="refresh-outline" size={15} color={TEAL} />
          <Text style={styles.restoreText}>Restore</Text>
        </TouchableOpacity>
      ) : item.role !== 'admin' ? (
        <TouchableOpacity onPress={() => archiveUser(item.id, item.name)} style={styles.archiveBtn}>
          <Ionicons name="archive-outline" size={17} color={DANGER} />
        </TouchableOpacity>
      ) : null}
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
          <Text style={styles.title}>User Management</Text>
          <View style={{ width: 38 }} />
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
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} />
      ) : users.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name={view === 'active' ? 'people-outline' : 'archive-outline'} size={48} color={SAGE} />
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
    paddingBottom: 20, 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30, 
    elevation: 6,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backBtn: { padding: 8, backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  
  tabRow: { flexDirection: 'row', backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 14, padding: 4, marginTop: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  tabBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#E0F2FE' },
  tabTextActive: { color: DEEP_GREEN, fontWeight: '900' },

  listContent: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  emptyText: { color: SAGE, fontSize: 14, fontWeight: '600' },
  
  card: {
    backgroundColor: '#ffffff', padding: 18, borderRadius: 20, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardArchived: { backgroundColor: '#FAFAFA', shadowOpacity: 0, borderWidth: 1, borderColor: '#EEEEEE' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  iconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: DEEP_GREEN, marginBottom: 2 },
  cardTextArchived: { color: SAGE },
  cardSubtitle: { fontSize: 12, color: SAGE, marginBottom: 6 },
  
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  roleText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  archiveBtn: { padding: 10, backgroundColor: '#FFEDED', borderRadius: 12 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  restoreText: { color: TEAL, fontWeight: '800', fontSize: 12 },
});