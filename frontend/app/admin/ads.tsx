import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";
import { compressImage } from "@/src/utils/imageCompress";

type Ad = {
  id: string;
  title: string;
  subtitle?: string | null;
  image_url: string;
  link_url?: string | null;
  active: boolean;
  order: number;
  impressions: number;
  clicks: number;
  start_at?: string | null;
  end_at?: string | null;
  impression_cap?: number | null;
};

export default function AdminAds() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useT();
  const [items, setItems] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Ad> | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    try {
      const data: any = await api.adminListAds();
      setItems(data || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [user?.is_admin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!authLoading && !user?.is_admin) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={40} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.forbidden")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const openNew = () => {
    setEditing({ title: "", subtitle: "", image_url: "", link_url: "", active: true, start_at: null, end_at: null, impression_cap: null });
    setEditorOpen(true);
  };
  const openEdit = (a: Ad) => {
    setEditing({ ...a });
    setEditorOpen(true);
  };

  const remove = (a: Ad) => {
    Alert.alert(t("admin.ads.confirmDelete"), a.title, [
      { text: t("account.cancel"), style: "cancel" },
      {
        text: t("admin.users.delete"), style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteAd(a.id);
            await load();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Failed");
          }
        },
      },
    ]);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Photo library access is required to pick an image.");
      return;
    }
    setUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      const res = await compressImage(uri, { initialWidth: 900, initialQuality: 0.75, targetBytes: 300_000 });
      setEditing((e) => e ? { ...e, image_url: res.dataUri } : e);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to pick image");
    } finally {
      setUploading(false);
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
    try {
      await api.adminReorderAds(next.map((a) => a.id));
    } catch {
      load();
    }
  };

  const save = async () => {
    if (!editing || !editing.title || !editing.image_url) {
      Alert.alert("Error", "Title and image are required");
      return;
    }
    // Validate optional dates
    const norm = (v?: string | null) => (v && v.trim() ? v.trim() : null);
    const payload = {
      title: editing.title,
      subtitle: editing.subtitle || null,
      image_url: editing.image_url,
      link_url: editing.link_url || null,
      active: !!editing.active,
      start_at: norm(editing.start_at as any),
      end_at: norm(editing.end_at as any),
      impression_cap: editing.impression_cap && Number(editing.impression_cap) > 0 ? Number(editing.impression_cap) : null,
    };
    try {
      if (editing.id) {
        await api.adminUpdateAd(editing.id, payload);
      } else {
        await api.adminCreateAd(payload);
      }
      setEditorOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed");
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("admin.ads.title")}</Text>
        <Pressable onPress={openNew} hitSlop={12} testID="admin-ads-add">
          <Ionicons name="add-circle" size={26} color={theme.colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="megaphone-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.ads.empty")}</Text>
          <Pressable onPress={openNew} style={styles.addFirstBtn}>
            <Text style={styles.addFirstBtnText}>{t("admin.ads.add")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxxl }}>
          {items.map((a, idx) => {
            const ctr = a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 100) : 0;
            return (
              <View key={a.id} style={[styles.card, !a.active && { opacity: 0.5 }]}>
                <Image source={{ uri: a.image_url }} style={styles.banner} resizeMode="cover" />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{a.title}</Text>
                  {!!a.subtitle && <Text style={styles.cardSub} numberOfLines={1}>{a.subtitle}</Text>}
                  <View style={styles.statsRow}>
                    <View style={styles.stat}><Ionicons name="eye-outline" size={12} color={theme.colors.muted} /><Text style={styles.statText}>{a.impressions}</Text></View>
                    <View style={styles.stat}><Ionicons name="hand-left-outline" size={12} color={theme.colors.muted} /><Text style={styles.statText}>{a.clicks}</Text></View>
                    <View style={styles.stat}><Ionicons name="trending-up-outline" size={12} color={theme.colors.muted} /><Text style={styles.statText}>{ctr}% CTR</Text></View>
                  </View>
                </View>
                <View style={styles.rowActions}>
                  <Pressable onPress={() => move(idx, -1)} disabled={idx === 0} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name="chevron-up" size={18} color={idx === 0 ? theme.colors.muted : theme.colors.onSurface} />
                  </Pressable>
                  <Pressable onPress={() => move(idx, 1)} disabled={idx === items.length - 1} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name="chevron-down" size={18} color={idx === items.length - 1 ? theme.colors.muted : theme.colors.onSurface} />
                  </Pressable>
                  <Pressable onPress={() => openEdit(a)} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name="pencil" size={18} color={theme.colors.brand} />
                  </Pressable>
                  <Pressable onPress={() => remove(a)} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name="trash" size={18} color={theme.colors.error} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Editor */}
      <Modal visible={editorOpen} animationType="slide" transparent onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditorOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editing?.id ? t("admin.ads.edit") : t("admin.ads.add")}</Text>
              <Pressable onPress={() => setEditorOpen(false)} hitSlop={12}><Ionicons name="close" size={22} color={theme.colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }} style={{ maxHeight: 500 }}>
              <View>
                <Text style={styles.label}>{t("admin.ads.image")}</Text>
                <Text style={styles.help}>{t("admin.ads.imageHint")}</Text>
                {editing?.image_url ? (
                  <Image source={{ uri: editing.image_url }} style={styles.previewBanner} resizeMode="cover" />
                ) : (
                  <View style={[styles.previewBanner, styles.previewEmpty]}>
                    <Ionicons name="image-outline" size={30} color={theme.colors.muted} />
                  </View>
                )}
                <Pressable onPress={pickImage} disabled={uploading} style={styles.pickBtn}>
                  {uploading ? (
                    <ActivityIndicator color={theme.colors.brand} />
                  ) : (
                    <>
                      <Ionicons name="image" size={16} color={theme.colors.brand} />
                      <Text style={styles.pickBtnText}>{t("admin.ads.imagePick")}</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.help}>{t("admin.ads.imageUrl")}</Text>
                <TextInput
                  value={editing?.image_url?.startsWith("data:") ? "" : (editing?.image_url || "")}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, image_url: v } : e)}
                  placeholder={t("admin.ads.imageUrlPh")}
                  placeholderTextColor={theme.colors.muted}
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>

              <View>
                <Text style={styles.label}>{t("admin.ads.name")}</Text>
                <TextInput
                  value={editing?.title}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, title: v } : e)}
                  placeholder={t("admin.ads.namePh")}
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  maxLength={80}
                />
              </View>

              <View>
                <Text style={styles.label}>{t("admin.ads.subtitle")}</Text>
                <TextInput
                  value={editing?.subtitle || ""}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, subtitle: v } : e)}
                  placeholder={t("admin.ads.subtitlePh")}
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  maxLength={140}
                />
              </View>

              <View>
                <Text style={styles.label}>{t("admin.ads.linkUrl")}</Text>
                <TextInput
                  value={editing?.link_url || ""}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, link_url: v } : e)}
                  placeholder={t("admin.ads.linkUrlPh")}
                  placeholderTextColor={theme.colors.muted}
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>

              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Start date (optional)</Text>
                  <TextInput
                    value={(editing?.start_at as any) || ""}
                    onChangeText={(v) => setEditing((e) => e ? { ...e, start_at: v } : e)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>End date (optional)</Text>
                  <TextInput
                    value={(editing?.end_at as any) || ""}
                    onChangeText={(v) => setEditing((e) => e ? { ...e, end_at: v } : e)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
              </View>

              <View>
                <Text style={styles.label}>Impression cap (optional)</Text>
                <TextInput
                  value={editing?.impression_cap ? String(editing.impression_cap) : ""}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, impression_cap: v.replace(/[^0-9]/g, "") as any } : e)}
                  placeholder="e.g. 10000 (auto-pauses ad)"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="number-pad"
                  style={styles.input}
                />
                <Text style={styles.help}>Ad auto-pauses once this many views are reached. Leave empty for no cap.</Text>
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.label}>{t("admin.ads.active")}</Text>
                <Switch
                  value={!!editing?.active}
                  onValueChange={(v) => setEditing((e) => e ? { ...e, active: v } : e)}
                  trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              </View>
            </ScrollView>

            <Pressable testID="ad-save" onPress={save} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>{t("admin.ads.save")}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },
  addFirstBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brand },
  addFirstBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },

  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  banner: { width: "100%", height: 110, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surface },
  cardBody: { gap: 4 },
  cardTitle: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 14 },
  cardSub: { color: theme.colors.onSurfaceSecondary, fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  stat: { flexDirection: "row", gap: 4, alignItems: "center" },
  statText: { color: theme.colors.muted, fontSize: 11, fontWeight: "600" },

  rowActions: { flexDirection: "row", gap: 4, justifyContent: "flex-end" },
  iconBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong, marginBottom: 4 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: theme.colors.onSurface, fontWeight: "800", fontSize: 18 },

  label: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  help: { color: theme.colors.muted, fontSize: 11, marginTop: 4, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surface,
    fontSize: 14,
  },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },

  previewBanner: { width: "100%", height: 100, borderRadius: theme.radius.sm, marginBottom: 8, backgroundColor: theme.colors.surface },
  previewEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border, borderStyle: "dashed" },
  pickBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.brand,
    marginBottom: 8,
  },
  pickBtnText: { color: theme.colors.brand, fontWeight: "700", fontSize: 13 },

  saveBtn: {
    height: 50, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
    marginTop: theme.spacing.sm,
  },
  saveBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
});
