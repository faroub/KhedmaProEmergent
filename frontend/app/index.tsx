import React from "react";
import { View, Text, StyleSheet, Pressable, ImageBackground, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { LanguageSwitcher } from "@/src/LanguageSwitcher";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t, isRTL } = useT();

  if (loading) {
    return (
      <View style={styles.loading} testID="splash-loading">
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  if (user?.role === "service_provider") return <Redirect href="/(provider)/dashboard" />;
  if (user?.role === "client") return <Redirect href="/(client)/home" />;

  return (
    <View style={styles.root} testID="onboarding-screen">
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1687463221023-02f259da7d77?w=1200" }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["rgba(11,17,32,0.4)", "rgba(11,17,32,0.85)", "#0B1120"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot}>
              <Ionicons name="hammer" size={18} color={theme.colors.onBrandPrimary} />
            </View>
            <Text style={styles.brandText}>{t("app.name")}</Text>
          </View>
          <LanguageSwitcher compact testID="onboarding-lang-switcher" />
        </View>

        <View style={styles.heroBlock}>
          <Text style={[styles.heroTitle, isRTL && { textAlign: "right", writingDirection: "rtl" }]}>
            {t("onboarding.title")}
          </Text>
          <Text style={[styles.heroSubtitle, isRTL && { textAlign: "right", writingDirection: "rtl" }]}>
            {t("onboarding.subtitle")}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            testID="browse-services-btn"
            onPress={() => router.replace("/(client)/home")}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.primaryBtnText}>{t("onboarding.browse")}</Text>
            <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={18} color={theme.colors.onBrandPrimary} />
          </Pressable>

          <Pressable
            testID="onboarding-otp-btn"
            onPress={() => router.push("/(auth)/otp")}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="phone-portrait-outline" size={16} color={theme.colors.onSurface} />
            <Text style={styles.secondaryBtnText}>{t("otp.title")}</Text>
          </Pressable>

          <Pressable
            testID="continue-as-provider-btn"
            onPress={() => router.push({ pathname: "/(auth)/register", params: { role: "service_provider" } })}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="briefcase" size={16} color={theme.colors.onSurface} />
            <Text style={styles.secondaryBtnText}>{t("onboarding.iamProvider")}</Text>
          </Pressable>

          <Pressable
            testID="go-to-login-btn"
            onPress={() => router.push("/(auth)/login")}
            style={styles.loginLink}
          >
            <Text style={styles.loginLinkText}>
              {t("onboarding.haveAccount")} <Text style={{ color: theme.colors.brand }}>{t("onboarding.signIn")}</Text>
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  container: { flex: 1, paddingHorizontal: theme.spacing.xl, justifyContent: "space-between", paddingVertical: theme.spacing.xl },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  brandDot: {
    width: 32, height: 32, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  brandText: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700", letterSpacing: 0.4 },
  heroBlock: { marginTop: theme.spacing.xxl },
  heroTitle: {
    color: theme.colors.onSurface,
    fontSize: 40,
    fontWeight: "800",
    lineHeight: 46,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: theme.colors.onSurfaceSecondary,
    fontSize: 16,
    lineHeight: 22,
    marginTop: theme.spacing.lg,
    maxWidth: 340,
  },
  actions: { gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.brand,
    paddingVertical: 18,
    borderRadius: theme.radius.pill,
    gap: theme.spacing.sm,
  },
  primaryBtnText: { color: theme.colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row", gap: theme.spacing.sm,
    paddingVertical: 18,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(21,30,50,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  secondaryBtnText: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "600" },
  loginLink: { alignItems: "center", paddingTop: theme.spacing.md },
  loginLinkText: { color: theme.colors.onSurfaceSecondary, fontSize: 14 },
});
