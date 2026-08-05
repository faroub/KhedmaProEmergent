import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ImageBackground,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Redirect, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { LanguageSwitcher } from "@/src/LanguageSwitcher";

type Feature = {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  subKey: string;
  color: string;
};

const FEATURES: Feature[] = [
  { icon: "shield-checkmark", titleKey: "landing.f1Title", subKey: "landing.f1Sub", color: "#3B82F6" },
  { icon: "flash", titleKey: "landing.f2Title", subKey: "landing.f2Sub", color: "#F59E0B" },
  { icon: "chatbubbles", titleKey: "landing.f3Title", subKey: "landing.f3Sub", color: "#10B981" },
  { icon: "star", titleKey: "landing.f4Title", subKey: "landing.f4Sub", color: "#EAB308" },
];

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t, isRTL } = useT();

  // Ensure any lingering keyboard from a previous screen is dismissed
  // as soon as the landing screen becomes focused. This prevents a leftover
  // empty "gap" at the bottom on Android when navigating back with the
  // soft keyboard still visible.
  useFocusEffect(
    React.useCallback(() => {
      Keyboard.dismiss();
    }, [])
  );

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
        colors={["rgba(11,17,32,0.55)", "rgba(11,17,32,0.9)", "#0B1120"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <LinearGradient
              colors={[theme.colors.brand, "#F59E0B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandLogoBox}
            >
              <Ionicons name="hammer" size={20} color="#0B1120" />
            </LinearGradient>
            <Text style={styles.brandText}>{t("app.name")}</Text>
          </View>
          <LanguageSwitcher compact testID="onboarding-lang-switcher" />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Promo banner card — same style as the old client-home "NEW" banner
              but hosting the current landing hero copy. Uses a solid dark
              gradient (no image) so the yellow badges/text pop. */}
          <View style={styles.promoWrap} testID="landing-promo-banner">
            <LinearGradient
              colors={["#111C36", "#0B1120", "#050912"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.promo}
            >
              {/* Subtle amber glow in the top-right corner to tie to the brand. */}
              <LinearGradient
                colors={["rgba(234,179,8,0.22)", "rgba(234,179,8,0.05)", "transparent"]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.3, y: 0.8 }}
                style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]}
              />
              <View style={styles.promoContent}>
                <View style={styles.promoBadgeRow}>
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>{t("landing.promoBadge")}</Text>
                  </View>
                  <View style={styles.pilotBadgeInline}>
                    <Ionicons name="location" size={11} color={theme.colors.brand} />
                    <Text style={styles.pilotBadgeText}>{t("landing.pilotBadge")}</Text>
                  </View>
                </View>
                <Text
                  style={[styles.promoTitle, isRTL && { textAlign: "right", writingDirection: "rtl" }]}
                  numberOfLines={2}
                >
                  {t("landing.heroTitle")}
                </Text>
                <Text
                  style={[styles.promoSub, isRTL && { textAlign: "right", writingDirection: "rtl" }]}
                  numberOfLines={2}
                >
                  {t("landing.heroSubtitle")}
                </Text>
              </View>
            </LinearGradient>
          </View>

          {/* Feature grid 2x2 */}
          <View style={styles.featureGrid} testID="landing-features">
            {FEATURES.map((f) => (
              <View key={f.titleKey} style={styles.featureCard} testID={`feature-${f.titleKey}`}>
                <View style={[styles.featureIconWrap, { backgroundColor: `${f.color}22`, borderColor: `${f.color}44` }]}>
                  <Ionicons name={f.icon} size={18} color={f.color} />
                </View>
                <Text style={styles.featureTitle} numberOfLines={1}>{t(f.titleKey)}</Text>
                <Text style={styles.featureSub} numberOfLines={2}>{t(f.subKey)}</Text>
              </View>
            ))}
          </View>

          {/* Trust bar */}
          <View style={styles.trustBar} testID="landing-trust">
            <View style={styles.trustItem}>
              <Text style={styles.trustNumber}>58</Text>
              <Text style={styles.trustLabel}>{t("landing.trustWilayas")}</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Text style={styles.trustNumber}>3</Text>
              <Text style={styles.trustLabel}>{t("landing.trustLangs")}</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Text style={styles.trustNumber}>90</Text>
              <Text style={styles.trustLabel}>{t("landing.trustTrial")}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <Pressable
            testID="browse-services-btn"
            onPress={() => router.replace("/(client)/home")}
            style={({ pressed }) => [
              styles.primaryBtn,
              isRTL && { flexDirection: "row-reverse" },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="search" size={16} color={theme.colors.onBrandPrimary} />
            <Text style={styles.primaryBtnText} numberOfLines={1}>
              {t("onboarding.browse")}
            </Text>
            <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={18} color={theme.colors.onBrandPrimary} />
          </Pressable>

          <View style={styles.stackedBtnCol}>
            <Pressable
              testID="onboarding-otp-btn"
              onPress={() => router.push("/(auth)/otp")}
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={theme.colors.onSurface} />
              <Text
                style={styles.secondaryBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                allowFontScaling={false}
              >
                {t("onboarding.phoneLogin")}
              </Text>
            </Pressable>
            <Pressable
              testID="continue-as-provider-btn"
              onPress={() => router.push({ pathname: "/(auth)/register", params: { role: "service_provider" } })}
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="briefcase" size={16} color={theme.colors.onSurface} />
              <Text
                style={styles.secondaryBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                allowFontScaling={false}
              >
                {t("onboarding.iamProvider")}
              </Text>
            </Pressable>
          </View>

          <Pressable
            testID="go-to-login-btn"
            onPress={() => router.push("/(auth)/login")}
            style={styles.loginLink}
          >
            <Text style={styles.loginLinkText}>
              {t("onboarding.haveAccount")}{" "}
              <Text style={{ color: theme.colors.brand, fontWeight: "700" }}>{t("onboarding.signIn")}</Text>
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
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  brandLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    color: theme.colors.onSurface,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  scrollContent: { paddingBottom: theme.spacing.lg },

  promoWrap: { marginTop: theme.spacing.lg },
  promo: {
    minHeight: 180,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.28)",
  },
  promoContent: { padding: theme.spacing.lg, gap: 6 },
  promoBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    flexWrap: "wrap",
  },
  newBadge: {
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  newBadgeText: {
    color: theme.colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  pilotBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(234, 179, 8, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.35)",
  },
  pilotBadgeText: { color: theme.colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  promoTitle: {
    color: theme.colors.onSurface,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  promoSub: {
    color: theme.colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

  featureGrid: {
    marginTop: theme.spacing.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  featureCard: {
    flexGrow: 1,
    flexBasis: "47%",
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(21,30,50,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 4,
  },
  featureTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "800" },
  featureSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, lineHeight: 16 },

  trustBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(21,30,50,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  trustItem: { flex: 1, alignItems: "center" },
  trustNumber: { color: theme.colors.brand, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  trustLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 10, fontWeight: "600", marginTop: 2, textAlign: "center" },
  trustDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.12)" },

  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    gap: theme.spacing.sm,
  },
  primaryBtnText: {
    color: theme.colors.onBrandPrimary,
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "center",
  },
  stackedBtnCol: {
    gap: theme.spacing.sm,
  },
  secondaryBtn: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(21,30,50,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: theme.colors.onSurface, fontSize: 14, fontWeight: "700", flexShrink: 1, textAlign: "center" },
  loginLink: { alignItems: "center", paddingTop: theme.spacing.sm },
  loginLinkText: { color: theme.colors.onSurfaceSecondary, fontSize: 14 },
});
