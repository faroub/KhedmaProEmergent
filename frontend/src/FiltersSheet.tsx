import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Switch,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons, type IoniconsIconName } from "@react-native-vector-icons/ionicons";
import { theme } from "./theme";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { useT } from "./language";

export type SortKey = "auto" | "rating" | "distance" | "price_asc" | "price_desc" | "newest";

export type FiltersState = {
  scope: string;      // one of "2","5","10","25","50","wilaya","country"
  category: string | null;
  verifiedOnly?: boolean;
  newOnly?: boolean;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: SortKey;
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
  const [minPriceStr, setMinPriceStr] = useState<string>(
    state.minPrice != null ? String(state.minPrice) : ""
  );
  const [maxPriceStr, setMaxPriceStr] = useState<string>(
    state.maxPrice != null ? String(state.maxPrice) : ""
  );

  // Sync local state whenever the sheet is (re)opened with a new external state.
  React.useEffect(() => {
    if (visible) {
      setLocal(state);
      setMinPriceStr(state.minPrice != null ? String(state.minPrice) : "");
      setMaxPriceStr(state.maxPrice != null ? String(state.maxPrice) : "");
    }
  }, [visible, state]);

  const sortOptions: { key: SortKey; label: string; icon: IoniconsIconName }[] = useMemo(
    () => [
      { key: "rating", label: t("filters.sortRating"), icon: "star" },
      { key: "distance", label: t("filters.sortDistance"), icon: "navigate" },
      { key: "newest", label: t("filters.sortNewest"), icon: "sparkles" },
      { key: "price_asc", label: t("filters.sortPriceAsc"), icon: "trending-down" },
      { key: "price_desc", label: t("filters.sortPriceDesc"), icon: "trending-up" },
    ],
    [t]
  );

  const parsePrice = (s: string): number | null => {
    const n = parseInt(s.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const commitAndApply = () => {
    Keyboard.dismiss();
    const min = parsePrice(minPriceStr);
    const max = parsePrice(maxPriceStr);
    // Ensure min <= max if both set.
    const clampedMax = max != null && min != null && max < min ? min : max;
    onApply({ ...local, minPrice: min, maxPrice: clampedMax });
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{t("filters.title")}</Text>
            <Pressable onPress={onClose} hitSlop={12} testID="filters-close-btn">
              <Ionicons name="close" size={22} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.xxl }}
            keyboardShouldPersistTaps="handled"
          >
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

            {/* Price range */}
            <View>
              <Text style={styles.fieldLabel}>{t("filters.priceRange")}</Text>
              <Text style={styles.fieldHint}>{t("filters.priceRangeSub")}</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.priceInputPrefix}>{t("filters.priceMin")}</Text>
                  <TextInput
                    testID="filter-min-price"
                    value={minPriceStr}
                    onChangeText={(v) => setMinPriceStr(v.replace(/[^\d]/g, "").slice(0, 7))}
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.priceInput}
                  />
                  <Text style={styles.priceInputSuffix}>{t("filters.priceCurrency")}</Text>
                </View>
                <Text style={styles.priceDash}>—</Text>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.priceInputPrefix}>{t("filters.priceMax")}</Text>
                  <TextInput
                    testID="filter-max-price"
                    value={maxPriceStr}
                    onChangeText={(v) => setMaxPriceStr(v.replace(/[^\d]/g, "").slice(0, 7))}
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="∞"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.priceInput}
                  />
                  <Text style={styles.priceInputSuffix}>{t("filters.priceCurrency")}</Text>
                </View>
              </View>
            </View>

            {/* Sort chips */}
            <View>
              <Text style={styles.fieldLabel}>{t("filters.sortBy")}</Text>
              <View style={styles.sortRow}>
                {sortOptions.map((opt) => {
                  const active = (local.sort ?? "auto") === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      testID={`filter-sort-${opt.key}`}
                      onPress={() =>
                        setLocal((s) => ({ ...s, sort: active ? "auto" : opt.key }))
                      }
                      style={[styles.sortChip, active && styles.sortChipActive]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={13}
                        color={active ? theme.colors.onBrandPrimary : theme.colors.brand}
                      />
                      <Text
                        style={[styles.sortChipText, active && styles.sortChipTextActive]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t("filters.newOnly")}</Text>
                <Text style={styles.fieldHint}>{t("filters.newOnlySub")}</Text>
              </View>
              <Switch
                testID="filter-new-toggle"
                value={!!local.newOnly}
                onValueChange={(v) => setLocal((s) => ({ ...s, newOnly: v }))}
                trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            {onReset && (
              <Pressable
                onPress={() => {
                  setMinPriceStr("");
                  setMaxPriceStr("");
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
              onPress={commitAndApply}
              style={[styles.actionBtn, styles.primary]}
              testID="filters-apply-btn"
            >
              <Text style={styles.actionBtnText}>{t("filters.apply")}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "85%",
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
  fieldHint: { color: theme.colors.muted, fontSize: 11, marginTop: 2, marginBottom: 6 },
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

  // Price range
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  priceInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  priceInputPrefix: { color: theme.colors.muted, fontSize: 11, fontWeight: "700" },
  priceInput: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 0,
    textAlign: "center",
  },
  priceInputSuffix: { color: theme.colors.brand, fontSize: 11, fontWeight: "800" },
  priceDash: { color: theme.colors.muted, fontSize: 14, fontWeight: "700" },

  // Sort chips
  sortRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sortChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  sortChipText: { color: theme.colors.onSurface, fontSize: 12, fontWeight: "700" },
  sortChipTextActive: { color: theme.colors.onBrandPrimary },

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
