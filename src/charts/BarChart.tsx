import { Fragment, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';

export interface BarChartDatum {
  label: string;
  value: number;
  secondaryValue?: number; // e.g. cash collected next to booked revenue
}

interface Props {
  data: BarChartDatum[];
  valueFormatter?: (value: number) => string;
  height?: number;
  barColor?: string;
  secondaryColor?: string;
  labelColor?: string;
  valueColor?: string;
  legend?: { primary: string; secondary?: string };
}

const BAR_WIDTH = 28;
const GAP = 16;
const CHART_PADDING_TOP = 24;
const CHART_PADDING_SIDE = 40;
const LABEL_HEIGHT = 20;

/** A small, dependency-free grouped bar chart — no external charting library. */
export function BarChart({
  data,
  valueFormatter = (v) => String(v),
  height = 160,
  barColor,
  secondaryColor,
  labelColor,
  valueColor,
  legend,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resolvedBarColor = barColor ?? colors.primary;
  const resolvedSecondaryColor = secondaryColor ?? colors.silver;
  const resolvedLabelColor = labelColor ?? colors.inkSoft;
  const resolvedValueColor = valueColor ?? colors.ink;

  if (data.length === 0) {
    return null;
  }

  const hasSecondary = data.some((d) => d.secondaryValue !== undefined);
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondaryValue ?? 0)));
  const barsAreaHeight = height - CHART_PADDING_TOP - LABEL_HEIGHT;
  const groupWidth = hasSecondary ? BAR_WIDTH * 2 + 4 : BAR_WIDTH;
  const chartWidth = CHART_PADDING_SIDE * 2 + data.length * (groupWidth + GAP) - GAP;

  return (
    <View>
      {legend && (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: resolvedBarColor }]} />
            <Text style={styles.legendText}>{legend.primary}</Text>
          </View>
          {legend.secondary && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: resolvedSecondaryColor }]} />
              <Text style={styles.legendText}>{legend.secondary}</Text>
            </View>
          )}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={Math.max(chartWidth, 200)} height={height}>
          {data.map((d, i) => {
            const x = CHART_PADDING_SIDE + i * (groupWidth + GAP);
            const barHeight = Math.max(2, (d.value / maxValue) * barsAreaHeight);
            const secondaryHeight =
              d.secondaryValue !== undefined ? Math.max(2, (d.secondaryValue / maxValue) * barsAreaHeight) : 0;

            return (
              <Fragment key={d.label}>
                <Rect
                  x={x}
                  y={CHART_PADDING_TOP + barsAreaHeight - barHeight}
                  width={BAR_WIDTH}
                  height={barHeight}
                  rx={3}
                  fill={resolvedBarColor}
                />
                {hasSecondary && (
                  <Rect
                    x={x + BAR_WIDTH + 4}
                    y={CHART_PADDING_TOP + barsAreaHeight - secondaryHeight}
                    width={BAR_WIDTH}
                    height={secondaryHeight}
                    rx={3}
                    fill={resolvedSecondaryColor}
                  />
                )}
                <SvgText
                  x={x + groupWidth / 2}
                  y={CHART_PADDING_TOP + barsAreaHeight + 16}
                  fontSize={11}
                  fill={resolvedLabelColor}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
                <SvgText
                  x={x + groupWidth / 2}
                  y={CHART_PADDING_TOP + barsAreaHeight - barHeight - 4}
                  fontSize={10}
                  fill={resolvedValueColor}
                  textAnchor="middle"
                >
                  {valueFormatter(d.value)}
                </SvgText>
              </Fragment>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    legendRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, color: colors.inkSoft },
  });
