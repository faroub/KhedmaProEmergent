import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/language";

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { refresh } = useAuth();
  const { t } = useT();
  const [role, setRole] = useState<"client" | "service_provider">(
    (params.role as any) === "service_provider" ? "service_provider" : "client"
  );
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const sendCode = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError(t("otp.errPhone"));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.otpRequest(trimmed);
      setStep("code");
      setResendIn(30);
    } catch (e: any) {
      setError(e?.message || t("otp.errPhone"));
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (code.trim().length !== 6) {
      setError(t("otp.errCode"));
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const data: any = await api.otpVerify(phone.trim(), code.trim(), role);
      await refresh();
      if (data.is_new_user || !data.profile_complete) {
        router.replace("/(auth)/complete-profile");
      } else if (data.user?.role === "service_provider") {
        router.replace("/(provider)/dashboard");
      } else {
        router.replace("/(client)/home");
      }
    } catch (e: any) {
      setError(e?.message || t("otp.errCode"));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() =>
              step === "code"
                ? setStep("phone")
                : router.canGoBack()
                ? router.back()
                : router.replace("/")
            }
            style={styles.back}
            testID="otp-back-btn"
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
          </Pressable>

          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait" size={40} color={theme.colors.brand} />
          </View>

          <Text style={styles.title}>{t("otp.title")}</Text>
          <Text style={styles.subtitle}>
            {step === "phone" ? t("otp.subtitle") : `${t("otp.enterCode")} ${phone}`}
          </Text>

          {step === "phone" && (
            <>
              <View style={styles.roleRow}>
                <Text style={styles.roleLabel}>{t("otp.iAm")}:</Text>
                <Pressable
                  testID="otp-role-client"
                  style={[styles.rolePill, role === "client" && styles.rolePillActive]}
                  onPress={() => setRole("client")}
                >
                  <Text style={[styles.rolePillText, role === "client" && styles.rolePillTextActive]}>
                    {t("otp.roleClient")}
                  </Text>
                </Pressable>
                <Pressable
                  testID="otp-role-provider"
                  style={[styles.rolePill, role === "service_provider" && styles.rolePillActive]}
                  onPress={() => setRole("service_provider")}
                >
                  <Text style={[styles.rolePillText, role === "service_provider" && styles.rolePillTextActive]}>
                    {t("otp.roleProvider")}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>{t("otp.phone")}</Text>
              <TextInput
                testID="otp-phone-input"
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="0555000000 / +213555000000"
                placeholderTextColor={theme.colors.muted}
                autoFocus
              />
              {error && <Text style={styles.error} testID="otp-error">{error}</Text>}
              <Pressable
                testID="otp-send-btn"
                onPress={sendCode}
                disabled={sending}
                style={[styles.primaryBtn, sending && { opacity: 0.7 }]}
              >
                {sending ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={styles.primaryBtnText}>{t("otp.sendCode")}</Text>}
              </Pressable>
              <View style={styles.mockHint}>
                <Ionicons name="information-circle" size={14} color={theme.colors.brand} />
                <Text style={styles.mockText}>{t("otp.mockHint")}</Text>
              </View>
            </>
          )}

          {step === "code" && (
            <>
              <Text style={styles.label}>{t("otp.code")}</Text>
              <TextInput
                testID="otp-code-input"
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                placeholder="000000"
                placeholderTextColor={theme.colors.muted}
                maxLength={6}
                autoFocus
              />
              {error && <Text style={styles.error} testID="otp-error">{error}</Text>}
              <Pressable
                testID="otp-verify-btn"
                onPress={verify}
                disabled={verifying || code.length !== 6}
                style={[styles.primaryBtn, (verifying || code.length !== 6) && { opacity: 0.6 }]}
              >
                {verifying ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={styles.primaryBtnText}>{t("otp.verify")}</Text>}
              </Pressable>
              <View style={styles.resendRow}>
                <Pressable testID="otp-wrong-number-btn" onPress={() => setStep("phone")}>
                  <Text style={styles.linkText}>{t("otp.wrongNumber")}</Text>
                </Pressable>
                <Pressable
                  testID="otp-resend-btn"
                  onPress={sendCode}
                  disabled={resendIn > 0 || sending}
                >
                  <Text style={[styles.linkText, resendIn > 0 && { opacity: 0.5 }]}>
                    {resendIn > 0 ? t("otp.resendIn", { sec: resendIn }) : t("otp.resend")}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -theme.spacing.sm },
  iconWrap: {
    alignSelf: "center", width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginTop: theme.spacing.md,
  },
  title: { color: theme.colors.onSurface, fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: theme.spacing.md },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginBottom: theme.spacing.lg, lineHeight: 20 },
  roleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  roleLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 13 },
  rolePill: {
    paddingHorizontal: theme.spacing.md, paddingVertical: 8,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rolePillActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  rolePillText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 },
  rolePillTextActive: { color: theme.colors.onBrandPrimary },
  label: { color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg, paddingVertical: 14, fontSize: 16,
    color: theme.colors.onSurface, borderWidth: 1, borderColor: theme.colors.border,
  },
  codeInput: { textAlign: "center", letterSpacing: 8, fontSize: 22, fontWeight: "700" },
  primaryBtn: {
    backgroundColor: theme.colors.brand, paddingVertical: 16,
    borderRadius: theme.radius.pill, alignItems: "center", marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  mockHint: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brandTertiary, marginTop: theme.spacing.sm,
  },
  mockText: { color: theme.colors.onBrandTertiary, fontSize: 12, flex: 1 },
  error: { color: theme.colors.error, fontSize: 14, textAlign: "center" },
  resendRow: { flexDirection: "row", justifyContent: "space-between", marginTop: theme.spacing.md },
  linkText: { color: theme.colors.brand, fontWeight: "600", fontSize: 13 },
});
