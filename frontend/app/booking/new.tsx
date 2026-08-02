import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/language";
import { AddressAutocomplete } from "@/src/AddressAutocomplete";

const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

function getNextDays(n: number) {
  const days: { date: Date; day: string }[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({ date: d, day: String(d.getDate()) });
  }
  return days;
}

export default function NewBooking() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t, lang } = useT();
  const [provider, setProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => getNextDays(14), []);
  const [selectedDay, setSelectedDay] = useState<Date>(days[0].date);
  const [selectedTime, setSelectedTime] = useState<string>("10:00");
  const [rateType, setRateType] = useState<"hourly" | "task">("hourly");
  const [hours, setHours] = useState("2");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [success, setSuccess] = useState(false);

  const isGuest = !user || user.role !== "client";
  const locale = lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-FR" : "en-US";

  useEffect(() => {
    if (!providerId) return;
    api.provider(providerId as string)
      .then((p: any) => setProvider(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [providerId]);

  const total =
    rateType === "hourly" && provider?.hourly_rate
      ? provider.hourly_rate * (parseFloat(hours) || 0)
      : rateType === "task"
      ? provider?.task_rate ?? 0
      : 0;

  const submit = async () => {
    if (!description || !address) {
      setError(t("booking.errFill"));
      return;
    }
    if (isGuest && (!guestName || !guestPhone)) {
      setError(t("booking.errGuest"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const scheduled = new Date(selectedDay);
      const [hh, mm] = selectedTime.split(":").map(Number);
      scheduled.setHours(hh, mm, 0, 0);
      const payload: any = {
        provider_id: providerId,
        scheduled_date: scheduled.toISOString(),
        task_description: description,
        address,
        rate_type: rateType,
        estimated_hours: rateType === "hourly" ? parseFloat(hours) : undefined,
      };
      if (isGuest) {
        payload.guest_name = guestName;
        payload.guest_phone = guestPhone;
        payload.guest_email = guestEmail || undefined;
      }
      await api.createBooking(payload);
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || t("booking.errFill"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.colors.brand} />
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={40} color={theme.colors.onBrandPrimary} />
        </View>
        <Text style={styles.successTitle}>{t("booking.success")}</Text>
        <Text style={styles.successSub}>{provider?.full_name} {t("booking.successSub")}</Text>
        <Pressable
          testID="booking-done-btn"
          style={styles.doneBtn}
          onPress={() => router.replace(user ? "/(client)/bookings" : "/(client)/home")}
        >
          <Text style={styles.doneBtnText}>{user ? t("booking.viewBookings") : t("booking.done")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="booking-back-btn">
          <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("booking.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
          <View style={styles.providerRow}>
            <View style={styles.providerAvatar}>
              <Ionicons name="person" size={24} color={theme.colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{provider?.full_name}</Text>
              <Text style={styles.providerCat}>{provider?.category ? t(`cat.${provider.category}`) : ""}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t("booking.selectDate")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
            {days.map((d) => {
              const active = selectedDay.toDateString() === d.date.toDateString();
              const label = d.date.toLocaleDateString(locale, { weekday: "short" });
              return (
                <Pressable
                  key={d.date.toISOString()}
                  testID={`day-${d.day}`}
                  onPress={() => setSelectedDay(d.date)}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                >
                  <Text style={[styles.dayLabel, active && styles.dayLabelActive]} numberOfLines={1}>{label}</Text>
                  <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.day}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionLabel}>{t("booking.selectTime")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
            {TIME_SLOTS.map((tt) => {
              const active = selectedTime === tt;
              return (
                <Pressable
                  key={tt}
                  testID={`time-${tt}`}
                  onPress={() => setSelectedTime(tt)}
                  style={[styles.timeChip, active && styles.timeChipActive]}
                >
                  <Text style={[styles.timeText, active && styles.timeTextActive]}>{tt}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionLabel}>{t("booking.rateType")}</Text>
          <View style={styles.rateRow}>
            <Pressable
              testID="rate-hourly-btn"
              onPress={() => setRateType("hourly")}
              style={[styles.rateBtn, rateType === "hourly" && styles.rateBtnActive]}
            >
              <Text style={[styles.rateBtnText, rateType === "hourly" && styles.rateBtnTextActive]}>
                {t("booking.hourly")} ({provider?.hourly_rate ?? "-"})
              </Text>
            </Pressable>
            <Pressable
              testID="rate-task-btn"
              onPress={() => setRateType("task")}
              style={[styles.rateBtn, rateType === "task" && styles.rateBtnActive]}
            >
              <Text style={[styles.rateBtnText, rateType === "task" && styles.rateBtnTextActive]}>
                {t("booking.task")} ({provider?.task_rate ?? "-"})
              </Text>
            </Pressable>
          </View>

          {rateType === "hourly" && (
            <>
              <Text style={styles.sectionLabel}>{t("booking.hours")}</Text>
              <TextInput
                testID="hours-input"
                style={styles.input}
                value={hours}
                onChangeText={setHours}
                keyboardType="numeric"
                placeholder="2"
                placeholderTextColor={theme.colors.muted}
              />
            </>
          )}

          <Text style={styles.sectionLabel}>{t("booking.description")}</Text>
          <TextInput
            testID="description-input"
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder={t("booking.descriptionPh")}
            placeholderTextColor={theme.colors.muted}
          />

          <Text style={styles.sectionLabel}>{t("booking.address")}</Text>
          <AddressAutocomplete
            testID="address-input"
            value={address}
            onChangeText={setAddress}
            placeholder={t("booking.addressPh")}
          />

          {isGuest && (
            <>
              <View style={styles.guestBanner}>
                <Ionicons name="information-circle" size={18} color={theme.colors.brand} />
                <Text style={styles.guestBannerText}>{t("booking.yourInfo")}</Text>
              </View>
              <Text style={styles.sectionLabel}>{t("booking.name")}</Text>
              <TextInput
                testID="guest-name-input"
                style={styles.input}
                value={guestName}
                onChangeText={setGuestName}
                placeholder={t("booking.name")}
                placeholderTextColor={theme.colors.muted}
              />
              <Text style={styles.sectionLabel}>{t("booking.phone")}</Text>
              <TextInput
                testID="guest-phone-input"
                style={styles.input}
                value={guestPhone}
                onChangeText={setGuestPhone}
                keyboardType="phone-pad"
                placeholder="+213 …"
                placeholderTextColor={theme.colors.muted}
              />
              <Text style={styles.sectionLabel}>{t("booking.email")}</Text>
              <TextInput
                testID="guest-email-input"
                style={styles.input}
                value={guestEmail}
                onChangeText={setGuestEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.muted}
              />
            </>
          )}

          {error && <Text style={styles.error} testID="booking-error">{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>

      <SafeAreaView edges={["bottom"]} style={styles.ctaBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalLabel}>{t("booking.total")}</Text>
          <Text style={styles.totalValue}>{total || "-"} DZD</Text>
        </View>
        <Pressable
          testID="confirm-booking-btn"
          onPress={submit}
          disabled={submitting}
          style={[styles.confirm, submitting && { opacity: 0.7 }]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.onBrandPrimary} />
          ) : (
            <Text style={styles.confirmText}>{t("booking.confirm")}</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface, padding: theme.spacing.xl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700" },
  providerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border },
  providerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  providerName: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700" },
  providerCat: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },
  sectionLabel: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm },
  dayChip: { width: 60, height: 76, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border, gap: 4 },
  dayChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  dayLabel: { color: theme.colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  dayLabelActive: { color: theme.colors.onBrandPrimary },
  dayNum: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  dayNumActive: { color: theme.colors.onBrandPrimary },
  timeChip: { height: 40, paddingHorizontal: 16, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  timeChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  timeText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  timeTextActive: { color: theme.colors.onBrandPrimary },
  rateRow: { flexDirection: "row", gap: theme.spacing.sm },
  rateBtn: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSecondary, alignItems: "center" },
  rateBtnActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  rateBtnText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  rateBtnTextActive: { color: theme.colors.onBrandPrimary },
  input: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.lg, paddingVertical: 14, fontSize: 16, color: theme.colors.onSurface, borderWidth: 1, borderColor: theme.colors.border },
  guestBanner: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.brandTertiary, marginTop: theme.spacing.xl },
  guestBannerText: { color: theme.colors.onBrandTertiary, fontSize: 13, fontWeight: "700", flex: 1 },
  error: { color: theme.colors.error, textAlign: "center", marginTop: theme.spacing.md },
  ctaBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: theme.spacing.md, paddingHorizontal: theme.spacing.xl, backgroundColor: theme.colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  totalLabel: { color: theme.colors.muted, fontSize: 12 },
  totalValue: { color: theme.colors.brand, fontSize: 18, fontWeight: "800" },
  confirm: { backgroundColor: theme.colors.brand, paddingHorizontal: 32, paddingVertical: 14, borderRadius: theme.radius.pill, minWidth: 120, alignItems: "center" },
  confirmText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.success, alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.lg },
  successTitle: { color: theme.colors.onSurface, fontSize: 22, fontWeight: "800", textAlign: "center" },
  successSub: { color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.sm, textAlign: "center" },
  doneBtn: { marginTop: theme.spacing.xl, backgroundColor: theme.colors.brand, paddingHorizontal: 32, paddingVertical: 14, borderRadius: theme.radius.pill },
  doneBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700" },
});
