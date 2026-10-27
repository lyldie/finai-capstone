import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTransactions, AppNotification } from '../../context/TransactionContext';
import { getBudgetStatusColor, getBudgetStatusTextColor, getBudgetStatusTint } from '../../utils/budgetThresholdColors';

const GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';
const WHITE = '#FFFFFF';

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    isLoading,
    fetchTransactions,
    markNotificationRead,
    markAllNotificationsRead,
    clearAllNotifications,
  } = useTransactions();
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  useFocusEffect(useCallback(() => { fetchTransactions(false); }, [fetchTransactions]));

  const handleClearAll = () => {
    if (!notifications.length) return;
    Alert.alert(
      'Clear Notifications',
      'This will clear your notification inbox while keeping your historical budget audit records safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: () => void clearAllNotifications() },
      ]
    );
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const actualPercent = Number(item.percentage_used ?? item.threshold);
    const displayPercent = Math.round(actualPercent);
    const isOverBudget = actualPercent > 100 || item.level === 'over_budget';
    // Notification colors reflect the threshold event saved at that time;
    // the Insights bars use the live spending percentage.
    const accentColor = getBudgetStatusColor(item.threshold);
    const badgeBg = getBudgetStatusTint(item.threshold);
    const badgeText = getBudgetStatusTextColor(item.threshold);
    const levelTitle = isOverBudget
      ? `OVER BUDGET · ${displayPercent}%`
      : actualPercent >= 100
      ? 'BUDGET LIMIT REACHED'
      : actualPercent >= 90
      ? `HIGH BUDGET USE · ${displayPercent}%`
      : `BUDGET WARNING · ${displayPercent}%`;

    return (
      <View style={[styles.item, { borderLeftColor: accentColor }, !item.is_read && styles.unreadItem]}>
        <View style={styles.itemHeader}>
          <View style={[styles.levelBadge, { backgroundColor: badgeBg }]}>
            <Ionicons
              name={actualPercent < 90 ? 'warning-outline' : 'alert-circle-outline'}
              size={13}
              color={badgeText}
            />
            <Text style={[styles.levelText, { color: badgeText }]}>{levelTitle}</Text>
          </View>
          <Text style={styles.dateText}>
            {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <Text style={styles.messageText}>{item.message}</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={() => {
              void markNotificationRead(item.id);
              router.push('/(tabs)/insights' as never);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.reviewButtonText}>Review Budget</Text>
            <Ionicons name="arrow-forward" size={13} color={TEAL} />
          </TouchableOpacity>

          {!item.is_read && (
            <TouchableOpacity
              style={styles.markReadBtn}
              onPress={() => void markNotificationRead(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="checkmark-done" size={15} color={SAGE} />
              <Text style={styles.markReadText}>Mark read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={GREEN} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => void markAllNotificationsRead()}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
            >
              <Ionicons name="checkmark-done-outline" size={15} color={TEAL} />
              <Text style={styles.actionPillText}>Read all</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={styles.iconCircle}
              onPress={handleClearAll}
              accessibilityRole="button"
              accessibilityLabel="Clear all notifications"
            >
              <Ionicons name="trash-outline" size={16} color={SAGE} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading && !notifications.length ? (
        <ActivityIndicator color={TEAL} style={styles.loader} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={notifications.length ? styles.list : styles.empty}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={28} color={TEAL} />
              </View>
              <Text style={styles.emptyTitle}>No budget alerts yet</Text>
              <Text style={styles.emptyText}>
                We'll proactively alert you here when category spending hits 70%, 90%, or goes over budget.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderColor: '#E6ECE9',
  },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: CREAM },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: GREEN, fontSize: 19, fontWeight: '900' },
  headerSubtitle: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#EAF4EF',
  },
  actionPillText: { color: TEAL, fontSize: 11, fontWeight: '800' },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginTop: 40 },
  list: { padding: 16, paddingBottom: 24 },
  item: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: '#E6ECE9',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  unreadItem: {
    backgroundColor: '#FFFEFA',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dateText: {
    color: SAGE,
    fontSize: 10,
    fontWeight: '600',
  },
  messageText: {
    color: GREEN,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F0EA',
    paddingTop: 10,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  reviewButtonText: {
    color: TEAL,
    fontSize: 12,
    fontWeight: '800',
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  markReadText: {
    color: SAGE,
    fontSize: 11,
    fontWeight: '700',
  },
  empty: { flexGrow: 1, justifyContent: 'center', padding: 32 },
  emptyContent: { alignItems: 'center' },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF4EF' },
  emptyTitle: { color: GREEN, fontSize: 17, fontWeight: '900', marginTop: 14 },
  emptyText: { color: '#58706B', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
