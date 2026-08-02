import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  FlatList,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const DOC_LABELS: Record<string, string> = {
  id_recto: "verify.idRecto",
  id_verso: "verify.idVerso",
  certification: "verify.certification",
  background_check: "verify.background",
};

export default function AdminVerification() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    try {
      const data: any = await api.adminListPending();
      setItems(data || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [user?.is_admin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!authLoading && !user?.is_admin) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={40} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.forbidden")}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.replace("/")}>
            <Text style={styles.backBtnText}>{t("admin.goHome")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const approve = async (id: string) => {
    setBusy(true);
    try {
      await api.adminApprove(id);
      setSelected(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setBusy(true);
    try {
      await api.adminReject(selected.id, rejectReason.trim());
      setRejectOpen(false);
      setRejectReason("");
      setSelected(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("admin.title")}</Text>
        <Pressable onPress={load} hitSlop={12} testID="admin-refresh">
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.empty")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
          {items.map((it) => (
            <Pressable
              key={it.id}
              testID={`admin-row-${it.id}`}
              onPress={() => setSelected(it)}
              style={styles.row}
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={22} color={theme.colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{it.full_name || t("admin.unnamed")}</Text>
                <Text style={styles.rowSub}>
                  {it.category || "—"} · {it.city || "—"}
                </Text>
                <Text style={styles.rowSub}>
                  {t("admin.submitted")}:{" "}
                  {it.verification_submitted_at
                    ? new Date(it.verification_submitted_at).toLocaleDateString()
                    : "—"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <View>
                <Text style={styles.sheetTitle}>{selected?.full_name || "—"}</Text>
                <Text style={styles.sheetSub}>
                  {selected?.email} · {selected?.phone || "—"}
                </Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
              {(selected?.verification_documents || []).map((d: any) => (
                <View key={d.id} style={styles.docCard} testID={`admin-doc-${d.type}`}>
                  <Pressable onPress={() => setViewerUrl(d.url)}>
                    <Image source={{ uri: d.url }} style={styles.docImage} contentFit="cover" />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docType}>{t(DOC_LABELS[d.type] || d.type)}</Text>
                    {d.note ? <Text style={styles.docNote}>{d.note}</Text> : null}
                    <Text style={styles.docDate}>
                      {d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.sheetActions}>
              <Pressable
                testID="admin-reject"
                style={[styles.actionBtn, styles.reject]}
                onPress={() => setRejectOpen(true)}
                disabled={busy}
              >
                <Ionicons name="close-circle-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>{t("admin.reject")}</Text>
              </Pressable>
              <Pressable
                testID="admin-approve"
                style={[styles.actionBtn, styles.approve]}
                onPress={() => selected && approve(selected.id)}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={"#fff"} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color={"#fff"} />
                    <Text style={styles.actionBtnText}>{t("admin.approve")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reject reason */}
      <Modal
        transparent
        visible={rejectOpen}
        animationType="fade"
        onRequestClose={() => setRejectOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRejectOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: theme.spacing.xl }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("admin.rejectTitle")}</Text>
            <Text style={styles.sheetSub}>{t("admin.rejectSub")}</Text>
            <TextInput
              testID="admin-reject-reason"
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t("admin.rejectPh")}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              multiline
              maxLength={500}
              autoFocus
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setRejectOpen(false)}
                style={[styles.actionBtn, styles.ghost]}
                disabled={busy}
              >
                <Text style={styles.actionBtnGhostText}>{t("account.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={reject}
                style={[styles.actionBtn, styles.reject, !rejectReason.trim() && { opacity: 0.5 }]}
                disabled={busy || !rejectReason.trim()}
                testID="admin-reject-confirm"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionBtnText}>{t("admin.reject")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Document full-screen viewer */}
      <Modal
        visible={viewerUrl !== null}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setViewerUrl(null)}
      >
        <View style={styles.viewer}>
          <FlatList
            data={viewerUrl ? [viewerUrl] : []}
            horizontal
            pagingEnabled
            keyExtractor={(_, i) => `v${i}`}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: "#000", justifyContent: "center" }}>
                <Image source={{ uri: item }} style={{ width: SCREEN_W, height: SCREEN_H }} contentFit="contain" />
              </View>
            )}
          />
          <Pressable onPress={() => setViewerUrl(null)} style={styles.viewerClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },
  backBtn: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  backBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },

  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  rowSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong, marginBottom: 4 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },
  sheetSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  docCard: {
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  docImage: { width: 72, height: 72, borderRadius: theme.radius.sm },
  docType: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700" },
  docNote: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  docDate: { color: theme.colors.muted, fontSize: 10, marginTop: 2 },

  sheetActions: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.sm },
  actionBtn: {
    flex: 1, height: 46, borderRadius: theme.radius.pill,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6,
  },
  approve: { backgroundColor: theme.colors.success },
  reject: { backgroundColor: theme.colors.error },
  ghost: { borderWidth: 1, borderColor: theme.colors.border },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  actionBtnGhostText: { color: theme.colors.onSurface, fontWeight: "700" },

  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.onSurface,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    textAlignVertical: "top",
  },

  viewer: { flex: 1, backgroundColor: "#000" },
  viewerClose: {
    position: "absolute", top: 48, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
});
