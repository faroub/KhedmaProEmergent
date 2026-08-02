import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, ImageBackground, Modal, TextInput, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { useAuth } from "@/src/auth";

export default function ProviderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, isRTL } = useT();
  const { user } = useAuth();
  const [provider, setProvider] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);

  const REPORT_REASONS = [
    { key: "no_show", tKey: "report.reasons.noShow" },
    { key: "poor_quality", tKey: "report.reasons.poorQuality" },
    { key: "price_gouging", tKey: "report.reasons.priceGouging" },
    { key: "unsafe", tKey: "report.reasons.unsafe" },
    { key: "fraud", tKey: "report.reasons.fraud" },
    { key: "other", tKey: "report.reasons.other" },
  ];

  const openReport = () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    setReportReason(null);
    setReportDetails("");
    setReportError(null);
    setReportSuccess(false);
    setReportOpen(true);
  };

  const submitReport = async () => {
    if (!reportReason) return;
    setReportSubmitting(true);
    try {
      await api.reportProvider({ provider_id: id as string, reason: reportReason, details: reportDetails || undefined });
      setReportSuccess(true);
      setTimeout(() => setReportOpen(false), 1500);
    } catch (e: any) {
      setReportError(e?.message || "Failed");
    } finally {
      setReportSubmitting(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([api.provider(id as string), api.providerReviews(id as string)])
      .then(([p, r]: any) => {
        setProvider(p);
        setReviews(r);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.colors.brand} />
      </SafeAreaView>
    );
  }

  if (!provider) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ color: theme.colors.onSurface }}>Provider not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={{ uri: provider.avatar_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800" }}
          style={styles.hero}
        >
          <LinearGradient
            colors={["rgba(11,17,32,0.4)", "rgba(11,17,32,0.95)"]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} testID="provider-back-btn">
              <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
            </Pressable>
          </SafeAreaView>
        </ImageBackground>

        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: provider.avatar_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400" }}
              style={styles.avatar}
              contentFit="cover"
            />
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{provider.full_name}</Text>
            <View style={styles.verified}>
              <Ionicons name="shield-checkmark" size={14} color={theme.colors.onBrandPrimary} />
              <Text style={styles.verifiedText}>{t("provider.verified")}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={14} color={theme.colors.brand} />
              <Text style={styles.metaText}>
                {provider.rating.toFixed(1)} ({provider.reviews_count})
              </Text>
            </View>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{provider.city || "Algeria"}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>
              {provider.category ? t(`cat.${provider.category}`) : ""}
            </Text>
          </View>

          {provider.bio && <Text style={styles.bio}>{provider.bio}</Text>}

          <View style={styles.ratesRow}>
            <View style={styles.rateCard}>
              <Ionicons name="time" size={16} color={theme.colors.brand} />
              <Text style={styles.rateValue}>{provider.hourly_rate ?? "-"}</Text>
              <Text style={styles.rateLabel}>{t("provider.perHour")}</Text>
            </View>
            <View style={styles.rateCard}>
              <Ionicons name="briefcase" size={16} color={theme.colors.brand} />
              <Text style={styles.rateValue}>{provider.task_rate ?? "-"}</Text>
              <Text style={styles.rateLabel}>{t("provider.perTask")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.reviewsSection}>
          {provider.portfolio_images && provider.portfolio_images.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{t("portfolio.title")}</Text>
              <FlatList
                horizontal
                data={provider.portfolio_images}
                keyExtractor={(_, i) => `p${i}`}
                contentContainerStyle={{ gap: 8 }}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <Image source={{ uri: item }} testID={`portfolio-${index}`} style={styles.portfolioImg} contentFit="cover" />
                )}
              />
            </>
          )}
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionTitle}>{t("provider.reviews")} ({reviews.length})</Text>
            <Pressable
              testID="write-review-btn"
              style={styles.writeReviewBtn}
              onPress={() => router.push(`/review/new?providerId=${provider.id}`)}
            >
              <Ionicons name="create-outline" size={14} color={theme.colors.brand} />
              <Text style={styles.writeReviewText}>{t("provider.writeReview")}</Text>
            </Pressable>
          </View>
          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>{t("provider.noReviews")}</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard} testID={`review-${r.id}`}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewer}>{r.client_name}</Text>
                  <View style={{ flexDirection: "row", gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons key={s} name={s <= r.rating ? "star" : "star-outline"} size={12} color={theme.colors.brand} />
                    ))}
                  </View>
                </View>
                <Text style={styles.reviewComment}>{r.comment}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.ctaBar}>
        <Pressable
          testID="message-provider-btn"
          style={styles.msgBtn}
          onPress={() => router.push(`/chat/${provider.id}?name=${encodeURIComponent(provider.full_name)}`)}
        >
          <Ionicons name="chatbubble-ellipses" size={18} color={theme.colors.brand} />
          <Text style={styles.msgBtnText}>{t("chat.messageBtn")}</Text>
        </Pressable>
        <Pressable
          testID="request-booking-btn"
          style={styles.cta}
          onPress={() => router.push(`/booking/new?providerId=${provider.id}`)}
        >
          <Text style={styles.ctaText}>{t("provider.requestBooking")}</Text>
          <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={18} color={theme.colors.onBrandPrimary} />
        </Pressable>
      </SafeAreaView>

      {/* Report modal */}
      <Modal transparent visible={reportOpen} animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" }}>{t("report.title")}</Text>
              <Pressable onPress={() => setReportOpen(false)} testID="report-close-btn">
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>

            {reportSuccess ? (
              <View style={{ alignItems: "center", padding: theme.spacing.xl }}>
                <Ionicons name="checkmark-circle" size={48} color={theme.colors.success} />
                <Text style={{ color: theme.colors.onSurface, fontSize: 15, marginTop: theme.spacing.sm }}>{t("report.submitted")}</Text>
              </View>
            ) : (
              <>
                <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" }}>{t("report.reason")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {REPORT_REASONS.map((r) => (
                    <Pressable
                      key={r.key}
                      testID={`report-reason-${r.key}`}
                      onPress={() => setReportReason(r.key)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.pill,
                        borderWidth: 1, borderColor: reportReason === r.key ? theme.colors.brand : theme.colors.border,
                        backgroundColor: reportReason === r.key ? theme.colors.brand : theme.colors.surfaceSecondary,
                      }}
                    >
                      <Text style={{ color: reportReason === r.key ? theme.colors.onBrandPrimary : theme.colors.onSurface, fontWeight: "600", fontSize: 12 }}>
                        {t(r.tKey)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" }}>{t("report.details")}</Text>
                <TextInput
                  testID="report-details-input"
                  style={{
                    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md,
                    padding: theme.spacing.md, color: theme.colors.onSurface, height: 100, textAlignVertical: "top",
                    borderWidth: 1, borderColor: theme.colors.border,
                  }}
                  multiline value={reportDetails} onChangeText={setReportDetails}
                  placeholder={t("report.detailsPh")} placeholderTextColor={theme.colors.muted}
                />
                {reportError && <Text style={{ color: theme.colors.error, textAlign: "center" }}>{reportError}</Text>}
                <Pressable
                  testID="report-submit-btn"
                  onPress={submitReport}
                  disabled={!reportReason || reportSubmitting}
                  style={{
                    backgroundColor: theme.colors.brand, paddingVertical: 14, borderRadius: theme.radius.pill,
                    alignItems: "center", opacity: !reportReason || reportSubmitting ? 0.6 : 1,
                  }}
                >
                  {reportSubmitting ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={{ color: theme.colors.onBrandPrimary, fontWeight: "700" }}>{t("report.submit")}</Text>}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  hero: { height: 240 },
  backBtn: {
    margin: theme.spacing.md, width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(11,17,32,0.6)", alignItems: "center", justifyContent: "center",
  },
  card: {
    marginTop: -30, marginHorizontal: theme.spacing.xl,
    padding: theme.spacing.lg, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  avatarWrap: { alignSelf: "center", marginTop: -60, marginBottom: theme.spacing.md },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: theme.colors.brand, backgroundColor: theme.colors.surfaceTertiary },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm },
  name: { color: theme.colors.onSurface, fontSize: 22, fontWeight: "800" },
  verified: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  verifiedText: { color: theme.colors.onBrandPrimary, fontSize: 10, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 6, marginTop: theme.spacing.sm },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.muted },
  bio: { color: theme.colors.onSurfaceTertiary, fontSize: 14, lineHeight: 20, marginTop: theme.spacing.md, textAlign: "center" },
  ratesRow: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.lg },
  rateCard: {
    flex: 1, alignItems: "center", padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceTertiary,
  },
  rateValue: { color: theme.colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 4 },
  rateLabel: { color: theme.colors.muted, fontSize: 11 },
  reviewsSection: { padding: theme.spacing.xl, gap: theme.spacing.md },
  reviewsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  writeReviewBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, height: 32,
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.brand,
  },
  writeReviewText: { color: theme.colors.brand, fontSize: 12, fontWeight: "700" },
  portfolioImg: { width: 140, height: 140, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary },
  sectionTitle: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700" },
  noReviews: { color: theme.colors.muted, fontSize: 13 },
  reviewCard: {
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border, gap: 6,
  },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between" },
  reviewer: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700" },
  reviewComment: { color: theme.colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  ctaBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: theme.spacing.md, paddingHorizontal: theme.spacing.xl,
    backgroundColor: "rgba(11,17,32,0.95)", borderTopWidth: 1, borderTopColor: theme.colors.border,
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
  },
  msgBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingHorizontal: theme.spacing.md, paddingVertical: 16,
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.brand,
  },
  msgBtnText: { color: theme.colors.brand, fontWeight: "700", fontSize: 14 },
  cta: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm,
    backgroundColor: theme.colors.brand, paddingVertical: 16, borderRadius: theme.radius.pill,
  },
  ctaText: { color: theme.colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
});
