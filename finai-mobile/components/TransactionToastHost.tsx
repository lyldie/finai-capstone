import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTransactions } from '../context/TransactionContext';

const DEEP_GREEN = '#1c3c36';
const SAGE = '#7C9A95';

export default function TransactionToastHost() {
  const { transactionToast, clearTransactionToast } = useTransactions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-220)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBudgetAlert = transactionToast?.kind === 'budget';
  const threshold = transactionToast?.threshold || 0;
  const overBudget = transactionToast?.level === 'over_budget' || threshold > 100;
  const critical = !overBudget && (transactionToast?.level === 'critical' || threshold >= 90);
  const displayPercentage = transactionToast?.percentage_used ?? threshold;
  const accent = !isBudgetAlert ? '#16845B' : overBudget ? '#B42318' : critical ? '#C2410C' : '#A16207';
  const tint = !isBudgetAlert ? '#ECFDF3' : overBudget ? '#FEF3F2' : critical ? '#FFF7ED' : '#FFFBEB';
  const severity = overBudget ? 'Over budget' : critical ? 'Budget nearly reached' : 'Budget warning';

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    Animated.timing(translateY, { toValue: -220, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) clearTransactionToast();
    });
  }, [clearTransactionToast, translateY]);

  useEffect(() => {
    if (!transactionToast) return;
    translateY.setValue(-220);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 72, friction: 12 }).start();
    timeoutRef.current = setTimeout(dismiss, 5000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [dismiss, transactionToast?.id, translateY]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => { if (gesture.dy < 0) translateY.setValue(gesture.dy); },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy < -40) dismiss();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 72, friction: 12 }).start();
    },
  }), [dismiss, translateY]);

  if (!transactionToast) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.position, { top: insets.top + 6, transform: [{ translateY }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.card, { backgroundColor: tint, borderLeftColor: accent }]}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Ionicons name={isBudgetAlert ? 'warning-outline' : 'checkmark-circle-outline'} size={20} color={accent} />
            <View style={styles.titles}>
              <Text style={styles.title}>{transactionToast.title}</Text>
              {isBudgetAlert && <Text style={[styles.severity, { color: accent }]}>{severity}</Text>}
            </View>
            {isBudgetAlert && <Text style={[styles.percent, { color: accent }]}>{displayPercentage.toFixed(0)}%</Text>}
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={10} accessibilityLabel="Dismiss message">
            <Ionicons name="close" size={18} color={SAGE} />
          </TouchableOpacity>
        </View>
        {transactionToast.messages.slice(0, 2).map((message, index) => (
          <Text key={`${index}-${message}`} style={styles.message}>{message}</Text>
        ))}
        {transactionToast.messages.length > 2 && (
          <Text style={styles.more}>+{transactionToast.messages.length - 2} more alerts</Text>
        )}
        {isBudgetAlert && transactionToast.advisorConversationId && (
          <TouchableOpacity
            style={styles.advisorLink}
            onPress={() => {
              const conversationId = transactionToast.advisorConversationId;
              dismiss();
              router.push({ pathname: '/chat', params: { conversation_id: conversationId } });
            }}
            accessibilityRole="button"
            accessibilityLabel="View Finn's budget insight"
          >
            <Text style={styles.advisorLinkText}>View Finn’s insight</Text>
            <Ionicons name="arrow-forward" size={15} color={DEEP_GREEN} />
          </TouchableOpacity>
        )}
        <Text style={styles.hint}>Swipe up to dismiss</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 16, right: 16, zIndex: 10000, elevation: 100 },
  card: { borderLeftWidth: 5, borderRadius: 17, padding: 14, shadowColor: '#000000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  titles: { flex: 1 },
  title: { color: DEEP_GREEN, fontSize: 14, fontWeight: '800' },
  severity: { fontSize: 14, fontWeight: '900', marginTop: 1 },
  percent: { fontSize: 17, fontWeight: '900', marginLeft: 8 },
  message: { color: DEEP_GREEN, fontSize: 12, lineHeight: 17, marginTop: 8 },
  more: { color: SAGE, fontSize: 11, fontWeight: '700', marginTop: 5 },
  advisorLink: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 5 },
  advisorLinkText: { color: DEEP_GREEN, fontSize: 12, fontWeight: '800' },
  hint: { color: SAGE, fontSize: 10, fontWeight: '600', textAlign: 'right', marginTop: 8 },
});
