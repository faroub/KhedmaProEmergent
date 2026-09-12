import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Share,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { BrandText } from "@/src/BrandText";

/**
 * "Marketing kit" — a lightweight admin gallery listing the pre-generated
 * ad creatives from `/api/static/ads/`. Each card offers a copyable URL and
 * an OS-native share sheet so the operator can shoot the images straight to
 * their design team or paste them into a Facebook/Instagram ad manager.
 *
 * Regenerate the images at any time with `python /app/scripts/gen_ads.py`.
 */

type Ad = {
  filename: string;
  label: string;
  ratio: string;
  platform: string;
  icon: import("@react-native-vector-icons/ionicons").IoniconsIconName;
};

const ADS: Ad[] = [
  { filename: "hero_portrait_4x5_fr.png", label: "Hero — French", ratio: "4:5 portrait", platform: "Facebook / Instagram feed", icon: "logo-facebook" },
  { filename: "hero_portrait_4x5_ar.png", label: "Hero — Arabic", ratio: "4:5 portrait", platform: "Facebook / Instagram feed", icon: "logo-facebook" },
  { filename: "square_1x1_fr.png", label: "Feed square — French", ratio: "1:1 square", platform: "Instagram feed", icon: "logo-instagram" },
  { filename: "square_1x1_ar.png", label: "Feed square — Arabic", ratio: "1:1 square", platform: "Instagram feed", icon: "logo-instagram" },
  { filename: "vertical_9x16_tiktok_fr.png", label: "TikTok / Reels — French", ratio: "9:16 vertical", platform: "TikTok / Reels / Stories", icon: "logo-tiktok" },
  { filename: "vertical_9x16_tiktok_ar.png", label: "TikTok / Reels — Arabic", ratio: "9:16 vertical", platform: "TikTok / Reels / Stories", icon: "logo-tiktok" },
  { filename: "cat_plumbing_fr.png", label: "Plumbing — French", ratio: "1:1 square", platform: "Instagram", icon: "construct" },
  { filename: "cat_cleaning_ar.png", label: "Cleaning — Arabic", ratio: "9:16 vertical", platform: "TikTok", icon: "sparkles" },
];

export default function MarketingKit() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Absolute URL builder so admins can copy something that works out of the app.
  const baseUrl = useMemo(() => (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, ""), []);
  const publicUrl = (fname: string) => `${baseUrl}/api/static/ads/${fname}`;

  if (!authLoading && !user?.is_admin) {
    return (
      <SafeAreaView style={styles.gate}>
        <Text style={styles.gateText}>Admin access required.</Text>
      </SafeAreaView>
    );
  }

  const copy = async (url: string) => {
    try {
      await Clipboard.setStringAsync(url);
      Alert.alert("✓ Copied", url);
    } catch {
      Alert.alert("Copy failed", url);
    }
  };

  const share = async (ad: Ad) => {
    const url = publicUrl(ad.filename);
    try {
      await Share.share({ message: `${ad.label} — khedmaPro ad creative\n${url}`, url });
    } catch {
      // ignore
    }
  };

  const openInBrowser = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert("Could not open URL", url));
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="kit-back-btn">
          <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Marketing kit</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <BrandText style={styles.introBrand} />
          <Text style={styles.introText}>
            Ready-to-post ad creatives in every aspect ratio you need. Tap the URL to copy, or share directly to your team.
          </Text>
          <Text style={styles.introHint}>
            Regenerate any time by running `python /app/scripts/gen_ads.py` on the backend.
          </Text>
        </View>

        {ADS.map((ad) => {
          const url = publicUrl(ad.filename);
          return (
            <View key={ad.filename} style={styles.card} testID={`ad-card-${ad.filename}`}>
              <Pressable onPress={() => openInBrowser(url)} style={styles.imageWrap}>
                <Image source={{ uri: url }} style={styles.image} contentFit="cover" />
              </Pressable>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name={ad.icon} size={14} color={theme.colors.brand} />
                  <Text style={styles.cardLabel} numberOfLines={1}>{ad.label}</Text>
                </View>
                <View style={styles.cardMetaRow}>
                  <View style={styles.pill}><Text style={styles.pillText}>{ad.ratio}</Text></View>
                  <Text style={styles.cardPlatform} numberOfLines={1}>{ad.platform}</Text>
                </View>
                <Pressable
                  testID={`ad-copy-${ad.filename}`}
                  onPress={() => copy(url)}
                  style={styles.urlRow}
                >
                  <Ionicons name="link" size={12} color={theme.colors.muted} />
                  <Text style={styles.urlText} numberOfLines={1}>{url}</Text>
                </Pressable>
                <View style={styles.actionsRow}>
                  <Pressable
                    testID={`ad-download-${ad.filename}`}
                    onPress={() => openInBrowser(url)}
                    style={[styles.actionBtn, styles.actionPrimary]}
                  >
                    <Ionicons name="download-outline" size={14} color={theme.colors.onBrandPrimary} />
                    <Text style={styles.actionBtnText}>Open</Text>
                  </Pressable>
                  {Platform.OS !== "web" && (
                    <Pressable
                      testID={`ad-share-${ad.filename}`}
                      onPress={() => share(ad)}
                      style={[styles.actionBtn, styles.actionGhost]}
                    >
                      <Ionicons name="share-social-outline" size={14} color={theme.colors.brand} />
                      <Text style={styles.actionGhostText}>Share</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  gate: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  gateText: { color: theme.colors.onSurface, fontSize: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "800" },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxxl },
  intro: { gap: 6, marginBottom: theme.spacing.md },
  introBrand: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  introText: { color: theme.colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  introHint: { color: theme.colors.muted, fontSize: 11, fontStyle: "italic" },
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: theme.colors.surfaceTertiary,
  },
  image: { width: "100%", height: "100%" },
  cardBody: { padding: theme.spacing.md, gap: 8 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLabel: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 14, flex: 1 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brandTertiary,
  },
  pillText: { color: theme.colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  cardPlatform: { color: theme.colors.muted, fontSize: 11, flex: 1 },
  urlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  urlText: { color: theme.colors.onSurfaceSecondary, fontSize: 11, flex: 1 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
  },
  actionPrimary: { backgroundColor: theme.colors.brand },
  actionGhost: { borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: "transparent" },
  actionBtnText: { color: theme.colors.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  actionGhostText: { color: theme.colors.brand, fontSize: 13, fontWeight: "800" },
});
