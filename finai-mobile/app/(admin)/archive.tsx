import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { getAccountDisplayEmoji } from '../../utils/accountEmoji';
import { getCategoryEmoji } from '../../utils/categoryEmoji';
import { getGoalEmoji } from '../../utils/goalEmoji';
import { getDisplayEmoji } from '../../components/EmojiPicker';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const CREAM = '#FAF7F2';
const EXPENSE = '#FF6259';

export default function AdminArchiveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'Categories' | 'Accounts' | 'GoalTypes'>('Categories');
  const [archivedData, setArchivedData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchArchivedData = useCallback(async () => {
    if (!user?.token) return;
    setIsLoading(true);
    try {
      let endpoint = `${API_URL}/api/categories/?archived=true`;
      if (activeTab === 'Accounts') {
        endpoint = `${API_URL}/api/accounts/templates?archived=true`; 
      } else if (activeTab === 'GoalTypes') {
        endpoint = `${API_URL}/api/goal-types/?archived=true`;
      }

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setArchivedData(Array.isArray(data) ? data : []);
      } else {
        setArchivedData([]);
      }
    } catch (error) {
      console.error(`Error fetching archived ${activeTab}:`, error);
      setArchivedData([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, user]);

  useFocusEffect(
    useCallback(() => {
      fetchArchivedData();
    }, [fetchArchivedData])
  );

  const handleRestore = async (id: string) => {
    try {
      let endpoint = `${API_URL}/api/categories/${id}/restore`;
      if (activeTab === 'Accounts') endpoint = `${API_URL}/api/accounts/${id}/restore`;
      if (activeTab === 'GoalTypes') endpoint = `${API_URL}/api/goal-types/${id}/restore`;

      const res = await fetch(endpoint, { 
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user?.token}` }
      });
      if (res.ok) {
        Alert.alert('Success 🎉', 'The preset has been restored to the active list.');
        fetchArchivedData();
      } else {
        Alert.alert('Could not restore item', 'Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'May nangyaring problema sa pag-restore.');
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
              let endpoint = `${API_URL}/api/categories/admin/${id}/permanent`;
              if (activeTab === 'Accounts') endpoint = `${API_URL}/api/accounts/admin/${id}/permanent`;
              if (activeTab === 'GoalTypes') endpoint = `${API_URL}/api/goal-types/${id}/permanent`;

              const res = await fetch(endpoint, { 
                method: 'DELETE',
                headers: { Authorization: `Bearer ${user?.token}` }
              });
              if (res.ok) {
                fetchArchivedData();
              } else {
                Alert.alert('Could not delete item', 'Please try again.');
              }
            } catch (error) {
              Alert.alert('Error', 'May nangyaring problema.');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DEEP_GREEN} />

      <LinearGradient colors={[TEAL, DEEP_GREEN]} style={styles.headerGradient}>
        <View style={styles.topNav}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerEyebrow}>Admin Trash Bin</Text>
            <Text style={styles.headerTitle}>Archive Hub</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabContainer}>
          {(['Categories', 'Accounts', 'GoalTypes'] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.navTab, activeTab === tab && styles.activeNavTab]}>
              <Text style={[styles.navTabText, activeTab === tab && styles.activeNavTabText]}>
                {tab === 'GoalTypes' ? 'Goal Types' : tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TEAL} />
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
              <Text style={styles.comingSoonText}>There are no archived items in this section.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const presetEmoji = activeTab === 'Accounts'
              ? getAccountDisplayEmoji(item.icon, item.name || 'account')
              : activeTab === 'GoalTypes'
                ? getDisplayEmoji(item.icon, getGoalEmoji(item.name || ''))
                : getDisplayEmoji(item.icon, getCategoryEmoji(item.name || '', item.type));
            return (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardCategory} numberOfLines={1}>{presetEmoji}  {item.name || 'Untitled'}</Text>
                  <Text style={styles.cardNote} numberOfLines={1}>
                    {item.type ? `Type: ${item.type}` : 'Preset Item'}
                  </Text>
                </View>
              </View>

              <View style={styles.cardRight}>
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
  navTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' },
  activeNavTabText: { color: DEEP_GREEN, fontWeight: '800' },

  listContent: { padding: 20 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 18, marginBottom: 12, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  cardLeft: { flex: 1, marginRight: 10 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardCategory: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800', marginBottom: 3 },
  cardNote: { color: SAGE, fontSize: 12, fontWeight: '500' },
  cardRight: { alignItems: 'flex-end' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(61, 125, 108, 0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  restoreText: { color: TEAL, fontSize: 11, fontWeight: '700' },
  deleteBtn: { backgroundColor: 'rgba(255, 98, 89, 0.12)', padding: 6, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100, gap: 8 },
  emptyIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 4, elevation: 2 },
  emptyTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800' },
  comingSoonText: { color: SAGE, fontSize: 13, fontWeight: '600' }
});
