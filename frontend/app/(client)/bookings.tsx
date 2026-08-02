import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type Booking = {
  id: string; provider_id: string; provider_name: string; provider_category?: string;
  client_id: string; client_name: string;
  scheduled_date: string; task_description: string; address: string;
  rate_type: string; estimated_hours?: number; estimated_total?: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  reviewed?: boolean;
};

const STATUS_COLOR: Record<string, string> = {
  pending: theme.colors.warning,
  confirmed: theme.colors.info,
  completed: theme.colors.success,
  cancelled: theme.colors.error,
};

export default function Bookings() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useT();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"all" | "pending" | "confirmed" | "completed">("all");

  const load = useCallback(async () => {
    try {
      const data: any = await api.myBookings();
      setBookings(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = tab === "all" ? bookings : bookings.filter((b) => b.status === tab);
  const isProvider = user?.role === "service_provider";

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.updateBookingStatus(id, status);
      load();
    } catch (e: any) {
      console.log(e);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("bookings.title")}</Text>
      </View>

      <View style={styles.tabsContainer}>
        {(["all", "pending", "confirmed", "completed"] as const).map((tt) => (
          <Pressable
            key={tt}
            testID={`bookings-tab-${tt}`}
            onPress={() => setTab(tt)}
            style={[styles.tab, tab === tt && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === tt && styles.tabTextActive]}>
              {t(`bookings.${tt}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 100, gap: theme.spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={theme.colors.muted} />
              <Text style={styles.emptyText}>{t("bookings.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`booking-${item.id}`}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {isProvider ? item.client_name : item.provider_name}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {item.provider_category || ""} • {new Date(item.scheduled_date).toLocaleDateString()}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLOR[item.status]}22`, borderColor: STATUS_COLOR[item.status] }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardDesc} numberOfLines={2}>{item.task_description}</Text>
              <View style={styles.cardMeta}>
                <Ionicons name="location-outline" size={13} color={theme.colors.muted} />
                <Text style={styles.cardMetaText} numberOfLines={1}>{item.address}</Text>
              </View>
              {item.estimated_total ? (
                <Text style={styles.cardTotal}>≈ {item.estimated_total} DZD</Text>
              ) : null}

              <View style={styles.actions}>
                {isProvider && item.status === "pending" && (
                  <>
                    <Pressable testID={`accept-${item.id}`} style={[styles.actionBtn, styles.actionPrimary]} onPress={() => updateStatus(item.id, "confirmed")}>
                      <Text style={styles.actionPrimaryText}>{t("bookings.accept")}</Text>
                    </Pressable>
                    <Pressable testID={`decline-${item.id}`} style={[styles.actionBtn, styles.actionOutline]} onPress={() => updateStatus(item.id, "cancelled")}>
                      <Text style={styles.actionOutlineText}>{t("bookings.decline")}</Text>
                    </Pressable>
                  </>
                )}
                {isProvider && item.status === "confirmed" && (
                  <Pressable testID={`complete-${item.id}`} style={[styles.actionBtn, styles.actionPrimary]} onPress={() => updateStatus(item.id, "completed")}>
                    <Text style={styles.actionPrimaryText}>{t("bookings.markComplete")}</Text>
                  </Pressable>
                )}
                {!isProvider && (item.status === "pending" || item.status === "confirmed") && (
                  <Pressable testID={`cancel-${item.id}`} style={[styles.actionBtn, styles.actionOutline]} onPress={() => updateStatus(item.id, "cancelled")}>
                    <Text style={styles.actionOutlineText}>{t("bookings.cancel")}</Text>
                  </Pressable>
                )}
                {!isProvider && item.status === "completed" && !item.reviewed && (
                  <Pressable testID={`review-${item.id}`} style={[styles.actionBtn, styles.actionPrimary]} onPress={() => router.push(`/review/${item.id}`)}>
                    <Ionicons name="star" size={14} color={theme.colors.onBrandPrimary} />
                    <Text style={styles.actionPrimaryText}>{t("bookings.leaveReview")}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800" },
  tabsContainer: { flexDirection: "row", paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm, height: 56, alignItems: "center" },
  tab: {
    paddingHorizontal: theme.spacing.md, height: 36, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  tabActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  tabText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: theme.colors.onBrandPrimary },
  card: {
    padding: theme.spacing.lg, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border, gap: theme.spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  cardTitle: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "700" },
  cardSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  cardDesc: { color: theme.colors.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { color: theme.colors.muted, fontSize: 12, flex: 1 },
  cardTotal: { color: theme.colors.brand, fontSize: 14, fontWeight: "700" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  actionBtn: {
    flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    height: 40, borderRadius: theme.radius.pill,
  },
  actionPrimary: { backgroundColor: theme.colors.brand },
  actionPrimaryText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  actionOutline: { borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: "transparent" },
  actionOutlineText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  empty: { alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xxxl },
  emptyText: { color: theme.colors.muted, fontSize: 14 },
});
