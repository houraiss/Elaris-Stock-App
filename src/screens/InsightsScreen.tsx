import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  getRevenueByMonth,
  getRealisedMarkupVsRuleTable,
  getSalesBreakdown,
  getCostTrendsByMaterial,
  getRingSizePopularity,
  getDeadStock,
  type MonthlyRevenue,
  type MarkupComparison,
  type SalesBreakdownRow,
  type SalesBreakdownDimension,
  type CostTrendSeries,
  type RingSizePopularity,
  type DeadStockRow,
} from '../db/repositories/insights';
import { BarChart } from '../charts/BarChart';
import { formatMad } from '../utils/money';

type Props = NativeStackScreenProps<RootStackParamList, 'Insights'>;

const DIMENSIONS: SalesBreakdownDimension[] = ['material', 'category', 'channel'];

export function InsightsScreen(_props: Props) {
  const { t } = useTranslation();
  const [revenue, setRevenue] = useState<MonthlyRevenue[]>([]);
  const [markupComparison, setMarkupComparison] = useState<MarkupComparison[]>([]);
  const [breakdownDimension, setBreakdownDimension] = useState<SalesBreakdownDimension>('material');
  const [breakdown, setBreakdown] = useState<SalesBreakdownRow[]>([]);
  const [costTrends, setCostTrends] = useState<CostTrendSeries[]>([]);
  const [ringSizes, setRingSizes] = useState<RingSizePopularity[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockRow[]>([]);

  const load = useCallback(async () => {
    const [rev, markup, cost, sizes, dead] = await Promise.all([
      getRevenueByMonth(6),
      getRealisedMarkupVsRuleTable(),
      getCostTrendsByMaterial(6),
      getRingSizePopularity(),
      getDeadStock(90),
    ]);
    setRevenue(rev);
    setMarkupComparison(markup);
    setCostTrends(cost);
    setRingSizes(sizes);
    setDeadStock(dead);
  }, []);

  const loadBreakdown = useCallback(async (dimension: SalesBreakdownDimension) => {
    setBreakdown(await getSalesBreakdown(dimension));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadBreakdown(breakdownDimension);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  function handleDimensionChange(dimension: SalesBreakdownDimension) {
    setBreakdownDimension(dimension);
    loadBreakdown(dimension);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>{t('insights.revenueOverTime')}</Text>
      <BarChart
        data={revenue.map((r) => ({ label: r.month, value: r.bookedCentimes, secondaryValue: r.cashCentimes }))}
        valueFormatter={formatMad}
        legend={{ primary: t('insights.booked'), secondary: t('insights.cashCollected') }}
      />

      <Text style={styles.sectionTitle}>{t('insights.realisedMarkup')}</Text>
      {markupComparison.length === 0 ? (
        <Text style={styles.emptyText}>{t('insights.noSalesYet')}</Text>
      ) : (
        markupComparison.map((row) => (
          <View key={row.label} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowLabel}>{row.label}</Text>
              <Text style={styles.listRowSub}>{t('insights.itemsSold', { count: row.itemCount })}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.listRowValue}>
                {(row.realisedBps / 100).toFixed(1)}% {t('insights.actual')}
              </Text>
              <Text style={styles.listRowSub}>{(row.ruleBps / 100).toFixed(1)}% {t('insights.rule')}</Text>
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t('insights.salesBreakdown')}</Text>
      <View style={styles.chipRow}>
        {DIMENSIONS.map((d) => (
          <Pressable key={d} style={[styles.chip, breakdownDimension === d && styles.chipActive]} onPress={() => handleDimensionChange(d)}>
            <Text style={[styles.chipText, breakdownDimension === d && styles.chipTextActive]}>{t(`insights.dimension_${d}`)}</Text>
          </Pressable>
        ))}
      </View>
      <BarChart data={breakdown.slice(0, 6).map((b) => ({ label: b.label, value: b.totalCentimes }))} valueFormatter={formatMad} />

      <Text style={styles.sectionTitle}>{t('insights.costTrends')}</Text>
      {costTrends.length === 0 ? (
        <Text style={styles.emptyText}>{t('insights.noPurchasesYet')}</Text>
      ) : (
        costTrends.map((series) => (
          <View key={series.materialName} style={{ marginBottom: 16 }}>
            <Text style={styles.subLabel}>{series.materialName}</Text>
            <BarChart data={series.points.map((p) => ({ label: p.month, value: p.avgCostPerGramCentimes }))} valueFormatter={formatMad} />
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>{t('insights.ringSizes')}</Text>
      {ringSizes.length === 0 ? (
        <Text style={styles.emptyText}>{t('insights.noSalesYet')}</Text>
      ) : (
        <BarChart data={ringSizes.map((r) => ({ label: r.label, value: r.qtySold }))} valueFormatter={(v) => String(v)} />
      )}

      <Text style={styles.sectionTitle}>{t('insights.deadStock')}</Text>
      {deadStock.length === 0 ? (
        <Text style={styles.emptyText}>{t('insights.noDeadStock')}</Text>
      ) : (
        deadStock.map((row) => (
          <View key={row.variantId} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowLabel}>
                {row.pieceName} · {row.variantLabel}
              </Text>
              <Text style={styles.listRowSub}>
                {row.daysSinceLastSale === null
                  ? t('insights.neverSold')
                  : t('insights.daysSinceSale', { count: row.daysSinceLastSale })}
              </Text>
            </View>
            <Text style={styles.listRowValue}>{row.onHand}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 60, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  subLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  emptyText: { color: '#888' },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  listRowLabel: { fontSize: 14, color: '#333' },
  listRowSub: { fontSize: 12, color: '#888' },
  listRowValue: { fontSize: 14, fontWeight: '600' },
});
