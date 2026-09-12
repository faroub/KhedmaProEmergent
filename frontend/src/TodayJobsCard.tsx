import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { api } from "@/src/api";
import { formatClock, useNow } from "@/src/hooks/useNow";

const ETA_OPTIONS = [10, 20, 30, 45, 60];

type Job = {
  id: string;
  client_id?: string | null;
  arrived_at?: string | null;
  eta_minutes?: number | null;
  rate_type?: string | null;
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
const ACTIVE_STATUSES = new Set(["confirmed", "in_progress"]);

export function TodayJobsCard({
  bookings,
  onStatusChanged,
  hourlyRate,
}: {
  bookings: Job[];
  onStatusChanged?: () => void;
  hourlyRate?: number | null;
}) {
  const { t, isRTL } = useT();
  const now = useNow(1000);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const changeStatus = async (job: Job, status: "in_progress" | "completed") => {
    setStatusBusy(job.id);
    try {
      await api.updateBookingStatus(job.id, status);
      onStatusChanged?.();
    } catch {}
    setStatusBusy(null);
  };
  // Per-job "On my way" state: which job has the ETA picker open, which is
  // sending, and the ETA (minutes) already sent.
  const [etaOpenFor, setEtaOpenFor] = useState<string | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [sentEta, setSentEta] = useState<Record<string, number>>({});

  const canChat = (job: Job) => !!job.client_id && !job.client_id.startsWith("guest:");

  const sendOnMyWay = async (job: Job, minutes: number) => {
    if (!job.client_id) return;
    setSendingFor(job.id);
    try {
      await api.sendEta(job.id, minutes);
      setSentEta((prev) => ({ ...prev, [job.id]: minutes }));
      setEtaOpenFor(null);
      onStatusChanged?.();
    } catch {}
    setSendingFor(null);
  };

  const jobs = useMemo(
    () =>
      bookings
        .filter((b) => ACTIVE_STATUSES.has(b.status) && b.scheduled_date && isToday(b.scheduled_date))
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

          {job.status === "in_progress" ? (
            <View style={styles.timerBox} testID={`today-job-inprogress-${job.id}`}>
              <View style={[styles.arrivedRow, isRTL && styles.rtlRow]}>
                <Ionicons name="location" size={16} color={theme.colors.brand} />
                <Text style={[styles.arrivedText, isRTL && styles.rtlText]}>
                  {t("dash.arrivedDone", { time: job.arrived_at ? formatTime(job.arrived_at) : "—" })}
                </Text>
              </View>
              <View style={[styles.timerRow, isRTL && styles.rtlRow]}>
                <View style={styles.timerDot} />
                <Text style={styles.timerLabel}>{t("dash.workingFor")}</Text>
                <Text style={styles.timerClock} testID={`today-job-timer-${job.id}`}>
                  {formatClock(now - new Date(job.arrived_at || now).getTime())}
                </Text>
              </View>
              {job.rate_type === "hourly" && !!hourlyRate && (
                <Text style={[styles.timerHint, isRTL && styles.rtlText]}>
                  {t("dash.soFar", {
                    amount: Math.round((hourlyRate * Math.max(0, now - new Date(job.arrived_at || now).getTime())) / 3_600_000),
                    rate: hourlyRate,
                  })}
                </Text>
              )}
            </View>
          ) : (
            <Pressable
              onPress={() => changeStatus(job, "in_progress")}
              disabled={statusBusy === job.id}
              style={[styles.arrivedBtn, isRTL && styles.rtlRow]}
              testID={`today-job-arrived-${job.id}`}
            >
              {statusBusy === job.id ? (
                <ActivityIndicator size="small" color={theme.colors.onBrandPrimary} />
              ) : (
                <>
                  <Ionicons name="location" size={16} color={theme.colors.onBrandPrimary} />
                  <Text style={styles.arrivedBtnText}>{t("dash.arrived")}</Text>
                </>
              )}
            </Pressable>
          )}

          {job.status === "in_progress" && (
            <Pressable
              onPress={() => changeStatus(job, "completed")}
              disabled={statusBusy === job.id}
              style={[styles.doneBtn, isRTL && styles.rtlRow]}
              testID={`today-job-done-${job.id}`}
            >
              <Ionicons name="checkmark-done" size={16} color={theme.colors.brand} />
              <Text style={styles.doneText}>{t("dash.markDone")}</Text>
            </Pressable>
          )}

          {canChat(job) && job.status === "confirmed" && (
            <View style={styles.etaBlock}>
              {(sentEta[job.id] ?? job.eta_minutes) != null ? (
                <View style={[styles.sentRow, isRTL && styles.rtlRow]} testID={`today-job-onmyway-sent-${job.id}`}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.sentText}>{t("dash.onMyWaySent", { minutes: sentEta[job.id] ?? job.eta_minutes })}</Text>
                  <Pressable onPress={() => setEtaOpenFor(job.id)} hitSlop={8} testID={`today-job-onmyway-edit-${job.id}`}>
                    <Text style={styles.sentEdit}>{t("dash.onMyWayUpdate")}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setEtaOpenFor(etaOpenFor === job.id ? null : job.id)}
                  style={[styles.onMyWayBtn, isRTL && styles.rtlRow]}
                  testID={`today-job-onmyway-${job.id}`}
                >
                  <Ionicons name="car" size={16} color={theme.colors.brand} />
                  <Text style={styles.onMyWayText}>{t("dash.onMyWay")}</Text>
                  <Ionicons name={etaOpenFor === job.id ? "chevron-up" : "chevron-down"} size={14} color={theme.colors.brand} />
                </Pressable>
              )}

              {etaOpenFor === job.id && (
                <View style={styles.etaPicker} testID={`today-job-eta-picker-${job.id}`}>
                  <Text style={[styles.etaLabel, isRTL && styles.rtlText]}>{t("dash.onMyWayPick")}</Text>
                  <View style={[styles.etaRow, isRTL && styles.rtlRow]}>
                    {ETA_OPTIONS.map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => sendOnMyWay(job, m)}
                        disabled={sendingFor === job.id}
                        style={styles.etaChip}
                        testID={`today-job-eta-${job.id}-${m}`}
                      >
                        {sendingFor === job.id ? (
                          <ActivityIndicator size="small" color={theme.colors.onBrandPrimary} />
                        ) : (
                          <Text style={styles.etaChipText}>{t("dash.onMyWayMin", { minutes: m })}</Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
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
  etaBlock: { gap: theme.spacing.sm },
  arrivedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  arrivedBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 14 },
  arrivedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brandTertiary,
  },
  arrivedText: { color: theme.colors.brand, fontWeight: "700", fontSize: 13, flex: 1 },
  timerBox: { gap: theme.spacing.sm },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  timerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  timerLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
  timerClock: {
    color: theme.colors.onSurface,
    fontSize: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timerHint: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.brand,
  },
  doneText: { color: theme.colors.brand, fontWeight: "700", fontSize: 14 },
  onMyWayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.brandTertiary,
  },
  onMyWayText: { color: theme.colors.brand, fontWeight: "700", fontSize: 14 },
  etaPicker: { gap: theme.spacing.sm },
  etaLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },
  etaRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  etaChip: {
    minWidth: 60,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  etaChipText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  sentRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  sentText: { color: theme.colors.success, fontWeight: "700", fontSize: 13, flex: 1 },
  sentEdit: { color: theme.colors.brand, fontWeight: "700", fontSize: 13, textDecorationLine: "underline" },
  callText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  rtlRow: { flexDirection: "row-reverse" },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
});
