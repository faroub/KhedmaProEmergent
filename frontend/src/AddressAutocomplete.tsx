import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { theme } from "./theme";
import { useT } from "./language";
import { searchAddress, Suggestion } from "./geocode";

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  testID?: string;
};

export function AddressAutocomplete({ value, onChangeText, placeholder, testID }: Props) {
  const { t, lang } = useT();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<any>(null);
  const lastQueryRef = useRef<string>("");

  useEffect(() => {
    if (!focused) return;
    if (!value || value.trim().length < 3) {
      setItems([]);
      return;
    }
    if (value === lastQueryRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = value;
      const res = await searchAddress(value, lang);
      setItems(res);
      setLoading(false);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, focused, lang]);

  const dropdown = useMemo(() => {
    if (!focused) return null;
    if (loading) {
      return (
        <View style={styles.dropdown}>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.brand} />
            <Text style={styles.loadingText}>{t("address.searching")}</Text>
          </View>
        </View>
      );
    }
    if (items.length === 0) return null;
    return (
      <View style={styles.dropdown} testID="address-suggestions">
        {items.slice(0, 5).map((it, idx) => (
          <Pressable
            key={`${it.lat}-${it.lon}-${idx}`}
            testID={`address-suggestion-${idx}`}
            style={styles.item}
            onPress={() => {
              onChangeText(it.display_name);
              setItems([]);
              setFocused(false);
            }}
          >
            <Ionicons name="location-outline" size={16} color={theme.colors.brand} />
            <Text style={styles.itemText} numberOfLines={2}>
              {it.display_name}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }, [focused, items, loading, onChangeText, t]);

  return (
    <View>
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
      />
      {dropdown}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.onSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: theme.colors.surfaceTertiary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  itemText: { color: theme.colors.onSurface, fontSize: 13, flex: 1 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: theme.spacing.md },
  loadingText: { color: theme.colors.muted, fontSize: 13 },
});
