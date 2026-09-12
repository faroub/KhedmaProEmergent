import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { PortfolioManager } from "@/src/PortfolioManager";
import { PhoneVerifyBanner } from "@/src/PhoneVerifyBanner";
import { ProviderAnalyticsCard } from "@/src/ProviderAnalyticsCard";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const { t } = useT();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data: any = await api.myBookings();
      setBookings(data);
      await refresh();
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [refresh]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stats = {
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    completed: bookings.filter((b) => b.status === "completed").length,
    earnings: bookings
      .filter((b) => b.status === "completed" && b.estimated_total)
      .reduce((s, b) => s + (b.estimated_total || 0), 0),
  };

  const onPay = async () => {
    setPaying(true);
    try {
      await api.paySubscription();
      await refresh();
    } catch {}
    setPaying(false);
  };

  const subStatus = user?.subscription_status;
  const daysLeft = user?.days_until_due ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}
      >
        <Text style={styles.hello}>{t("home.hello")}, {user?.full_name?.split(" ")[0]}</Text>
        <Text style={styles.sub}>{t("dash.subDesc")}</Text>

        <PhoneVerifyBanner />

        {/* Subscription banner */}
        <View style={styles.subBanner} testID="subscription-banner">
          <LinearGradient
            colors={
              subStatus === "trial"
                ? ["#2A2416", "#3B321D"]
                : subStatus === "active"
                ? ["#0A2A20", "#10362A"]
                : ["#3A1414", "#4A1E1E"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.subContent}>
            <View style={styles.subIcon}>
              <Ionicons
                name={subStatus === "active" ? "shield-checkmark" : subStatus === "trial" ? "gift" : "warning"}
                size={24}
                color={subStatus === "active" ? theme.colors.success : theme.colors.brand}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>
                {subStatus === "trial" && t("dash.subTrial")}
                {subStatus === "active" && t("dash.subActive")}
                {subStatus === "due" && t("dash.subDue")}
                {subStatus === "deactivated" && t("dash.subDeact")}
              </Text>
              <Text style={styles.subDesc}>
                {subStatus === "trial" && t("dash.subTrialSub", { days: daysLeft })}
                {subStatus === "active" && t("dash.subActiveSub", { days: daysLeft })}
                {subStatus === "due" && t("dash.subDueSub")}
                {subStatus === "deactivated" && t("dash.subDeactSub")}
              </Text>
            </View>
          </View>
          {(subStatus === "trial" || subStatus === "due" || subStatus === "active") && (
            <Pressable testID="pay-subscription-btn" onPress={onPay} disabled={paying} style={styles.subBtn}>
              {paying ? (
                <ActivityIndicator color={theme.colors.onBrandPrimary} size="small" />
              ) : (
                <Text style={styles.subBtnText}>
                  {subStatus === "active" ? t("dash.renew") : t("dash.pay")}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.earnings}</Text>
            <Text style={styles.statLabel}>{t("dash.earned")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.completed}</Text>
            <Text style={styles.statLabel}>{t("dash.completed")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.confirmed}</Text>
            <Text style={styles.statLabel}>{t("dash.upcoming")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.warning }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>{t("dash.pending")}</Text>
          </View>
        </View>

        {/* Analytics chart (12-week performance) */}
        <ProviderAnalyticsCard />

        {/* Rating card */}
        <View style={styles.ratingCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ratingLabel}>{t("dash.yourRating")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Ionicons name="star" size={22} color={theme.colors.brand} />
              <Text style={styles.ratingValue}>{(user?.rating ?? 0).toFixed(1)}</Text>
              <Text style={styles.ratingCount}>({user?.reviews_count ?? 0} {t("dash.reviews")})</Text>
            </View>
          </View>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{user?.category ? t(`cat.${user.category}`) : ""}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t("dash.recent")}</Text>
        <PortfolioManager />
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.lg }} />
        ) : bookings.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={40} color={theme.colors.muted} />
            <Text style={styles.emptyText}>{t("dash.noBookings")}</Text>
            <Text style={styles.emptySub}>{t("dash.noBookingsSub")}</Text>
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {bookings.slice(0, 5).map((b) => (
              <View key={b.id} style={styles.bookingRow} testID={`dash-booking-${b.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookingName}>{b.client_name}</Text>
                  <Text style={styles.bookingDate}>{new Date(b.scheduled_date).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.bookingStatus}>{b.status}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  hello: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800" },
  sub: { color: theme.colors.onSurfaceSecondary, fontSize: 14, marginTop: 4 },
  subBanner: {
    marginTop: theme.spacing.lg, borderRadius: theme.radius.lg, overflow: "hidden",
    padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border,
  },
  subContent: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center" },
  subIcon: {
    width: 44, height: 44, borderRadius: theme.radius.md,
    backgroundColor: "rgba(212,175,55,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  subLabel: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  subDesc: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  subBtn: {
    marginTop: theme.spacing.md, backgroundColor: theme.colors.brand,
    height: 44, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center",
  },
  subBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700" },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, marginTop: theme.spacing.lg },
  statCard: {
    flexBasis: "47%", flexGrow: 1, padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  statValue: { color: theme.colors.brand, fontSize: 24, fontWeight: "800" },
  statLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  ratingCard: {
    marginTop: theme.spacing.md, padding: theme.spacing.lg,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
    flexDirection: "row", alignItems: "center",
  },
  ratingLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 13 },
  ratingValue: { color: theme.colors.onSurface, fontSize: 22, fontWeight: "800" },
  ratingCount: { color: theme.colors.muted, fontSize: 12 },
  categoryPill: {
    paddingHorizontal: theme.spacing.md, paddingVertical: 6,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary,
  },
  categoryText: { color: theme.colors.onBrandTertiary, fontWeight: "700", fontSize: 12, textTransform: "capitalize" },

  sectionTitle: { color: theme.colors.onSurface, fontSize: 17, fontWeight: "700", marginTop: theme.spacing.xl, marginBottom: theme.spacing.md },
  bookingRow: {
    flexDirection: "row", alignItems: "center",
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  bookingName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 14 },
  bookingDate: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  bookingStatus: { color: theme.colors.brand, textTransform: "capitalize", fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xl },
  emptyText: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700" },
  emptySub: { color: theme.colors.muted, fontSize: 12, textAlign: "center" },
});
