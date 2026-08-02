import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const u = await login(email.trim().toLowerCase(), password);
      router.replace(u.role === "service_provider" ? "/(provider)/dashboard" : "/(client)/home");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.back} testID="login-back-btn">
            <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
          </Pressable>

          <Text style={styles.title}>{t("auth.welcomeBack")}</Text>
          <Text style={styles.subtitle}>{t("auth.signInSub")}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.email")}</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.muted}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.password")}</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={theme.colors.muted}
            />
          </View>

          {error && (
            <Text style={styles.error} testID="login-error-text">
              {error}
            </Text>
          )}

          <Pressable
            testID="login-submit-btn"
            onPress={onSubmit}
            disabled={submitting}
            style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }]}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.onBrandPrimary} />
            ) : (
              <Text style={styles.submitText}>{t("auth.signInBtn")}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.push("/(auth)/register")} style={styles.linkRow} testID="go-to-register-btn">
            <Text style={styles.linkText}>
              {t("auth.noAccount")} <Text style={{ color: theme.colors.brand }}>{t("auth.signUp")}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -theme.spacing.sm },
  title: { color: theme.colors.onSurface, fontSize: 32, fontWeight: "800", marginTop: theme.spacing.md },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: 15, marginBottom: theme.spacing.lg },
  field: { gap: theme.spacing.xs },
  label: { color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.onSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  error: { color: theme.colors.error, fontSize: 14, textAlign: "center" },
  submit: {
    backgroundColor: theme.colors.brand,
    paddingVertical: 16,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  submitText: { color: theme.colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  linkRow: { alignItems: "center", paddingTop: theme.spacing.md },
  linkText: { color: theme.colors.onSurfaceSecondary },
});
