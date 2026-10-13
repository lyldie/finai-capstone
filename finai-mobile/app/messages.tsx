import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#7C9A95';
const CREAM = '#FAF7F2';

type Topic = 'general' | 'budget' | 'goals';
type Conversation = {
  id: string;
  topic: Topic;
  title: string;
  last_message?: string;
  updated_at?: string;
};

const topicOptions: { topic: Topic; title: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { topic: 'budget', title: 'Budget', icon: 'pie-chart-outline' },
  { topic: 'goals', title: 'Savings goals', icon: 'flag-outline' },
  { topic: 'general', title: 'General', icon: 'chatbubble-ellipses-outline' },
];

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingTopic, setOpeningTopic] = useState<Topic | null>(null);

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

  const openTopic = async (topic: Topic) => {
    if (!user?.token || openingTopic) return;
    setOpeningTopic(topic);
    try {
      const response = await fetch(`${API_URL}/advisor/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ topic }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Could not open this conversation.');
      router.push({ pathname: '/chat', params: { conversation_id: payload.id } });
    } catch (error) {
      console.warn('Could not open advisor conversation:', error);
    } finally {
      setOpeningTopic(null);
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const icon = topicOptions.find((option) => option.topic === item.topic)?.icon || 'chatbubble-ellipses-outline';
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={21} color={DEEP_GREEN} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>Continue a conversation with FinAI</Text>
        </View>
      </View>

      <View style={styles.startSection}>
        <Text style={styles.sectionTitle}>Start or continue a topic</Text>
        <View style={styles.topicRow}>
          {topicOptions.map((item) => (
            <TouchableOpacity
              key={item.topic}
              style={styles.topicButton}
              onPress={() => openTopic(item.topic)}
              disabled={Boolean(openingTopic)}
              activeOpacity={0.75}
            >
              {openingTopic === item.topic
                ? <ActivityIndicator size="small" color={TEAL} />
                : <Ionicons name={item.icon} size={20} color={TEAL} />}
              <Text style={styles.topicLabel}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Your conversations</Text>
        <TouchableOpacity onPress={() => void loadConversations()} accessibilityLabel="Refresh conversations">
          <Ionicons name="refresh-outline" size={19} color={TEAL} />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={TEAL} /></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={conversations.length ? styles.list : styles.emptyList}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={38} color={SAGE} />
              <Text style={styles.emptyTitle}>Your advisor history starts here</Text>
              <Text style={styles.emptyText}>Open a topic above. Your messages will be saved to your account so you can return to them later.</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  iconButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { color: DEEP_GREEN, fontSize: 22, fontWeight: '900' },
  subtitle: { color: SAGE, fontSize: 12, fontWeight: '600', marginTop: 3 },
  startSection: { marginHorizontal: 18, marginTop: 12, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 20 },
  sectionTitle: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800' },
  topicRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  topicButton: { flex: 1, minHeight: 76, borderRadius: 14, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 5 },
  topicLabel: { color: DEEP_GREEN, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 26, marginBottom: 8 },
  list: { paddingHorizontal: 18, paddingBottom: 24 },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE5E1' },
  threadIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(61,125,108,0.12)', alignItems: 'center', justifyContent: 'center' },
  threadCopy: { flex: 1 },
  threadTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  threadTitle: { color: DEEP_GREEN, fontSize: 15, fontWeight: '800', flex: 1 },
  threadDate: { color: SAGE, fontSize: 10, fontWeight: '600' },
  threadPreview: { color: '#657B75', fontSize: 12, lineHeight: 18, marginTop: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 42, paddingVertical: 36 },
  emptyTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  emptyText: { color: SAGE, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
});
