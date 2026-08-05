import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type Stats = {
  users: { total: number; clients: number; providers: number; verified_providers: number; deactivated: number };
  queue: { pending_verifications: number; open_flags: number; pending_bookings: number };
  bookings: { total: number; this_month: number; completed: number };
  revenue: { commission_this_month_dzd: number; commission_total_dzd: number; gmv_this_month_dzd: number };
};

type ManageTile = {
  key: string;
  labelKey: string;
  subKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
};

const TILES: ManageTile[] = [
  { key: "users", labelKey: "admin.hub.users", subKey: "admin.hub.usersSub", icon: "people", route: "/admin/users", color: "#3B82F6" },
  { key: "subscriptions", labelKey: "admin.hub.subscriptions", subKey: "admin.hub.subscriptionsSub", icon: "card", route: "/admin/subscriptions", color: "#22C55E" },
  { key: "bookings", labelKey: "admin.hub.bookings", subKey: "admin.hub.bookingsSub", icon: "calendar", route: "/admin/bookings", color: "#10B981" },
  { key: "categories", labelKey: "admin.hub.categories", subKey: "admin.hub.categoriesSub", icon: "grid", route: "/admin/categories", color: "#F59E0B" },
  { key: "ads", labelKey: "admin.ads.title", subKey: "admin.ads.hubSub", icon: "megaphone", route: "/admin/ads", color: "#EC4899" },
  { key: "revenue", labelKey: "admin.hub.revenue", subKey: "admin.hub.revenueSub", icon: "cash", route: "/admin/revenue", color: "#EAB308" },
  { key: "broadcast", labelKey: "admin.hub.broadcast", subKey: "admin.hub.broadcastSub", icon: "notifications", route: "/admin/broadcast", color: "#8B5CF6" },
  { key: "verification", labelKey: "admin.hub.verification", subKey: "admin.hubSub", icon: "shield-checkmark", route: "/admin/verification", color: "#06B6D4" },
  { key: "flags", labelKey: "admin.hub.flags", subKey: "flags.sectionSub", icon: "flag", route: "/admin/flags", color: "#EF4444" },
  { key: "settings", labelKey: "admin.hub.settings", subKey: "admin.hub.settingsSub", icon: "settings", route: "/admin/settings", color: "#64748B" },
];

function fmtDzd(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export default function AdminHub() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    try {
      const s: any = await api.adminStats();
      setStats(s);
    } catch {
      setStats(null);
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

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="admin-hub-back">
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("admin.hub")}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{t("admin.hubSub")}</Text>
        </View>
        <Pressable onPress={() => { setRefreshing(true); load(); }} hitSlop={12} testID="admin-hub-refresh">
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.lg }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />
          }
        >
          {/* Attention Queue */}
          {stats && (stats.queue.pending_verifications + stats.queue.open_flags > 0) ? (
            <View style={styles.attentionBar}>
              <Ionicons name="alert-circle" size={18} color={theme.colors.warning} />
              <Text style={styles.attentionText}>{t("admin.queue.title")}</Text>
              <View style={styles.attentionBadges}>
                {stats.queue.pending_verifications > 0 && (
                  <View style={[styles.badge, { backgroundColor: "#06B6D422" }]}>
                    <Text style={[styles.badgeText, { color: "#06B6D4" }]}>{stats.queue.pending_verifications} {t("admin.queue.verifications")}</Text>
                  </View>
                )}
                {stats.queue.open_flags > 0 && (
                  <View style={[styles.badge, { backgroundColor: "#EF444422" }]}>
                    <Text style={[styles.badgeText, { color: "#EF4444" }]}>{stats.queue.open_flags} {t("admin.queue.flags")}</Text>
                  </View>
                )}
              </View>
            </View>
          ) : null}

          {/* KPI Cards */}
          <View style={styles.kpiGrid}>
            <KpiCard color="#3B82F6" icon="people" label={t("admin.kpi.clients")} value={stats?.users.clients ?? 0} />
            <KpiCard color="#F59E0B" icon="briefcase" label={t("admin.kpi.providers")} value={stats?.users.providers ?? 0} />
            <KpiCard color="#10B981" icon="shield-checkmark" label={t("admin.kpi.verified")} value={stats?.users.verified_providers ?? 0} />
            <KpiCard color="#EF4444" icon="ban" label={t("admin.kpi.deactivated")} value={stats?.users.deactivated ?? 0} />
            <KpiCard color="#8B5CF6" icon="calendar" label={t("admin.kpi.bookingsMonth")} value={stats?.bookings.this_month ?? 0} />
            <KpiCard color="#06B6D4" icon="checkmark-done" label={t("admin.kpi.completed")} value={stats?.bookings.completed ?? 0} />
            <KpiCard color="#EAB308" icon="cash" label={t("admin.kpi.commissionMonth")} value={fmtDzd(stats?.revenue.commission_this_month_dzd ?? 0)} suffix=" DA" />
            <KpiCard color="#22C55E" icon="trending-up" label={t("admin.kpi.commissionTotal")} value={fmtDzd(stats?.revenue.commission_total_dzd ?? 0)} suffix=" DA" />
          </View>

          {/* Management tiles */}
          <Text style={styles.sectionLabel}>{t("admin.hub.manage")}</Text>
          <View style={styles.tilesCol}>
            {TILES.map((tile) => (
              <Pressable
                key={tile.key}
                testID={`admin-tile-${tile.key}`}
                style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
                onPress={() => router.push(tile.route as any)}
              >
                <View style={[styles.tileIcon, { backgroundColor: `${tile.color}22`, borderColor: `${tile.color}44` }]}>
                  <Ionicons name={tile.icon} size={20} color={tile.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileTitle}>{t(tile.labelKey)}</Text>
                  <Text style={styles.tileSub}>{t(tile.subKey)}</Text>
                </View>
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.onSurfaceTertiary} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function KpiCard({ color, icon, label, value, suffix }: {
  color: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: number | string; suffix?: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.kpiValue} numberOfLines={1}>
        {value}{suffix || ""}
      </Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>{label}</Text>
    </View>
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
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
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

  attentionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(245, 158, 11, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.30)",
    flexWrap: "wrap",
  },
  attentionText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  attentionBadges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill },
  badgeText: { fontSize: 11, fontWeight: "700" },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  kpiCard: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 140,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  kpiIcon: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  kpiValue: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  kpiLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600" },

  sectionLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },

  tilesCol: { gap: theme.spacing.sm },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tileIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  tileTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "700" },
  tileSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
});
