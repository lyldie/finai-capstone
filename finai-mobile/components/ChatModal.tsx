import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, Modal, 
  TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const FINAI_DEEP_GREEN = '#144A3D';
const FINAI_SAGE = '#8A9A86';
const FINAI_LIGHT_BG = '#F7F9F8';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export default function ChatModal({ visible, onClose, userId }: ChatModalProps) {
  const [inputText, setInputText] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      text: 'Kamusta paps! Ako si FinAi Advisor. Handa akong tulungan ka sa budget, goals, at spending habits mo. Ano ang gusto mong malaman ngayon?',
      sender: 'ai',
    },
  ]);

  const sendChatMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsChatLoading(true);

    try {
      // PALITAN ANG IP ADDRESS KUNG NASA PHYSICAL PHONE (e.g., 192.168.1.X)
      const response = await fetch('http://192.168.1.67:8000/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, message: userMsg.text }),
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

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageBubbleWrapper, isUser ? styles.messageBubbleUser : styles.messageBubbleAI]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={14} color="#FFF" />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.messageText, isUser ? styles.textUser : styles.textAI]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.modalOverlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.chatSheetContainer}>
          <View style={styles.chatHeader}>
            <View style={styles.chatHeaderLeft}>
              <View style={styles.chatHeaderIcon}>
                <Ionicons name="sparkles" size={16} color="#FFF" />
              </View>
              <View>
                <Text style={styles.chatHeaderTitle}>FinAi Advisor</Text>
                <Text style={styles.chatHeaderSubtitle}>AI Assistant</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={28} color="#C4D1CB" />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatContentContainer}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.chatInputWrapper}>
            <TextInput
              style={styles.chatInput}
              placeholder="Ask about your budget or goals..."
              placeholderTextColor={FINAI_SAGE}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity 
              style={[styles.chatSendBtn, (!inputText.trim() || isChatLoading) && { opacity: 0.5 }]} 
              onPress={sendChatMessage} 
              disabled={!inputText.trim() || isChatLoading}
            >
              {isChatLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={16} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  chatSheetContainer: { backgroundColor: FINAI_LIGHT_BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%', overflow: 'hidden' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  chatHeaderIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: FINAI_DEEP_GREEN, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  chatHeaderTitle: { fontSize: 18, fontWeight: '800', color: FINAI_DEEP_GREEN },
  chatHeaderSubtitle: { fontSize: 12, color: FINAI_SAGE },
  chatContentContainer: { padding: 16, flexGrow: 1 },
  messageBubbleWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  messageBubbleUser: { justifyContent: 'flex-end' },
  messageBubbleAI: { justifyContent: 'flex-start' },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: FINAI_DEEP_GREEN, justifyContent: 'center', alignItems: 'center', marginRight: 8, marginBottom: 4 },
  messageBubble: { maxWidth: '80%', padding: 14, borderRadius: 20 },
  bubbleUser: { backgroundColor: FINAI_DEEP_GREEN, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EBF0EE', borderBottomLeftRadius: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4 },
  messageText: { fontSize: 14, lineHeight: 22 },
  textUser: { color: '#FFFFFF' },
  textAI: { color: '#142D2A' },
  chatInputWrapper: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  chatInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#142D2A', maxHeight: 100 },
  chatSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: FINAI_DEEP_GREEN, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
});