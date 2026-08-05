import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";

type Social = {
  facebook_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
};

type Props = {
  compact?: boolean;
  color?: string;
  testID?: string;
  label?: string;
};

// Tiny module-level cache so we don't refetch on every mount.
let _cache: Social | null = null;

/**
 * Renders Facebook / Instagram / TikTok icons that link to the URLs
 * configured by the admin under Platform Settings → Social media.
 * Renders nothing when no URLs are configured — so the layout collapses
 * cleanly for early-stage deployments.
 */
export function SocialLinksRow({ compact = false, color, testID = "social-links-row", label }: Props) {
  const [social, setSocial] = useState<Social | null>(_cache);

  useEffect(() => {
    let cancelled = false;
    // Use fetch directly rather than the `api` helper to keep this component
    // dependency-light and let it work on the marketing HTML side later.
    (async () => {
      try {
        const url =
          (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api/public/settings";
        const resp = await fetch(url);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled) {
          _cache = data.social || {};
          setSocial(_cache);
        }
      } catch {
        // Silent — social links are non-critical.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!social) return null;
  const items: { key: keyof Social; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "facebook_url", icon: "logo-facebook" },
    { key: "instagram_url", icon: "logo-instagram" },
    { key: "tiktok_url", icon: "logo-tiktok" },
  ];
  const active = items.filter((it) => !!social[it.key]);
  if (active.length === 0) return null;

  const iconColor = color || theme.colors.onSurface;

  return (
    <View style={compact ? styles.rowCompact : styles.row} testID={testID}>
      {label ? <Text style={[styles.label, { color: iconColor }]}>{label}</Text> : null}
      <View style={styles.iconsRow}>
        {active.map((it) => (
          <Pressable
            key={it.key}
            testID={`social-${it.key.replace("_url", "")}`}
            onPress={() => {
              const url = social[it.key];
              if (url) Linking.openURL(url).catch(() => {});
            }}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Ionicons name={it.icon} size={compact ? 18 : 22} color={iconColor} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  rowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  iconsRow: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center" },
  iconBtn: { padding: 4 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    opacity: 0.75,
    marginRight: theme.spacing.sm,
    letterSpacing: 0.3,
  },
});
