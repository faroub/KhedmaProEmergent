import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { api } from "./api";
import { useAuth } from "./auth";
import { theme } from "./theme";
import { useT } from "./language";

type Props = { onChange?: (imgs: string[]) => void };

const MAX_IMAGES = 12;

export function PortfolioManager({ onChange }: Props) {
  const { user, refresh } = useAuth();
  const { t } = useT();
  const [images, setImages] = useState<string[]>(user?.portfolio_images || []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setImages(user?.portfolio_images || []);
  }, [user?.portfolio_images]);

  const persist = async (list: string[]) => {
    setImages(list);
    onChange?.(list);
    try {
      await api.updatePortfolio(list);
      await refresh();
    } catch {}
  };

  const pick = async () => {
    if (busy || images.length >= MAX_IMAGES) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setBusy(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) {
        setBusy(false);
        return;
      }
      const asset = result.assets[0];
      // Compress locally with expo-image-manipulator: 1200 px wide, quality 0.7 JPEG, base64 out.
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const dataUri = `data:image/jpeg;base64,${compressed.base64}`;
      await persist([...images, dataUri]);
    } catch (e) {
      // no-op
    } finally {
      setBusy(false);
    }
  };

  const remove = async (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    await persist(next);
  };

  return (
    <View style={styles.wrap} testID="portfolio-manager">
      <View style={styles.header}>
        <Text style={styles.title}>{t("portfolio.title")}</Text>
        <Text style={styles.limit}>{images.length}/{MAX_IMAGES} · {t("portfolio.limit")}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {images.map((uri, idx) => (
          <View key={`${idx}-${uri.length}`} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} contentFit="cover" testID={`portfolio-thumb-${idx}`} />
            <Pressable
              testID={`portfolio-remove-${idx}`}
              style={styles.removeBtn}
              onPress={() => remove(idx)}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {images.length < MAX_IMAGES && (
          <Pressable
            testID="portfolio-add-btn"
            style={styles.addBtn}
            onPress={pick}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.brand} />
            ) : (
              <>
                <Ionicons name="add" size={28} color={theme.colors.brand} />
                <Text style={styles.addText}>{t("portfolio.add")}</Text>
              </>
            )}
          </Pressable>
        )}
      </ScrollView>
      {images.length === 0 && !busy && (
        <Text style={styles.emptyHint}>{t("portfolio.empty")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },
  limit: { color: theme.colors.muted, fontSize: 11 },
  thumbWrap: { width: 100, height: 100, borderRadius: theme.radius.md, overflow: "hidden", position: "relative" },
  thumb: { width: "100%", height: "100%", backgroundColor: theme.colors.surfaceSecondary },
  removeBtn: {
    position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center",
  },
  addBtn: {
    width: 100, height: 100, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.brand, borderStyle: "dashed",
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center", gap: 2,
  },
  addText: { color: theme.colors.brand, fontSize: 12, fontWeight: "600" },
  emptyHint: { color: theme.colors.muted, fontSize: 12, textAlign: "center", paddingVertical: theme.spacing.sm },
});
