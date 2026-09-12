import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getHomeSummary, type HomeSummary } from '../db/repositories/insights';
import { getLowStockThreshold } from '../settings/lowStockThreshold';
import { formatMad } from '../utils/money';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const NAV_ITEMS: { key: keyof RootStackParamList; labelKey: string }[] = [
  { key: 'LogSale', labelKey: 'home.logSale' },
  { key: 'Stock', labelKey: 'home.goToStock' },
  { key: 'Purchases', labelKey: 'home.purchases' },
  { key: 'Balances', labelKey: 'home.balances' },
  { key: 'Insights', labelKey: 'home.insights' },
  { key: 'Settings', labelKey: 'home.settings' },
];

export function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const threshold = await getLowStockThreshold();
      setSummary(await getHomeSummary(threshold));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.title}>{t('common.appName')}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navRow}>
        {NAV_ITEMS.map((item) => (
          <Pressable key={item.key} style={styles.navChip} onPress={() => navigation.navigate(item.key as never)}>
            <Text style={styles.navChipText}>{t(item.labelKey)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {summary && (
        <>
          <View style={styles.statGrid}>
            <StatCard label={t('home.bookedThisMonth')} value={formatMad(summary.bookedThisMonthCentimes)} />
            <StatCard label={t('home.cashCollected')} value={formatMad(summary.cashCollectedThisMonthCentimes)} />
            <StatCard label={t('home.grossMargin')} value={formatMad(summary.grossMarginThisMonthCentimes)} />
            <StatCard label={t('home.owedToYou')} value={formatMad(summary.owedToYouCentimes)} />
            <StatCard label={t('home.owedToSuppliers')} value={formatMad(summary.owedToSuppliersCentimes)} />
            <StatCard label={t('home.inventoryValue')} value={formatMad(summary.inventoryValueCentimes)} />
            <StatCard
              label={t('home.lowStock')}
              value={String(summary.lowStockCount)}
              highlight={summary.lowStockCount > 0}
            />
          </View>

          <Text style={styles.sectionTitle}>{t('home.topPieces')}</Text>
          {summary.topPieces.length === 0 ? (
            <Text style={styles.emptyText}>{t('home.noSalesYet')}</Text>
          ) : (
            summary.topPieces.map((p) => (
              <View key={p.pieceId} style={styles.listRow}>
                <Text style={styles.listRowLabel}>{p.name}</Text>
                <Text style={styles.listRowValue}>{p.qtySold}</Text>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>{t('home.recentActivity')}</Text>
          {summary.recentActivity.length === 0 ? (
            <Text style={styles.emptyText}>{t('home.noActivityYet')}</Text>
          ) : (
            summary.recentActivity.map((a) => (
              <View key={`${a.kind}-${a.id}`} style={styles.listRow}>
                <Text style={styles.listRowLabel}>{t(`home.activity_${a.kind}`)}</Text>
                <Text style={styles.listRowValue}>{formatMad(a.amountCentimes)}</Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.statCard, highlight && styles.statCardHighlight]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 60, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  navRow: { marginBottom: 16 },
  navChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#1a1a1a', marginEnd: 8 },
  navChipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { width: '48%', borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, gap: 4 },
  statCardHighlight: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  statLabel: { fontSize: 12, color: '#666' },
  statValue: { fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  emptyText: { color: '#888' },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  listRowLabel: { fontSize: 14, color: '#333', flex: 1 },
  listRowValue: { fontSize: 14, fontWeight: '600' },
});
