import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';

type Conversation = {
  id: string;
  topic: 'general' | 'budget' | 'goals';
  title: string;
  last_message?: string;
  updated_at?: string;
};

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    if (!user?.token) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/advisor/conversations`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Could not load your conversations.');
      setConversations(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.warn('Could not load advisor conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useFocusEffect(useCallback(() => {
    void loadConversations();
  }, [loadConversations]));

  const renderConversation = ({ item }: { item: Conversation }) => {
    const icon = item.topic === 'budget' ? 'pie-chart-outline' : item.topic === 'goals' ? 'flag-outline' : 'chatbubble-ellipses-outline';
    return (
      <TouchableOpacity
        style={styles.threadRow}
        onPress={() => router.push({ pathname: '/chat', params: { conversation_id: item.id } })}
        activeOpacity={0.75}
      >
        <View style={styles.threadIcon}><Ionicons name={icon} size={22} color={TEAL} /></View>
        <View style={styles.threadCopy}>
          <View style={styles.threadTitleRow}>
            <Text style={styles.threadTitle}>{item.title}</Text>
            <Text style={styles.threadDate}>{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : ''}</Text>
          </View>
          <Text style={styles.threadPreview} numberOfLines={2}>{item.last_message || 'Open to continue this conversation.'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={SAGE} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOrbLarge} />
          <View pointerEvents="none" style={styles.heroOrbSmall} />
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>YOUR FINAI SPACE</Text>
              <Text style={styles.title}>Messages</Text>
            </View>
            <View style={styles.onlineBadge}><Ionicons name="sparkles" size={13} color="#F5D27C" /><Text style={styles.onlineText}>YOUR ADVISOR</Text></View>
          </View>
          <View style={styles.heroMessage}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Your money conversations, all in one place.</Text>
              <Text style={styles.heroSubtitle}>Pick up where you left off or start with a question.</Text>
            </View>
            <Image source={require('../assets/images/finn-wave.gif')} style={styles.heroFinn} resizeMode="contain" accessibilityLabel="Finn waving hello" />
          </View>
        </LinearGradient>

        <View style={styles.startSection}>
          <View style={styles.startHeadingRow}>
            <View style={styles.headingIcon}><Ionicons name="sparkles" size={17} color={GOLD} /></View>
            <View style={styles.startHeadingCopy}>
              <Text style={styles.sectionTitle}>Start a chat with Finn</Text>
              <Text style={styles.sectionSubtitle}>Ask about spending, budgets, savings, or your next money decision.</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/chat' as never)} activeOpacity={0.86} accessibilityRole="button" accessibilityLabel="Start a new chat with Finn">
            <LinearGradient colors={[DEEP_GREEN, TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startChatButton}>
              <View style={styles.startChatIcon}><Ionicons name="chatbubble-ellipses" size={18} color={DEEP_GREEN} /></View>
              <Text style={styles.startChatText}>Start a chat</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your conversations</Text>
            <Text style={styles.sectionSubtitle}>Saved so you can return anytime</Text>
          </View>
          <View style={styles.listActions}>
            <View style={styles.countPill}><Text style={styles.countText}>{conversations.length}</Text></View>
            <TouchableOpacity style={styles.refreshButton} onPress={() => void loadConversations()} accessibilityLabel="Refresh conversations">
              <Ionicons name="refresh-outline" size={18} color={TEAL} />
            </TouchableOpacity>
          </View>
        </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={TEAL} /><Text style={styles.loadingText}>Loading your conversations…</Text></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          scrollEnabled={false}
          contentContainerStyle={conversations.length ? styles.list : styles.emptyList}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={28} color={TEAL} /></View>
              <Text style={styles.emptyTitle}>Your story with Finn starts here</Text>
              <Text style={styles.emptyText}>Start a topic above. Your conversation will be saved here for next time.</Text>
            </View>
          )}
        />
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  scrollContent: { paddingBottom: 34 },
  hero: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 36, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' },
  heroOrbLarge: { position: 'absolute', width: 230, height: 230, borderRadius: 115, right: -88, top: 34, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroOrbSmall: { position: 'absolute', width: 94, height: 94, borderRadius: 47, right: 86, top: 112, backgroundColor: 'rgba(237,178,50,0.12)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#BFD8CE', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 2 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  onlineText: { color: '#E5F1EB', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  heroMessage: { flexDirection: 'row', alignItems: 'center', minHeight: 116, marginTop: 7 },
  heroCopy: { flex: 1, paddingRight: 2 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: -0.5 },
  heroSubtitle: { color: '#D1E3DC', fontSize: 12, lineHeight: 18, fontWeight: '500', marginTop: 7, maxWidth: 250 },
  heroFinn: { width: 106, height: 112, marginLeft: 2 },
  startSection: { marginHorizontal: 16, marginTop: -20, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 23, shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 5 },
  startHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(237,178,50,0.16)', alignItems: 'center', justifyContent: 'center' },
  startHeadingCopy: { flex: 1 },
  sectionTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  sectionSubtitle: { color: SAGE, fontSize: 11, fontWeight: '600', marginTop: 3 },
  startChatButton: { minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, marginTop: 15 },
  startChatIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F5D27C', alignItems: 'center', justifyContent: 'center' },
  startChatText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 27, marginBottom: 10 },
  listActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countPill: { minWidth: 27, height: 27, borderRadius: 14, backgroundColor: 'rgba(61,125,108,0.12)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText: { color: TEAL, fontSize: 11, fontWeight: '900' },
  refreshButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, gap: 10 },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: '#FFFFFF', borderRadius: 19, borderWidth: 1, borderColor: '#EEF0EA', shadowColor: DEEP_GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.045, shadowRadius: 8, elevation: 2 },
  threadIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: 'rgba(61,125,108,0.12)', alignItems: 'center', justifyContent: 'center' },
  threadCopy: { flex: 1 },
  threadTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  threadTitle: { color: DEEP_GREEN, fontSize: 14, fontWeight: '900', flex: 1 },
  threadDate: { color: SAGE, fontSize: 9, fontWeight: '700' },
  threadPreview: { color: '#657B75', fontSize: 11, lineHeight: 16, marginTop: 5 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 10 },
  emptyList: { paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingHorizontal: 36, paddingVertical: 30, backgroundColor: '#FFFFFF', borderRadius: 20 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: 'rgba(61,125,108,0.12)', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: DEEP_GREEN, fontSize: 15, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  emptyText: { color: SAGE, fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
});
