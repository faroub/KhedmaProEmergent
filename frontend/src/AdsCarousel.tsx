import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Linking, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "./api";
import { theme } from "./theme";

type Ad = {
  id: string;
  title: string;
  subtitle?: string | null;
  image_url: string;
  link_url?: string | null;
};

const CARD_MARGIN = theme.spacing.xl;
const CARD_WIDTH = Dimensions.get("window").width - CARD_MARGIN * 2;

export function AdsCarousel({ testID = "ads-carousel" }: { testID?: string }) {
  const [ads, setAds] = useState<Ad[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    api
      .listAds()
      .then((res: any) => setAds(Array.isArray(res) ? res : []))
      .catch(() => setAds([]));
  }, []);

  const onViewableChanged = useCallback(({ viewableItems }: any) => {
    viewableItems.forEach((v: any) => {
      const ad = v.item as Ad;
      if (!ad || seenRef.current.has(ad.id)) return;
      seenRef.current.add(ad.id);
      api.adImpression(ad.id);
    });
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;

  if (ads.length === 0) return null;

  return (
    <View testID={testID} style={styles.wrap}>
      <FlatList
        horizontal
        data={ads}
        keyExtractor={(a) => a.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + theme.spacing.sm}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: CARD_MARGIN, gap: theme.spacing.sm }}
        onViewableItemsChanged={onViewableChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => <AdCard ad={item} />}
      />
    </View>
  );
}

function AdCard({ ad }: { ad: Ad }) {
  const onPress = () => {
    api.adClick(ad.id);
    if (ad.link_url) {
      Linking.openURL(ad.link_url).catch(() => {});
    }
  };
  return (
    <Pressable
      testID={`ad-${ad.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="link"
      accessibilityLabel={ad.title}
    >
      <Image source={{ uri: ad.image_url }} style={styles.image} contentFit="cover" />
      <LinearGradient
        colors={["rgba(11,17,32,0.05)", "rgba(11,17,32,0.90)"]}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.body}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PARTNER</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{ad.title}</Text>
        {!!ad.subtitle && <Text style={styles.subtitle} numberOfLines={2}>{ad.subtitle}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: theme.spacing.md },
  card: {
    width: CARD_WIDTH,
    height: 120,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  body: { position: "absolute", left: 0, right: 0, bottom: 0, padding: theme.spacing.md, gap: 4 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(212, 175, 55, 0.85)",
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  badgeText: { color: "#0B1120", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  title: { color: "#fff", fontSize: 15, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
});
