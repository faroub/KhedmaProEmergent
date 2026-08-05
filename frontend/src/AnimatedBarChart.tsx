import React, { useState } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { theme } from "./theme";

export type BarPoint = {
  /** X-axis label (rendered under the bar) */
  label: string;
  /** Bar height metric */
  value: number;
  /** Optional secondary label shown on tooltip */
  tooltip?: string;
  /** Optional per-bar color override */
  color?: string;
};

type Props = {
  data: BarPoint[];
  /** Height of the chart area in px. Default 160. */
  height?: number;
  /** Format the on-bar / tooltip value (e.g. `${v} DA` or `${v.toLocaleString()}`). */
  formatValue?: (v: number) => string;
  /** Show the topmost value on top of each bar. */
  showTopLabel?: boolean;
  /** Bar color (falls back to theme.brand). */
  color?: string;
  /** Bar width. Default 14. */
  barWidth?: number;
  /** Test ID */
  testID?: string;
};

/**
 * Animated bar chart wrapper around `react-native-gifted-charts`.
 * - Tap a bar to see a tooltip with the formatted value.
 * - Bars animate in on mount and when data updates.
 * - Empty x-axis labels every 2 bars to avoid clipping on narrow devices.
 */
export function AnimatedBarChart({
  data,
  height = 160,
  formatValue = (v) => String(v),
  showTopLabel = false,
  color,
  barWidth = 14,
  testID = "animated-bar-chart",
}: Props) {
  const [focused, setFocused] = useState<number | null>(null);
  const brand = color || theme.colors.brand;
  const max = Math.max(1, ...data.map((d) => d.value));

  // Prepare gifted-charts data. Every second label to reduce clutter.
  const chartData = data.map((d, i) => ({
    value: d.value,
    label: i % 2 === 0 ? d.label : "",
    frontColor: d.color || brand,
    topLabelComponent: () =>
      showTopLabel && d.value > 0 ? (
        <Text style={styles.topLabel}>{formatValue(d.value)}</Text>
      ) : null,
    onPress: () => setFocused(focused === i ? null : i),
  }));

  const screenW = Dimensions.get("window").width;
  // Leave 32px for padding + 40 for Y-axis.
  const availableW = screenW - 32 - 40;
  const spacing = Math.max(4, Math.min(20, (availableW - data.length * barWidth) / Math.max(1, data.length - 1)));

  return (
    <View testID={testID} style={styles.wrap}>
      <BarChart
        data={chartData}
        width={availableW}
        height={height}
        barWidth={barWidth}
        spacing={spacing}
        initialSpacing={4}
        endSpacing={4}
        barBorderRadius={3}
        hideYAxisText
        yAxisThickness={0}
        xAxisThickness={0}
        xAxisLabelTextStyle={styles.axisLabel}
        maxValue={max * 1.15}
        isAnimated
        animationDuration={600}
        noOfSections={3}
        rulesColor={theme.colors.border}
        rulesType="solid"
        renderTooltip={(item: any, idx: number) =>
          focused === idx ? (
            <View style={styles.tooltip}>
              <Text style={styles.tooltipVal}>{formatValue(item.value)}</Text>
              {data[idx].tooltip ? <Text style={styles.tooltipSub}>{data[idx].tooltip}</Text> : null}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingLeft: 4, paddingTop: 24 },
  topLabel: {
    color: theme.colors.onSurface,
    fontSize: 9,
    fontWeight: "800",
    marginBottom: 2,
    minWidth: 30,
    textAlign: "center",
  },
  axisLabel: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: "600",
  },
  tooltip: {
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.onSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 60,
    alignItems: "center",
  },
  tooltipVal: { color: theme.colors.surface, fontWeight: "800", fontSize: 12 },
  tooltipSub: { color: theme.colors.onSurfaceSecondary, fontSize: 10, marginTop: 2 },
});
