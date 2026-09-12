import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type FlagRow = {
  provider_id: string;
  reason: string;
  flagged_at: string;
  full_name?: string | null;
  email?: string | null;
  category?: string | null;
  completion_rate?: number | null;
};

export default function AdminFlags() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<FlagRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    setError(null);
    try {
      const data: any = await api.adminListFlags();
      setItems(data || []);
    } catch (e: any) {
      setItems([]);
      setError(e?.message || "Failed to load flags");
    }
    setLoading(false);
    setRefreshing(false);
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

  const clearFlag = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.adminClearFlag(selected.provider_id);
      setConfirmClear(false);
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="flags-back-btn">
          <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("flags.title")}</Text>
        <Pressable onPress={load} hitSlop={12} testID="flags-refresh-btn">
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("flags.empty")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={theme.colors.brand}
            />
          }
        >
          <View style={styles.banner}>
            <Ionicons name="flag" size={16} color={theme.colors.error} />
            <Text style={styles.bannerText}>{t("flags.bannerSub", { n: items.length })}</Text>
          </View>
          {items.map((it) => {
            const rate = typeof it.completion_rate === "number" ? Math.round(it.completion_rate * 100) : null;
            return (
              <Pressable
                key={it.provider_id}
                testID={`flag-row-${it.provider_id}`}
                onPress={() => setSelected(it)}
                style={styles.row}
              >
                <View style={styles.avatar}>
                  <Ionicons name="alert-circle" size={22} color={theme.colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {it.full_name || t("admin.unnamed")}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {it.email || "—"}
                    {it.category ? ` · ${t(`cat.${it.category}`)}` : ""}
                  </Text>
                  <Text style={styles.rowReason} numberOfLines={2}>
                    {it.reason}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {t("flags.flaggedAt")}: {new Date(it.flagged_at).toLocaleDateString()}
                    {rate != null ? `  ·  ${t("flags.completion")}: ${rate}%` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Detail sheet */}
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
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {selected?.full_name || t("admin.unnamed")}
                </Text>
                <Text style={styles.sheetSub}>{selected?.email || ""}</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={12} testID="flag-close-btn">
                <Ionicons name="close" size={24} color={theme.colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Ionicons name="flag" size={16} color={theme.colors.error} />
                <Text style={styles.detailLabel}>{t("flags.reason")}</Text>
              </View>
              <Text style={styles.detailValue}>{selected?.reason}</Text>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={16} color={theme.colors.brand} />
                <Text style={styles.detailLabel}>{t("flags.flaggedAt")}</Text>
              </View>
              <Text style={styles.detailValue}>
                {selected ? new Date(selected.flagged_at).toLocaleString() : ""}
              </Text>
            </View>

            {typeof selected?.completion_rate === "number" && (
              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Ionicons name="stats-chart" size={16} color={theme.colors.info} />
                  <Text style={styles.detailLabel}>{t("flags.completion")}</Text>
                </View>
                <Text style={styles.detailValue}>{Math.round(selected.completion_rate * 100)}%</Text>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setSelected(null)}
                style={[styles.actionBtn, styles.ghost]}
                disabled={busy}
                testID="flag-cancel-btn"
              >
                <Text style={styles.actionBtnGhostText}>{t("account.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmClear(true)}
                style={[styles.actionBtn, styles.clearBtn]}
                disabled={busy}
                testID="flag-clear-btn"
              >
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>{t("flags.clear")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm clear */}
      <Modal transparent visible={confirmClear} animationType="fade" onRequestClose={() => setConfirmClear(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmClear(false)} />
          <View style={[styles.sheet, { paddingBottom: theme.spacing.xxl }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("flags.confirmTitle")}</Text>
            <Text style={styles.sheetSub}>{t("flags.confirmSub")}</Text>
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setConfirmClear(false)}
                style={[styles.actionBtn, styles.ghost]}
                disabled={busy}
              >
                <Text style={styles.actionBtnGhostText}>{t("account.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={clearFlag}
                style={[styles.actionBtn, styles.clearBtn]}
                disabled={busy}
                testID="flag-clear-confirm-btn"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionBtnText}>{t("account.confirm")}</Text>
                )}
              </Pressable>
            </View>
          </View>
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
  },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },
  backBtn: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  backBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(220, 38, 38, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.35)",
  },
  bannerText: { color: theme.colors.onSurface, fontSize: 12, flex: 1, fontWeight: "600" },

  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "flex-start",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(220, 38, 38, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  rowSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  rowReason: { color: theme.colors.error, fontSize: 12, marginTop: 4, fontWeight: "600" },
  rowMeta: { color: theme.colors.muted, fontSize: 10, marginTop: 4 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginBottom: 4,
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },
  sheetSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  detailCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  detailValue: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "600" },

  sheetActions: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.sm },
  actionBtn: {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  clearBtn: { backgroundColor: theme.colors.success },
  ghost: { borderWidth: 1, borderColor: theme.colors.border },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  actionBtnGhostText: { color: theme.colors.onSurface, fontWeight: "700" },

  error: { color: theme.colors.error, fontSize: 13, textAlign: "center" },
});
