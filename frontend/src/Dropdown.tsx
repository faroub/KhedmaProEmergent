import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";

export type DropdownOption = {
  value: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional trailing text (e.g., "5 km"). */
  hint?: string;
};

type Props = {
  value?: string | null;
  onSelect: (value: string | null) => void;
  options: DropdownOption[];
  /** Placeholder / label when nothing is selected. */
  placeholder: string;
  /** Sheet header title. Defaults to `placeholder`. */
  sheetTitle?: string;
  /** Optional "All" entry (null value). Set true to show it above options. */
  allowNull?: boolean;
  allowNullLabel?: string;
  /** Optional search input in the sheet. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Trigger button icon (defaults to grid). */
  triggerIcon?: keyof typeof Ionicons.glyphMap;
  /** Small pill vs full-width row. */
  compact?: boolean;
  disabled?: boolean;
  testID?: string;
};

/**
 * Native-feeling dropdown backed by a bottom sheet — matches the WilayaPicker
 * UX pattern used elsewhere in the app. Renders a pill/row that opens a
 * scrollable options sheet with an optional search input.
 */
export function Dropdown({
  value,
  onSelect,
  options,
  placeholder,
  sheetTitle,
  allowNull = false,
  allowNullLabel = "All",
  searchable = false,
  searchPlaceholder = "Search…",
  triggerIcon = "grid-outline",
  compact = false,
  disabled = false,
  testID = "dropdown",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const current = value ? options.find((o) => o.value === value) : null;
  const label = current ? current.label : allowNull && value === null ? allowNullLabel : placeholder;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, search]);

  return (
    <>
      <Pressable
        testID={testID}
        onPress={() => !disabled && setOpen(true)}
        style={[compact ? styles.compactBtn : styles.fullBtn, disabled && { opacity: 0.5 }]}
      >
        {current?.icon || triggerIcon ? (
          <Ionicons
            name={(current?.icon || triggerIcon) as any}
            size={compact ? 14 : 18}
            color={theme.colors.brand}
          />
        ) : null}
        <Text style={compact ? styles.compactText : styles.fullText} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 14 : 16} color={theme.colors.muted} />
      </Pressable>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.sheetTitle}>{sheetTitle || placeholder}</Text>
              <Pressable onPress={() => setOpen(false)} testID={`${testID}-close-btn`} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>
            {searchable && (
              <TextInput
                testID={`${testID}-search-input`}
                style={styles.search}
                value={search}
                onChangeText={setSearch}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.colors.muted}
                autoCorrect={false}
                autoCapitalize="none"
              />
            )}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
              ListHeaderComponent={
                allowNull ? (
                  <Pressable
                    testID={`${testID}-opt-all`}
                    style={[styles.option, !value && styles.optionActive]}
                    onPress={() => {
                      onSelect(null);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Ionicons
                      name="apps"
                      size={18}
                      color={!value ? theme.colors.onBrandPrimary : theme.colors.brand}
                    />
                    <Text
                      style={[styles.optionText, !value && styles.optionTextActive]}
                    >
                      {allowNullLabel}
                    </Text>
                    {!value && (
                      <Ionicons name="checkmark" size={18} color={theme.colors.onBrandPrimary} />
                    )}
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    testID={`${testID}-opt-${item.value}`}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      onSelect(item.value);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    {item.icon && (
                      <Ionicons
                        name={item.icon as any}
                        size={18}
                        color={active ? theme.colors.onBrandPrimary : theme.colors.brand}
                      />
                    )}
                    <Text
                      style={[styles.optionText, active && styles.optionTextActive]}
                    >
                      {item.label}
                    </Text>
                    {item.hint && (
                      <Text
                        style={[
                          styles.optionHint,
                          active && { color: theme.colors.onBrandPrimary },
                        ]}
                      >
                        {item.hint}
                      </Text>
                    )}
                    {active && (
                      <Ionicons name="checkmark" size={18} color={theme.colors.onBrandPrimary} />
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>—</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexShrink: 0,
  },
  compactText: { color: theme.colors.onSurface, fontSize: 13, fontWeight: "600", maxWidth: 140 },
  fullBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fullText: { flex: 1, color: theme.colors.onSurface, fontSize: 14, fontWeight: "600" },

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
  sheetTitle: { color: theme.colors.onSurface, fontSize: 18, fontWeight: "800" },
  search: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.onSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  optionText: { flex: 1, color: theme.colors.onSurface, fontSize: 15, fontWeight: "600" },
  optionTextActive: { color: theme.colors.onBrandPrimary },
  optionHint: { color: theme.colors.onSurfaceTertiary, fontSize: 12 },
  empty: { color: theme.colors.muted, textAlign: "center", padding: theme.spacing.xl },
});
