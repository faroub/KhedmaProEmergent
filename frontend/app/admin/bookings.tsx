import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

const FILTERS: { key: string; labelKey: string }[] = [
  { key: "", labelKey: "admin.users.filterAll" },
  { key: "pending", labelKey: "bookings.pending" },
  { key: "confirmed", labelKey: "bookings.confirmed" },
  { key: "awaiting_confirmation", labelKey: "bookings.pending" },
  { key: "completed", labelKey: "bookings.completed" },
  { key: "cancelled", labelKey: "bookings.cancel" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  awaiting_confirmation: "#F59E0B",
  confirmed: "#3B82F6",
  completed: "#10B981",
  cancelled: "#EF4444",
  declined: "#EF4444",
};

export default function AdminBookings() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useT();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    try {
      const data: any = await api.adminBookings(status || undefined, 100);
      setRows(data || []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [user?.is_admin, status]);

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

  const totalCommission = rows.reduce((sum, r) => sum + (r.platform_commission_dzd || 0), 0);
  const totalGmv = rows.reduce((sum, r) => sum + (r.total_dzd || 0), 0);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("admin.bookings.title")}</Text>
        <Pressable onPress={load} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key || "all"}
            onPress={() => setStatus(f.key)}
            style={[styles.chip, status === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, status === f.key && styles.chipTextActive]}>{t(f.labelKey)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {rows.length > 0 && (
        <View style={styles.summary}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>{t("admin.bookings.total")}</Text>
            <Text style={styles.summaryValue}>{totalGmv.toLocaleString()} DA</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>{t("admin.bookings.commission")}</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.brand }]}>{totalCommission.toLocaleString()} DA</Text>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.bookings.empty")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxxl }}>
          {rows.map((r) => (
            <Pressable key={r.id} onPress={() => setSelected(r)} style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: (STATUS_COLORS[r.status] || theme.colors.muted) + "22" }]}>
                <Ionicons name="calendar" size={18} color={STATUS_COLORS[r.status] || theme.colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {r.provider?.full_name || r.provider_id?.slice(0, 8)} → {r.client?.full_name || r.client_id?.slice(0, 8)}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {r.status?.toUpperCase()} · {r.total_dzd || 0} DA
                </Text>
                <Text style={styles.rowMeta}>
                  {r.scheduled_for ? new Date(r.scheduled_for).toLocaleString() : (r.created_at ? new Date(r.created_at).toLocaleString() : "—")}
                </Text>
              </View>
              <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal visible={selected !== null} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>#{selected?.id?.slice(0, 8)}</Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={12}><Ionicons name="close" size={22} color={theme.colors.onSurface} /></Pressable>
            </View>
            {selected && (
              <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: 8 }}>
                <DetailRow label="Status" value={selected.status} />
                <DetailRow label="Provider" value={selected.provider?.full_name || selected.provider_id} />
                <DetailRow label="Client" value={selected.client?.full_name || selected.client_id} />
                <DetailRow label="Total" value={`${selected.total_dzd || 0} DA`} />
                <DetailRow label="Commission" value={`${selected.platform_commission_dzd || 0} DA`} />
                <DetailRow label="Scheduled" value={selected.scheduled_for ? new Date(selected.scheduled_for).toLocaleString() : "—"} />
                <DetailRow label="Created" value={selected.created_at ? new Date(selected.created_at).toLocaleString() : "—"} />
                {selected.description && <DetailRow label="Description" value={selected.description} />}
                {selected.address && <DetailRow label="Address" value={selected.address} />}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },

  filterRow: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md, gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { color: theme.colors.onSurface, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: theme.colors.onBrandPrimary },

  summary: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  summaryValue: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: 2 },

  row: {
    flexDirection: "row", gap: theme.spacing.md, padding: theme.spacing.md,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: "center",
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 13 },
  rowSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  rowMeta: { color: theme.colors.muted, fontSize: 10, marginTop: 2 },

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
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  detailLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  detailValue: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
