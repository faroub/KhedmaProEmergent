import React, { useEffect, useState } from "react";
import { Text, StyleSheet, Pressable, ActivityIndicator, Linking, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { theme } from "./theme";
import { useT } from "./language";
import { api } from "./api";

type Props = {
  /** Counterpart user id whose phone we want to reveal. */
  otherId: string;
  /** Booking status (used to know whether reveal is allowed). Optional. */
  bookingStatus?: string | null;
  /** Test ID prefix. */
  testID?: string;
  /** Compact rendering (single-line pill) — default false shows a full row. */
  compact?: boolean;
};

const REVEAL_ALLOWED = new Set(["confirmed", "awaiting_confirmation", "completed"]);

/**
 * "Reveal phone" button. Calls `GET /api/users/{id}/phone`, which only returns
 * the number when a confirmed/awaiting_confirmation/completed booking exists
 * between the two parties. Once revealed, offers a "Call" action via Linking.
 */
export function RevealPhoneButton({ otherId, bookingStatus, testID = "reveal-phone", compact = false }: Props) {
  const { t } = useT();
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset state if the target/booking changes.
  useEffect(() => {
    setPhone(null);
    setErr(null);
  }, [otherId, bookingStatus]);

  const canReveal = !bookingStatus || REVEAL_ALLOWED.has(bookingStatus);

  const doReveal = async () => {
    if (!canReveal || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res: any = await api.revealPhone(otherId);
      if (res?.phone) {
        setPhone(res.phone);
      } else {
        setErr(t("reveal.noPhone"));
      }
    } catch (e: any) {
      // Backend returns 403 "Phone will be visible once the booking is confirmed"
      setErr(e?.message || t("reveal.error"));
    } finally {
      setLoading(false);
    }
  };

  const call = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  // ---- Rendered states ----
  if (phone) {
    return (
      <View style={compact ? styles.pillRow : styles.fullRow}>
        <Ionicons name="call" size={compact ? 14 : 16} color={theme.colors.success} />
        <Text
          testID={`${testID}-value`}
          selectable
          style={compact ? styles.pillPhone : styles.fullPhone}
        >
          {phone}
        </Text>
        <Pressable onPress={call} style={styles.callBtn} testID={`${testID}-call`}>
          <Ionicons name="call-outline" size={12} color={theme.colors.onBrandPrimary} />
          <Text style={styles.callBtnText}>{t("reveal.call")}</Text>
        </Pressable>
      </View>
    );
  }

  if (!canReveal) {
    return (
      <View style={compact ? styles.pillRow : styles.fullRow}>
        <Ionicons name="lock-closed" size={compact ? 12 : 14} color={theme.colors.muted} />
        <Text style={compact ? styles.pillHint : styles.fullHint} numberOfLines={2}>
          {t("bookings.phoneHidden")}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 4 }}>
      <Pressable
        onPress={doReveal}
        disabled={loading}
        testID={testID}
        style={[compact ? styles.pillBtn : styles.fullBtn, loading && { opacity: 0.6 }]}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} size="small" />
        ) : (
          <>
            <Ionicons name="call" size={compact ? 12 : 14} color={theme.colors.brand} />
            <Text style={compact ? styles.pillBtnText : styles.fullBtnText}>
              {t("bookings.revealPhone")}
            </Text>
          </>
        )}
      </Pressable>
      {err ? <Text style={styles.err} numberOfLines={2}>{err}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Full row (bookings list)
  fullRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  fullBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.brand,
    backgroundColor: "transparent",
  },
  fullBtnText: { color: theme.colors.brand, fontSize: 12, fontWeight: "700" },
  fullPhone: {
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  fullHint: { color: theme.colors.muted, fontSize: 12, flex: 1 },

  // Compact pill (chat header)
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.brand,
  },
  pillBtnText: { color: theme.colors.brand, fontSize: 11, fontWeight: "700" },
  pillPhone: {
    color: theme.colors.onSurface,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
    maxWidth: 140,
  },
  pillHint: { color: theme.colors.muted, fontSize: 11, flex: 1 },

  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
  },
  callBtnText: { color: theme.colors.onBrandPrimary, fontSize: 11, fontWeight: "800" },

  err: { color: theme.colors.error, fontSize: 11 },
});
