import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
    }
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
      }
      const u = await register(payload);
      router.replace(u.role === "service_provider" ? "/(provider)/dashboard" : "/(client)/home");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="register-back-btn">
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
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+213 …"
              placeholderTextColor={theme.colors.muted}
            />
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
            disabled={submitting}
            style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }]}
          >
            {submitting ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={styles.submitText}>{t("auth.createBtn")}</Text>}
          </Pressable>

          <Pressable onPress={() => router.push("/(auth)/login")} style={styles.linkRow} testID="go-to-login-link">
            <Text style={styles.linkText}>
              {t("auth.haveAccount")} <Text style={{ color: theme.colors.brand }}>{t("onboarding.signIn")}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
});
