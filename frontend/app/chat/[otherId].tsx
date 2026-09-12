import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, WS_URL } from "@/src/api";
import { readToken } from "@/src/authStorage";
import { useAuth } from "@/src/auth";
import { RevealPhoneButton } from "@/src/RevealPhoneButton";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type Msg = {
  id: string;
  thread_id: string;
  from_id: string;
  from_name: string;
  to_id: string;
  text: string;
  created_at: string;
};

export default function ChatScreen() {
  const params = useLocalSearchParams<{ otherId: string; name?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useT();
  const otherId = params.otherId as string;
  const otherName = (params.name as string) || "";
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  const loadHistory = useCallback(async () => {
    try {
      const data: any = await api.chatHistory(otherId);
      setMessages(data);
    } catch {}
    setLoading(false);
  }, [otherId]);

  useEffect(() => {
    if (!user) return;
    loadHistory();

    (async () => {
      const token = await readToken();
      if (!token) return;
      try {
        const ws = new WebSocket(WS_URL(token));
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === "message" && data.message) {
              const m: Msg = data.message;
              // Only append if related to this thread
              if ((m.from_id === user.id && m.to_id === otherId) || (m.from_id === otherId && m.to_id === user.id)) {
                setMessages((prev) => (prev.find((p) => p.id === m.id) ? prev : [...prev, m]));
              }
            }
          } catch {}
        };
        wsRef.current = ws;
      } catch {}
    })();

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, otherId, loadHistory]);

  useEffect(() => {
    // scroll to bottom on new messages
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const msg: any = await api.sendMessage(otherId, trimmed);
      setMessages((prev) => (prev.find((p) => p.id === msg.id) ? prev : [...prev, msg]));
      setText("");
    } catch {}
    setSending(false);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>{t("review.needAccount")}</Text>
        <Pressable style={styles.gateBtn} onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.gateBtnText}>{t("profile.guestSignIn")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="chat-back-btn">
          <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{otherName || t("chat.title")}</Text>
        <View style={styles.headerReveal}>
          <RevealPhoneButton otherId={otherId} compact testID="chat-reveal-phone" />
        </View>
      </View>

      <View style={styles.safetyBanner}>
        <Ionicons name="shield-checkmark" size={14} color={theme.colors.brand} />
        <Text style={styles.safetyText}>{t("chat.safety")}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={80}>
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: theme.spacing.md, gap: 8 }}
            renderItem={({ item }) => {
              const mine = item.from_id === user.id;
              return (
                <View
                  testID={`msg-${item.id}`}
                  style={[styles.bubble, mine ? styles.mine : styles.theirs]}
                >
                  <Text style={mine ? styles.mineText : styles.theirsText}>{item.text}</Text>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable
            testID="chat-send-btn"
            style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]}
            onPress={send}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={18} color={theme.colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.md, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  headerReveal: { minWidth: 40, alignItems: "flex-end", justifyContent: "center", maxWidth: 180 },
  safetyBanner: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, marginHorizontal: theme.spacing.md, marginTop: theme.spacing.sm, borderRadius: theme.radius.sm, backgroundColor: theme.colors.brandTertiary },
  safetyText: { color: theme.colors.onBrandTertiary, fontSize: 11, flex: 1 },
  bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  mine: { alignSelf: "flex-end", backgroundColor: theme.colors.brand, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: theme.colors.surfaceSecondary, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
  mineText: { color: theme.colors.onBrandPrimary, fontSize: 14 },
  theirsText: { color: theme.colors.onSurface, fontSize: 14 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surfaceSecondary },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.surfaceTertiary, color: theme.colors.onSurface, fontSize: 14, borderWidth: 1, borderColor: theme.colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700", textAlign: "center" },
  gateBtn: { backgroundColor: theme.colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: theme.radius.pill },
  gateBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700" },
});
