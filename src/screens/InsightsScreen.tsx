import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
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
  getFollowerGrowthVsSales,
  getPostToSalesCorrelation,
  type MonthlyRevenue,
  type MarkupComparison,
  type SalesBreakdownRow,
  type SalesBreakdownDimension,
  type CostTrendSeries,
  type RingSizePopularity,
  type DeadStockRow,
  type FollowerGrowthPoint,
  type PostSalesCorrelationRow,
} from '../db/repositories/insights';
import type { SocialPlatform } from '../db/schema/social';
import { BarChart } from '../charts/BarChart';
import { formatMad } from '../utils/money';
import { getMaterialDisplayName } from '../i18n/materialName';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { SOCIAL_PLATFORM_ICONS } from '../theme/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Insights'>;

const DIMENSIONS: SalesBreakdownDimension[] = ['material', 'category', 'channel'];
const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

function formatBandWeightRange(minWeightMg: number, maxWeightMg: number): string {
  const min = Math.round(minWeightMg / 1000);
  const max = maxWeightMg >= Number.MAX_SAFE_INTEGER / 2 ? '∞' : Math.round(maxWeightMg / 1000);
  return `${min}–${max} g`;
}

export function InsightsScreen(_props: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [revenue, setRevenue] = useState<MonthlyRevenue[]>([]);
  const [markupComparison, setMarkupComparison] = useState<MarkupComparison[]>([]);
  const [breakdownDimension, setBreakdownDimension] = useState<SalesBreakdownDimension>('material');
  const [breakdown, setBreakdown] = useState<SalesBreakdownRow[]>([]);
  const [costTrends, setCostTrends] = useState<CostTrendSeries[]>([]);
  const [ringSizes, setRingSizes] = useState<RingSizePopularity[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockRow[]>([]);
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform>('instagram');
  const [followerGrowth, setFollowerGrowth] = useState<FollowerGrowthPoint[]>([]);
  const [postCorrelation, setPostCorrelation] = useState<PostSalesCorrelationRow[]>([]);

  const load = useCallback(async () => {
    const [rev, markup, cost, sizes, dead, correlation] = await Promise.all([
      getRevenueByMonth(6),
      getRealisedMarkupVsRuleTable(),
      getCostTrendsByMaterial(6),
      getRingSizePopularity(),
      getDeadStock(90),
      getPostToSalesCorrelation(),
    ]);
    setRevenue(rev);
    setMarkupComparison(markup);
    setCostTrends(cost);
    setRingSizes(sizes);
    setDeadStock(dead);
    setPostCorrelation(correlation);
  }, []);

  const loadFollowerGrowth = useCallback(async (platform: SocialPlatform) => {
    setFollowerGrowth(await getFollowerGrowthVsSales(platform, 6));
  }, []);

  const loadBreakdown = useCallback(async (dimension: SalesBreakdownDimension) => {
    setBreakdown(await getSalesBreakdown(dimension));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadBreakdown(breakdownDimension);
      loadFollowerGrowth(socialPlatform);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  function handleDimensionChange(dimension: SalesBreakdownDimension) {
    setBreakdownDimension(dimension);
    loadBreakdown(dimension);
  }

  function handleSocialPlatformChange(platform: SocialPlatform) {
    setSocialPlatform(platform);
    loadFollowerGrowth(platform);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <SectionHeader icon="trending-up" title={t('insights.revenueOverTime')} style={styles.firstSection} />
      <BarChart
        data={revenue.map((r) => ({ label: r.month, value: r.bookedCentimes, secondaryValue: r.cashCentimes }))}
        valueFormatter={formatMad}
        legend={{ primary: t('insights.booked'), secondary: t('insights.cashCollected') }}
        barColor={colors.primary}
        secondaryColor={colors.gold}
      />

      <SectionHeader icon="analytics" title={t('insights.realisedMarkup')} />
      {markupComparison.length === 0 ? (
        <EmptyState icon="analytics-outline" message={t('insights.noSalesYet')} compact />
      ) : (
        <View style={styles.listCard}>
          {markupComparison.map((row, index) => (
            <View
              key={`${row.materialCode ?? 'all'}-${row.minWeightMg}-${row.maxWeightMg}`}
              style={[styles.listRow, index === markupComparison.length - 1 && styles.noBorder]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.listRowLabel}>
                  {row.materialCode && row.materialName ? getMaterialDisplayName(row.materialCode, row.materialName, t) : t('settings.allMaterials')} ·{' '}
                  {formatBandWeightRange(row.minWeightMg, row.maxWeightMg)}
                </Text>
                <Text style={styles.listRowSub}>{t('insights.itemsSold', { count: row.itemCount })}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.listRowValue}>
                  {(row.realisedBps / 100).toFixed(1)}% {t('insights.actual')}
                </Text>
                <Text style={styles.listRowSub}>{(row.ruleBps / 100).toFixed(1)}% {t('insights.rule')}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <SectionHeader icon="pie-chart" title={t('insights.salesBreakdown')} />
      <View style={styles.chipRow}>
        {DIMENSIONS.map((d) => (
          <Chip key={d} label={t(`insights.dimension_${d}`)} active={breakdownDimension === d} onPress={() => handleDimensionChange(d)} />
        ))}
      </View>
      <BarChart
        data={breakdown.slice(0, 6).map((b) => ({ label: b.code ? getMaterialDisplayName(b.code, b.label, t) : b.label, value: b.totalCentimes }))}
        valueFormatter={formatMad}
        barColor={colors.primary}
      />

      <SectionHeader icon="stats-chart" title={t('insights.costTrends')} />
      {costTrends.length === 0 ? (
        <EmptyState icon="stats-chart-outline" message={t('insights.noPurchasesYet')} compact />
      ) : (
        costTrends.map((series) => (
          <View key={series.materialCode} style={styles.subSection}>
            <Text style={styles.subLabel}>{getMaterialDisplayName(series.materialCode, series.materialName, t)}</Text>
            <BarChart data={series.points.map((p) => ({ label: p.month, value: p.avgCostPerGramCentimes }))} valueFormatter={formatMad} barColor={colors.silver} />
          </View>
        ))
      )}

      <SectionHeader icon="ellipse" title={t('insights.ringSizes')} />
      {ringSizes.length === 0 ? (
        <EmptyState icon="ellipse-outline" message={t('insights.noSalesYet')} compact />
      ) : (
        <BarChart data={ringSizes.map((r) => ({ label: r.label, value: r.qtySold }))} valueFormatter={(v) => String(v)} barColor={colors.primary} />
      )}

      <SectionHeader icon="archive" title={t('insights.deadStock')} />
      {deadStock.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" message={t('insights.noDeadStock')} compact />
      ) : (
        <View style={styles.listCard}>
          {deadStock.map((row, index) => (
            <View key={row.variantId} style={[styles.listRow, index === deadStock.length - 1 && styles.noBorder]}>
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
          ))}
        </View>
      )}

      <SectionHeader icon="share-social" title={t('insights.followerGrowth')} />
      <View style={styles.chipRow}>
        {SOCIAL_PLATFORMS.map((p) => (
          <Chip key={p} label={t(`social.platform_${p}`)} active={socialPlatform === p} onPress={() => handleSocialPlatformChange(p)} icon={SOCIAL_PLATFORM_ICONS[p]} />
        ))}
      </View>
      {followerGrowth.every((p) => p.followers === null) ? (
        <EmptyState icon="people-outline" message={t('insights.noFollowerData')} compact />
      ) : (
        <>
          <Text style={styles.subLabel}>{t('insights.followers')}</Text>
          <BarChart data={followerGrowth.map((p) => ({ label: p.month, value: p.followers ?? 0 }))} valueFormatter={(v) => String(v)} barColor={colors.info} />
          <Text style={[styles.subLabel, styles.subLabelSpaced]}>{t('insights.bookedRevenue')}</Text>
          <BarChart data={followerGrowth.map((p) => ({ label: p.month, value: p.bookedCentimes }))} valueFormatter={formatMad} barColor={colors.gold} />
        </>
      )}

      <SectionHeader icon="link" title={t('insights.postToSales')} />
      {postCorrelation.length === 0 ? (
        <EmptyState icon="link-outline" message={t('insights.noPostsYet')} compact />
      ) : (
        <View style={[styles.listCard, styles.listCardBottom]}>
          {postCorrelation.map((row, index) => (
            <View key={row.postId} style={[styles.listRow, index === postCorrelation.length - 1 && styles.noBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listRowLabel}>{row.pieceNames.join(', ')}</Text>
                <Text style={styles.listRowSub}>
                  {t(`social.platform_${row.platform}`)} · {row.postedAt.slice(0, 10)}
                </Text>
              </View>
              <Text style={styles.listRowValue}>{t('insights.unitsSoldAfter', { count: row.qtySoldAfter })}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  firstSection: { marginTop: 0 },
  subSection: { marginBottom: spacing.lg },
  subLabel: { fontSize: 13, fontWeight: '600', color: colors.inkSoft, marginBottom: spacing.xs },
  subLabelSpaced: { marginTop: spacing.md },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  listCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  listCardBottom: { marginBottom: spacing.md },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  noBorder: { borderBottomWidth: 0 },
  listRowLabel: { fontSize: 14, color: colors.ink },
  listRowSub: { fontSize: 12, color: colors.inkMuted },
  listRowValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
