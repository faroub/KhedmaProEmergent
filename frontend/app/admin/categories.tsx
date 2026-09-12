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
  Share,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, type IoniconsIconName } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, getAuthToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useT } from "@/src/language";

type Cat = {
  id: string;
  icon: IoniconsIconName;
  name_en: string;
  name_fr: string;
  name_ar: string;
  order: number;
  active: boolean;
};

// Curated Ionicons palette for services categories.
const ICON_PRESETS: (IoniconsIconName)[] = [
  "water", "flash", "sparkles", "hammer", "brush", "color-palette",
  "leaf", "flower", "laptop", "desktop", "briefcase", "school",
  "book", "camera", "cube", "car", "car-sport", "bus",
  "bicycle", "airplane", "boat", "home", "bed", "restaurant",
  "cafe", "cart", "gift", "storefront", "cash", "card",
  "wallet", "fitness", "heart", "medkit", "medical", "bandage",
  "cut", "shirt", "glasses", "musical-notes", "mic", "headset",
  "game-controller", "football", "basketball", "paw", "fish", "wine",
  "pizza", "pint", "ice-cream", "beer",
  "construct", "build", "settings",
  "shield-checkmark", "chatbubbles", "language", "megaphone",
];

export default function AdminCategories() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL, lang } = useT();
  const [items, setItems] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true);
    try {
      const data: any = await api.adminListCategories();
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
    setEditing({ id: "", icon: "grid", name_en: "", name_fr: "", name_ar: "", order: items.length, active: true });
    setEditorOpen(true);
  };

  const exportCategories = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(api.adminExportCategoriesUrl(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Use Share to let the admin save the JSON (email, files app, etc.).
      await Share.share({
        title: "khedmaPro categories export",
        message: text,
      });
    } catch (e: any) {
      Alert.alert("Export failed", e?.message || "Could not export");
    }
  };

  const importCategories = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri);
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        Alert.alert("Invalid file", "Please pick a valid JSON file.");
        return;
      }
      const list = Array.isArray(parsed) ? parsed : parsed.categories;
      if (!Array.isArray(list) || list.length === 0) {
        Alert.alert("Invalid file", "Expected an array of categories.");
        return;
      }
      Alert.alert(
        "Import categories",
        `Found ${list.length} categories. How should we apply them?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Merge (safe)",
            onPress: async () => {
              try {
                const r: any = await api.adminImportCategories({ categories: list, mode: "merge" });
                Alert.alert("Imported", JSON.stringify(r.stats));
                await load();
              } catch (e: any) {
                Alert.alert("Import failed", e?.message || "Failed");
              }
            },
          },
          {
            text: "Replace (destructive)",
            style: "destructive",
            onPress: async () => {
              try {
                const r: any = await api.adminImportCategories({ categories: list, mode: "replace" });
                Alert.alert("Imported", JSON.stringify(r.stats));
                await load();
              } catch (e: any) {
                Alert.alert("Import failed", e?.message || "Failed");
              }
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Could not import");
    }
  };
  const openEdit = (c: Cat) => {
    setEditing({ ...c });
    setEditorOpen(true);
  };

  const remove = (c: Cat) => {
    Alert.alert(t("admin.cat.confirmDelete"), c.name_en, [
      { text: t("account.cancel"), style: "cancel" },
      {
        text: t("admin.users.delete"), style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteCategory(c.id);
            await load();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Failed");
          }
        },
      },
    ]);
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next); // optimistic
    try {
      await api.adminReorderCategories(next.map((c) => c.id));
    } catch {
      load();
    }
  };

  const displayName = (c: Cat) =>
    lang === "fr" ? c.name_fr : lang === "ar" ? c.name_ar : c.name_en;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("admin.cat.title")}</Text>
        <Pressable onPress={exportCategories} hitSlop={10} testID="admin-cat-export" style={styles.iconMini}>
          <Ionicons name="download-outline" size={20} color={theme.colors.onSurface} />
        </Pressable>
        <Pressable onPress={importCategories} hitSlop={10} testID="admin-cat-import" style={styles.iconMini}>
          <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.onSurface} />
        </Pressable>
        <Pressable onPress={openNew} hitSlop={10} testID="admin-cat-add" style={styles.iconMini}>
          <Ionicons name="add-circle" size={24} color={theme.colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xl }} />
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="grid-outline" size={44} color={theme.colors.muted} />
          <Text style={styles.emptyText}>{t("admin.cat.empty")}</Text>
          <Pressable onPress={openNew} style={styles.addFirstBtn}>
            <Text style={styles.addFirstBtnText}>{t("admin.cat.add")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxxl }}>
          {items.map((c, idx) => (
            <View key={c.id} style={[styles.row, !c.active && { opacity: 0.5 }]}>
              <View style={styles.iconBox}>
                <Ionicons name={c.icon} size={22} color={theme.colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{displayName(c)}</Text>
                <Text style={styles.rowSub}>{c.id}</Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => move(idx, -1)} disabled={idx === 0} hitSlop={8} style={styles.iconBtn}>
                  <Ionicons name="chevron-up" size={18} color={idx === 0 ? theme.colors.muted : theme.colors.onSurface} />
                </Pressable>
                <Pressable onPress={() => move(idx, 1)} disabled={idx === items.length - 1} hitSlop={8} style={styles.iconBtn}>
                  <Ionicons name="chevron-down" size={18} color={idx === items.length - 1 ? theme.colors.muted : theme.colors.onSurface} />
                </Pressable>
                <Pressable onPress={() => openEdit(c)} hitSlop={8} style={styles.iconBtn}>
                  <Ionicons name="pencil" size={18} color={theme.colors.brand} />
                </Pressable>
                <Pressable onPress={() => remove(c)} hitSlop={8} style={styles.iconBtn}>
                  <Ionicons name="trash" size={18} color={theme.colors.error} />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Editor sheet */}
      <Modal visible={editorOpen} animationType="slide" transparent onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditorOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editing?.id && items.find((c) => c.id === editing.id) ? t("admin.cat.edit") : t("admin.cat.add")}</Text>
              <Pressable onPress={() => setEditorOpen(false)} hitSlop={12}><Ionicons name="close" size={22} color={theme.colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }} style={{ maxHeight: 500 }}>
              <View>
                <Text style={styles.label}>{t("admin.cat.icon")}</Text>
                <Pressable onPress={() => setIconPickerOpen(true)} style={styles.iconPicker}>
                  <View style={styles.iconPickerBox}>
                    <Ionicons name={editing?.icon || "grid"} size={26} color={theme.colors.brand} />
                  </View>
                  <Text style={styles.iconPickerText}>{editing?.icon}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
                </Pressable>
              </View>

              {!items.find((c) => c.id === editing?.id) && (
                <View>
                  <Text style={styles.label}>{t("admin.cat.id")}</Text>
                  <TextInput
                    testID="cat-id"
                    value={editing?.id}
                    onChangeText={(v) => setEditing((e) => e ? { ...e, id: v.trim().toLowerCase() } : e)}
                    placeholder={t("admin.cat.idPh")}
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                  <Text style={styles.help}>{t("admin.cat.idHelp")}</Text>
                </View>
              )}

              <View>
                <Text style={styles.label}>{t("admin.cat.nameEn")}</Text>
                <TextInput
                  value={editing?.name_en}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, name_en: v } : e)}
                  style={styles.input}
                  placeholderTextColor={theme.colors.muted}
                />
              </View>
              <View>
                <Text style={styles.label}>{t("admin.cat.nameFr")}</Text>
                <TextInput
                  value={editing?.name_fr}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, name_fr: v } : e)}
                  style={styles.input}
                  placeholderTextColor={theme.colors.muted}
                />
              </View>
              <View>
                <Text style={styles.label}>{t("admin.cat.nameAr")}</Text>
                <TextInput
                  value={editing?.name_ar}
                  onChangeText={(v) => setEditing((e) => e ? { ...e, name_ar: v } : e)}
                  style={styles.input}
                  placeholderTextColor={theme.colors.muted}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.label}>{t("admin.cat.active")}</Text>
                <Switch
                  value={!!editing?.active}
                  onValueChange={(v) => setEditing((e) => e ? { ...e, active: v } : e)}
                  trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              </View>
            </ScrollView>

            <Pressable
              testID="cat-save"
              onPress={async () => {
                if (!editing) return;
                const isExisting = items.find((c) => c.id === editing.id);
                if (!editing.id || !editing.name_en || !editing.name_fr || !editing.name_ar || !editing.icon) {
                  Alert.alert("Error", "Please fill all fields");
                  return;
                }
                try {
                  if (isExisting) {
                    await api.adminUpdateCategory(editing.id, {
                      icon: editing.icon,
                      name_en: editing.name_en,
                      name_fr: editing.name_fr,
                      name_ar: editing.name_ar,
                      active: editing.active,
                    });
                  } else {
                    await api.adminCreateCategory({
                      id: editing.id,
                      icon: editing.icon,
                      name_en: editing.name_en,
                      name_fr: editing.name_fr,
                      name_ar: editing.name_ar,
                      active: editing.active,
                    });
                  }
                  setEditorOpen(false);
                  await load();
                } catch (e: any) {
                  Alert.alert("Error", e?.message || "Failed");
                }
              }}
              style={styles.saveBtn}
            >
              <Text style={styles.saveBtnText}>{t("admin.cat.save")}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Icon picker grid */}
      <Modal visible={iconPickerOpen} animationType="slide" transparent onRequestClose={() => setIconPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIconPickerOpen(false)} />
          <View style={[styles.sheet, { maxHeight: "70%" }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{t("admin.cat.pickIcon")}</Text>
              <Pressable onPress={() => setIconPickerOpen(false)} hitSlop={12}><Ionicons name="close" size={22} color={theme.colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.iconGrid}>
              {ICON_PRESETS.map((ico) => {
                const active = editing?.icon === ico;
                return (
                  <Pressable
                    key={ico}
                    testID={`icon-${ico}`}
                    onPress={() => {
                      setEditing((e) => e ? { ...e, icon: ico } : e);
                      setIconPickerOpen(false);
                    }}
                    style={[styles.iconTile, active && styles.iconTileActive]}
                  >
                    <Ionicons name={ico} size={22} color={active ? theme.colors.brand : theme.colors.onSurface} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800", flex: 1 },
  iconMini: { padding: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, fontSize: 14, textAlign: "center" },
  addFirstBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brand },
  addFirstBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowName: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 14 },
  rowSub: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  rowActions: { flexDirection: "row", gap: 4 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8 },

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
  help: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },
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
  iconPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconPickerBox: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: theme.colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  iconPickerText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600", flex: 1 },

  saveBtn: {
    height: 50,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.sm,
  },
  saveBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },

  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  iconTile: {
    width: 52, height: 52, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  iconTileActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
});
