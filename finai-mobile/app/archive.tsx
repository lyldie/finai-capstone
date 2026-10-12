import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

type ArchiveTab = 'Transactions' | 'Accounts' | 'Goals';

// Same peso formatter style as the other screens (sign is handled by the caller).
const peso = (value: number, fixed = false) =>
  '₱' + Math.abs(Number(value) || 0).toLocaleString('en-US', fixed
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// "2026-10-11" (or an ISO timestamp) -> "Oct 11, 2026"
const formatDate = (value?: string) => {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const parsed = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function ArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ArchiveTab>('Transactions');
  const [archivedData, setArchivedData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // UI-only state: item counts per tab (filled in as each tab loads) and the item currently being restored/deleted.
  const [tabCounts, setTabCounts] = useState<Partial<Record<ArchiveTab, number>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fetch archived items depending on active tab
  const fetchArchivedData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) throw new Error('Your session is missing. Please log in again.');
      const token = await AsyncStorage.getItem('user_token');
      if (!token) throw new Error('Your session has expired. Please log in again.');

      let endpoint = '';
      // Query parameters that match the backend routers
      if (activeTab === 'Transactions') {
        endpoint = `${API_URL}/get-expenses?user_id=${encodeURIComponent(userId)}&archived=true`;
      } else if (activeTab === 'Accounts') {
        endpoint = `${API_URL}/api/accounts/user/${encodeURIComponent(userId)}?archived=true`;
      } else if (activeTab === 'Goals') {
        endpoint = `${API_URL}/api/goals/?user_id=${encodeURIComponent(userId)}&archived=true`;
      }

      let data: any;
      if (activeTab === 'Transactions') {
        const all: any[] = [];
        let offset = 0;
        while (true) {
          const pageRes = await fetch(`${endpoint}&limit=500&offset=${offset}`, { headers: { Authorization: `Bearer ${token || ''}` } });
          const page = await pageRes.json().catch(() => ({}));
          if (!pageRes.ok) {
            const detail = typeof page?.detail === 'string' ? page.detail : 'The server could not load archived transactions.';
            throw new Error(`Request failed (${pageRes.status}): ${detail}`);
          }
          if (!Array.isArray(page.data)) throw new Error('Invalid archived transactions response.');
          all.push(...page.data);
          if (!page.has_more || page.data.length === 0) break;
          offset += page.data.length;
        }
        data = { data: all };
      } else {
        const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token || ''}` } });
        data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = typeof data?.detail === 'string' ? data.detail : `The server could not load archived ${activeTab.toLowerCase()}.`;
          throw new Error(`Request failed (${res.status}): ${detail}`);
        }
      }
      if (data) {
        // Frontend filtering so only archived items are ever shown
        const filtered = Array.isArray(data)
          ? data.filter((item: any) => item.is_archived === true || item.archived === true)
          : Array.isArray(data?.data)
            ? data.data.filter((item: any) => item.is_archived === true || item.archived === true)
            : [];
        const mapped = filtered.map((item: any) => ({ ...item, id: String(item.id ?? item._id ?? '') })).filter((item: any) => item.id);
        setArchivedData(mapped);
        setTabCounts((prev) => ({ ...prev, [activeTab]: mapped.length }));
      } else {
        setArchivedData([]);
        setTabCounts((prev) => ({ ...prev, [activeTab]: 0 }));
      }
    } catch (error) {
      console.error(`Error fetching archived ${activeTab}:`, error);
      setArchivedData([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load archived items. Check your connection and try again.');
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
    setBusyId(id);
    try {
      const token = await AsyncStorage.getItem('user_token');
      // Restore endpoint for each kind of item
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
    } finally {
      setBusyId(null);
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
            setBusyId(id);
            try {
              const token = await AsyncStorage.getItem('user_token');
              // Permanent delete endpoint for each kind of item
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
            } finally {
              setBusyId(null);
            }
          }
        }
      ]
    );
  };

  const emptyHint =
    activeTab === 'Transactions' ? 'Swipe a record on the Transactions tab and tap Archive to see it here.'
    : activeTab === 'Accounts' ? 'Archived accounts will show up here.'
    : 'Archived goals will show up here.';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DEEP_GREEN} />

      {/* Gradient Header */}
      <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.headerGradient, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topNav}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.titleColumn}>
            <Text style={styles.headerTitle}>Archive</Text>
            <Text style={styles.headerSubtitle}>Restore items or delete them for good</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Segmented tabs for Transactions, Accounts, Goals */}
        <View style={styles.tabContainer}>
          {(['Transactions', 'Accounts', 'Goals'] as const).map((tab) => {
            const count = tabCounts[tab];
            const active = activeTab === tab;
            return (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.navTab, active && styles.activeNavTab]} activeOpacity={0.85}>
                <Text style={[styles.navTabText, active && styles.activeNavTabText]} numberOfLines={1}>{tab}</Text>
                {typeof count === 'number' && count > 0 && (
                  <View style={[styles.tabCount, active && styles.tabCountActive]}>
                    <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DEEP_GREEN} />
        </View>
      ) : loadError ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="cloud-offline-outline" size={34} color={EXPENSE} />
          </View>
          <Text style={styles.emptyTitle}>Could not load archived {activeTab.toLowerCase()}.</Text>
          <Text style={styles.comingSoonText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchArchivedData} activeOpacity={0.85}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={archivedData}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 + insets.bottom }]}
          ListHeaderComponent={
            archivedData.length > 0 ? (
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={18} color={TEAL} />
                <Text style={styles.infoBannerText}>Restore brings an item back. Deleting removes it permanently.</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="archive-outline" size={36} color={GOLD} />
              </View>
              <Text style={styles.emptyTitle}>No archived {activeTab.toLowerCase()}.</Text>
              <Text style={styles.comingSoonText}>{emptyHint}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isIncome = item.type === 'Income';
            const isNeutral = item.type === 'Transfer' || item.type === 'Contribution';
            const color = isIncome ? INCOME : isNeutral ? TEAL : EXPENSE;
            const iconTint =
              activeTab === 'Goals' ? 'rgba(237, 178, 50, 0.16)'
              : activeTab === 'Accounts' || isNeutral ? 'rgba(61, 125, 108, 0.12)'
              : isIncome ? 'rgba(16, 185, 129, 0.12)'
              : 'rgba(255, 98, 89, 0.12)';
            const itemEmoji = activeTab === 'Accounts'
              ? getAccountDisplayEmoji(item.icon, item.name || 'account')
              : activeTab === 'Goals'
                ? getGoalEmoji(item.target_name || '')
                : item.type === 'Contribution' || item.goal_id
                  ? '🎯'
                  : item.type === 'Transfer'
                    ? '🔄'
                    : getCategoryEmoji(item.category || '', String(item.type || 'Expense').toLowerCase());
            const title = item.category || item.target_name || item.name || 'Untitled';
            const busy = busyId === item.id;

            // Subtitle lines per kind of item
            let primaryLine = '';
            let metaLine = '';
            if (activeTab === 'Transactions') {
              primaryLine = item.note || '';
              metaLine = [formatDate(item.date), item.account].filter(Boolean).join(' · ');
            } else if (activeTab === 'Accounts') {
              primaryLine = `Initial balance ${peso(item.initial_balance || 0)}`;
            } else {
              primaryLine = `Target ${peso(item.target_amount || 0)}`;
              metaLine = item.target_date ? `By ${formatDate(item.target_date)}` : '';
            }
            const archivedOn = item.archived_at ? `Archived ${formatDate(item.archived_at)}` : '';

            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.cardIconBox, { backgroundColor: iconTint }]}>
                    <Text style={{ fontSize: 20 }}>{itemEmoji}</Text>
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardCategory} numberOfLines={1}>{title}</Text>
                    {primaryLine ? <Text style={styles.cardNote} numberOfLines={1}>{primaryLine}</Text> : null}
                    {metaLine ? <Text style={styles.cardMeta} numberOfLines={1}>{metaLine}</Text> : null}
                    {archivedOn ? <Text style={styles.cardMeta} numberOfLines={1}>{archivedOn}</Text> : null}
                  </View>

                  {activeTab === 'Transactions' && (
                    <Text style={[styles.cardAmount, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {item.type === 'Transfer' ? '' : isIncome ? '+' : '-'}{peso(parseFloat(item.amount) || 0, true)}
                    </Text>
                  )}
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={[styles.restoreBtn, busy && styles.btnBusy]} onPress={() => handleRestore(item.id)} disabled={busy} activeOpacity={0.85}>
                    {busy ? (
                      <ActivityIndicator size="small" color={TEAL} />
                    ) : (
                      <>
                        <Ionicons name="refresh-outline" size={16} color={TEAL} />
                        <Text style={styles.restoreText}>Restore</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.deleteBtn, busy && styles.btnBusy]} onPress={() => handlePermanentDelete(item.id)} disabled={busy} activeOpacity={0.85}>
                    <Ionicons name="trash-outline" size={16} color="#D6392F" />
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: DEEP_GREEN,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ---- Header (top padding comes from the safe-area inset) ----
  headerGradient: { paddingBottom: 16, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center', alignItems: 'center' },
  titleColumn: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  tabContainer: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', padding: 4, borderRadius: 24 },
  navTab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 9, borderRadius: 20 },
  activeNavTab: { backgroundColor: GOLD },
  navTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  activeNavTabText: { color: DEEP_GREEN, fontWeight: '800' },
  tabCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  tabCountActive: { backgroundColor: DEEP_GREEN },
  tabCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  tabCountTextActive: { color: '#FFFFFF' },

  // ---- List ----
  listContent: { paddingHorizontal: 20, paddingTop: 16 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(61, 125, 108, 0.1)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, marginBottom: 14 },
  infoBannerText: { flex: 1, color: DEEP_GREEN, fontSize: 12, fontWeight: '600', lineHeight: 17 },

  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, marginBottom: 12, ...CARD_SHADOW, borderWidth: 1, borderColor: 'rgba(28, 60, 54, 0.04)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconBox: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1, minWidth: 0, justifyContent: 'center' },
  cardCategory: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800' },
  cardNote: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 2 },
  cardMeta: { color: SAGE, fontSize: 11, fontWeight: '500', marginTop: 2 },
  cardAmount: { fontSize: 15, fontWeight: '800', maxWidth: '36%' },

  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(28, 60, 54, 0.12)', marginTop: 14 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  restoreBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, backgroundColor: 'rgba(61, 125, 108, 0.12)', borderRadius: 12 },
  restoreText: { color: TEAL, fontSize: 13, fontWeight: '800' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: 18, backgroundColor: 'rgba(255, 98, 89, 0.1)', borderRadius: 12 },
  deleteText: { color: '#D6392F', fontSize: 13, fontWeight: '800' },
  btnBusy: { opacity: 0.5 },

  // ---- Empty / error ----
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100, paddingHorizontal: 30, gap: 8 },
  emptyIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 4, ...CARD_SHADOW },
  emptyTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  comingSoonText: { color: SAGE, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  retryButton: { marginTop: 12, backgroundColor: DEEP_GREEN, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  retryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }
});