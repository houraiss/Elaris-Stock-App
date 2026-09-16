import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getHomeSummary, type HomeSummary } from '../db/repositories/insights';
import { getRevenueByMonth, type MonthlyRevenue } from '../db/repositories/insights';
import { getLowStockThreshold } from '../settings/lowStockThreshold';
import {
  getHomeSectionOrder,
  setHomeSectionOrder,
  resetHomeSectionOrder,
  DEFAULT_HOME_SECTION_ORDER,
  type HomeSectionId,
} from '../settings/homeLayout';
import { formatMad, madToCentimes } from '../utils/money';
import {
  fetchSilverSpotPrice,
  getCachedSilverSpotPrice,
  isStale,
  pricePerGramMad,
  SILVER_PURITIES,
  type SilverSpotPrice,
} from '../pricing/silverSpot';
import { BarChart } from '../charts/BarChart';
import { IconCircle } from '../components/IconCircle';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/EmptyState';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { radius, spacing, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { ACTIVITY_ICONS, ROUTE_ICONS, type IconName } from '../theme/icons';

const SILVER_STALE_MS = 15 * 60 * 1000;

function silverUpdatedLabel(t: (key: string, options?: Record<string, unknown>) => string, fetchedAtIso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(fetchedAtIso).getTime()) / 60_000);
  if (diffMin < 1) return t('home.silverUpdatedNow');
  if (diffMin < 60) return t('home.silverUpdatedMinutes', { count: diffMin });
  return t('home.silverUpdatedHours', { count: Math.floor(diffMin / 60) });
}

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface QuickAction {
  key: keyof RootStackParamList;
  labelKey: string;
  icon: IconName;
  tint: 'gold' | 'ink' | 'info' | 'success' | 'warning' | 'silver';
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'LogSale', labelKey: 'home.logSale', icon: ROUTE_ICONS.LogSale, tint: 'gold' },
  { key: 'Stock', labelKey: 'home.goToStock', icon: ROUTE_ICONS.Stock, tint: 'ink' },
  { key: 'Purchases', labelKey: 'home.purchases', icon: ROUTE_ICONS.Purchases, tint: 'info' },
  { key: 'Balances', labelKey: 'home.balances', icon: ROUTE_ICONS.Balances, tint: 'success' },
  { key: 'CustomOrders', labelKey: 'home.customOrders', icon: ROUTE_ICONS.CustomOrders, tint: 'warning' },
  { key: 'Reservations', labelKey: 'home.reservations', icon: ROUTE_ICONS.Reservations, tint: 'silver' },
  { key: 'Social', labelKey: 'home.social', icon: ROUTE_ICONS.Social, tint: 'info' },
  { key: 'Insights', labelKey: 'home.insights', icon: ROUTE_ICONS.Insights, tint: 'gold' },
  { key: 'Settings', labelKey: 'home.settings', icon: ROUTE_ICONS.Settings, tint: 'ink' },
];

function getTints(colors: Colors): Record<QuickAction['tint'], { bg: string; fg: string }> {
  return {
    gold: { bg: colors.goldSoft, fg: colors.onGoldSoft },
    silver: { bg: colors.silverSoft, fg: colors.onSilverSoft },
    ink: { bg: colors.surfaceAlt, fg: colors.ink },
    info: { bg: colors.infoSoft, fg: colors.info },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
  };
}

function getRankTones(colors: Colors) {
  return [
    { bg: colors.goldSoft, fg: colors.onGoldSoft },
    { bg: colors.silverSoft, fg: colors.onSilverSoft },
    { bg: colors.warningSoft, fg: colors.warning },
  ];
}

const SECTION_LABEL_KEYS: Record<HomeSectionId, string> = {
  hero: 'home.bookedThisMonth',
  silver: 'home.silverSpotTitle',
  quickActions: 'home.quickActions',
  overview: 'home.overview',
  topPieces: 'home.topPieces',
  recentActivity: 'home.recentActivity',
};

function greetingKey(hour: number): string {
  if (hour < 5) return 'home.greetingNight';
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 17) return 'home.greetingAfternoon';
  if (hour < 22) return 'home.greetingEvening';
  return 'home.greetingNight';
}

export function HomeScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tints = useMemo(() => getTints(colors), [colors]);
  const rankTones = useMemo(() => getRankTones(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [revenue, setRevenue] = useState<MonthlyRevenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [silverSpot, setSilverSpot] = useState<SilverSpotPrice | null>(null);
  const [silverRefreshing, setSilverRefreshing] = useState(false);
  const [silverUnavailable, setSilverUnavailable] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<HomeSectionId[]>(DEFAULT_HOME_SECTION_ORDER);
  const [layoutEditing, setLayoutEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const threshold = await getLowStockThreshold();
      const [summaryResult, revenueResult] = await Promise.all([getHomeSummary(threshold), getRevenueByMonth(5)]);
      setSummary(summaryResult);
      setRevenue(revenueResult);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSilverSpot = useCallback(async (force = false) => {
    const cached = await getCachedSilverSpotPrice();
    if (cached) setSilverSpot(cached);
    if (!force && cached && !isStale(cached, SILVER_STALE_MS)) return;
    setSilverRefreshing(true);
    try {
      const fresh = await fetchSilverSpotPrice();
      setSilverSpot(fresh);
      setSilverUnavailable(false);
    } catch {
      setSilverUnavailable(!cached);
    } finally {
      setSilverRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadSilverSpot();
    }, [load, loadSilverSpot]),
  );

  useEffect(() => {
    getHomeSectionOrder().then(setSectionOrder);
  }, []);

  const handleRefresh = useCallback(() => {
    load();
    loadSilverSpot(true);
  }, [load, loadSilverSpot]);

  function moveSection(index: number, direction: -1 | 1) {
    setSectionOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      setHomeSectionOrder(next);
      return next;
    });
  }

  async function handleResetLayout() {
    await resetHomeSectionOrder();
    setSectionOrder(DEFAULT_HOME_SECTION_ORDER);
  }

  const now = new Date();
  const dateLabel = now.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });

  function renderSection(id: HomeSectionId, index: number) {
    switch (id) {
      case 'hero':
        return (
          <LinearGradient
            key={id}
            // Always a dark "spotlight" card by design, in both themes — not
            // tied to `colors.primary`, which flips to light in dark mode
            // and would otherwise wash out the white text/icons below.
            colors={['#211D18', '#3A2E1E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, index > 0 && styles.heroNotFirst]}
          >
            <Ionicons name="diamond" size={120} color="rgba(255,255,255,0.07)" style={styles.heroWatermark} />
            <Text style={styles.heroLabel}>{t('home.bookedThisMonth')}</Text>
            <Text style={styles.heroValue}>{summary ? formatMad(summary.bookedThisMonthCentimes) : '—'}</Text>
            <View style={styles.heroFootRow}>
              <Ionicons name="cash-outline" size={14} color="rgba(255,255,255,0.75)" />
              <Text style={styles.heroFootText}>
                {t('home.cashCollected')}: {summary ? formatMad(summary.cashCollectedThisMonthCentimes) : '—'}
              </Text>
            </View>

            {revenue.length > 0 && (
              <View style={styles.heroChart}>
                <BarChart
                  data={revenue.map((r) => ({ label: r.month, value: r.bookedCentimes, secondaryValue: r.cashCentimes }))}
                  valueFormatter={formatMad}
                  barColor="#E9DDC8"
                  secondaryColor="rgba(255,255,255,0.35)"
                  labelColor="rgba(255,255,255,0.55)"
                  valueColor="rgba(255,255,255,0.9)"
                  height={120}
                />
              </View>
            )}
          </LinearGradient>
        );

      case 'silver':
        return (
          <View key={id}>
            <SectionHeader icon="sparkles" title={t('home.silverSpotTitle')} tint={colors.silver} />
            <Card style={styles.silverCard}>
              <View style={styles.silverRow}>
                {SILVER_PURITIES.map((purity, index) => (
                  <View key={purity} style={styles.silverPurityBlock}>
                    {index > 0 && <View style={styles.silverDivider} />}
                    <View style={styles.silverPurityHeader}>
                      <View style={styles.silverPurityBadge}>
                        <Text style={styles.silverPurityBadgeText}>{purity}</Text>
                      </View>
                      <Text style={styles.silverPriceUnit}>{t('home.perGram')}</Text>
                    </View>
                    <Text style={styles.silverPriceValue}>
                      {silverSpot ? formatMad(madToCentimes(pricePerGramMad(silverSpot, purity))) : '—'}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.silverFooterRow}>
                <Text style={styles.silverFooterText} numberOfLines={1}>
                  {silverSpot
                    ? silverUpdatedLabel(t, silverSpot.fetchedAt)
                    : silverUnavailable
                      ? t('home.silverUnavailable')
                      : t('common.loading')}
                </Text>
                <Pressable onPress={() => loadSilverSpot(true)} disabled={silverRefreshing} hitSlop={8}>
                  {silverRefreshing ? (
                    <ActivityIndicator size="small" color={colors.inkMuted} />
                  ) : (
                    <Ionicons name="refresh" size={16} color={colors.inkMuted} />
                  )}
                </Pressable>
              </View>
              <Text style={styles.silverDisclaimer}>{t('home.silverDisclaimer')}</Text>
            </Card>
          </View>
        );

      case 'quickActions':
        return (
          <View key={id}>
            <SectionHeader icon="apps" title={t('home.quickActions')} />
            <View style={styles.actionGrid}>
              {QUICK_ACTIONS.map((item) => {
                const tint = tints[item.tint];
                return (
                  <Pressable key={item.key} style={styles.actionTile} onPress={() => navigation.navigate(item.key as never)}>
                    <IconCircle name={item.icon} color={tint.fg} backgroundColor={tint.bg} boxSize={48} size={22} />
                    <Text style={styles.actionLabel} numberOfLines={2}>
                      {t(item.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );

      case 'overview':
        if (!summary) return null;
        return (
          <View key={id}>
            <SectionHeader icon="stats-chart" title={t('home.overview')} />
            <View style={styles.statGrid}>
              <StatCard icon="cash-outline" tint="success" label={t('home.cashCollected')} value={formatMad(summary.cashCollectedThisMonthCentimes)} />
              <StatCard icon="trending-up" tint="gold" label={t('home.grossMargin')} value={formatMad(summary.grossMarginThisMonthCentimes)} />
              <StatCard icon="people-outline" tint="info" label={t('home.owedToYou')} value={formatMad(summary.owedToYouCentimes)} />
              <StatCard icon="business-outline" tint="silver" label={t('home.owedToSuppliers')} value={formatMad(summary.owedToSuppliersCentimes)} />
              <StatCard icon="cube-outline" tint="ink" label={t('home.inventoryValue')} value={formatMad(summary.inventoryValueCentimes)} />
              <StatCard
                icon={summary.lowStockCount > 0 ? 'alert-circle' : 'checkmark-circle'}
                tint={summary.lowStockCount > 0 ? 'warning' : 'success'}
                label={t('home.lowStock')}
                value={String(summary.lowStockCount)}
                highlight={summary.lowStockCount > 0}
              />
            </View>
          </View>
        );

      case 'topPieces':
        if (!summary) return null;
        return (
          <View key={id}>
            <SectionHeader icon="ribbon" title={t('home.topPieces')} />
            {summary.topPieces.length === 0 ? (
              <EmptyState icon="pricetags-outline" message={t('home.noSalesYet')} compact />
            ) : (
              <View style={styles.listCard}>
                {summary.topPieces.map((p, index) => {
                  const rankTone = rankTones[index] ?? { bg: colors.surfaceAlt, fg: colors.inkSoft };
                  return (
                    <View key={p.pieceId} style={[styles.listRow, index === summary.topPieces.length - 1 && styles.listRowLast]}>
                      <View style={[styles.rankBadge, { backgroundColor: rankTone.bg }]}>
                        <Text style={[styles.rankBadgeText, { color: rankTone.fg }]}>{index + 1}</Text>
                      </View>
                      <Text style={styles.listRowLabel} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.listRowValue}>{p.qtySold}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );

      case 'recentActivity':
        if (!summary) return null;
        return (
          <View key={id}>
            <SectionHeader icon="time" title={t('home.recentActivity')} />
            {summary.recentActivity.length === 0 ? (
              <EmptyState icon="file-tray-outline" message={t('home.noActivityYet')} compact />
            ) : (
              <View style={[styles.listCard, styles.listCardBottom]}>
                {summary.recentActivity.map((a, index) => (
                  <View
                    key={`${a.kind}-${a.id}`}
                    style={[styles.listRow, index === summary.recentActivity.length - 1 && styles.listRowLast]}
                  >
                    <IconCircle
                      name={ACTIVITY_ICONS[a.kind] ?? 'ellipse'}
                      color={a.kind === 'sale' ? colors.onGoldSoft : colors.info}
                      backgroundColor={a.kind === 'sale' ? colors.goldSoft : colors.infoSoft}
                      boxSize={32}
                      size={16}
                    />
                    <Text style={styles.listRowLabel}>{t(`home.activity_${a.kind}`)}</Text>
                    <Text style={[styles.listRowValue, a.kind === 'sale' && styles.listRowValuePositive]}>
                      {formatMad(a.amountCentimes)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={colors.ink} colors={[colors.ink]} />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>{t('common.appName').toUpperCase()}</Text>
          <Text style={styles.greeting}>{t(greetingKey(now.getHours()))}</Text>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
        </View>
        <View style={styles.headerButtonRow}>
          <Pressable style={styles.headerIconButton} onPress={() => setLayoutEditing((v) => !v)}>
            <Ionicons name={layoutEditing ? 'checkmark-done' : 'options-outline'} size={20} color={colors.ink} />
          </Pressable>
          <Pressable style={styles.headerIconButton} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={20} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {layoutEditing ? (
        <>
          <Text style={styles.layoutEditHint}>{t('home.layoutEditHint')}</Text>
          <Card style={styles.layoutEditCard}>
            {sectionOrder.map((id, index) => (
              <View key={id} style={[styles.layoutEditRow, index === sectionOrder.length - 1 && styles.listRowLast]}>
                <Ionicons name="reorder-three-outline" size={18} color={colors.inkMuted} />
                <Text style={styles.layoutEditLabel}>{t(SECTION_LABEL_KEYS[id])}</Text>
                <Pressable onPress={() => moveSection(index, -1)} disabled={index === 0} hitSlop={8}>
                  <Ionicons name="chevron-up-circle-outline" size={24} color={index === 0 ? colors.border : colors.ink} />
                </Pressable>
                <Pressable onPress={() => moveSection(index, 1)} disabled={index === sectionOrder.length - 1} hitSlop={8}>
                  <Ionicons name="chevron-down-circle-outline" size={24} color={index === sectionOrder.length - 1 ? colors.border : colors.ink} />
                </Pressable>
              </View>
            ))}
          </Card>
          <View style={styles.layoutEditActionsRow}>
            <Button label={t('home.resetLayout')} icon="refresh-outline" variant="secondary" onPress={handleResetLayout} style={{ flex: 1 }} />
            <Button label={t('home.doneEditingLayout')} icon="checkmark-done" variant="primary" onPress={() => setLayoutEditing(false)} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        sectionOrder.map((id, index) => renderSection(id, index))
      )}
    </ScrollView>
  );
}

function StatCard({
  icon,
  tint,
  label,
  value,
  highlight,
}: {
  icon: IconName;
  tint: QuickAction['tint'];
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = getTints(colors)[tint];
  return (
    <View style={[styles.statCard, highlight && styles.statCardHighlight]}>
      <IconCircle name={icon} color={tone.fg} backgroundColor={tone.bg} boxSize={32} size={16} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 1.5, marginBottom: 2 },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.ink },
  dateLabel: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  headerButtonRow: { flexDirection: 'row', gap: spacing.sm },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layoutEditHint: { fontSize: 13, color: colors.inkSoft, marginBottom: spacing.md },
  layoutEditCard: { padding: 0, overflow: 'hidden' },
  layoutEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  layoutEditLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  layoutEditActionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    ...shadow.raised,
  },
  heroNotFirst: { marginTop: spacing.xxl },
  heroWatermark: { position: 'absolute', end: -20, top: -20 },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '700', marginTop: spacing.xs },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  heroFootText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  heroChart: { marginTop: spacing.lg },
  silverCard: { gap: spacing.md },
  silverRow: { flexDirection: 'row' },
  silverPurityBlock: { flex: 1, paddingHorizontal: spacing.md },
  silverDivider: { position: 'absolute', start: 0, top: 2, bottom: 2, width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  silverPurityHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  silverPurityBadge: { backgroundColor: colors.silverSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  silverPurityBadgeText: { fontSize: 12, fontWeight: '700', color: colors.onSilverSoft },
  silverPriceUnit: { fontSize: 11, color: colors.inkMuted },
  silverPriceValue: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: spacing.xs },
  silverFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  silverFooterText: { fontSize: 12, color: colors.inkSoft, flex: 1, marginEnd: spacing.sm },
  silverDisclaimer: { fontSize: 11, color: colors.inkMuted },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionTile: {
    width: '31%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionLabel: { fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statCardHighlight: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  statLabel: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.xs },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.ink },
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
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  listRowLast: { borderBottomWidth: 0 },
  rankBadge: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { fontSize: 13, fontWeight: '700' },
  listRowLabel: { fontSize: 14, color: colors.ink, flex: 1 },
  listRowValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
  listRowValuePositive: { color: colors.success },
});
