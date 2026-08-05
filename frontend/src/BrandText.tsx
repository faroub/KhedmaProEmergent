import React from "react";
import { Text, TextStyle, StyleProp } from "react-native";
import { theme } from "./theme";

type Props = {
  style?: StyleProp<TextStyle>;
  proColor?: string;
  testID?: string;
};

/**
 * Renders the "khedmaPro" wordmark with the trailing "Pro" tinted in the
 * brand amber. Accepts a `style` for size/weight tweaks so it can be dropped
 * anywhere. Pass `proColor` to override the accent color.
 */
export function BrandText({ style, proColor, testID }: Props) {
  const accent = proColor || theme.colors.brand;
  return (
    <Text style={style} testID={testID}>
      khedma
      <Text style={{ color: accent }}>Pro</Text>
    </Text>
  );
}
