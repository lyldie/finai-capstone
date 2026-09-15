import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, TextInput, 
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

export default function ChatScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  
  const [inputText, setInputText] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Load chat history from AsyncStorage
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const savedChat = await AsyncStorage.getItem(`finai_chat_${user?.id}`);
        if (savedChat) {
          setMessages(JSON.parse(savedChat));
        }
      } catch (error) {
        console.error("Failed to load chat history", error);
      } finally {
        setIsReady(true);
      }
    };
    loadHistory();
  }, [user?.id]);

  // Save chat history automatically
  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(`finai_chat_${user?.id}`, JSON.stringify(messages));
    }
  }, [messages, isReady, user?.id]);

  const sendChatMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsChatLoading(true);

    try {
      const response = await fetch(`${API_URL}/advisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, message: userMsg.text }),
      });

      const data = await response.json();

      if (response.ok) {
        const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: data.reply, sender: 'ai' };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        throw new Error(data.detail || 'Error communicating with FinAi');
      }
    } catch (error) {
      const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), text: "Pasensya na paps, may problema yata sa connection. Try mo ulit maya-maya.", sender: 'ai' };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const clearChat = () => {
    Alert.alert("Clear Chat", "Gusto mo bang burahin ang usapan ninyo ni FinAi?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => setMessages([]) }
    ]);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageBubbleWrapper, isUser ? styles.messageBubbleUser : styles.messageBubbleAI]}>
        {!isUser && (
          <View style={styles.aiAvatarSmall}>
            <Text style={{ fontSize: 14 }}>🥜</Text>
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.messageText, isUser ? styles.textUser : styles.textAI]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  const renderHeader = () => {
    if (messages.length > 0) return null; // Hide hero banner when conversation starts
    
    return (
      <View style={styles.heroSection}>
        <View style={styles.bigAvatarContainer}>
          <Text style={{ fontSize: 44 }}>🥜</Text>
        </View>
        <Text style={styles.heroTitle}>Hi, {user?.name || 'Paps'}!</Text>
        <Text style={styles.heroSubtitle}>Anong financial kalat natin today?</Text>
        <Text style={styles.heroDesc}>Mag-log ng pera, gumawa ng goal, o humingi ng painfully honest na advice.</Text>

        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push({ pathname: '/(tabs)/two', params: { type: 'Expense' } })}>
            <View style={[styles.actionIconBox, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="receipt-outline" size={20} color="#EF4444" />
            </View>
            <Text style={styles.actionTitle}>Log Expense</Text>
            <Text style={styles.actionSubtitle}>Add a purchase or bill</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push({ pathname: '/(tabs)/two', params: { type: 'Income' } })}>
            <View style={[styles.actionIconBox, { backgroundColor: '#E6F4EA' }]}>
              <Ionicons name="cash-outline" size={20} color="#10B981" />
            </View>
            <Text style={styles.actionTitle}>Log Income</Text>
            <Text style={styles.actionSubtitle}>Salary, sahod, or raket</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push({ pathname: '/(tabs)/two', params: { type: 'Transfer' } })}>
            <View style={[styles.actionIconBox, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="swap-horizontal-outline" size={20} color="#3B82F6" />
            </View>
            <Text style={styles.actionTitle}>Transfer</Text>
            <Text style={styles.actionSubtitle}>Lipat pera sa account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/goals' as never)}>
            <View style={[styles.actionIconBox, { backgroundColor: '#FEF3C7' }]}>
             <Ionicons name="flag-outline" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.actionTitle}>Savings Goal</Text>
            <Text style={styles.actionSubtitle}>Give your money a mission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Top Custom Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={22} color="#142D2A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <View style={styles.aiAvatarHeader}><Text style={{fontSize: 12}}>🥜</Text></View>
            <Text style={styles.headerTitle}>Chat with FinAi</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton} onPress={clearChat}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.chatContentContainer}
          onContentSizeChange={() => {
            if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: true });
          }}
          showsVerticalScrollIndicator={false}
        />

        {/* Bottom Input Area */}
        <View style={styles.inputArea}>
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.attachButton}>
              <Ionicons name="add" size={22} color="#7C9A95" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.textInput}
              placeholder="Message FinAi..."
              placeholderTextColor="#A2B5B0"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            
            <TouchableOpacity 
              style={[styles.sendButton, (!inputText.trim() || isChatLoading) && { backgroundColor: '#E2E8F0' }]} 
              onPress={sendChatMessage}
              disabled={!inputText.trim() || isChatLoading}
            >
              {isChatLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="arrow-up" size={18} color={!inputText.trim() || isChatLoading ? '#A2B5B0' : '#FFF'} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 55, 
    paddingBottom: 15, 
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { 
    width: 38, height: 38, borderRadius: 19, 
    backgroundColor: '#F3F4F6', 
    justifyContent: 'center', alignItems: 'center' 
  },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
  aiAvatarHeader: { 
    width: 28, height: 28, borderRadius: 14, 
    backgroundColor: '#EAF4F1', justifyContent: 'center', alignItems: 'center', marginRight: 8 
  },
  headerTitle: { color: '#142D2A', fontSize: 16, fontWeight: '700' },
  headerRight: { flexDirection: 'row', gap: 8 },

  // Hero Section (Zero State)
  heroSection: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 16 },
  bigAvatarContainer: { 
    width: 80, height: 80, borderRadius: 40, 
    backgroundColor: '#EAF4F1', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#D1E7E0',
    shadowColor: '#2b5f56', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8
  },
  heroTitle: { color: '#142D2A', fontSize: 26, fontWeight: '900', marginBottom: 6 },
  heroSubtitle: { color: '#2b5f56', fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  heroDesc: { color: '#7C9A95', fontSize: 12, textAlign: 'center', marginBottom: 25, paddingHorizontal: 20, lineHeight: 18 },
  
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' },
  actionCard: { 
    width: '48%', backgroundColor: '#FFFFFF', 
    padding: 16, borderRadius: 20, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#142D2A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2
  },
  actionIconBox: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  actionTitle: { color: '#142D2A', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  actionSubtitle: { color: '#7C9A95', fontSize: 11, fontWeight: '500' },

  // Chat Section
  chatContentContainer: { paddingHorizontal: 16, paddingBottom: 20, flexGrow: 1 },
  messageBubbleWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  messageBubbleUser: { justifyContent: 'flex-end' },
  messageBubbleAI: { justifyContent: 'flex-start' },
  aiAvatarSmall: { 
    width: 28, height: 28, borderRadius: 14, 
    backgroundColor: '#EAF4F1', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginBottom: 4 
  },
  messageBubble: { maxWidth: '78%', padding: 14, borderRadius: 20 },
  bubbleUser: { backgroundColor: '#2b5f56', borderBottomRightRadius: 4 },
  bubbleAI: { 
    backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#142D2A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1
  },
  messageText: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  textUser: { color: '#FFFFFF' },
  textAI: { color: '#142D2A' },

  // Input Area
  inputArea: { 
    paddingHorizontal: 16, paddingVertical: 12, 
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' 
  },
  inputContainer: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#F3F4F6', borderRadius: 24, paddingLeft: 6, paddingRight: 6, paddingVertical: 6,
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  attachButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  textInput: { flex: 1, color: '#142D2A', fontSize: 14, paddingHorizontal: 10, maxHeight: 100 },
  sendButton: { 
    width: 38, height: 38, borderRadius: 19, 
    backgroundColor: '#2b5f56', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2b5f56', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4
  },
});