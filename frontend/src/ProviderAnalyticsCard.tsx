import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "./api";
import { theme } from "./theme";
import { AnimatedBarChart, BarPoint } from "./AnimatedBarChart";

type Week = { week_start: string; bookings: number; completed: number; earned_dzd: number };
type Analytics = {
  weeks: Week[];
  totals: { bookings: number; completed: number; earned_dzd: number };
  rating: number;
  reviews_count: number;
  profile_views: number;
  verification_status: string;
};

const RANGES: { key: number; label: string }[] = [
  { key: 4, label: "1M" },
  { key: 12, label: "3M" },
  { key: 26, label: "6M" },
];

export function ProviderAnalyticsCard({ testID = "provider-analytics" }: { testID?: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<number>(12);
  const [metric, setMetric] = useState<"bookings" | "earned">("bookings");

  useEffect(() => {
    let dead = false;
    setLoading(true);
    api
      .providerAnalytics(range)
      .then((res: any) => {
        if (dead) return;
        setData(res);
      })
      .catch(() => {})
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [range]);

  if (loading) {
    return (
      <View style={styles.card} testID={testID}>
        <ActivityIndicator color={theme.colors.brand} />
      </View>
    );
  }
  if (!data) return null;

  const total = metric === "bookings" ? data.totals.bookings : data.totals.earned_dzd;

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Your performance</Text>
          <Text style={styles.subtitle}>
            {metric === "bookings"
              ? `${total} bookings in the last ${range} weeks`
              : `${total.toLocaleString()} DA earned in the last ${range} weeks`}
          </Text>
        </View>
        <View style={styles.rangePill}>
          {RANGES.map((r) => (
            <Pressable key={r.key} onPress={() => setRange(r.key)} style={[styles.rangeBtn, range === r.key && styles.rangeBtnActive]}>
              <Text style={[styles.rangeBtnText, range === r.key && styles.rangeBtnTextActive]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Metric toggle */}
      <View style={styles.metricRow}>
        <Pressable
          testID="metric-bookings"
          onPress={() => setMetric("bookings")}
          style={[styles.metricBtn, metric === "bookings" && styles.metricBtnActive]}
        >
          <Ionicons name="calendar" size={13} color={metric === "bookings" ? theme.colors.brand : theme.colors.muted} />
          <Text style={[styles.metricText, metric === "bookings" && styles.metricTextActive]}>Bookings</Text>
        </Pressable>
        <Pressable
          testID="metric-earnings"
          onPress={() => setMetric("earned")}
          style={[styles.metricBtn, metric === "earned" && styles.metricBtnActive]}
        >
          <Ionicons name="cash" size={13} color={metric === "earned" ? theme.colors.brand : theme.colors.muted} />
          <Text style={[styles.metricText, metric === "earned" && styles.metricTextActive]}>Earnings</Text>
        </Pressable>
      </View>

      {/* Bar chart (animated + tap to see tooltip) */}
      <AnimatedBarChart
        data={data.weeks.map<BarPoint>((w) => ({
          label: w.week_start.slice(5),
          value: metric === "bookings" ? w.bookings : w.earned_dzd,
          tooltip: `Week of ${w.week_start}`,
        }))}
        height={130}
        barWidth={12}
        formatValue={(v) =>
          metric === "earned" && v >= 1000 ? `${(v / 1000).toFixed(1)}k DA` : metric === "earned" ? `${v} DA` : String(v)
        }
      />

      {/* Bottom stats */}
      <View style={styles.statsRow}>
        <Stat icon="checkmark-done" label="Completed" value={data.totals.completed} color="#10B981" />
        <Stat icon="star" label="Rating" value={data.rating ? data.rating.toFixed(1) : "—"} color="#EAB308" subLabel={`${data.reviews_count} reviews`} />
        <Stat icon="eye" label="Profile views" value={data.profile_views || 0} color="#8B5CF6" />
      </View>
    </View>
  );
}

function Stat({ icon, label, value, color, subLabel }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: number | string; color: string; subLabel?: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subLabel && <Text style={styles.statSub}>{subLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  title: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 15 },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  rangePill: {
    flexDirection: "row", gap: 2,
    padding: 2, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rangeBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill },
  rangeBtnActive: { backgroundColor: theme.colors.brand },
  rangeBtnText: { color: theme.colors.onSurfaceSecondary, fontSize: 10, fontWeight: "800" },
  rangeBtnTextActive: { color: theme.colors.onBrandPrimary },

  metricRow: { flexDirection: "row", gap: 6 },
  metricBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  metricBtnActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
  metricText: { color: theme.colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  metricTextActive: { color: theme.colors.onSurface },

  statsRow: { flexDirection: "row", gap: theme.spacing.sm, marginTop: 4 },
  stat: {
    flex: 1, padding: 8, gap: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  statIcon: { width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  statValue: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: 2 },
  statLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700" },
  statSub: { color: theme.colors.muted, fontSize: 9 },
});
