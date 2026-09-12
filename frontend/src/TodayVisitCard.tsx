import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { RevealPhoneButton } from "@/src/RevealPhoneButton";
import type { LocalBooking } from "@/src/db/schema";

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

// Client-side reminder: today's confirmed visits with provider name + time.
export function TodayVisitCard({ bookings }: { bookings: LocalBooking[] }) {
  const { t, isRTL } = useT();
  const router = useRouter();

  const visits = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "confirmed" && b.scheduled_date && isToday(b.scheduled_date))
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [bookings]
  );

  if (visits.length === 0) return null;

  return (
    <View style={styles.card} testID="today-visit-card">
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View style={styles.headerIcon}>
          <Ionicons name="alarm" size={20} color={theme.colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, isRTL && styles.rtlText]}>{t("bookings.todayTitle")}</Text>
          <Text style={[styles.sub, isRTL && styles.rtlText]}>
            {t("bookings.todaySub", { n: visits.length })}
          </Text>
        </View>
      </View>

      {visits.map((v) => (
        <View key={v.id} style={styles.visit} testID={`today-visit-${v.id}`}>
          <View style={[styles.row, isRTL && styles.rtlRow]}>
            <Image
              source={{ uri: v.provider_avatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200" }}
              style={styles.avatar}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.provider, isRTL && styles.rtlText]} numberOfLines={1}>
                {v.provider_name}
              </Text>
              {!!v.provider_category && (
                <Text style={[styles.category, isRTL && styles.rtlText]}>{t(`cat.${v.provider_category}`)}</Text>
              )}
            </View>
            <View style={styles.timePill}>
              <Ionicons name="time-outline" size={13} color={theme.colors.onBrandPrimary} />
              <Text style={styles.timeText}>{formatTime(v.scheduled_date)}</Text>
            </View>
          </View>

          {!!v.address && (
            <View style={[styles.row, isRTL && styles.rtlRow]}>
              <Ionicons name="location-outline" size={15} color={theme.colors.onSurfaceSecondary} />
              <Text style={[styles.address, isRTL && styles.rtlText]} numberOfLines={2}>
                {v.address}
              </Text>
            </View>
          )}

          <View style={[styles.actions, isRTL && styles.rtlRow]}>
            <Pressable
              style={styles.chatBtn}
              onPress={() =>
                router.push(`/chat/${v.provider_id}?name=${encodeURIComponent(v.provider_name || "")}`)
              }
              testID={`today-visit-chat-${v.id}`}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color={theme.colors.onBrandPrimary} />
              <Text style={styles.chatText}>{t("bookings.todayMessage")}</Text>
            </Pressable>
            <RevealPhoneButton
              otherId={v.provider_id}
              bookingStatus={v.status}
              compact
              testID={`today-visit-phone-${v.id}`}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.md,
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
  visit: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.border },
  provider: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  category: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  timeText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  address: { color: theme.colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  chatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  chatText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  rtlRow: { flexDirection: "row-reverse" },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
});
