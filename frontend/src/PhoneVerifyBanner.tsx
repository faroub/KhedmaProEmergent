import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "./api";
import { useAuth } from "./auth";
import { theme } from "./theme";
import { useT } from "./language";

/**
 * "Verify your phone" banner shown to providers whose `phone_verified` is
 * false. Non-blocking (never dead-ends the user), but the backend prevents
 * confirming bookings until this succeeds.
 */
export function PhoneVerifyBanner() {
  const { user, refresh } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"idle" | "sent" | "verified">("idle");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  if (user.role !== "service_provider") return null;
  if (user.phone_verified) return null;
  if (!user.phone) return null; // nothing to verify

  const sendOtp = async () => {
    if (!user.phone) return;
    setLoading(true);
    setError(null);
    try {
      await api.otpRequest(user.phone);
      setStep("sent");
    } catch (e: any) {
      setError(e?.message || t("verifyPhone.errSend"));
    }
    setLoading(false);
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError(t("verifyPhone.errCode"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.verifyMyPhone(code);
      setStep("verified");
      await refresh(); // pull in updated phone_verified=true
      // Auto-close after a beat.
      setTimeout(() => {
        setOpen(false);
        setCode("");
        setStep("idle");
      }, 1200);
    } catch (e: any) {
      setError(e?.message || t("verifyPhone.errVerify"));
    }
    setLoading(false);
  };

  const openModal = () => {
    setOpen(true);
    setStep("idle");
    setCode("");
    setError(null);
  };

  return (
    <>
      <Pressable style={styles.banner} onPress={openModal} testID="verify-phone-banner">
        <Ionicons name="warning" size={18} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>{t("verifyPhone.bannerTitle")}</Text>
          <Text style={styles.bannerSub} numberOfLines={2}>
            {t("verifyPhone.bannerSub")}
          </Text>
        </View>
        <View style={styles.bannerCta}>
          <Text style={styles.bannerCtaText}>{t("verifyPhone.action")}</Text>
        </View>
      </Pressable>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !loading && setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.head}>
              <Text style={styles.title}>{t("verifyPhone.modalTitle")}</Text>
              <Pressable onPress={() => !loading && setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.phoneRow}>
              <Ionicons name="call" size={16} color={theme.colors.brand} />
              <Text style={styles.phoneText}>{user.phone}</Text>
            </View>

            {step === "idle" && (
              <>
                <Text style={styles.hint}>{t("verifyPhone.hintSend")}</Text>
                <Pressable
                  onPress={sendOtp}
                  disabled={loading}
                  style={[styles.primary, loading && { opacity: 0.6 }]}
                  testID="verify-phone-send-btn"
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>{t("verifyPhone.sendCode")}</Text>
                  )}
                </Pressable>
              </>
            )}

            {step === "sent" && (
              <>
                <Text style={styles.hint}>{t("verifyPhone.hintEnter")}</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.codeInput}
                  autoFocus
                  testID="verify-phone-code-input"
                />
                <View style={styles.row}>
                  <Pressable onPress={sendOtp} disabled={loading} style={[styles.ghost, { flex: 1 }]}>
                    <Text style={styles.ghostText}>{t("verifyPhone.resend")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={verify}
                    disabled={loading || code.length !== 6}
                    style={[styles.primary, { flex: 1 }, (loading || code.length !== 6) && { opacity: 0.6 }]}
                    testID="verify-phone-verify-btn"
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>{t("verifyPhone.verify")}</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}

            {step === "verified" && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={40} color={theme.colors.success} />
                <Text style={styles.successText}>{t("verifyPhone.success")}</Text>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  bannerTitle: { color: "#fff", fontWeight: "800", fontSize: 13 },
  bannerSub: { color: "#fff", fontSize: 11, opacity: 0.9, marginTop: 2 },
  bannerCta: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  bannerCtaText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginBottom: 4,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  phoneText: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700" },
  hint: { color: theme.colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  primary: {
    height: 48,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  primaryText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  ghost: {
    height: 48,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ghostText: { color: theme.colors.onSurface, fontWeight: "700" },
  codeInput: {
    height: 56,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.onSurface,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 8,
    textAlign: "center",
  },
  row: { flexDirection: "row", gap: theme.spacing.md },
  successBox: { alignItems: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.md },
  successText: { color: theme.colors.success, fontWeight: "800", fontSize: 16 },
  error: { color: theme.colors.error, fontSize: 13, textAlign: "center" },
});
