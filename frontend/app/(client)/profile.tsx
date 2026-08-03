import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ImageBackground,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { LanguageSwitcher } from "@/src/LanguageSwitcher";
import { api } from "@/src/api";
import { VerificationCard } from "@/src/VerificationCard";
import { PhoneVerifyBanner } from "@/src/PhoneVerifyBanner";

type ConfirmKind = "deactivate" | "reactivate" | "delete" | null;

export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const { t } = useT();

  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const isProvider = user?.role === "service_provider";
  const subStatus = user?.subscription_status;
  const daysLeft = user?.days_until_due ?? 0;
  const isManuallyDeact = !!user?.is_manually_deactivated;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const onLogout = async () => {
    await logout();
    router.replace("/");
  };

  const onPay = async () => {
    setPaying(true);
    try {
      const r: any = await api.paySubscription();
      if (r && r.checkout_url) {
        // Real Chargily flow — open the hosted checkout in the in-app browser.
        // Payment confirmation happens via server webhook; we refresh status on return.
        const WB = await import("expo-web-browser");
        await WB.openBrowserAsync(r.checkout_url);
        await refresh();
        showToast(t("account.paySuccess"));
      } else {
        // Mock success path
        await refresh();
        showToast(t("account.paySuccess"));
      }
    } catch (e: any) {
      showToast(e?.message || "Error");
    }
    setPaying(false);
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === "deactivate") {
        await api.deactivateAccount();
        await refresh();
        showToast(t("account.deactivated"));
      } else if (confirm === "reactivate") {
        await api.reactivateAccount();
        await refresh();
        showToast(t("account.reactivated"));
      } else if (confirm === "delete") {
        await api.deleteAccount();
        showToast(t("account.deleted"));
        // Fully log out and route to onboarding
        setTimeout(async () => {
          await logout();
          router.replace("/");
        }, 800);
      }
    } catch (e: any) {
      showToast(e?.message || "Error");
    }
    setBusy(false);
    setConfirm(null);
  };

  // ---- Guest ----
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
                onPress={() =>
                  router.push({ pathname: "/(auth)/register", params: { role: "client" } })
                }
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

  // ---- Confirmation copy ----
  const confirmTitle =
    confirm === "delete"
      ? t("account.confirmDelete")
      : confirm === "reactivate"
      ? t("account.confirmReactivate")
      : t("account.confirmDeactivate");
  const confirmSub =
    confirm === "delete"
      ? t("account.confirmDeleteSub")
      : confirm === "reactivate"
      ? t("account.confirmReactivateSub")
      : t("account.confirmDeactivateSub");

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.xl,
          paddingBottom: 100,
          gap: theme.spacing.md,
        }}
      >
        <Text style={styles.title}>{t("profile.title")}</Text>

        {/* Manual deactivation banner */}
        {isManuallyDeact && (
          <View style={styles.deactBanner} testID="deact-banner">
            <Ionicons name="pause-circle" size={20} color={theme.colors.warning} />
            <Text style={styles.deactBannerText}>{t("account.deactBanner")}</Text>
          </View>
        )}

        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={theme.colors.brand} />
          </View>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>
              {user.role === "client" ? t("auth.client") : t("auth.provider")}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Row icon="call" label={t("profile.phone")} value={user.phone || "—"} />
          <Row icon="location" label={t("profile.city")} value={user.city || "—"} />
        </View>

        {/* ============ Admin (admin users only) ============ */}
        {user.is_admin && (
          <>
            <Pressable
              testID="admin-panel-link"
              style={styles.dangerCardActive}
              onPress={() => router.push("/admin/verification")}
            >
              <Ionicons name="shield-checkmark" size={22} color={theme.colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dangerTitle}>{t("admin.title")}</Text>
                <Text style={styles.dangerSub}>{t("admin.empty")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable
              testID="admin-flags-link"
              style={styles.dangerCardActive}
              onPress={() => router.push("/admin/flags")}
            >
              <Ionicons name="flag" size={22} color={theme.colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dangerTitle}>{t("flags.section")}</Text>
                <Text style={styles.dangerSub}>{t("flags.sectionSub")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
          </>
        )}

        {/* ============ Verification (providers only) ============ */}
        {isProvider && (
          <>
            <PhoneVerifyBanner />
            <Text style={styles.sectionLabel}>{t("verify.title")}</Text>
            <VerificationCard />
          </>
        )}

        {/* ============ Subscription (providers only) ============ */}
        {isProvider && (
          <>
            <Text style={styles.sectionLabel}>{t("account.subscription")}</Text>
            <View style={styles.subCard} testID="subscription-card">
              <View style={styles.subRow}>
                <View style={styles.subBadge(subStatus)}>
                  <Ionicons
                    name={
                      subStatus === "active"
                        ? "shield-checkmark"
                        : subStatus === "trial"
                        ? "gift"
                        : subStatus === "manually_deactivated"
                        ? "pause-circle"
                        : "warning"
                    }
                    size={16}
                    color={theme.colors.onBrandPrimary}
                  />
                  <Text style={styles.subBadgeText}>
                    {subStatus === "active" && t("account.subActive")}
                    {subStatus === "trial" && t("account.subTrial")}
                    {subStatus === "due" && t("account.subDue")}
                    {subStatus === "manually_deactivated" && t("account.subManual")}
                    {(!subStatus || subStatus === "deleted") && t("account.subDeact")}
                  </Text>
                </View>
              </View>
              <Text style={styles.subDesc}>
                {subStatus === "trial" && t("account.daysLeftTrial", { days: daysLeft })}
                {subStatus === "active" && t("account.daysLeftActive", { days: daysLeft })}
                {subStatus === "due" && t("account.dueNow")}
                {subStatus === "due" && "\n" + t("account.willAutoDelete")}
              </Text>
              {(subStatus === "trial" || subStatus === "due" || subStatus === "active") && (
                <>
                  <Pressable
                    testID="pay-btn"
                    onPress={onPay}
                    disabled={paying}
                    style={styles.payBtn}
                  >
                    {paying ? (
                      <ActivityIndicator color={theme.colors.onBrandPrimary} />
                    ) : (
                      <Text style={styles.payBtnText}>{t("account.payNow")}</Text>
                    )}
                  </Pressable>
                  <Text style={styles.mockHint}>{t("account.mockPay")}</Text>
                </>
              )}
            </View>
          </>
        )}

        {/* ============ Language ============ */}
        <Text style={styles.sectionLabel}>{t("profile.language")}</Text>
        <LanguageSwitcher testID="profile-lang-switcher" />

        {/* ============ Danger zone ============ */}
        <Text style={[styles.sectionLabel, { color: theme.colors.error, marginTop: theme.spacing.xl }]}>
          {t("account.dangerZone")}
        </Text>

        {isManuallyDeact ? (
          <Pressable
            testID="reactivate-btn"
            onPress={() => setConfirm("reactivate")}
            style={styles.dangerCardActive}
          >
            <Ionicons name="play-circle" size={22} color={theme.colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerTitle}>{t("account.reactivate")}</Text>
              <Text style={styles.dangerSub}>{t("account.reactivateSub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
          </Pressable>
        ) : (
          <Pressable
            testID="deactivate-btn"
            onPress={() => setConfirm("deactivate")}
            style={styles.dangerCard}
          >
            <Ionicons name="pause-circle-outline" size={22} color={theme.colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerTitle}>{t("account.deactivate")}</Text>
              <Text style={styles.dangerSub}>{t("account.deactivateSub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
          </Pressable>
        )}

        <Pressable
          testID="delete-btn"
          onPress={() => setConfirm("delete")}
          style={styles.dangerCardDelete}
        >
          <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.dangerTitle, { color: theme.colors.error }]}>{t("account.delete")}</Text>
            <Text style={styles.dangerSub}>{t("account.deleteSub")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.error} />
        </Pressable>

        <Pressable
          testID="switch-role-btn"
          onPress={async () => {
            await logout();
            router.replace("/");
          }}
          style={styles.switchRoleCard}
        >
          <Ionicons name="swap-horizontal-outline" size={22} color={theme.colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.switchRoleTitle}>{t("account.switchRole")}</Text>
            <Text style={styles.switchRoleSub}>{t("account.switchRoleSub")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
        </Pressable>

        <Pressable testID="logout-btn" onPress={onLogout} style={styles.logout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={styles.logoutText}>{t("profile.signOut")}</Text>
        </Pressable>
      </ScrollView>

      {/* Toast */}
      {toast && (
        <View style={styles.toast} testID="profile-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Confirmation modal */}
      <Modal
        transparent
        visible={confirm !== null}
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <View style={styles.modalRoot}>
          <View style={styles.modalCard} testID="confirm-modal">
            <View
              style={[
                styles.modalIcon,
                confirm === "delete" && { backgroundColor: "rgba(220,53,69,0.15)" },
              ]}
            >
              <Ionicons
                name={
                  confirm === "delete"
                    ? "trash-outline"
                    : confirm === "reactivate"
                    ? "play-circle"
                    : "pause-circle-outline"
                }
                size={30}
                color={
                  confirm === "delete"
                    ? theme.colors.error
                    : confirm === "reactivate"
                    ? theme.colors.success
                    : theme.colors.warning
                }
              />
            </View>
            <Text style={styles.modalTitle}>{confirmTitle}</Text>
            <Text style={styles.modalSub}>{confirmSub}</Text>
            <View style={styles.modalActions}>
              <Pressable
                testID="confirm-cancel"
                onPress={() => setConfirm(null)}
                disabled={busy}
                style={[styles.modalBtn, styles.modalCancel]}
              >
                <Text style={styles.modalCancelText}>{t("account.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="confirm-ok"
                onPress={runConfirm}
                disabled={busy}
                style={[
                  styles.modalBtn,
                  confirm === "delete"
                    ? styles.modalConfirmDanger
                    : styles.modalConfirm,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.modalConfirmText}>{t("account.confirm")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.colors.brand} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
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
  guestSub: {
    color: theme.colors.onSurfaceSecondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  guestActions: { width: "100%", gap: theme.spacing.md, marginTop: theme.spacing.xl },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    paddingVertical: 16,
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  primaryBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(21,30,50,0.6)",
    paddingVertical: 16,
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  secondaryBtnText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 },

  title: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800", marginBottom: theme.spacing.md },
  sectionLabel: {
    color: theme.colors.onSurfaceTertiary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: theme.spacing.md,
  },
  card: {
    alignItems: "center",
    padding: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.sm,
  },
  name: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "700" },
  email: { color: theme.colors.onSurfaceSecondary, fontSize: 13 },
  rolePill: {
    marginTop: theme.spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.pill,
  },
  roleText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  section: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 13, width: 80 },
  rowValue: { color: theme.colors.onSurface, fontSize: 14, flex: 1, textAlign: "right" },

  // Deactivated banner
  deactBanner: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,171,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,171,0,0.35)",
  },
  deactBannerText: { color: theme.colors.warning, flex: 1, fontSize: 13, fontWeight: "600" },

  // Subscription card
  subCard: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  subRow: { flexDirection: "row", alignItems: "center" },
  subBadge: (status?: string | null) => ({
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor:
      status === "active"
        ? theme.colors.success
        : status === "trial"
        ? theme.colors.brand
        : status === "manually_deactivated"
        ? theme.colors.warning
        : theme.colors.error,
  }),
  subBadgeText: { color: theme.colors.onBrandPrimary, fontSize: 12, fontWeight: "700" },
  subDesc: { color: theme.colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  payBtn: {
    marginTop: theme.spacing.sm,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  mockHint: { color: theme.colors.muted, fontSize: 11, textAlign: "center" },

  // Danger zone
  dangerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dangerCardActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(45,180,120,0.08)",
    borderWidth: 1,
    borderColor: "rgba(45,180,120,0.35)",
  },
  dangerCardDelete: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(220,53,69,0.06)",
    borderWidth: 1,
    borderColor: "rgba(220,53,69,0.35)",
  },
  dangerTitle: { color: theme.colors.onSurface, fontSize: 15, fontWeight: "700" },
  dangerSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  logoutText: { color: theme.colors.error, fontSize: 15, fontWeight: "700" },
  switchRoleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  switchRoleTitle: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  switchRoleSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  // Toast
  toast: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: theme.radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Modal
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    gap: theme.spacing.md,
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,171,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    color: theme.colors.onSurface,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  modalSub: {
    color: theme.colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: theme.spacing.md,
    width: "100%",
    marginTop: theme.spacing.sm,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancel: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalCancelText: { color: theme.colors.onSurface, fontWeight: "700" },
  modalConfirm: { backgroundColor: theme.colors.brand },
  modalConfirmDanger: { backgroundColor: theme.colors.error },
  modalConfirmText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },
});
