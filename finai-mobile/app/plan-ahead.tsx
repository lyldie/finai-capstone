import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import PlanningDashboard from '../components/PlanningDashboard';
import { CategoryForecast, PlanningData } from '../types/planning';

const DEEP_GREEN = '#1c3c36';
const CREAM = '#FAF7F2';

export default function PlanAheadScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<PlanningData | null>(null);
  const [dataUserId, setDataUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openingAdvisor, setOpeningAdvisor] = useState(false);

  const openFinnChat = async (topic: 'general' | 'budget' | 'goals', prompt: string) => {
    if (!user?.token || openingAdvisor) return;
    setOpeningAdvisor(true);
    try {
      const response = await fetch(`${API_URL}/advisor/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ topic }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Could not open Finn’s conversation.');
      router.push({ pathname: '/chat', params: { conversation_id: payload.id, prefill: prompt } });
    } catch (error) {
      Alert.alert('Couldn’t open Finn', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setOpeningAdvisor(false);
    }
  };

  useFocusEffect(useCallback(() => {
    if (!user?.token) {
      setData(null);
      setDataUserId(null);
      setError('Your session is missing. Please sign in again to view your planning analysis.');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const requestTimeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/advisor/planning`, {
      headers: { Authorization: `Bearer ${user.token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || 'FinAI could not load your planning analysis.');
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setData(payload);
          setDataUserId(user.id);
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Please check your connection and try again.');
        } else if (timedOut) {
          setError('The plan is taking longer than expected. Try again in a moment; your recorded insights are still available.');
        }
      })
      .finally(() => {
        clearTimeout(requestTimeout);
        if (!controller.signal.aborted) setLoading(false);
        else if (timedOut) setLoading(false);
      });

    return () => {
      clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [user?.id, user?.token, refreshKey]));

  const hasCurrentPlan = !!data && dataUserId === user?.id;
  const outlookDate = data?.metrics?.as_of_date
    ? new Date(`${data.metrics.as_of_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  if (loading && !hasCurrentPlan) {
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
        <TouchableOpacity onPress={() => setRefreshKey((value) => value + 1)} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Refresh Plan Ahead forecast">
          <Ionicons name="refresh-outline" size={19} color={DEEP_GREEN} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {error && !data && <View style={{ padding: 20 }}><Text style={{ color: DEEP_GREEN }}>{error}</Text><TouchableOpacity onPress={() => setRefreshKey((value) => value + 1)}><Text style={{ color: '#3D7D6C', paddingTop: 12 }}>Try again</Text></TouchableOpacity></View>}
        {dataUserId === user?.id && data && <PlanningDashboard
          data={data}
          onFinn={() => openFinnChat('budget', 'Please help me understand my latest Plan Ahead outlook and forecast. Explain the recorded figures and uncertainty.')}
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
});
