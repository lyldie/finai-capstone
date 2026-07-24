import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  StatusBar, SafeAreaView, Dimensions 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function AdminDashboard() {
  const router = useRouter();
  const [adminName, setAdminName] = useState('Admin');

  useEffect(() => {
    const checkAdmin = async () => {
      const role = await AsyncStorage.getItem('user_role');
      const name = await AsyncStorage.getItem('user_name');
      if (role !== 'admin') {
        router.replace('/login');
      }
      if (name) setAdminName(name);
    };
    checkAdmin();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.clear();
    router.replace('/login');
  };

  // INAYOS KO NA 'YUNG MENU CARD: Gumagamit na siya ng 'onPress' prop
  const MenuCard = ({ title, icon, color, onPress, subtitle }: any) => (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={30} color={color} />
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
            <Text style={styles.adminName}>Hello, {adminName}! 👋</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#FF5252" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>System Health</Text>
            <Text style={[styles.statValue, {color: '#2ECC71'}]}>Optimal</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Active Users</Text>
            <Text style={styles.statValue}>Fetching...</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Presets Manager</Text>
        <View style={styles.grid}>
          <MenuCard 
            title="Categories" 
            subtitle="Income & Expenses"
            icon="list-outline" 
            color="#3D7D6C" 
            onPress={() => router.push('/(admin)/categories')}
          />
          <MenuCard 
            title="Accounts" 
            subtitle="Bank, Cash, etc."
            icon="wallet-outline" 
            color="#edb232" 
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

        <Text style={[styles.sectionTitle, {marginTop: 20}]}>System Management</Text>
        <View style={styles.grid}>
          <MenuCard 
            title="User Management" 
            subtitle="Control panel"
            icon="people-outline" 
            color="#6C5CE7" 
            onPress={() => console.log('Go to Users')}
          />
          <MenuCard 
            title="Audit Logs" 
            subtitle="History of activities"
            icon="receipt-outline" 
            color="#A0A0A0" 
            onPress={() => console.log('Go to Logs')}
          />
        </View>
      </ScrollView>

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="grid" size={24} color="#3D7D6C" />
          <Text style={[styles.navText, {color: '#3D7D6C'}]}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="notifications-outline" size={24} color="#8BA19D" />
          <Text style={styles.navText}>Alerts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="settings-outline" size={24} color="#8BA19D" />
          <Text style={styles.navText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F0F4F3' },
  header: { padding: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  greeting: { fontSize: 14, color: '#8BA19D', fontWeight: '600', letterSpacing: 1 },
  adminName: { fontSize: 24, fontWeight: 'bold', color: '#1c3c36' },
  logoutBtn: { padding: 10, backgroundColor: '#FFF0F0', borderRadius: 12 },
  statsRow: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 2 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: '#8BA19D', marginBottom: 5 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#1c3c36' },
  divider: { width: 1, height: '100%', backgroundColor: '#EEE' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1c3c36', marginBottom: 15, paddingLeft: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { backgroundColor: 'white', width: width * 0.43, borderRadius: 25, padding: 20, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  iconContainer: { width: 55, height: 55, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c3c36' },
  cardSubtitle: { fontSize: 11, color: '#8BA19D', marginTop: 4 },
  navBar: { position: 'absolute', bottom: 0, width: '100%', height: 80, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopLeftRadius: 25, borderTopRightRadius: 25, elevation: 20 },
  navItem: { alignItems: 'center' },
  navText: { fontSize: 10, marginTop: 4, color: '#8BA19D', fontWeight: '600' }
});