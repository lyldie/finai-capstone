import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import PlanningInsightsPanel from '../components/PlanningInsightsPanel';

const DEEP_GREEN = '#1c3c36';
const CREAM = '#FAF7F2';

export default function PlanAheadScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [dataUserId, setDataUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={21} color={DEEP_GREEN} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Plan Ahead</Text>
          <Text style={styles.headerSubtitle}>Your financial planning recommendations</Text>
        </View>
        <View style={styles.headerIcon}><Ionicons name="sparkles" size={19} color={DEEP_GREEN} /></View>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <PlanningInsightsPanel
          data={dataUserId === user?.id ? data : null}
          loading={loading}
          error={error}
          onRefresh={() => setRefreshKey((value) => value + 1)}
          onAskFinAI={openFinnChat}
          onReviewBudget={(budget) => {
            if (budget.id && ['weekly', 'monthly', 'annual'].includes(budget.period)) {
              router.push({
                pathname: '/setbudget',
                params: {
                  id: budget.id,
                  category_id: budget.category_id,
                  categoryName: budget.category,
                  period_type: budget.period,
                },
              });
            } else {
              router.push('/(tabs)/insights' as never);
            }
          }}
          onViewInsights={() => router.push('/(tabs)/insights' as never)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: { minHeight: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { color: DEEP_GREEN, fontSize: 21, fontWeight: '900' },
  headerSubtitle: { color: '#7C9A95', fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(237,178,50,0.2)', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 24 },
});
