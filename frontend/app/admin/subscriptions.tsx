import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
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

type Sub = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  category?: string | null;
  wilaya_code?: string | null;
  subscription_status: "trial" | "active" | "due" | "expired" | "deactivated";
  active: boolean;
  days_until_due?: number | null;
  trial_ends_at?: string | null;
  last_paid_at?: string | null;
  lifetime_paid_dzd: number;
  payments_count: number;
  is_manually_deactivated: boolean;
};

type Payment = { id: string; amount_dzd: number; paid_at: string; method: string; status: string; note?: string | null };

const FILTERS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "", label: "All", icon: "list", color: theme.colors.brand },
  { key: "trial", label: "Trial", icon: "gift", color: "#10B981" },
  { key: "active", label: "Active", icon: "checkmark-circle", color: "#3B82F6" },
  { key: "due", label: "Due", icon: "alert-circle", color: "#F59E0B" },
  { key: "deactivated", label: "Deactivated", icon: "ban", color: "#EF4444" },
];

const STATUS_COLOR: Record<string, string> = {
  trial: "#10B981",
  active: "#3B82F6",
  due: "#F59E0B",
  expired: "#EF4444",
  deactivated: "#EF4444",
};

export default function AdminSubscriptions() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useT();
  const [rows, setRows] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKey, setFilterKey] = useState("");
  const [selected, setSelected] = useState<Sub | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    try {
      const data: any = await api.adminSubscriptions(filterKey || undefined, 200);
      setRows(data || []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [user?.is_admin, filterKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openDetail = async (s: Sub) => {
    setSelected(s);
    setPayments([]);
    try {
      const data: any = await api.adminProviderPayments(s.id);
      setPayments(data || []);
    } catch { setPayments([]); }
  };

  const markPaid = () => {
    if (!selected) return;
    Alert.alert("Mark as paid?", `Add a 1000 DA payment for ${selected.full_name || selected.email}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark paid",
        onPress: async () => {
          setBusy(true);
          try {
            await api.adminMarkPaid(selected.id, { amount_dzd: 1000, note: "Manual admin entry" });
            await load();
            const d: any = await api.adminProviderPayments(selected.id);
            setPayments(d || []);
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Failed");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

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

  const totalActive = rows.filter((r) => r.subscription_status === "active").length;
  const totalTrial = rows.filter((r) => r.subscription_status === "trial").length;
  const totalDue = rows.filter((r) => r.subscription_status === "due" || r.subscription_status === "expired").length;
  const totalLifetime = rows.reduce((s, r) => s + (r.lifetime_paid_dzd || 0), 0);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Subscriptions</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Provider payments &amp; billing status</Text>
        </View>
        <Pressable onPress={load} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      {/* Summary strip */}
      <View style={styles.summary}>
        <SummaryBox label="Active" value={totalActive} color="#3B82F6" />
        <SummaryBox label="Trial" value={totalTrial} color="#10B981" />
        <SummaryBox label="Due" value={totalDue} color="#F59E0B" />
        <SummaryBox label="Lifetime" value={`${totalLifetime.toLocaleString()} DA`} color={theme.colors.brand} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key || "all"}
            onPress={() => setFilterKey(f.key)}
            style={[styles.chip, filterKey === f.key && styles.chipActive]}
          >
            <Ionicons name={f.icon} size={12} color={filterKey === f.key ? theme.colors.onBrandPrimary : f.color} />
            <Text style={[styles.chipText, filterKey === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="card-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>No providers match</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxxl }}>
          {rows.map((r) => (
            <Pressable key={r.id} onPress={() => openDetail(r)} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: STATUS_COLOR[r.subscription_status] || theme.colors.muted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{r.full_name || r.email || "—"}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {r.subscription_status.toUpperCase()} · {r.days_until_due != null ? `${r.days_until_due}d left` : "—"} · {r.category || "—"}
                </Text>
                <Text style={styles.rowMeta}>
                  Paid lifetime: {r.lifetime_paid_dzd.toLocaleString()} DA ({r.payments_count})
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
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{selected?.full_name || "—"}</Text>
                <Text style={styles.sheetSub}>{selected?.email || "—"}</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={12}><Ionicons name="close" size={22} color={theme.colors.onSurface} /></Pressable>
            </View>

            {selected && (
              <View style={styles.statusCard}>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[selected.subscription_status] + "22", borderColor: STATUS_COLOR[selected.subscription_status] }]}>
                  <Text style={[styles.statusPillText, { color: STATUS_COLOR[selected.subscription_status] }]}>{selected.subscription_status.toUpperCase()}</Text>
                </View>
                <Text style={styles.statusMeta}>
                  {selected.days_until_due != null ? `${selected.days_until_due} days until due` : "No renewal date"}
                </Text>
                {selected.last_paid_at && <Text style={styles.statusMeta}>Last paid: {new Date(selected.last_paid_at).toLocaleDateString()}</Text>}
                {selected.trial_ends_at && <Text style={styles.statusMeta}>Trial ends: {new Date(selected.trial_ends_at).toLocaleDateString()}</Text>}
              </View>
            )}

            <View style={styles.summary2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Lifetime paid</Text>
                <Text style={styles.detailValue}>{(selected?.lifetime_paid_dzd || 0).toLocaleString()} DA</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Payments</Text>
                <Text style={styles.detailValue}>{selected?.payments_count || 0}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Payment history</Text>
            <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 6 }}>
              {payments.length === 0 ? (
                <Text style={styles.rowMeta}>No payments yet.</Text>
              ) : (
                payments.map((p) => (
                  <View key={p.id} style={styles.payRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payAmt}>{p.amount_dzd.toLocaleString()} DA</Text>
                      <Text style={styles.rowMeta}>{new Date(p.paid_at).toLocaleString()} · {p.method}</Text>
                    </View>
                    <View style={[styles.payTag, { backgroundColor: (p.status === "paid" ? theme.colors.success : theme.colors.warning) + "33" }]}>
                      <Text style={[styles.payTagText, { color: p.status === "paid" ? theme.colors.success : theme.colors.warning }]}>{p.status}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable onPress={markPaid} disabled={busy} style={styles.markBtn}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.markBtnText}>Mark 1000 DA as paid (manual)</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={[styles.summaryVal, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },

  summary: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  summaryBox: {
    flex: 1, padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center",
  },
  summaryVal: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  summaryLbl: { color: theme.colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700", marginTop: 2 },

  filterRow: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md, gap: 6 },
  chip: {
    flexDirection: "row", gap: 4, alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { color: theme.colors.onSurface, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: theme.colors.onBrandPrimary },

  row: {
    flexDirection: "row", gap: theme.spacing.md,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 14 },
  rowSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  rowMeta: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong, marginBottom: 4 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: theme.spacing.md },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },
  sheetSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  statusCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    gap: 4,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1, marginBottom: 4,
  },
  statusPillText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  statusMeta: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },

  summary2: { flexDirection: "row", gap: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  detailLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 11, fontWeight: "700" },
  detailValue: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: 2 },
  sectionLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },

  payRow: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    padding: theme.spacing.sm, borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  payAmt: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "700" },
  payTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  payTagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  markBtn: {
    height: 46, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.success,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6, marginTop: theme.spacing.sm,
  },
  markBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
