import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type Row = { month: string; commission_dzd: number; gmv_dzd: number; completed_bookings: number };

export default function AdminRevenue() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    try {
      const data: any = await api.adminRevenue(12);
      setRows((data || []).reverse());
    } catch {
      setRows([]);
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
        </View>
      </SafeAreaView>
    );
  }

  const totalCommission = rows.reduce((s, r) => s + r.commission_dzd, 0);
  const totalGmv = rows.reduce((s, r) => s + r.gmv_dzd, 0);
  const maxCommission = Math.max(1, ...rows.map((r) => r.commission_dzd));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("admin.revenue.title")}</Text>
        <Pressable onPress={load} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cash-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.revenue.empty")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md, paddingBottom: theme.spacing.xxxl }}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t("admin.revenue.commission")}</Text>
              <Text style={styles.summaryValue}>{totalCommission.toLocaleString()} DA</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t("admin.revenue.gmv")}</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.brand }]}>{totalGmv.toLocaleString()} DA</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t("admin.revenue.month")}</Text>
          {rows.map((r) => {
            const pct = Math.min(100, Math.round((r.commission_dzd / maxCommission) * 100));
            return (
              <View key={r.month} style={styles.barRow}>
                <View style={styles.barHead}>
                  <Text style={styles.barMonth}>{r.month}</Text>
                  <Text style={styles.barValue}>{r.commission_dzd.toLocaleString()} DA</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <View style={styles.barMeta}>
                  <Text style={styles.barMetaText}>{t("admin.revenue.bookings")}: {r.completed_bookings}</Text>
                  <Text style={styles.barMetaText}>{t("admin.revenue.gmv")}: {r.gmv_dzd.toLocaleString()} DA</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },

  summaryRow: { flexDirection: "row", gap: theme.spacing.md },
  summaryCard: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  summaryValue: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", marginTop: 4, letterSpacing: -0.3 },

  sectionLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },

  barRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barMonth: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700" },
  barValue: { color: theme.colors.brand, fontSize: 14, fontWeight: "800" },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surface, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: theme.colors.brand, borderRadius: 4 },
  barMeta: { flexDirection: "row", justifyContent: "space-between" },
  barMetaText: { color: theme.colors.onSurfaceSecondary, fontSize: 11 },
});
