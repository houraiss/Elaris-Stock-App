import { Fragment } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

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
  legend?: { primary: string; secondary?: string };
}

const BAR_WIDTH = 28;
const GAP = 16;
const CHART_PADDING_TOP = 24;
const LABEL_HEIGHT = 20;

/** A small, dependency-free grouped bar chart — no external charting library. */
export function BarChart({
  data,
  valueFormatter = (v) => String(v),
  height = 160,
  barColor = '#1a1a1a',
  secondaryColor = '#9ca3af',
  legend,
}: Props) {
  if (data.length === 0) {
    return null;
  }

  const hasSecondary = data.some((d) => d.secondaryValue !== undefined);
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondaryValue ?? 0)));
  const barsAreaHeight = height - CHART_PADDING_TOP - LABEL_HEIGHT;
  const groupWidth = hasSecondary ? BAR_WIDTH * 2 + 4 : BAR_WIDTH;
  const chartWidth = data.length * (groupWidth + GAP);

  return (
    <View>
      {legend && (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: barColor }]} />
            <Text style={styles.legendText}>{legend.primary}</Text>
          </View>
          {legend.secondary && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: secondaryColor }]} />
              <Text style={styles.legendText}>{legend.secondary}</Text>
            </View>
          )}
        </View>
      )}
      <Svg width={Math.max(chartWidth, 200)} height={height}>
        {data.map((d, i) => {
          const x = i * (groupWidth + GAP);
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
                fill={barColor}
              />
              {hasSecondary && (
                <Rect
                  x={x + BAR_WIDTH + 4}
                  y={CHART_PADDING_TOP + barsAreaHeight - secondaryHeight}
                  width={BAR_WIDTH}
                  height={secondaryHeight}
                  rx={3}
                  fill={secondaryColor}
                />
              )}
              <SvgText
                x={x + groupWidth / 2}
                y={CHART_PADDING_TOP + barsAreaHeight + 16}
                fontSize={11}
                fill="#666"
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
              <SvgText
                x={x + groupWidth / 2}
                y={CHART_PADDING_TOP + barsAreaHeight - barHeight - 4}
                fontSize={10}
                fill="#333"
                textAnchor="middle"
              >
                {valueFormatter(d.value)}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#666' },
});
