import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type Convo = {
  other_id: string;
  other_name: string;
  other_avatar?: string;
  other_role: string;
  last_text: string;
  last_at: string;
};

export default function MessagesList() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useT();
  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data: any = await api.myChats();
      setItems(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.muted} />
        <Text style={styles.emptyTitle}>{t("chat.empty")}</Text>
        <Text style={styles.emptySub}>{t("chat.emptySub")}</Text>
        <Pressable
          testID="chat-signin-btn"
          style={styles.gateBtn}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={styles.gateBtnText}>{t("profile.guestSignIn")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("chat.title")}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.other_id}
          contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 120, gap: theme.spacing.sm }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.muted} />
              <Text style={styles.emptyTitle}>{t("chat.empty")}</Text>
              <Text style={styles.emptySub}>{t("chat.emptySub")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`convo-${item.other_id}`}
              style={styles.row}
              onPress={() => router.push(`/chat/${item.other_id}?name=${encodeURIComponent(item.other_name)}`)}
            >
              {item.other_avatar ? (
                <Image source={{ uri: item.other_avatar }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={22} color={theme.colors.brand} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.other_name}</Text>
                <Text style={styles.preview} numberOfLines={1}>{item.last_text}</Text>
              </View>
              <Text style={styles.time}>
                {new Date(item.last_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.sm, backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.surfaceTertiary },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  name: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  preview: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  time: { color: theme.colors.muted, fontSize: 11 },
  emptyBox: { alignItems: "center", padding: theme.spacing.xxxl, gap: theme.spacing.sm },
  emptyTitle: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  emptySub: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
  gateBtn: { marginTop: theme.spacing.md, backgroundColor: theme.colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: theme.radius.pill },
  gateBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700" },
});
