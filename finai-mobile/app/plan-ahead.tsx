import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionContext';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import PlanningDashboard from '../components/PlanningDashboard';
import { CategoryForecast, PlanningData } from '../types/planning';
import { userFacingError } from '../utils/userFacingError';

const DEEP_GREEN = '#1c3c36';
const CREAM = '#FAF7F2';

type PlanningCacheEntry = { signature: string; data: PlanningData };
const planningMemoryCache = new Map<string, PlanningCacheEntry>();
const planningRequests = new Map<string, Promise<PlanningData>>();

function planningInputSignature(input: Record<string, unknown>) {
  const source = JSON.stringify(input);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function requestPlanning(userId: string, token: string, signature: string, apiUrl: string) {
  const requestKey = `${userId}:${signature}`;
  const existing = planningRequests.get(requestKey);
  if (existing) return existing;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const request = fetch(`${apiUrl}/advisor/planning`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'FinAI could not load your planning analysis.');
    return payload as PlanningData;
  }).finally(() => {
    clearTimeout(timeout);
    planningRequests.delete(requestKey);
  });
  planningRequests.set(requestKey, request);
  return request;
}

export default function PlanAheadScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const { pendingTransactionCount, transactions, budgets, goals, accounts, categories, isLoading: financialDataLoading } = useTransactions();
  const [data, setData] = useState<PlanningData | null>(null);
  const [dataUserId, setDataUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [needsSyncedRefresh, setNeedsSyncedRefresh] = useState(false);
  const forceRefresh = useRef(false);
  const loadedSignature = useRef<string | null>(null);
  const previousPendingCount = useRef(pendingTransactionCount);

  const inputSignature = useMemo(() => planningInputSignature({
    day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()),
    transactions: transactions.map(({ id, amount, category_id, category, type, date, account_id, to_account_id, goal_id, pending_sync }) =>
      [id, amount, category_id, category, type, date, account_id, to_account_id, goal_id, pending_sync]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    budgets: budgets.map(({ id, category_id, amount, period_type, period_key, budget_kind, rollover_enabled }) =>
      [id, category_id, amount, period_type, period_key, budget_kind, rollover_enabled]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    goals: goals.map(({ id, target_name, target_amount, current_savings, target_date }) =>
      [id, target_name, target_amount, current_savings, target_date]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    accounts: accounts.map(({ id, initial_balance, current_balance, account_role }) =>
      [id, initial_balance, current_balance, account_role]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    categories: categories.map(({ id, name, type }) => [id, name, type]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  }), [transactions, budgets, goals, accounts, categories]);

  useEffect(() => {
    if (previousPendingCount.current > 0 && pendingTransactionCount === 0) {
      setNeedsSyncedRefresh(true);
    }
    previousPendingCount.current = pendingTransactionCount;
  }, [pendingTransactionCount]);
  const openFinnChat = (topic: 'general' | 'budget' | 'goals', prompt: string) => {
    if (!user?.token) return;
    if (isOnline === false) { Alert.alert('Finn is offline', 'Your saved forecasts remain viewable, but Finn can only create or continue an AI conversation when you are online.'); return; }
    router.push({ pathname: '/chat', params: { topic, prefill: prompt } });
  };

  useFocusEffect(useCallback(() => {
    if (!user?.token) {
      setData(null);
      setDataUserId(null);
      setError('Your session is missing. Please sign in again to view your planning analysis.');
      setLoading(false);
      return;
    }

    let active = true;
    const cacheKey = `@offline_${user.id}_planning_data`;
    if (isOnline === false) {
      AsyncStorage.getItem(cacheKey).then((cached) => {
        if (!active) return;
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setData(parsed.data || parsed); setDataUserId(user.id); setError(null);
          }
          catch { setData(null); setDataUserId(null); setError('Plan Ahead needs an internet connection for its first forecast.'); }
        } else {
          setData(null); setDataUserId(null); setError('Plan Ahead needs an internet connection for its first forecast. Your Insights and saved records remain available offline.');
        }
        setLoading(false);
      });
      return () => { active = false; };
    }

    if (financialDataLoading) return () => { active = false; };

    const force = forceRefresh.current;
    forceRefresh.current = false;
    const memory = planningMemoryCache.get(user.id);
    if (!force && memory?.signature === inputSignature) {
      setData(memory.data);
      setDataUserId(user.id);
      setError(null);
      setNeedsSyncedRefresh(false);
      setLoading(false);
      loadedSignature.current = inputSignature;
      return () => { active = false; };
    }
    if (!force && dataUserId === user.id && data && loadedSignature.current === inputSignature) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    const load = async () => {
      if (!force) {
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          const parsed = cached ? JSON.parse(cached) : null;
          if (active && parsed?.signature === inputSignature && parsed?.data) {
            planningMemoryCache.set(user.id, { signature: inputSignature, data: parsed.data });
            loadedSignature.current = inputSignature;
            setData(parsed.data);
            setDataUserId(user.id);
            setNeedsSyncedRefresh(false);
            setError(null);
            setLoading(false);
            return;
          }
        } catch { /* A bad or old cache is replaced by the next successful response. */ }
      }
      return requestPlanning(user.id, user.token!, inputSignature, API_URL);
    };
    load()
      .then((payload) => {
        if (payload) {
          loadedSignature.current = inputSignature;
          planningMemoryCache.set(user.id, { signature: inputSignature, data: payload });
          void AsyncStorage.setItem(cacheKey, JSON.stringify({ signature: inputSignature, data: payload }));
          if (active) {
            setData(payload);
            setDataUserId(user.id);
            setNeedsSyncedRefresh(false);
          }
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(userFacingError(requestError, 'Please check your connection and try again.'));
          if (requestError?.name === 'AbortError') {
            setError('The plan is taking longer than expected. Try again in a moment; your recorded insights are still available.');
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id, user?.token, isOnline, inputSignature, financialDataLoading, refreshKey, data, dataUserId]));

  const hasCurrentPlan = !!data && dataUserId === user?.id;
  const outlookDate = data?.metrics?.as_of_date
    ? new Date(`${data.metrics.as_of_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen} edges={['top', 'right', 'bottom', 'left']}>
        <LinearGradient colors={[DEEP_GREEN, '#2D6659']} style={styles.loadingGradient}>
          <View style={styles.loadingTopRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.loadingBackButton} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={21} color={DEEP_GREEN} />
            </TouchableOpacity>
            <View style={styles.loadingBrand}>
              <Ionicons name="sparkles" size={16} color="#F3C65A" />
              <Text style={styles.loadingBrandText}>FINAI · PLAN AHEAD</Text>
            </View>
          </View>
          <View style={styles.loadingMain}>
            <View style={styles.loadingImageFrame}>
              <Image
                source={require('../assets/images/finn-advising.gif')}
                style={styles.loadingImage}
                resizeMode="contain"
                accessibilityLabel="Finn reviewing a budget"
              />
            </View>
            <View style={styles.loadingStatus}>
              <ActivityIndicator size="small" color={DEEP_GREEN} />
              <Text style={styles.loadingStatusText}>FINN IS REVIEWING</Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={21} color={DEEP_GREEN} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Plan Ahead</Text>
          <Text style={styles.headerSubtitle}>{outlookDate ? `Based on recorded activity as of ${outlookDate}` : 'Your financial outlook'}</Text>
        </View>
        <TouchableOpacity onPress={() => { forceRefresh.current = true; setData(null); setDataUserId(null); loadedSignature.current = null; setLoading(true); setRefreshKey((value) => value + 1); }} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Refresh Plan Ahead forecast">
          <Ionicons name="refresh-outline" size={19} color={DEEP_GREEN} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {(pendingTransactionCount > 0 || needsSyncedRefresh) && dataUserId === user?.id && data && <View style={styles.pendingNotice}>
          <Ionicons name="cloud-upload-outline" size={18} color="#785B17" />
          <Text style={styles.pendingNoticeText}>{pendingTransactionCount > 0
            ? `${pendingTransactionCount} saved ${pendingTransactionCount === 1 ? 'change has' : 'changes have'} not synced yet. This plan may not include ${pendingTransactionCount === 1 ? 'it' : 'them'}.`
            : error ? 'Your changes synced, but this forecast could not refresh. The figures shown may be out of date.' : 'Your changes synced. Plan Ahead is refreshing to include them.'}</Text>
        </View>}
        {error && !data && <View style={{ padding: 20 }}><Text style={{ color: DEEP_GREEN }}>{error}</Text><TouchableOpacity onPress={() => { forceRefresh.current = true; setLoading(true); setRefreshKey((value) => value + 1); }}><Text style={{ color: '#3D7D6C', paddingTop: 12 }}>Try again</Text></TouchableOpacity></View>}
        {dataUserId === user?.id && data && <PlanningDashboard
          data={data}
          onFinn={(message) => openFinnChat('budget', message || 'Please help me understand my latest Plan Ahead outlook and forecast. Explain the recorded figures and uncertainty.')}
          onManageBills={() => router.push('/fixed-bills' as never)}
          onCategory={(item: CategoryForecast, period) => router.push({ pathname: '/category-forecast' as never, params: { category_id: item.category_id, period, name: item.category, forecast: JSON.stringify(item) } } as never)}
        />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingScreen: { flex: 1, backgroundColor: DEEP_GREEN },
  loadingGradient: { flex: 1, paddingHorizontal: 22, paddingBottom: 28 },
  loadingTopRow: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loadingBackButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  loadingBrand: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  loadingBrandText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  loadingMain: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 28 },
  loadingImageFrame: { width: 340, height: 340, maxWidth: '96%', alignItems: 'center', justifyContent: 'center' },
  loadingImage: { width: '100%', height: '100%' },
  loadingStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3C65A', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, marginTop: 24 },
  loadingStatusText: { color: DEEP_GREEN, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  header: { minHeight: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { color: DEEP_GREEN, fontSize: 24, fontWeight: '900' },
  headerSubtitle: { color: '#627772', fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(237,178,50,0.2)', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 24 },
  pendingNotice: { marginHorizontal: 16, marginTop: 6, marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: '#FFF3D5', flexDirection: 'row', alignItems: 'center', gap: 9 },
  pendingNoticeText: { flex: 1, color: '#785B17', fontSize: 12, lineHeight: 17, fontWeight: '600' },
});
