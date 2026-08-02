import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { api } from "./api";
import { useT } from "./language";

type Wilaya = { code: string; en: string; fr: string; ar: string };

type Props = {
  value?: string | null; // wilaya code
  onSelect: (code: string, name: string) => void;
  label?: string;
  compact?: boolean;
  testID?: string;
};

export function WilayaPicker({ value, onSelect, label, compact = false, testID = "wilaya-picker" }: Props) {
  const { lang, t } = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);

  useEffect(() => {
    api.wilayas().then((w: any) => setWilayas(w)).catch(() => {});
  }, []);

  const nameFor = (w: Wilaya) => (lang === "fr" ? w.fr : lang === "ar" ? w.ar : w.en);
  const current = value ? wilayas.find((w) => w.code === value) : null;
  const currentLabel = current ? nameFor(current) : label || t("wilaya.select");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wilayas;
    return wilayas.filter(
      (w) =>
        w.en.toLowerCase().includes(q) ||
        w.fr.toLowerCase().includes(q) ||
        w.ar.includes(q) ||
        w.code === q
    );
  }, [wilayas, search]);

  return (
    <>
      <Pressable
        testID={testID}
        style={compact ? styles.compactBtn : styles.fullBtn}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="map" size={compact ? 14 : 18} color={theme.colors.brand} />
        <Text style={compact ? styles.compactText : styles.fullText} numberOfLines={1}>
          {currentLabel}
        </Text>
        {!compact && <Ionicons name="chevron-down" size={16} color={theme.colors.muted} />}
      </Pressable>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.sheetTitle}>{t("wilaya.select")}</Text>
              <Pressable onPress={() => setOpen(false)} testID="wilaya-close-btn">
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>
            <TextInput
              testID="wilaya-search-input"
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder={t("wilaya.searchPh")}
              placeholderTextColor={theme.colors.muted}
              autoCorrect={false}
            />
            <FlatList
              data={filtered}
              keyExtractor={(w) => w.code}
              contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
              renderItem={({ item }) => (
                <Pressable
                  testID={`wilaya-opt-${item.code}`}
                  style={[styles.option, value === item.code && styles.optionActive]}
                  onPress={() => {
                    onSelect(item.code, nameFor(item));
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Text style={styles.optionCode}>{item.code}</Text>
                  <Text style={[styles.optionText, value === item.code && styles.optionTextActive]}>
                    {nameFor(item)}
                  </Text>
                  {value === item.code && <Ionicons name="checkmark" size={18} color={theme.colors.onBrandPrimary} />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, height: 36, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary, borderWidth: 1, borderColor: theme.colors.border,
    flexShrink: 0,
  },
  compactText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600", maxWidth: 120 },
  fullBtn: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md, paddingVertical: 14,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  fullText: { flex: 1, color: theme.colors.onSurface, fontSize: 14, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl, height: "80%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.md },
  sheetTitle: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  search: {
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md, paddingVertical: 12, fontSize: 15,
    color: theme.colors.onSurface, borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  option: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.md,
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary, marginBottom: 6,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  optionActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  optionCode: { color: theme.colors.brand, fontWeight: "800", fontSize: 13, width: 30 },
  optionText: { flex: 1, color: theme.colors.onSurface, fontSize: 15, fontWeight: "600" },
  optionTextActive: { color: theme.colors.onBrandPrimary },
});
