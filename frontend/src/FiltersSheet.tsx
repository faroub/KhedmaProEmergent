import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { useT } from "./language";

export type FiltersState = {
  scope: string;      // one of "2","5","10","25","50","wilaya","country"
  category: string | null;
  verifiedOnly?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  state: FiltersState;
  scopeOptions: DropdownOption[];
  categoryOptions: DropdownOption[];
  onApply: (next: FiltersState) => void;
  /** Reset to defaults callback. */
  onReset?: () => void;
};

/**
 * Full-screen bottom sheet holding every browse filter. Uses local state so
 * users can pick a distance + category without triggering a refetch on every
 * tap; the parent gets the final tuple via `onApply`.
 */
export function FiltersSheet({
  visible,
  onClose,
  state,
  scopeOptions,
  categoryOptions,
  onApply,
  onReset,
}: Props) {
  const { t } = useT();
  const [local, setLocal] = useState<FiltersState>(state);

  // Sync local state whenever the sheet is (re)opened with a new external state.
  React.useEffect(() => {
    if (visible) setLocal(state);
  }, [visible, state]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{t("filters.title")}</Text>
            <Pressable onPress={onClose} hitSlop={12} testID="filters-close-btn">
              <Ionicons name="close" size={22} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.xxl }}>
            <View>
              <Text style={styles.fieldLabel}>{t("filters.distance")}</Text>
              <Dropdown
                testID="filter-scope-dropdown"
                triggerIcon="locate-outline"
                value={local.scope}
                placeholder={t("home.scope.filterBy")}
                sheetTitle={t("home.scope.filterBy")}
                onSelect={(v) => setLocal((s) => ({ ...s, scope: (v || "5") }))}
                options={scopeOptions}
              />
            </View>

            <View>
              <Text style={styles.fieldLabel}>{t("filters.category")}</Text>
              <Dropdown
                testID="filter-category-dropdown"
                triggerIcon="grid-outline"
                value={local.category}
                placeholder={t("home.categoryFilter")}
                sheetTitle={t("home.categories")}
                allowNull
                allowNullLabel={t("home.all")}
                onSelect={(v) => setLocal((s) => ({ ...s, category: v }))}
                options={categoryOptions}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t("filters.verifiedOnly")}</Text>
                <Text style={styles.fieldHint}>{t("filters.verifiedOnlySub")}</Text>
              </View>
              <Switch
                testID="filter-verified-toggle"
                value={!!local.verifiedOnly}
                onValueChange={(v) => setLocal((s) => ({ ...s, verifiedOnly: v }))}
                trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            {onReset && (
              <Pressable
                onPress={() => {
                  onReset();
                  onClose();
                }}
                style={[styles.actionBtn, styles.ghost]}
                testID="filters-reset-btn"
              >
                <Text style={styles.actionBtnGhostText}>{t("filters.reset")}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                onApply(local);
                onClose();
              }}
              style={[styles.actionBtn, styles.primary]}
              testID="filters-apply-btn"
            >
              <Text style={styles.actionBtnText}>{t("filters.apply")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The pill button that opens the FiltersSheet, showing a badge with the number
 * of active non-default filters.
 */
export function FiltersPill({
  activeCount,
  onPress,
  testID = "filters-pill",
  label,
}: {
  activeCount: number;
  onPress: () => void;
  testID?: string;
  label: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.pill} testID={testID}>
      <Ionicons name="options-outline" size={16} color={theme.colors.brand} />
      <Text style={styles.pillText}>{label}</Text>
      {activeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    maxHeight: "80%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: "800" },
  fieldLabel: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 13, marginBottom: 6 },
  fieldHint: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: theme.colors.brand },
  ghost: { borderWidth: 1, borderColor: theme.colors.border },
  actionBtnText: { color: theme.colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  actionBtnGhostText: { color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  pillText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "700" },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: theme.colors.onBrandPrimary, fontSize: 11, fontWeight: "800" },
});
