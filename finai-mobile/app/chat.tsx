import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../config";

// ---- FINAI BRAND TOKENS (shared with transactions.tsx / index.tsx / two.tsx / insights.tsx) ----
const DEEP_GREEN = "#1c3c36";
const TEAL = "#3D7D6C";
const GOLD = "#edb232";
const SAGE = "#7C9A95";
const CREAM = "#FAF7F2";
const INCOME = "#10B981";
const EXPENSE = "#FF6259";

interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "ai";
}

// How many prior turns to send as conversation history, matching the backend's
// MAX_HISTORY_TURNS cap so we're not sending more than the server will actually use.
const MAX_HISTORY_TURNS = 10;

export default function ChatScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [inputText, setInputText] = useState("");
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

  const sendChatMessage = async (question = inputText) => {
    if (!question.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text: question.trim(),
      sender: "user",
    };

    // FIX: capture recent history BEFORE appending the new message, so what gets sent
    // to the backend is the conversation as it stood up to this point -- the backend
    // then appends the new message itself as the final turn.
    const recentHistory = messages
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ sender: m.sender, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsChatLoading(true);

    try {
      const response = await fetch(`${API_URL}/advisor/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({
          user_id: user?.id,
          message: userMsg.text,
          history: recentHistory,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: data.reply,
          sender: "ai",
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        throw new Error(data.detail || "Error communicating with FinAi");
      }
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'I could not connect just now. Please try again shortly.',
        sender: "ai",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const clearChat = () => {
    Alert.alert(
      "Clear Chat",
      'Are you sure you want to clear your conversation with FinAI?',
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setMessages([]),
        },
      ],
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === "user";
    return (
      <View
        style={[
          styles.messageBubbleWrapper,
          isUser ? styles.messageBubbleUser : styles.messageBubbleAI,
        ]}
      >
        {!isUser && (
          <View style={styles.aiAvatarSmall}>
            <Text style={{ fontSize: 14 }}>🥜</Text>
          </View>
        )}
        {isUser ? (
          <LinearGradient
            colors={[DEEP_GREEN, TEAL]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.messageBubble, styles.bubbleUser]}
          >
            <Text style={[styles.messageText, styles.textUser]}>
              {item.text}
            </Text>
          </LinearGradient>
        ) : (
          <View style={[styles.messageBubble, styles.bubbleAI]}>
            <Text style={[styles.messageText, styles.textAI]}>{item.text}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => {
    if (messages.length > 0) return null; // Hide hero banner when conversation starts

    return (
      <View style={styles.heroSection}>
        <LinearGradient
          colors={[DEEP_GREEN, TEAL]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bigAvatarContainer}
        >
          <Text style={{ fontSize: 40 }}>🥜</Text>
        </LinearGradient>
        <Text style={styles.heroTitle}>Hi, {user?.name?.trim().split(/\s+/)[0] || 'there'}!</Text>
        <Text style={styles.heroSubtitle}>
          What would you like help with today?
        </Text>
        <Text style={styles.heroDesc}>
          Record money, create a goal, or ask for straightforward
          advice.
        </Text>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/two",
                params: { type: "Expense" },
              })
            }
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: "rgba(255, 98, 89, 0.12)" },
              ]}
            >
              <Ionicons name="receipt-outline" size={20} color={EXPENSE} />
            </View>
            <Text style={styles.actionTitle}>Log Expense</Text>
            <Text style={styles.actionSubtitle}>Add a purchase or bill</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/two",
                params: { type: "Income" },
              })
            }
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: "rgba(16, 185, 129, 0.12)" },
              ]}
            >
              <Ionicons name="cash-outline" size={20} color={INCOME} />
            </View>
            <Text style={styles.actionTitle}>Log Income</Text>
            <Text style={styles.actionSubtitle}>Salary, sahod, or raket</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/two",
                params: { type: "Transfer" },
              })
            }
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: "rgba(61, 125, 108, 0.12)" },
              ]}
            >
              <Ionicons name="swap-horizontal-outline" size={20} color={TEAL} />
            </View>
            <Text style={styles.actionTitle}>Transfer</Text>
            <Text style={styles.actionSubtitle}>Transfer money between accounts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/goals" as never)}
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: "rgba(237, 178, 50, 0.16)" },
              ]}
            >
              <Ionicons name="flag-outline" size={20} color={GOLD} />
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
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <Ionicons name="arrow-back" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <View style={styles.aiAvatarHeader}>
              <Text style={{ fontSize: 12 }}>🥜</Text>
            </View>
            <Text style={styles.headerTitle}>Chat with FinAi</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton} onPress={clearChat}>
            <Ionicons name="trash-outline" size={18} color={EXPENSE} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.chatContentContainer}
          onContentSizeChange={() => {
            if (messages.length > 0)
              flatListRef.current?.scrollToEnd({ animated: true });
          }}
          showsVerticalScrollIndicator={false}
        />

        {/* Bottom Input Area */}
        <View style={styles.inputArea}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
            {[
              ['Today', 'How much have I spent today?'],
              ['This week', 'How am I doing with spending this week?'],
              ['This month', 'Am I on track with my budgets this month?'],
              ['Savings goal', 'How much should I save each month for my goals?'],
            ].map(([label, prompt]) => (
              <TouchableOpacity
                key={label}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: '#D7E2DE', backgroundColor: '#F7F9F8', paddingHorizontal: 12, paddingVertical: 7 }}
                onPress={() => sendChatMessage(prompt)}
                disabled={isChatLoading}
              >
                <Text style={{ color: DEEP_GREEN, fontSize: 12, fontWeight: '700' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.attachButton}>
              <Ionicons name="add" size={22} color={SAGE} />
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
              onPress={() => sendChatMessage()}
              disabled={!inputText.trim() || isChatLoading}
              activeOpacity={0.85}
            >
              {!inputText.trim() || isChatLoading ? (
                <View
                  style={[styles.sendButton, { backgroundColor: "#E2E8F0" }]}
                >
                  {isChatLoading ? (
                    <ActivityIndicator size="small" color={SAGE} />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color="#A2B5B0" />
                  )}
                </View>
              ) : (
                <LinearGradient
                  colors={[DEEP_GREEN, TEAL]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendButton}
                >
                  <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 55,
    paddingBottom: 15,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECE7DD",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CREAM,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
  },
  aiAvatarHeader: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(237, 178, 50, 0.16)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  headerTitle: { color: DEEP_GREEN, fontSize: 16, fontWeight: "700" },
  headerRight: { flexDirection: "row", gap: 8 },

  // Hero Section (Zero State)
  heroSection: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 16,
  },
  bigAvatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: DEEP_GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  heroTitle: {
    color: DEEP_GREEN,
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 6,
  },
  heroSubtitle: {
    color: TEAL,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  heroDesc: {
    color: SAGE,
    fontSize: 12,
    textAlign: "center",
    marginBottom: 25,
    paddingHorizontal: 20,
    lineHeight: 18,
  },

  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
  },
  actionCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    marginBottom: 14,
    shadowColor: DEEP_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  actionTitle: {
    color: DEEP_GREEN,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  actionSubtitle: { color: SAGE, fontSize: 11, fontWeight: "500" },

  // Chat Section
  chatContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  messageBubbleWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  messageBubbleUser: { justifyContent: "flex-end" },
  messageBubbleAI: { justifyContent: "flex-start" },
  aiAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(237, 178, 50, 0.16)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  messageBubble: { maxWidth: "78%", padding: 14, borderRadius: 20 },
  bubbleUser: {
    borderBottomRightRadius: 4,
    shadowColor: DEEP_GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  bubbleAI: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    shadowColor: DEEP_GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  messageText: { fontSize: 14, lineHeight: 22, fontWeight: "500" },
  textUser: { color: "#FFFFFF" },
  textAI: { color: DEEP_GREEN },

  // Input Area
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#ECE7DD",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CREAM,
    borderRadius: 24,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    color: DEEP_GREEN,
    fontSize: 14,
    paddingHorizontal: 10,
    maxHeight: 100,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
});
