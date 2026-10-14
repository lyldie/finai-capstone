import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
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
  source?: "gemini" | "rule_based" | "user";
  message_type?: "planning_insight";
}

export default function ChatScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ conversation_id?: string; prefill?: string }>();
  const routeConversationId = typeof params.conversation_id === "string" ? params.conversation_id : undefined;
  const routePrefill = typeof params.prefill === "string" ? params.prefill : undefined;
  const flatListRef = useRef<FlatList>(null);
  const prefillApplied = useRef(false);

  const [inputText, setInputText] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(routeConversationId || null);
  const [conversationTitle, setConversationTitle] = useState("FinAI Advisor");

  // A direct Chat open is a draft. Persist it only after the user sends a message.
  useEffect(() => {
    if (routeConversationId) {
      setIsReady(false);
      setConversationId(routeConversationId);
      return;
    }
    setConversationId(null);
    setMessages([]);
    setConversationTitle("New chat");
    setIsReady(true);
  }, [user?.token, routeConversationId]);

  useEffect(() => {
    if (!conversationId || !user?.token) return;
    let active = true;
    setIsReady(false);
    fetch(`${API_URL}/advisor/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "Could not load this conversation.");
        if (active) {
          setMessages(Array.isArray(payload.messages) ? payload.messages : []);
          setConversationTitle(payload.conversation?.title || "FinAI Advisor");

        }
      })
      .catch((error) => {
        console.error("Failed to load advisor messages", error);
        if (active) Alert.alert("Couldn’t load messages", "Check your connection and reopen this conversation.");
      })
      .finally(() => { if (active) setIsReady(true); });
    return () => { active = false; };
  }, [conversationId, user?.token]);

  useEffect(() => {
    if (!isReady || !routePrefill || prefillApplied.current) return;
    setInputText(routePrefill);
    prefillApplied.current = true;
  }, [isReady, routePrefill]);

  const sendChatMessage = async (question = inputText) => {
    if (!question.trim() || !user?.token || isChatLoading || !isReady) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text: question.trim(),
      sender: "user",
      source: "user",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsChatLoading(true);

    let activeConversationId = conversationId;
    let createdConversationId: string | null = null;
    try {
      if (!activeConversationId) {
        const createResponse = await fetch(`${API_URL}/advisor/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
          body: JSON.stringify({ topic: "general" }),
        });
        const created = await createResponse.json();
        if (!createResponse.ok) throw new Error(created.detail || "Could not start your conversation.");
        activeConversationId = created.id;
        createdConversationId = created.id;
      }

      const response = await fetch(`${API_URL}/advisor/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({ text: userMsg.text }),
      });

      const data = await response.json();

      if (response.ok) {
        if (createdConversationId) {
          setConversationId(createdConversationId);
          setConversationTitle(data.conversation?.title || "FinAI Advisor");
        }
        const savedUserMessage: ChatMessage = data.user_message || userMsg;
        const savedAssistantMessage: ChatMessage = data.assistant_message || {
          id: (Date.now() + 1).toString(), text: data.reply, sender: "ai", source: data.source,
        };
        setMessages((prev) => [
          ...prev.filter((message) => message.id !== userMsg.id),
          savedUserMessage,
          savedAssistantMessage,
        ]);
      } else {
        throw new Error(data.detail || "Error communicating with FinAi");
      }
    } catch (error) {
      if (createdConversationId) {
        void fetch(`${API_URL}/advisor/conversations/${createdConversationId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.token}` },
        }).catch(() => undefined);
      }
      setMessages((prev) => prev.filter((message) => message.id !== userMsg.id));
      setInputText(userMsg.text);
      Alert.alert("Message not saved", "Check your connection and try again. Your text is still in the message box.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const clearChat = () => {
    Alert.alert(
      "Delete conversation",
      'This permanently deletes this conversation from your account.',
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/advisor/conversations/${conversationId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${user?.token || ''}` },
              });
              if (!response.ok) throw new Error("Could not delete this conversation.");
              router.replace("/messages" as never);
            } catch {
              Alert.alert("Couldn’t delete conversation", "Please check your connection and try again.");
            }
          },
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
            <Image source={require("../assets/images/finn-mascot.png")} style={styles.finnSmallImage} resizeMode="contain" />
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
            {(item.message_type === "planning_insight" || item.source === "rule_based") && (
              <Text style={styles.sourceLabel}>
                {item.message_type === "planning_insight"
                  ? item.source === "gemini" ? "PROACTIVE INSIGHT · GEMINI ANALYSIS" : "PROACTIVE INSIGHT · RECORDED DATA"
                  : "BASED ON YOUR RECORDED DATA"}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => {
    if (messages.length > 0) return null; // Hide hero banner when conversation starts

    return (
      <View style={styles.heroSection}>
        <Image
          source={require("../assets/images/finn-wave.gif")}
          style={styles.finnWelcomeImage}
          resizeMode="contain"
          accessibilityLabel="Finn waving hello"
        />
        <Text style={styles.heroTitle}>Hi, {user?.name?.trim().split(/\s+/)[0] || 'there'}!</Text>
        <Text style={styles.heroSubtitle}>
          I’m Finn, your AI Budget Advisor. How can I help today?
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
              <Image source={require("../assets/images/finn-mascot.png")} style={styles.finnHeaderImage} resizeMode="contain" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>Chat with Finn</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>{conversationTitle}</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.planButton}
            onPress={() => router.push('/plan-ahead' as never)}
            accessibilityRole="button"
            accessibilityLabel="Open Plan Ahead analysis"
          >
            <Ionicons name="analytics-outline" size={17} color={TEAL} />
            <Text style={styles.planButtonText}>Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/messages' as never)} accessibilityLabel="Open messages inbox">
            <Ionicons name="mail-unread-outline" size={18} color={DEEP_GREEN} />
          </TouchableOpacity>
          {conversationId && (
            <TouchableOpacity style={styles.iconButton} onPress={clearChat} accessibilityLabel="Delete conversation">
              <Ionicons name="trash-outline" size={18} color={EXPENSE} />
            </TouchableOpacity>
          )}
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
          ListHeaderComponent={isReady ? renderHeader : <ActivityIndicator style={{ marginTop: 32 }} size="large" color={TEAL} />}
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
                disabled={isChatLoading || !isReady}
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
              disabled={!inputText.trim() || isChatLoading || !isReady}
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
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 },
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
    flex: 1,
    minWidth: 0,
  },
  headerText: { flex: 1, minWidth: 0 },
  aiAvatarHeader: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(237, 178, 50, 0.16)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  finnHeaderImage: { width: 26, height: 26 },
  headerTitle: { color: DEEP_GREEN, fontSize: 14, fontWeight: "800" },
  headerSubtitle: { color: SAGE, fontSize: 10, fontWeight: "600", marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  planButton: { height: 38, paddingHorizontal: 9, borderRadius: 13, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 4 },
  planButtonText: { color: TEAL, fontSize: 12, fontWeight: "800" },
  sourceLabel: { color: SAGE, fontSize: 9, fontWeight: "800", letterSpacing: 0.6, marginTop: 8 },

  // Hero Section (Zero State)
  heroSection: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 16,
  },
  finnWelcomeImage: { width: 112, height: 112, marginBottom: -14 },
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
  finnSmallImage: { width: 28, height: 28 },
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
