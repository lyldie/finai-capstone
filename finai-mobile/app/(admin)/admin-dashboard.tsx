import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, SafeAreaView, Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';

const { width } = Dimensions.get('window');
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logoutUser } = useAuth();
  const [activeUserCount, setActiveUserCount] = useState<number | null>(null);

  useEffect(() => {
    // CHANGED: this used to just show a static "Fetching..." string forever.
    // Now it actually calls the (now-gated) users endpoint and shows a real
    // count of active (non-archived) users.
    const fetchActiveUserCount = async () => {
      if (!user?.token) return;
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
    };
    fetchActiveUserCount();
  }, [user]);

  const handleLogout = async () => {
    await logoutUser();
    router.replace('/login');
  };

  const MenuCard = ({ title, icon, color, onPress, subtitle }: any) => (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" />

      <LinearGradient colors={['#F7FBF9', '#FFFFFF']} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>finAI Control Panel</Text>
            <Text style={styles.adminName}>Hello, {user?.name || 'Admin'}! 👋</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#FF5252" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>System Health</Text>
            <Text style={[styles.statValue, { color: '#2ECC71' }]}>Optimal</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Active Users</Text>
            <Text style={styles.statValue}>{activeUserCount !== null ? activeUserCount : '—'}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Presets Manager</Text>
        <View style={styles.grid}>
          <MenuCard
            title="Categories"
            subtitle="Income & Expenses"
            icon="pricetags-outline"
            color={TEAL}
            onPress={() => router.push('/(admin)/categories')}
          />
          <MenuCard
            title="Accounts"
            subtitle="Bank, Cash, etc."
            icon="wallet-outline"
            color={GOLD}
            onPress={() => router.push('/(admin)/accounts')}
          />
          <MenuCard
            title="Goal Types"
            subtitle="Savings Targets"
            icon="trophy-outline"
            color="#4A90E2"
            onPress={() => router.push('/(admin)/goal-types')}
          />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>System Management</Text>
        <View style={styles.grid}>
          <MenuCard
            title="User Management"
            subtitle="Active & archived"
            icon="people-outline"
            color="#6C5CE7"
            onPress={() => router.push('/(admin)/users' as any)}
          />
          <MenuCard
            title="Audit Logs"
            subtitle="History of activities"
            icon="receipt-outline"
            color={SAGE}
            onPress={() => router.push('/(admin)/logs' as any)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F0F4F3' },
  header: { padding: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  greeting: { fontSize: 13, color: SAGE, fontWeight: '700', letterSpacing: 1 },
  adminName: { fontSize: 24, fontWeight: '900', color: DEEP_GREEN },
  logoutBtn: { padding: 10, backgroundColor: '#FFF0F0', borderRadius: 14 },
  statsRow: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 2 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: SAGE, marginBottom: 5, fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '900', color: DEEP_GREEN },
  divider: { width: 1, height: '100%', backgroundColor: '#EEE' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: DEEP_GREEN, marginBottom: 14, paddingLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { backgroundColor: 'white', width: width * 0.43, borderRadius: 22, padding: 20, marginBottom: 15, elevation: 3, shadowColor: DEEP_GREEN, shadowOpacity: 0.06, shadowRadius: 8 },
  iconContainer: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: DEEP_GREEN },
  cardSubtitle: { fontSize: 11, color: SAGE, marginTop: 3, fontWeight: '500' },
});