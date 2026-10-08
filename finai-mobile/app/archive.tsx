import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccountDisplayEmoji } from '../utils/accountEmoji';
import { getCategoryEmoji } from '../utils/categoryEmoji';
import { getGoalEmoji } from '../utils/goalEmoji';
import { getDisplayEmoji } from '../components/EmojiPicker';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const INCOME = '#10B981';
const EXPENSE = '#FF6259';

export default function ArchiveScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'Transactions' | 'Accounts' | 'Goals'>('Transactions');
  const [archivedData, setArchivedData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch archived items depending on active tab
  const fetchArchivedData = useCallback(async () => {
    setIsLoading(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      const token = await AsyncStorage.getItem('user_token');

      let endpoint = '';
      // 👈 FIX: Ginamit natin ang tamang query parameters na tugma sa ating backend routers
      if (activeTab === 'Transactions') {
        endpoint = `${API_URL}/get-expenses?user_id=${userId}&archived=true`;
      } else if (activeTab === 'Accounts') {
        endpoint = `${API_URL}/api/accounts/user/${userId}?archived=true`;
      } else if (activeTab === 'Goals') {
        endpoint = `${API_URL}/api/goals/?user_id=${userId}&archived=true`;
      }

      let data: any;
      if (activeTab === 'Transactions') {
        const all: any[] = [];
        let offset = 0;
        while (true) {
          const pageRes = await fetch(`${endpoint}&limit=500&offset=${offset}`, { headers: { Authorization: `Bearer ${token || ''}` } });
          if (!pageRes.ok) throw new Error('Failed to load archived transactions.');
          const page = await pageRes.json();
          if (!Array.isArray(page.data)) throw new Error('Invalid archived transactions response.');
          all.push(...page.data);
          if (!page.has_more || page.data.length === 0) break;
          offset += page.data.length;
        }
        data = { data: all };
      } else {
        const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token || ''}` } });
        if (!res.ok) throw new Error(`Failed to load archived ${activeTab.toLowerCase()}.`);
        data = await res.json();
      }
      if (data) {
        // Frontend filtering para masiguradong ang mga naka-archive lang ang lalabas
        const filtered = Array.isArray(data)
          ? data.filter((item: any) => item.is_archived === true || item.archived === true)
          : Array.isArray(data?.data)
            ? data.data.filter((item: any) => item.is_archived === true || item.archived === true)
            : [];
        setArchivedData(filtered);
      } else {
        setArchivedData([]);
      }
    } catch (error) {
      console.error(`Error fetching archived ${activeTab}:`, error);
      setArchivedData([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      fetchArchivedData();
    }, [fetchArchivedData])
  );

  const handleRestore = async (id: string) => {
    try {
      const token = await AsyncStorage.getItem('user_token');
      // 👈 FIX: Tugmang restore endpoints para sa bawat uri ng item
      let endpoint = `${API_URL}/restore-expense/${id}`;
      if (activeTab === 'Accounts') endpoint = `${API_URL}/api/accounts/${id}/restore`;
      if (activeTab === 'Goals') endpoint = `${API_URL}/api/goals/${id}/restore`;

      const method = activeTab === 'Accounts' || activeTab === 'Transactions' ? 'PATCH' : 'PUT';
      const res = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${token || ''}` } });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert('Restored', 'The item is back in the active list.');
        fetchArchivedData();
      } else {
        Alert.alert('Cannot restore item', result.detail || 'Please check its linked account and try again.');
      }
    } catch (error) {
      Alert.alert('Cannot restore item', 'Check your connection and try again.');
    }
  };

  const handlePermanentDelete = (id: string) => {
    Alert.alert(
      'Permanent Delete',
      'Are you sure you want to permanently delete this item? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Permanently', 
          style: 'destructive', 
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('user_token');
              // 👈 FIX: Tugmang permanent delete endpoints
              let endpoint = `${API_URL}/permanent-delete-expense/${id}`;
              if (activeTab === 'Accounts') endpoint = `${API_URL}/api/accounts/${id}/permanent`;
              if (activeTab === 'Goals') endpoint = `${API_URL}/api/goals/${id}/permanent`;

              const res = await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${token || ''}` } });
              const result = await res.json().catch(() => ({}));
              if (res.ok) {
                fetchArchivedData();
              } else {
                Alert.alert('Cannot delete item', result.detail || 'Please try again.');
              }
            } catch (error) {
              Alert.alert('Cannot delete item', 'Check your connection and try again.');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DEEP_GREEN} />

      {/* Gradient Header */}
      <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
        <View style={styles.topNav}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerEyebrow}>Trash Bin</Text>

          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Segmented Tabs para sa Transactions, Accounts, Goals */}
        <View style={styles.tabContainer}>
          {(['Transactions', 'Accounts', 'Goals'] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.navTab, activeTab === tab && styles.activeNavTab]}>
              <Text style={[styles.navTabText, activeTab === tab && styles.activeNavTabText]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DEEP_GREEN} />
        </View>
      ) : (
        <FlatList
          data={archivedData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="archive-outline" size={36} color={GOLD} />
              </View>
              <Text style={styles.emptyTitle}>No archived {activeTab.toLowerCase()}.</Text>
              <Text style={styles.comingSoonText}>Archived items will appear here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isIncome = item.type === 'Income';
            const isNeutral = item.type === 'Transfer' || item.type === 'Contribution';
            const color = isIncome ? INCOME : isNeutral ? TEAL : EXPENSE;
            const itemEmoji = activeTab === 'Accounts'
              ? getAccountDisplayEmoji(item.icon, item.name || 'account')
              : activeTab === 'Goals'
                ? getGoalEmoji(item.target_name || '')
                : item.type === 'Contribution' || item.goal_id
                  ? '🎯'
                  : item.type === 'Transfer'
                    ? '🔄'
                    : getCategoryEmoji(item.category || '', String(item.type || 'Expense').toLowerCase());

            return (
              <View style={styles.card}>
                <View style={styles.cardLeft}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardCategory} numberOfLines={1}>{itemEmoji}  {item.category || item.target_name || item.name || 'Untitled'}</Text>
                    <Text style={styles.cardNote} numberOfLines={1}>
                      {activeTab === 'Transactions' ? `${item.note || 'No description'} • ${item.date}` : `Initial Balance: ₱${item.initial_balance || item.target_amount || 0}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardRight}>
                  {activeTab === 'Transactions' && (
                    <Text style={[styles.cardAmount, { color }]}>
                      {item.type === 'Transfer' ? '' : isIncome ? '+' : '-'}₱{(parseFloat(item.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                  )}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.restoreBtn} onPress={() => handleRestore(item.id)}>
                      <Ionicons name="refresh-outline" size={14} color={TEAL} />
                      <Text style={styles.restoreText}>Restore</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handlePermanentDelete(item.id)}>
                      <Ionicons name="trash-outline" size={14} color={EXPENSE} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerGradient: { paddingTop: 54, paddingBottom: 16, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  headerEyebrow: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600', marginBottom: 2, textAlign: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  
  tabContainer: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', padding: 4, borderRadius: 24 },
  navTab: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },
  activeNavTab: { backgroundColor: GOLD },
  navTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  activeNavTabText: { color: DEEP_GREEN, fontWeight: '800' },

  listContent: { padding: 20 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 18, marginBottom: 12, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  cardLeft: { flex: 1, marginRight: 10 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardCategory: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800', marginBottom: 3 },
  cardNote: { color: SAGE, fontSize: 12, fontWeight: '500' },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 15, fontWeight: '900', marginBottom: 6 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(61, 125, 108, 0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  restoreText: { color: TEAL, fontSize: 11, fontWeight: '700' },
  deleteBtn: { backgroundColor: 'rgba(255, 98, 89, 0.12)', padding: 6, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100, gap: 8 },
  emptyIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 4, elevation: 2 },
  emptyTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800' },
  comingSoonText: { color: SAGE, fontSize: 13, fontWeight: '600' }
});
