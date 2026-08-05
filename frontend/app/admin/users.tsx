import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type UserRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: "client" | "service_provider";
  category?: string | null;
  wilaya_code?: string | null;
  city?: string | null;
  verification_status?: string | null;
  is_manually_deactivated?: boolean;
  is_auto_deactivated?: boolean;
  is_deactivated?: boolean;
  is_admin?: boolean;
  created_at?: string;
};

const FILTERS: { key: string; labelKey: string; params: any }[] = [
  { key: "all", labelKey: "admin.users.filterAll", params: {} },
  { key: "clients", labelKey: "admin.users.filterClients", params: { role: "client" } },
  { key: "providers", labelKey: "admin.users.filterProviders", params: { role: "service_provider" } },
  { key: "verified", labelKey: "admin.users.filterVerified", params: { status: "verified" } },
  { key: "pending", labelKey: "admin.users.filterPending", params: { status: "pending" } },
  { key: "deact", labelKey: "admin.users.filterDeact", params: { status: "deactivated" } },
];

export default function AdminUsers() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useT();
  const [q, setQ] = useState("");
  const [filterKey, setFilterKey] = useState("all");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFilter = useMemo(() => FILTERS.find((f) => f.key === filterKey) || FILTERS[0], [filterKey]);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    setError(null);
    try {
      const data: any = await api.adminSearchUsers({
        q: q.trim() || undefined,
        ...currentFilter.params,
        limit: 60,
      });
      setRows(data || []);
    } catch (e: any) {
      setError(e?.message || "Failed");
      setRows([]);
    }
    setLoading(false);
  }, [user?.is_admin, q, currentFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  const isDeactivated = (r: UserRow) =>
    !!(r.is_manually_deactivated || r.is_auto_deactivated || r.is_deactivated);

  const doAction = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDeactivate = (u: UserRow) => {
    Alert.alert(
      t("admin.users.confirmDeactivate"),
      u.full_name || u.email || u.phone || "",
      [
        { text: t("account.cancel"), style: "cancel" },
        { text: t("admin.users.deactivate"), style: "destructive", onPress: () => doAction(() => api.adminDeactivateUser(u.id)) },
      ]
    );
  };

  const confirmDelete = (u: UserRow) => {
    Alert.alert(
      t("admin.users.confirmDelete"),
      t("admin.users.deleteWarn"),
      [
        { text: t("account.cancel"), style: "cancel" },
        { text: t("admin.users.delete"), style: "destructive", onPress: () => doAction(() => api.adminDeleteUser(u.id)) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="admin-users-back">
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("admin.users.title")}</Text>
        <Pressable onPress={load} hitSlop={12} testID="admin-users-refresh">
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={theme.colors.muted} style={{ marginHorizontal: 8 }} />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={load}
          returnKeyType="search"
          placeholder={t("admin.users.searchPh")}
          placeholderTextColor={theme.colors.muted}
          style={styles.search}
          testID="admin-users-search"
        />
        {q ? (
          <Pressable hitSlop={8} onPress={() => { setQ(""); }}>
            <Ionicons name="close-circle" size={18} color={theme.colors.muted} style={{ marginHorizontal: 6 }} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            testID={`admin-users-filter-${f.key}`}
            onPress={() => setFilterKey(f.key)}
            style={[styles.chip, filterKey === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filterKey === f.key && styles.chipTextActive]}>{t(f.labelKey)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.users.empty")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxxl }}>
          {rows.map((r) => {
            const deact = isDeactivated(r);
            const isProvider = r.role === "service_provider";
            const verified = r.verification_status === "verified";
            return (
              <Pressable
                key={r.id}
                testID={`admin-user-${r.id}`}
                onPress={() => setSelected(r)}
                style={[styles.row, deact && { opacity: 0.6 }]}
              >
                <View style={[styles.avatar, isProvider && { backgroundColor: theme.colors.brandTertiary }]}>
                  <Ionicons name={isProvider ? "briefcase" : "person"} size={20} color={isProvider ? theme.colors.brand : "#60A5FA"} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{r.full_name || t("admin.unnamed")}</Text>
                    {verified && <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />}
                    {r.is_admin && <View style={styles.adminTag}><Text style={styles.adminTagText}>ADMIN</Text></View>}
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {r.email || r.phone || "—"} · {isProvider ? "Provider" : "Client"}
                  </Text>
                  {deact && (
                    <Text style={[styles.rowSub, { color: theme.colors.error }]}>{t("account.subDeact")}</Text>
                  )}
                </View>
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.onSurfaceTertiary} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Detail sheet */}
      <Modal visible={selected !== null} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{selected?.full_name || t("admin.unnamed")}</Text>
                <Text style={styles.sheetSub}>{selected?.email || selected?.phone || "—"}</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.detailCard}>
              <DetailRow icon="person-outline" label="Role" value={selected?.role === "service_provider" ? "Provider" : "Client"} />
              <DetailRow icon="location-outline" label="Wilaya" value={selected?.wilaya_code || "—"} />
              <DetailRow icon="business-outline" label="Category" value={selected?.category || "—"} />
              <DetailRow icon="shield-outline" label="Verification" value={selected?.verification_status || "—"} />
              <DetailRow icon="calendar-outline" label="Joined" value={selected?.created_at ? new Date(selected.created_at).toLocaleDateString() : "—"} />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            {selected && !selected.is_admin && (
              <View style={styles.actions}>
                {selected.role === "service_provider" && (
                  <Pressable
                    testID="admin-user-verify"
                    style={[styles.actionBtn, styles.warn]}
                    onPress={() => doAction(() => api.adminForceVerify(selected.id, selected.verification_status !== "verified"))}
                    disabled={busy}
                  >
                    <Ionicons name="shield-checkmark" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>{selected.verification_status === "verified" ? t("admin.users.unverify") : t("admin.users.forceVerify")}</Text>
                  </Pressable>
                )}
                {isDeactivated(selected) ? (
                  <Pressable
                    testID="admin-user-reactivate"
                    style={[styles.actionBtn, styles.approve]}
                    onPress={() => doAction(() => api.adminReactivateUser(selected.id))}
                    disabled={busy}
                  >
                    <Ionicons name="refresh-circle" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>{t("admin.users.reactivate")}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID="admin-user-deactivate"
                    style={[styles.actionBtn, styles.warn]}
                    onPress={() => confirmDeactivate(selected)}
                    disabled={busy}
                  >
                    <Ionicons name="ban" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>{t("admin.users.deactivate")}</Text>
                  </Pressable>
                )}
                <Pressable
                  testID="admin-user-delete"
                  style={[styles.actionBtn, styles.reject]}
                  onPress={() => confirmDelete(selected)}
                  disabled={busy}
                >
                  <Ionicons name="trash" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>{t("admin.users.delete")}</Text>
                </Pressable>
              </View>
            )}
            {busy && <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.sm }} />}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={theme.colors.muted} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  search: { flex: 1, color: theme.colors.onSurface, fontSize: 14, paddingVertical: 10 },

  filterRow: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { color: theme.colors.onSurface, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: theme.colors.onBrandPrimary },

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
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  rowName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 14 },
  rowSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  adminTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: theme.colors.brandTertiary },
  adminTagText: { color: theme.colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

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
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: theme.spacing.md },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },
  sheetSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  detailCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700", width: 90 },
  detailValue: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600", flex: 1 },

  actions: { gap: theme.spacing.sm },
  actionBtn: {
    height: 46, borderRadius: theme.radius.pill,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6,
  },
  approve: { backgroundColor: theme.colors.success },
  warn: { backgroundColor: theme.colors.warning },
  reject: { backgroundColor: theme.colors.error },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  error: { color: theme.colors.error, fontSize: 13, textAlign: "center" },
});
