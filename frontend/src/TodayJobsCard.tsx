import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type Job = {
  id: string;
  status: string;
  scheduled_date: string;
  client_name?: string | null;
  client_phone?: string | null;
  address?: string | null;
  task_description?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
};

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const openMaps = (job: Job) => {
  const q =
    job.location_lat != null && job.location_lng != null
      ? `${job.location_lat},${job.location_lng}`
      : encodeURIComponent(job.address || "");
  const url = Platform.select({
    ios: `maps:0,0?q=${q}`,
    default: `https://www.google.com/maps/search/?api=1&query=${q}`,
  });
  Linking.openURL(url).catch(() => {});
};

// Reminder card shown on the provider dashboard: every job confirmed for
// today, with the address and a one-tap call to the client.
export function TodayJobsCard({ bookings }: { bookings: Job[] }) {
  const { t, isRTL } = useT();

  const jobs = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "confirmed" && b.scheduled_date && isToday(b.scheduled_date))
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [bookings]
  );

  if (jobs.length === 0) return null;

  return (
    <View style={styles.card} testID="today-jobs-card">
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View style={styles.headerIcon}>
          <Ionicons name="alarm" size={20} color={theme.colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, isRTL && styles.rtlText]}>{t("dash.todayTitle")}</Text>
          <Text style={[styles.sub, isRTL && styles.rtlText]}>
            {t("dash.todaySub", { n: jobs.length })}
          </Text>
        </View>
      </View>

      {jobs.map((job) => (
        <View key={job.id} style={styles.job} testID={`today-job-${job.id}`}>
          <View style={[styles.jobRow, isRTL && styles.rtlRow]}>
            <View style={styles.timePill}>
              <Text style={styles.timeText}>{formatTime(job.scheduled_date)}</Text>
            </View>
            <Text style={[styles.client, isRTL && styles.rtlText]} numberOfLines={1}>
              {job.client_name || t("dash.todayClient")}
            </Text>
          </View>

          {!!job.task_description && (
            <Text style={[styles.task, isRTL && styles.rtlText]} numberOfLines={2}>
              {job.task_description}
            </Text>
          )}

          {!!job.address && (
            <Pressable
              onPress={() => openMaps(job)}
              style={[styles.addressRow, isRTL && styles.rtlRow]}
              testID={`today-job-address-${job.id}`}
            >
              <Ionicons name="location-outline" size={15} color={theme.colors.onSurfaceSecondary} />
              <Text style={[styles.address, isRTL && styles.rtlText]} numberOfLines={2}>
                {job.address}
              </Text>
              <Ionicons
                name={isRTL ? "chevron-back" : "chevron-forward"}
                size={14}
                color={theme.colors.muted}
              />
            </Pressable>
          )}

          <Pressable
            onPress={() => job.client_phone && Linking.openURL(`tel:${job.client_phone}`).catch(() => {})}
            disabled={!job.client_phone}
            style={[styles.callBtn, !job.client_phone && styles.callBtnDisabled, isRTL && styles.rtlRow]}
            testID={`today-job-call-${job.id}`}
          >
            <Ionicons name="call" size={16} color={theme.colors.onBrandPrimary} />
            <Text style={styles.callText}>
              {job.client_phone ? t("dash.todayCall", { phone: job.client_phone }) : t("dash.todayNoPhone")}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.spacing.xl,
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.brand,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "800" },
  sub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  job: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  jobRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  timeText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  client: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15, flex: 1 },
  task: { color: theme.colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  address: { color: theme.colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.success,
  },
  callBtnDisabled: { backgroundColor: theme.colors.muted },
  callText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  rtlRow: { flexDirection: "row-reverse" },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
});
