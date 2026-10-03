import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, SafeAreaView, Dimensions
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';

const { width } = Dimensions.get('window');
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const BG_COLOR = '#F4F7F6';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logoutUser } = useAuth();
  
  const [activeUserCount, setActiveUserCount] = useState<number | null>(null);
  
  // NEW: Dynamic System Health State
  const [systemHealth, setSystemHealth] = useState<'Optimal' | 'Degraded' | 'Offline' | 'Checking...'>('Checking...');

  useFocusEffect(
    useCallback(() => {
      const fetchDashboardData = async () => {
        if (!user?.token) return;

        // 1. Fetch Active Users
        try {
          const res = await fetch(`${API_URL}/api/users/?archived=false`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setActiveUserCount(Array.isArray(data) ? data.filter((u: any) => u.role !== 'admin').length : null);
          }
        } catch (e) {
          console.error("Could not fetch active user count:", e);
        }

        // 2. Fetch System Health Status (OCR & Advisor Check)
        try {
          const healthRes = await fetch(`${API_URL}/api/health`);
          if (healthRes.ok) {
            const healthData = await healthRes.json();
            if (healthData.status === 'optimal') setSystemHealth('Optimal');
            else if (healthData.status === 'degraded') setSystemHealth('Degraded');
            else setSystemHealth('Offline');
          } else {
            setSystemHealth('Offline');
          }
        } catch (e) {
          setSystemHealth('Offline'); // Kung di ma-contact ang backend
        }
      };
      
      fetchDashboardData();
    }, [user])
  );

  const handleLogout = async () => {
    await logoutUser();
    router.replace('/login');
  };

  // Determine colors based on health status
  let healthColor = '#2ECC71'; // Green for Optimal
  let healthBg = '#E8F5E9';
  if (systemHealth === 'Degraded') {
    healthColor = '#F59E0B'; // Orange
    healthBg = '#FEF3C7';
  } else if (systemHealth === 'Offline') {
    healthColor = '#EF4444'; // Red
    healthBg = '#FEE2E2';
  } else if (systemHealth === 'Checking...') {
    healthColor = SAGE; // Gray
    healthBg = '#F3F4F6';
  }

  const MenuCard = ({ title, icon, color, onPress, subtitle }: any) => (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
      <View style={styles.cardArrow}>
        <Ionicons name="chevron-forward" size={16} color={SAGE} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={[TEAL, DEEP_GREEN]} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>FINAI CONTROL PANEL</Text>
            <Text style={styles.adminName}>Hello, {user?.name?.split(' ')[0] || 'Admin'}! 👋</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#FF7675" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>System Health</Text>
            {/* CHANGED: Dynamic Status Badge */}
            <View style={[styles.statusBadge, { backgroundColor: healthBg }]}>
              <View style={[styles.statusDot, { backgroundColor: healthColor }]} />
              <Text style={[styles.statValueGreen, { color: healthColor }]}>{systemHealth}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Active Users</Text>
            <Text style={styles.statValueDark}>{activeUserCount !== null ? activeUserCount : '—'}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Presets Manager</Text>
        <View style={styles.grid}>
          <MenuCard title="Categories" subtitle="Income & Expenses" icon="pricetags" color={TEAL} onPress={() => router.push('/(admin)/categories')} />
          <MenuCard title="Accounts" subtitle="Bank, Cash, etc." icon="wallet" color={GOLD} onPress={() => router.push('/(admin)/accounts')} />
          <MenuCard title="Goal Types" subtitle="Savings Targets" icon="trophy" color="#4A90E2" onPress={() => router.push('/(admin)/goal-types')} />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 10 }]}>System Management</Text>
        <View style={styles.grid}>
          <MenuCard title="Users" subtitle="Active & Archived" icon="people" color="#6C5CE7" onPress={() => router.push('/(admin)/users' as any)} />
          <MenuCard title="Audit Logs" subtitle="History of Actions" icon="receipt" color={SAGE} onPress={() => router.push('/(admin)/logs' as any)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: BG_COLOR },
  header: { 
    padding: 25, paddingTop: 35, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, 
    elevation: 8, shadowColor: DEEP_GREEN, shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 5 }
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  greeting: { fontSize: 11, color: '#A3D2CA', fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  adminName: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  logoutBtn: { padding: 10, backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 14 },
  statsRow: { 
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 22, padding: 18, 
    elevation: 5, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    transform: [{ translateY: 25 }] 
  },
  statBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, color: SAGE, marginBottom: 6, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 6 },
  statValueGreen: { fontSize: 14, fontWeight: '800' },
  statValueDark: { fontSize: 22, fontWeight: '900', color: DEEP_GREEN },
  divider: { width: 1, height: '100%', backgroundColor: '#F0F0F0' },
  scrollContent: { padding: 25, paddingTop: 50, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: DEEP_GREEN, marginBottom: 14, paddingLeft: 4, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { 
    backgroundColor: 'white', width: width * 0.42, borderRadius: 24, padding: 18, marginBottom: 16, 
    elevation: 3, shadowColor: DEEP_GREEN, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    position: 'relative'
  },
  iconContainer: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: DEEP_GREEN, marginBottom: 2 },
  cardSubtitle: { fontSize: 11, color: SAGE, fontWeight: '600' },
  cardArrow: { position: 'absolute', top: 18, right: 18 },
});