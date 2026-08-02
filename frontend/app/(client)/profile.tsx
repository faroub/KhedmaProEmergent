import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { LanguageSwitcher } from "@/src/LanguageSwitcher";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { t } = useT();

  const onLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface }} testID="profile-guest">
        <ImageBackground
          source={{ uri: "https://images.unsplash.com/photo-1687463221023-02f259da7d77?w=1200" }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["rgba(11,17,32,0.5)", "rgba(11,17,32,0.95)"]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.guestRoot} edges={["top", "bottom"]}>
          <View style={styles.langTop}>
            <LanguageSwitcher compact testID="profile-guest-lang" />
          </View>
          <View style={styles.guestBody}>
            <View style={styles.guestIcon}>
              <Ionicons name="person-circle-outline" size={72} color={theme.colors.brand} />
            </View>
            <Text style={styles.guestTitle}>{t("profile.guestTitle")}</Text>
            <Text style={styles.guestSub}>{t("profile.guestSub")}</Text>
            <View style={styles.guestActions}>
              <Pressable
                testID="guest-register-btn"
                style={styles.primaryBtn}
                onPress={() => router.push({ pathname: "/(auth)/register", params: { role: "client" } })}
              >
                <Text style={styles.primaryBtnText}>{t("profile.guestCreate")}</Text>
              </Pressable>
              <Pressable
                testID="guest-login-btn"
                style={styles.secondaryBtn}
                onPress={() => router.push("/(auth)/login")}
              >
                <Text style={styles.secondaryBtnText}>{t("profile.guestSignIn")}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 100, gap: theme.spacing.md }}>
        <Text style={styles.title}>{t("profile.title")}</Text>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={theme.colors.brand} />
          </View>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{user.role === "client" ? t("auth.client") : t("auth.provider")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Row icon="call" label={t("profile.phone")} value={user.phone || "—"} />
          <Row icon="location" label={t("profile.city")} value={user.city || "—"} />
        </View>

        <Text style={styles.sectionLabel}>{t("profile.language")}</Text>
        <LanguageSwitcher testID="profile-lang-switcher" />

        <Pressable testID="logout-btn" onPress={onLogout} style={styles.logout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={styles.logoutText}>{t("profile.signOut")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.colors.brand} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  guestRoot: { flex: 1, padding: theme.spacing.xl },
  langTop: { alignItems: "flex-end" },
  guestBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
  guestIcon: { marginBottom: theme.spacing.md },
  guestTitle: { color: theme.colors.onSurface, fontSize: 26, fontWeight: "800", textAlign: "center" },
  guestSub: { color: theme.colors.onSurfaceSecondary, fontSize: 15, textAlign: "center", lineHeight: 22, maxWidth: 320 },
  guestActions: { width: "100%", gap: theme.spacing.md, marginTop: theme.spacing.xl },
  primaryBtn: { backgroundColor: theme.colors.brand, paddingVertical: 16, borderRadius: theme.radius.pill, alignItems: "center" },
  primaryBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(21,30,50,0.6)", paddingVertical: 16, borderRadius: theme.radius.pill, alignItems: "center",
  },
  secondaryBtnText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 },

  title: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800", marginBottom: theme.spacing.md },
  sectionLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600", marginTop: theme.spacing.md },
  card: {
    alignItems: "center", padding: theme.spacing.xl, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.sm,
  },
  name: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "700" },
  email: { color: theme.colors.onSurfaceSecondary, fontSize: 13 },
  rolePill: {
    marginTop: theme.spacing.sm, paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill,
  },
  roleText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  section: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.md,
    padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  rowLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 13, width: 80 },
  rowValue: { color: theme.colors.onSurface, fontSize: 14, flex: 1, textAlign: "right" },
  logout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: theme.spacing.sm, padding: theme.spacing.md,
    marginTop: theme.spacing.md, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.error,
  },
  logoutText: { color: theme.colors.error, fontSize: 15, fontWeight: "700" },
});
