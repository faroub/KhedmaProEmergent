import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, ImageBackground, Modal, TextInput, FlatList, Dimensions,
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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

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
  // Full-screen viewer for review-attached photos. Null when closed.
  const [reviewPhoto, setReviewPhoto] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

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
            {provider.is_verified && (
              <View style={styles.verified} testID="verified-badge">
                <Ionicons name="shield-checkmark" size={14} color={theme.colors.onBrandPrimary} />
                <Text style={styles.verifiedText}>{t("verify.badgeShort")}</Text>
              </View>
            )}
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
                renderItem={({ item, index }) => {
                  const url = typeof item === "string" ? item : item?.url;
                  const caption = typeof item === "string" ? null : item?.caption;
                  const tags = typeof item === "string" ? [] : item?.tags || [];
                  const isCover = typeof item === "string" ? false : !!item?.is_cover;
                  return (
                    <Pressable
                      testID={`portfolio-${index}`}
                      onPress={() => setViewerIdx(index)}
                      style={styles.portfolioTile}
                    >
                      <Image source={{ uri: url }} style={styles.portfolioImg} contentFit="cover" />
                      {isCover && (
                        <View style={styles.portfolioCoverBadge}>
                          <Ionicons name="star" size={10} color="#fff" />
                          <Text style={styles.portfolioCoverText}>{t("portfolio.cover")}</Text>
                        </View>
                      )}
                      {(caption || tags.length > 0) && (
                        <View style={styles.portfolioCaption}>
                          <Text style={styles.portfolioCaptionText} numberOfLines={1}>
                            {caption || t(`portfolio.tag_${tags[0]}`)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                }}
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
                {/* Attached photos (if any). Tap any thumb to open a lightweight viewer. */}
                {Array.isArray(r.photos) && r.photos.length > 0 && (
                  <View style={styles.reviewPhotosRow} testID={`review-photos-${r.id}`}>
                    {r.photos.map((uri: string, i: number) => (
                      <Pressable
                        key={`${r.id}-p-${i}`}
                        onPress={() => setReviewPhoto(uri)}
                        style={styles.reviewPhotoThumbWrap}
                        testID={`review-photo-${r.id}-${i}`}
                      >
                        <Image source={{ uri }} style={styles.reviewPhotoThumb} contentFit="cover" />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Full-screen gallery viewer */}
      <Modal
        visible={viewerIdx !== null}
        animationType="fade"
        onRequestClose={() => setViewerIdx(null)}
        statusBarTranslucent
        transparent={false}
      >
        <View style={styles.viewerRoot}>
          <FlatList
            data={provider?.portfolio_images || []}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIdx || 0}
            getItemLayout={(_, i) => ({
              length: SCREEN_W,
              offset: SCREEN_W * i,
              index: i,
            })}
            keyExtractor={(_, i) => `v${i}`}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => {
              const url = typeof item === "string" ? item : item?.url;
              const caption = typeof item === "string" ? null : item?.caption;
              const tags = typeof item === "string" ? [] : item?.tags || [];
              return (
                <View style={styles.viewerPage}>
                  <Image source={{ uri: url }} style={styles.viewerImg} contentFit="contain" />
                  {(caption || tags.length > 0) && (
                    <View style={styles.viewerMeta}>
                      {caption ? <Text style={styles.viewerCaption}>{caption}</Text> : null}
                      {tags.length > 0 ? (
                        <View style={styles.viewerTags}>
                          {tags.map((tg: string) => (
                            <View key={tg} style={styles.viewerTag}>
                              <Text style={styles.viewerTagText}>{t(`portfolio.tag_${tg}`)}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            }}
          />
          <Pressable
            testID="detail-viewer-close"
            onPress={() => setViewerIdx(null)}
            style={styles.viewerClose}
            hitSlop={12}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>

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
          style={[styles.cta, isRTL && { flexDirection: "row-reverse" }]}
          onPress={() => router.push(`/booking/new?providerId=${provider.id}`)}
        >
          <Text
            style={styles.ctaText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            allowFontScaling={false}
          >
            {t("provider.requestBooking")}
          </Text>
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

      {/* Lightweight viewer for a single review-attached photo. */}
      <Modal
        visible={reviewPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewPhoto(null)}
      >
        <Pressable style={styles.reviewViewerRoot} onPress={() => setReviewPhoto(null)}>
          {reviewPhoto && (
            <Image source={{ uri: reviewPhoto }} style={styles.reviewViewerImage} contentFit="contain" />
          )}
          <Pressable
            style={styles.reviewViewerClose}
            onPress={() => setReviewPhoto(null)}
            hitSlop={12}
            testID="review-photo-viewer-close"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </Pressable>
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
  portfolioTile: { width: 140, height: 140, borderRadius: theme.radius.md, overflow: "hidden", position: "relative" },
  portfolioCoverBadge: {
    position: "absolute", top: 6, left: 6,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  portfolioCoverText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  portfolioCaption: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  portfolioCaptionText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  // Full-screen viewer
  viewerRoot: { flex: 1, backgroundColor: "#000" },
  viewerPage: { width: SCREEN_W, height: SCREEN_H, justifyContent: "center", backgroundColor: "#000" },
  viewerImg: { width: SCREEN_W, height: SCREEN_H },
  viewerClose: {
    position: "absolute", top: 48, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  viewerMeta: {
    position: "absolute", left: 0, right: 0, bottom: 60,
    paddingHorizontal: 24, gap: 8,
  },
  viewerCaption: { color: "#fff", fontSize: 15, fontWeight: "600" },
  viewerTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  viewerTag: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: theme.radius.pill,
  },
  viewerTagText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  sectionTitle: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700" },
  noReviews: { color: theme.colors.muted, fontSize: 13 },
  reviewCard: {
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border, gap: 6,
  },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between" },
  reviewer: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700" },
  reviewComment: { color: theme.colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  reviewPhotosRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: theme.spacing.sm,
    flexWrap: "wrap",
  },
  reviewPhotoThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceTertiary,
  },
  reviewPhotoThumb: { width: "100%", height: "100%" },
  reviewViewerRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  reviewViewerImage: { width: "100%", height: "100%" },
  reviewViewerClose: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
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
    flex: 2,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm,
    backgroundColor: theme.colors.brand, paddingVertical: 16,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
  },
  ctaText: {
    color: theme.colors.onBrandPrimary,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
    includeFontPadding: false,
  },
});
