import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Calendar, LocaleConfig } from "react-native-calendars";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { getItem, setItem } from "@/src/utils/storage";

const DAYS: { key: string; tKey: string }[] = [
  { key: "mon", tKey: "day.mon" },
  { key: "tue", tKey: "day.tue" },
  { key: "wed", tKey: "day.wed" },
  { key: "thu", tKey: "day.thu" },
  { key: "fri", tKey: "day.fri" },
  { key: "sat", tKey: "day.sat" },
  { key: "sun", tKey: "day.sun" },
];

const TIME_OPTIONS = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

// French / Arabic locales for calendar
LocaleConfig.locales["fr"] = {
  monthNames: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
  monthNamesShort: ["Jan.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."],
  dayNames: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  dayNamesShort: ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."],
};
LocaleConfig.locales["ar"] = {
  monthNames: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  monthNamesShort: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  dayNames: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  dayNamesShort: ["أحد", "اثن", "ثلا", "أرب", "خمي", "جمع", "سبت"],
};

const CACHE_KEY = "sp_schedule_cache";

export default function Schedule() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const [hours, setHours] = useState<Record<string, { start: string; end: string } | null>>({});
  const [breaks, setBreaks] = useState<Record<string, { start: string; end: string }[]>>({});
  const [vacation, setVacation] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState<{ day: string; kind: "start" | "end" } | null>(null);

  useEffect(() => {
    LocaleConfig.defaultLocale = lang === "en" ? "" : lang;
  }, [lang]);

  const load = useCallback(async () => {
    // Load cache first for instant offline display
    try {
      const cached = await getItem<any>(CACHE_KEY);
      if (cached && cached.provider_id === user?.id) {
        setHours(cached.working_hours || {});
        setBreaks(cached.breaks || {});
        setVacation(cached.vacation_days || []);
      }
    } catch {}
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const data: any = await api.getSchedule(user.id);
      setHours(data.working_hours || {});
      setBreaks(data.breaks || {});
      setVacation(data.vacation_days || []);
      setOffline(false);
      // Cache for offline access
      await setItem(CACHE_KEY, { provider_id: user.id, ...data });
    } catch (e: any) {
      // Only flag offline for network-style failures, not auth or missing data
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch") || msg === "") {
        setOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDayClosed = (day: string) => {
    setHours((h) => ({ ...h, [day]: h[day] ? null : { start: "08:00", end: "17:00" } }));
  };

  const setTime = (day: string, kind: "start" | "end", val: string) => {
    setHours((h) => {
      const current = h[day] || { start: "08:00", end: "17:00" };
      return { ...h, [day]: { ...current, [kind]: val } };
    });
  };

  const toggleVacation = (dateStr: string) => {
    setVacation((v) => (v.includes(dateStr) ? v.filter((d) => d !== dateStr) : [...v, dateStr]));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { working_hours: hours, breaks, vacation_days: vacation };
      await api.setSchedule(payload);
      await setItem(CACHE_KEY, { provider_id: user?.id, ...payload });
      setSaved(true);
      setOffline(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setOffline(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.colors.brand} />
      </SafeAreaView>
    );
  }

  const marked: any = {};
  vacation.forEach((d) => {
    marked[d] = { selected: true, selectedColor: theme.colors.error, selectedTextColor: "#fff" };
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 120, gap: theme.spacing.md }}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("schedule.title")}</Text>
          {offline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={12} color={theme.colors.warning} />
              <Text style={styles.offlineText}>{t("schedule.offlineHint")}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t("schedule.workingHours")}</Text>
        <View style={styles.card}>
          {DAYS.map((d, idx) => {
            const h = hours[d.key];
            const closed = h === null || h === undefined;
            return (
              <View
                key={d.key}
                style={[styles.dayRow, idx < DAYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                testID={`sched-row-${d.key}`}
              >
                <Text style={styles.dayName}>{t(d.tKey)}</Text>
                {closed ? (
                  <Pressable
                    testID={`sched-open-${d.key}`}
                    onPress={() => toggleDayClosed(d.key)}
                    style={styles.closedBtn}
                  >
                    <Text style={styles.closedText}>{t("schedule.closed")}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.timeGroup}>
                    <Pressable
                      testID={`sched-start-${d.key}`}
                      onPress={() => setEditing({ day: d.key, kind: "start" })}
                      style={styles.timeChip}
                    >
                      <Text style={styles.timeChipText}>{h.start}</Text>
                    </Pressable>
                    <Text style={styles.timeDash}>—</Text>
                    <Pressable
                      testID={`sched-end-${d.key}`}
                      onPress={() => setEditing({ day: d.key, kind: "end" })}
                      style={styles.timeChip}
                    >
                      <Text style={styles.timeChipText}>{h.end}</Text>
                    </Pressable>
                    <Pressable
                      testID={`sched-close-${d.key}`}
                      onPress={() => toggleDayClosed(d.key)}
                      style={styles.closeIcon}
                    >
                      <Ionicons name="close" size={14} color={theme.colors.muted} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t("schedule.vacation")}</Text>
        <Text style={styles.hint}>{t("schedule.tapDay")}</Text>
        <View style={styles.calWrap}>
          <Calendar
            testID="vacation-calendar"
            markedDates={marked}
            onDayPress={(d: any) => toggleVacation(d.dateString)}
            enableSwipeMonths
            theme={{
              backgroundColor: theme.colors.surfaceSecondary,
              calendarBackground: theme.colors.surfaceSecondary,
              textSectionTitleColor: theme.colors.muted,
              dayTextColor: theme.colors.onSurface,
              monthTextColor: theme.colors.onSurface,
              todayTextColor: theme.colors.brand,
              arrowColor: theme.colors.brand,
              selectedDayBackgroundColor: theme.colors.error,
              textDisabledColor: theme.colors.surfaceTertiary,
            }}
          />
        </View>

        <Pressable
          testID="save-schedule-btn"
          onPress={save}
          disabled={saving}
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.onBrandPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>{saved ? t("schedule.saved") : t("schedule.save")}</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditing(null)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>
              {editing?.kind === "start" ? t("schedule.start") : t("schedule.end")}
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {TIME_OPTIONS.map((tt) => (
                <Pressable
                  key={tt}
                  testID={`time-opt-${editing?.day}-${editing?.kind}-${tt}`}
                  onPress={() => {
                    if (editing) setTime(editing.day, editing.kind, tt);
                    setEditing(null);
                  }}
                  style={styles.timeOption}
                >
                  <Text style={styles.timeOptionText}>{tt}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800" },
  offlineBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.warning },
  offlineText: { color: theme.colors.warning, fontSize: 11, fontWeight: "700" },
  sectionTitle: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: theme.spacing.md },
  hint: { color: theme.colors.muted, fontSize: 12, marginTop: -theme.spacing.xs },
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden",
  },
  dayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.md, paddingVertical: 12, gap: theme.spacing.sm },
  dayName: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "600", flex: 1 },
  closedBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceTertiary, borderWidth: 1, borderColor: theme.colors.border },
  closedText: { color: theme.colors.muted, fontSize: 12, fontWeight: "600" },
  timeGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.md, backgroundColor: theme.colors.brandTertiary },
  timeChipText: { color: theme.colors.onBrandTertiary, fontWeight: "700", fontSize: 12 },
  timeDash: { color: theme.colors.muted, fontSize: 12 },
  closeIcon: { padding: 4 },
  calWrap: { borderRadius: theme.radius.md, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  saveBtn: { backgroundColor: theme.colors.brand, paddingVertical: 16, borderRadius: theme.radius.pill, alignItems: "center", marginTop: theme.spacing.lg },
  saveBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: theme.colors.surfaceSecondary, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl, maxHeight: "60%" },
  modalTitle: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700", marginBottom: theme.spacing.md },
  timeOption: { padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceTertiary, marginBottom: 6 },
  timeOptionText: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "600", textAlign: "center" },
});
