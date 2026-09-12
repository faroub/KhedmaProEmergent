import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { WilayaPicker } from "@/src/WilayaPicker";

type Category = { id: string; name: string; icon: string };

export default function Register() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { register } = useAuth();
  const { t } = useT();

  const [role, setRole] = useState<"client" | "service_provider">(
    (params.role as any) === "service_provider" ? "service_provider" : "client"
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [wilayaCode, setWilayaCode] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [taskRate, setTaskRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Provider OTP-verification step. Blocks final registration until the phone
  // number is proven owned. Clients skip this entirely.
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [phoneVerificationToken, setPhoneVerificationToken] = useState<string | null>(null);

  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const t = setTimeout(() => setOtpResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [otpResendCooldown]);

  useEffect(() => {
    api.categories().then((c: any) => setCategories(c)).catch(() => {});
  }, []);

  // Phone must be Algerian mobile: leading 5/6/7 followed by 8 digits after normalization.
  const isValidDzPhone = (raw: string) => {
    const s = raw.replace(/[\s().-]/g, "");
    let national = s;
    if (s.startsWith("+213")) national = s.slice(4);
    else if (s.startsWith("00213")) national = s.slice(5);
    else if (s.startsWith("0")) national = s.slice(1);
    return /^[567]\d{8}$/.test(national);
  };

  /** Runs the actual /auth/register call. For providers, `token` must be a
   *  fresh phone_verification_token from the OTP step. */
  const doRegister = async (token: string | null) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        email: email.trim().toLowerCase(),
        password,
        role,
        full_name: fullName,
        phone: phone || undefined,
        city: city || undefined,
      };
      if (role === "service_provider") {
        payload.category = category;
        payload.bio = bio || undefined;
        payload.hourly_rate = hourlyRate ? parseFloat(hourlyRate) : undefined;
        payload.task_rate = taskRate ? parseFloat(taskRate) : undefined;
        payload.wilaya_code = wilayaCode || undefined;
        payload.phone_verification_token = token;
      }
      const u = await register(payload);
      router.replace(u.role === "service_provider" ? "/(provider)/dashboard" : "/(client)/home");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
      // If the token was rejected (e.g. expired), clear it so the user re-verifies.
      if ((e?.message || "").toLowerCase().includes("verification")) {
        setPhoneVerificationToken(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Ask the backend to text a 6-digit OTP to `phone`. Opens the OTP modal. */
  const startPhoneVerification = async () => {
    setOtpSending(true);
    setOtpError(null);
    setOtpCode("");
    try {
      await api.otpRequest(phone.trim());
      setOtpOpen(true);
      setOtpResendCooldown(30);
    } catch (e: any) {
      setError(e?.message || t("register.otpSendFail"));
    } finally {
      setOtpSending(false);
    }
  };

  const resendOtp = async () => {
    if (otpResendCooldown > 0 || otpSending) return;
    setOtpSending(true);
    setOtpError(null);
    try {
      await api.otpRequest(phone.trim());
      setOtpResendCooldown(30);
    } catch (e: any) {
      setOtpError(e?.message || t("register.otpSendFail"));
    } finally {
      setOtpSending(false);
    }
  };

  const submitOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError(t("register.otpInvalidFormat"));
      return;
    }
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await api.otpVerifyForRegistration(phone.trim(), otpCode);
      setPhoneVerificationToken(res.phone_verification_token);
      setOtpOpen(false);
      // Continue to registration immediately with the fresh token.
      await doRegister(res.phone_verification_token);
    } catch (e: any) {
      setOtpError(e?.message || t("register.otpVerifyFail"));
    } finally {
      setOtpVerifying(false);
    }
  };

  const onSubmit = async () => {
    if (!fullName || !email || !password) {
      setError(t("auth.errFill"));
      return;
    }
    if (role === "service_provider") {
      if (!category) {
        setError(t("auth.errCategory"));
        return;
      }
      if (!phone.trim() || !isValidDzPhone(phone.trim())) {
        setError(t("auth.errPhoneProvider"));
        return;
      }
      if (!wilayaCode) {
        setError(t("auth.errWilaya"));
        return;
      }
      // Provider path: require a fresh phone_verification_token. If we already
      // have one that matches this phone, use it. Otherwise open the OTP step.
      if (!phoneVerificationToken) {
        setError(null);
        await startPhoneVerification();
        return;
      }
      await doRegister(phoneVerificationToken);
      return;
    }
    // Client path: skip OTP verification.
    await doRegister(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={styles.back}
            testID="register-back-btn"
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
          </Pressable>

          <Text style={styles.title}>{t("auth.createAccount")}</Text>
          <Text style={styles.subtitle}>{t("auth.joinSub")}</Text>

          <View style={styles.roleRow}>
            <Pressable
              testID="role-client-btn"
              style={[styles.roleBtn, role === "client" && styles.roleBtnActive]}
              onPress={() => setRole("client")}
            >
              <Ionicons name="person" size={18} color={role === "client" ? theme.colors.onBrandPrimary : theme.colors.onSurface} />
              <Text style={[styles.roleText, role === "client" && styles.roleTextActive]}>{t("auth.client")}</Text>
            </Pressable>
            <Pressable
              testID="role-provider-btn"
              style={[styles.roleBtn, role === "service_provider" && styles.roleBtnActive]}
              onPress={() => setRole("service_provider")}
            >
              <Ionicons name="briefcase" size={18} color={role === "service_provider" ? theme.colors.onBrandPrimary : theme.colors.onSurface} />
              <Text style={[styles.roleText, role === "service_provider" && styles.roleTextActive]}>{t("auth.provider")}</Text>
            </Pressable>
          </View>

          <Field label={t("auth.fullName")}>
            <TextInput testID="reg-name-input" style={styles.input} value={fullName} onChangeText={setFullName} placeholder={t("auth.fullName")} placeholderTextColor={theme.colors.muted} />
          </Field>
          <Field label={t("auth.email")}>
            <TextInput testID="reg-email-input" style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={theme.colors.muted} />
          </Field>
          <Field label={t("auth.password")}>
            <TextInput testID="reg-password-input" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={theme.colors.muted} />
          </Field>
          <Field label={role === "service_provider" ? t("auth.phoneRequired") : t("auth.phoneOptional")}>
            <TextInput
              testID="reg-phone-input"
              style={styles.input}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                // Any edit invalidates a previously-issued verification token.
                if (phoneVerificationToken) setPhoneVerificationToken(null);
              }}
              keyboardType="phone-pad"
              placeholder="+213 …"
              placeholderTextColor={theme.colors.muted}
            />
            {role === "service_provider" && phoneVerificationToken && (
              <View style={styles.phoneVerifiedRow} testID="phone-verified-row">
                <Ionicons name="checkmark-circle" size={14} color={theme.colors.brand} />
                <Text style={styles.phoneVerifiedText}>{t("register.phoneVerified")}</Text>
              </View>
            )}
          </Field>
          <Field label={t("auth.cityOptional")}>
            <TextInput testID="reg-city-input" style={styles.input} value={city} onChangeText={setCity} placeholder="Algiers" placeholderTextColor={theme.colors.muted} />
          </Field>

          {role === "service_provider" && (
            <>
              <Text style={styles.sectionLabel}>{t("auth.wilayaRequired")}</Text>
              <WilayaPicker
                testID="reg-wilaya-picker"
                value={wilayaCode}
                onSelect={(code) => setWilayaCode(code)}
                label={t("wilaya.select")}
              />

              <Text style={styles.sectionLabel}>{t("auth.category")}</Text>
              <View style={styles.categoryGrid}>
                {categories.map((c) => (
                  <Pressable
                    key={c.id}
                    testID={`reg-cat-${c.id}`}
                    onPress={() => setCategory(c.id)}
                    style={[styles.catChip, category === c.id && styles.catChipActive]}
                  >
                    <Ionicons name={c.icon as any} size={14} color={category === c.id ? theme.colors.onBrandPrimary : theme.colors.brand} />
                    <Text style={[styles.catChipText, category === c.id && styles.catChipTextActive]}>{t(`cat.${c.id}`)}</Text>
                  </Pressable>
                ))}
              </View>

              <Field label={t("auth.bio")}>
                <TextInput
                  testID="reg-bio-input"
                  style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  placeholder={t("auth.bioPh")}
                  placeholderTextColor={theme.colors.muted}
                />
              </Field>
              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label={t("auth.hourlyRate")}>
                    <TextInput testID="reg-hourly-input" style={styles.input} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="numeric" placeholder="800" placeholderTextColor={theme.colors.muted} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t("auth.taskRate")}>
                    <TextInput testID="reg-task-input" style={styles.input} value={taskRate} onChangeText={setTaskRate} keyboardType="numeric" placeholder="3000" placeholderTextColor={theme.colors.muted} />
                  </Field>
                </View>
              </View>

              <View style={styles.trialBanner}>
                <Ionicons name="gift" size={20} color={theme.colors.brand} />
                <Text style={styles.trialText}>{t("auth.trial")}</Text>
              </View>
            </>
          )}

          {error && <Text style={styles.error} testID="register-error-text">{error}</Text>}

          <Pressable
            testID="register-submit-btn"
            onPress={onSubmit}
            disabled={submitting || otpSending}
            style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }]}
          >
            {submitting || otpSending ? (
              <ActivityIndicator color={theme.colors.onBrandPrimary} />
            ) : (
              <Text style={styles.submitText}>
                {role === "service_provider" && !phoneVerificationToken
                  ? t("register.verifyPhoneCta")
                  : t("auth.createBtn")}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.push("/(auth)/login")} style={styles.linkRow} testID="go-to-login-link">
            <Text style={styles.linkText}>
              {t("auth.haveAccount")} <Text style={{ color: theme.colors.brand }}>{t("onboarding.signIn")}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Phone OTP verification step — providers only. */}
      <Modal
        transparent
        visible={otpOpen}
        animationType="slide"
        onRequestClose={() => setOtpOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.otpBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !otpVerifying && setOtpOpen(false)}
          />
          <View style={styles.otpSheet} testID="otp-verify-sheet">
            <View style={styles.otpHandle} />
            <View style={styles.otpIconRow}>
              <View style={styles.otpIconWrap}>
                <Ionicons name="chatbubble-ellipses" size={22} color={theme.colors.brand} />
              </View>
            </View>
            <Text style={styles.otpTitle}>{t("register.otpTitle")}</Text>
            <Text style={styles.otpSub}>
              {t("register.otpSub", { phone: phone.trim() })}
            </Text>

            <TextInput
              testID="otp-code-input"
              style={styles.otpInput}
              value={otpCode}
              onChangeText={(v) => setOtpCode(v.replace(/[^\d]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="123456"
              placeholderTextColor={theme.colors.muted}
              maxLength={6}
              autoFocus
              textAlign="center"
            />

            {otpError && (
              <Text style={styles.otpError} testID="otp-error-text">
                {otpError}
              </Text>
            )}

            <Pressable
              testID="otp-verify-btn"
              onPress={submitOtp}
              disabled={otpVerifying || otpCode.length !== 6}
              style={({ pressed }) => [
                styles.submit,
                { marginTop: theme.spacing.md },
                (otpVerifying || otpCode.length !== 6) && { opacity: 0.6 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {otpVerifying ? (
                <ActivityIndicator color={theme.colors.onBrandPrimary} />
              ) : (
                <Text style={styles.submitText}>{t("register.otpVerifyBtn")}</Text>
              )}
            </Pressable>

            <View style={styles.otpFooterRow}>
              <Pressable
                testID="otp-resend-btn"
                onPress={resendOtp}
                disabled={otpResendCooldown > 0 || otpSending}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.otpResendText,
                    (otpResendCooldown > 0 || otpSending) && { color: theme.colors.muted },
                  ]}
                >
                  {otpResendCooldown > 0
                    ? t("register.otpResendIn", { s: otpResendCooldown })
                    : t("register.otpResend")}
                </Text>
              </Pressable>
              <Pressable
                testID="otp-cancel-btn"
                onPress={() => setOtpOpen(false)}
                disabled={otpVerifying}
                hitSlop={8}
              >
                <Text style={styles.otpCancel}>{t("account.cancel")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -theme.spacing.sm },
  title: { color: theme.colors.onSurface, fontSize: 30, fontWeight: "800", marginTop: theme.spacing.sm },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 15, marginBottom: theme.spacing.md },
  roleRow: { flexDirection: "row", gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  roleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm,
    paddingVertical: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border,
  },
  roleBtnActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  roleText: { color: theme.colors.onSurface, fontWeight: "600" },
  roleTextActive: { color: theme.colors.onBrandPrimary },
  label: { color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14, fontSize: 16, color: theme.colors.onSurface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  sectionLabel: { color: theme.colors.onSurface, fontWeight: "700", marginTop: theme.spacing.sm, fontSize: 15 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  catChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  catChipText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600" },
  catChipTextActive: { color: theme.colors.onBrandPrimary },
  trialBanner: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brandTertiary, marginTop: theme.spacing.sm,
  },
  trialText: { color: theme.colors.onBrandTertiary, flex: 1, fontSize: 13 },
  submit: {
    backgroundColor: theme.colors.brand, paddingVertical: 16, borderRadius: theme.radius.pill,
    alignItems: "center", marginTop: theme.spacing.md,
  },
  submitText: { color: theme.colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  error: { color: theme.colors.error, fontSize: 14, textAlign: "center" },
  linkRow: { alignItems: "center", paddingTop: theme.spacing.sm },
  linkText: { color: theme.colors.onSurfaceSecondary },

  phoneVerifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  phoneVerifiedText: { color: theme.colors.brand, fontSize: 12, fontWeight: "700" },

  // OTP verification modal
  otpBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  otpSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
    gap: theme.spacing.sm,
  },
  otpHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginBottom: theme.spacing.sm,
  },
  otpIconRow: { alignItems: "center", marginBottom: theme.spacing.sm },
  otpIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(234, 179, 8, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  otpTitle: {
    color: theme.colors.onSurface,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  otpSub: {
    color: theme.colors.onSurfaceSecondary,
    fontSize: 13,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  otpInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 8,
    color: theme.colors.onSurface,
  },
  otpError: { color: theme.colors.error, fontSize: 13, textAlign: "center", marginTop: 6 },
  otpFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  otpResendText: { color: theme.colors.brand, fontSize: 13, fontWeight: "700" },
  otpCancel: { color: theme.colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
});
