import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LANGS, useT } from "@/src/language";
import { theme } from "@/src/theme";

type Props = {
  compact?: boolean;
  testID?: string;
};

export function LanguageSwitcher({ compact = false, testID = "lang-switcher" }: Props) {
  const { lang, setLang, t } = useT();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang);

  return (
    <>
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={compact ? styles.compactBtn : styles.fullBtn}
      >
        <Ionicons name="globe-outline" size={18} color={theme.colors.brand} />
        <Text style={compact ? styles.compactText : styles.fullText}>{current?.native}</Text>
        {!compact && <Ionicons name="chevron-down" size={16} color={theme.colors.muted} />}
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} testID="lang-backdrop">
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{t("profile.language")}</Text>
            {LANGS.map((l) => (
              <Pressable
                key={l.code}
                testID={`lang-option-${l.code}`}
                onPress={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                style={[styles.option, lang === l.code && styles.optionActive]}
              >
                <Text style={[styles.optionText, lang === l.code && styles.optionTextActive]}>
                  {l.native}
                </Text>
                {lang === l.code && <Ionicons name="checkmark" size={18} color={theme.colors.onBrandPrimary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, height: 36,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(21,30,50,0.75)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.35)",
  },
  compactText: { color: theme.colors.onSurface, fontSize: 12, fontWeight: "600" },
  fullBtn: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md, paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  fullText: { flex: 1, color: theme.colors.onSurface, fontSize: 14, fontWeight: "600" },
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  sheetTitle: {
    color: theme.colors.onSurface, fontSize: 18, fontWeight: "700",
    marginBottom: theme.spacing.md,
  },
  option: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceTertiary,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  optionActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  optionText: { color: theme.colors.onSurface, fontSize: 16, fontWeight: "600" },
  optionTextActive: { color: theme.colors.onBrandPrimary },
});
