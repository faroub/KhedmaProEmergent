import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/language";
import { compressImage } from "@/src/utils/imageCompress";

const MAX_PHOTOS = 3;

export default function ReviewScreen() {
  const params = useLocalSearchParams<{ bookingId?: string; providerId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useT();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState<null | string>(null);

  const pickPhotos = async () => {
    if (photoBusy || photos.length >= MAX_PHOTOS) return;
    setPhotoBusy(t("review.photoPicking"));
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setPhotoBusy(null);
        return;
      }
      const slotsLeft = MAX_PHOTOS - photos.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: true,
        selectionLimit: slotsLeft,
      });
      if (result.canceled || !result.assets?.length) {
        setPhotoBusy(null);
        return;
      }
      const picked = result.assets.slice(0, slotsLeft);
      const added: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        setPhotoBusy(t("review.photoCompressing", { i: i + 1, n: picked.length }));
        try {
          const c = await compressImage(picked[i].uri, {
            targetBytes: 200 * 1024,
            initialWidth: 1200,
            minWidth: 640,
            initialQuality: 0.6,
          });
          added.push(c.dataUri);
        } catch (err) {
          console.warn("review.compress failed", err);
        }
      }
      if (added.length > 0) {
        setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
      }
    } finally {
      setTimeout(() => setPhotoBusy(null), 400);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const bookingId = params.bookingId && params.bookingId !== "new" ? params.bookingId : undefined;
  const providerId = params.providerId;

  // Login gate
  if (!user || user.role !== "client") {
    return (
      <SafeAreaView style={styles.gateRoot} edges={["top", "bottom"]}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="review-gate-back-btn">
          <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
        </Pressable>
        <View style={styles.gateBody}>
          <View style={styles.gateIcon}>
            <Ionicons name="star" size={48} color={theme.colors.brand} />
          </View>
          <Text style={styles.gateTitle}>{t("review.needAccount")}</Text>
          <Text style={styles.gateSub}>{t("review.needAccountSub")}</Text>
          <Pressable
            testID="review-gate-register-btn"
            style={styles.gateBtn}
            onPress={() =>
              router.replace({
                pathname: "/(auth)/register",
                params: { role: "client", next: providerId ? `/review/new?providerId=${providerId}` : "" },
              })
            }
          >
            <Text style={styles.gateBtnText}>{t("profile.guestCreate")}</Text>
          </Pressable>
          <Pressable
            testID="review-gate-signin-btn"
            style={styles.gateBtnOutline}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.gateBtnOutlineText}>{t("profile.guestSignIn")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    if (!comment.trim()) {
      setError(t("review.commentPh"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload: any = { rating, comment, photos };
      if (bookingId) payload.booking_id = bookingId;
      else if (providerId) payload.provider_id = providerId;
      await api.createReview(payload);
      router.back();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="review-back-btn">
          <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("review.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={styles.prompt}>{t("review.prompt")}</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Pressable key={s} onPress={() => setRating(s)} testID={`star-${s}`}>
                <Ionicons name={s <= rating ? "star" : "star-outline"} size={44} color={theme.colors.brand} />
              </Pressable>
            ))}
          </View>

          <TextInput
            testID="comment-input"
            style={[styles.input, { height: 120, textAlignVertical: "top" }]}
            value={comment}
            onChangeText={setComment}
            multiline
            placeholder={t("review.commentPh")}
            placeholderTextColor={theme.colors.muted}
          />

          {/* Photo attachments (optional, up to 3) */}
          <View style={styles.photosBlock}>
            <View style={styles.photosHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.photosLabel}>{t("review.photosLabel")}</Text>
                <Text style={styles.photosHint}>{t("review.photosHint")}</Text>
              </View>
              <Text style={styles.photosCount}>{photos.length} / {MAX_PHOTOS}</Text>
            </View>
            {!!photoBusy && (
              <Text style={styles.photosBusy} testID="review-photo-progress">
                {photoBusy}
              </Text>
            )}
            <View style={styles.photosRow}>
              {photos.map((uri, idx) => (
                <View key={`${idx}-${uri.slice(-8)}`} style={styles.photoThumbWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <Pressable
                    testID={`review-remove-photo-${idx}`}
                    onPress={() => removePhoto(idx)}
                    hitSlop={8}
                    style={styles.photoRemoveBtn}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <Pressable
                  testID="review-add-photo-btn"
                  onPress={pickPhotos}
                  disabled={!!photoBusy}
                  style={[styles.photoAdd, !!photoBusy && { opacity: 0.6 }]}
                >
                  {photoBusy ? (
                    <ActivityIndicator color={theme.colors.brand} size="small" />
                  ) : (
                    <>
                      <Ionicons name="camera" size={22} color={theme.colors.brand} />
                      <Text style={styles.photoAddText}>{t("review.addPhoto")}</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable testID="submit-review-btn" onPress={submit} disabled={submitting} style={styles.submit}>
            {submitting ? <ActivityIndicator color={theme.colors.onBrandPrimary} /> : <Text style={styles.submitText}>{t("review.submit")}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", margin: theme.spacing.sm },
  title: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "700" },
  prompt: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: theme.spacing.lg },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: theme.spacing.sm, marginVertical: theme.spacing.md },
  input: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.lg, paddingVertical: 14, fontSize: 15, color: theme.colors.onSurface, borderWidth: 1, borderColor: theme.colors.border },
  error: { color: theme.colors.error, textAlign: "center" },
  submit: { backgroundColor: theme.colors.brand, paddingVertical: 16, borderRadius: theme.radius.pill, alignItems: "center" },
  submitText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },

  // Photo attachment block
  photosBlock: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  photosHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  photosLabel: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 14 },
  photosHint: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  photosCount: { color: theme.colors.muted, fontSize: 12, fontWeight: "700" },
  photosBusy: { color: theme.colors.brand, fontSize: 11, fontStyle: "italic" },
  photosRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  photoThumbWrap: { width: 84, height: 84, borderRadius: theme.radius.md, overflow: "hidden", position: "relative" },
  photoThumb: { width: "100%", height: "100%" },
  photoRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoAdd: {
    width: 84,
    height: 84,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: theme.colors.surface,
  },
  photoAddText: { color: theme.colors.brand, fontSize: 10, fontWeight: "700" },

  gateRoot: { flex: 1, backgroundColor: theme.colors.surface },
  gateBody: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  gateIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.md },
  gateTitle: { color: theme.colors.onSurface, fontSize: 24, fontWeight: "800", textAlign: "center" },
  gateSub: { color: theme.colors.onSurfaceSecondary, textAlign: "center", fontSize: 14, lineHeight: 20, maxWidth: 300, marginBottom: theme.spacing.lg },
  gateBtn: { width: "100%", backgroundColor: theme.colors.brand, paddingVertical: 16, borderRadius: theme.radius.pill, alignItems: "center" },
  gateBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  gateBtnOutline: { width: "100%", borderWidth: 1, borderColor: theme.colors.borderStrong, paddingVertical: 16, borderRadius: theme.radius.pill, alignItems: "center" },
  gateBtnOutlineText: { color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 },
});
