import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, type IoniconsIconName } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { WilayaPicker } from "@/src/WilayaPicker";

type Audience = "all" | "clients" | "providers" | "wilaya";

const AUDIENCES: { key: Audience; labelKey: string; icon: IoniconsIconName }[] = [
  { key: "all", labelKey: "admin.broadcast.audAll", icon: "globe" },
  { key: "clients", labelKey: "admin.broadcast.audClients", icon: "people" },
  { key: "providers", labelKey: "admin.broadcast.audProviders", icon: "briefcase" },
  { key: "wilaya", labelKey: "admin.broadcast.audWilaya", icon: "location" },
];

export default function AdminBroadcast() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useT();
  const [audience, setAudience] = useState<Audience>("all");
  const [wilaya, setWilaya] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!authLoading && !user?.is_admin) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={40} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.forbidden")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canSend = title.trim().length > 0 && message.trim().length > 0 && (audience !== "wilaya" || !!wilaya);

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const res: any = await api.adminBroadcast({
        title: title.trim(),
        message: message.trim(),
        audience,
        wilaya_code: audience === "wilaya" ? wilaya! : undefined,
      });
      Alert.alert("✓", t("admin.broadcast.sent", { n: res.sent || 0 }), [
        { text: "OK", onPress: () => { setTitle(""); setMessage(""); } },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("admin.broadcast.title")}</Text>
          <Text style={styles.subtitle}>{t("admin.broadcast.subtitle")}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}>
          <View>
            <Text style={styles.label}>{t("admin.broadcast.audience")}</Text>
            <View style={styles.audienceGrid}>
              {AUDIENCES.map((a) => (
                <Pressable
                  key={a.key}
                  testID={`broadcast-audience-${a.key}`}
                  onPress={() => setAudience(a.key)}
                  style={[styles.audienceCard, audience === a.key && styles.audienceCardActive]}
                >
                  <Ionicons name={a.icon} size={18} color={audience === a.key ? theme.colors.brand : theme.colors.muted} />
                  <Text style={[styles.audienceText, audience === a.key && { color: theme.colors.onSurface }]}>{t(a.labelKey)}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {audience === "wilaya" && (
            <View>
              <Text style={styles.label}>{t("admin.broadcast.wilaya")}</Text>
              <WilayaPicker
                testID="broadcast-wilaya-picker"
                onSelect={(c) => setWilaya(c)}
                value={wilaya}
                label={t("wilaya.filterAll")}
              />
            </View>
          )}

          <View>
            <Text style={styles.label}>{t("admin.broadcast.pushTitle")}</Text>
            <TextInput
              testID="broadcast-title"
              value={title}
              onChangeText={setTitle}
              placeholder={t("admin.broadcast.pushTitlePh")}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              maxLength={80}
            />
          </View>

          <View>
            <Text style={styles.label}>{t("admin.broadcast.pushMsg")}</Text>
            <TextInput
              testID="broadcast-message"
              value={message}
              onChangeText={setMessage}
              placeholder={t("admin.broadcast.pushMsgPh")}
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, styles.inputArea]}
              multiline
              maxLength={200}
            />
            <Text style={styles.helpText}>{message.length}/200</Text>
          </View>

          <Pressable
            testID="broadcast-send"
            onPress={send}
            disabled={!canSend || busy}
            style={[styles.sendBtn, (!canSend || busy) && { opacity: 0.5 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>{t("admin.broadcast.send")}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
  emptyText: { color: theme.colors.muted, fontSize: 14 },

  label: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  helpText: { color: theme.colors.muted, fontSize: 11, marginTop: 4, textAlign: "right" },

  audienceGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  audienceCard: {
    flexGrow: 1, flexBasis: "45%", minWidth: 140,
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  audienceCardActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
  audienceText: { color: theme.colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },

  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceSecondary,
    fontSize: 14,
  },
  inputArea: { minHeight: 100, textAlignVertical: "top" },

  sendBtn: {
    marginTop: theme.spacing.md,
    height: 50,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  sendBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
});
