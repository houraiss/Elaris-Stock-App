import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet, Alert, RefreshControl, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listOpenLayaways, recordLayawayPayment, type OpenLayaway } from '../db/repositories/sales';
import { listSuppliersWithBalances, recordSupplierPayment, type SupplierBalance } from '../db/repositories/suppliers';
import { madToCentimes, formatMad } from '../utils/money';
import type { PaymentMethod } from '../db/schema/supplierPayments';
import { IconCircle } from '../components/IconCircle';
import { SegmentedControl } from '../components/SegmentedControl';
import { Chip } from '../components/Chip';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { PAYMENT_METHOD_ICONS } from '../theme/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Balances'>;

type Tab = 'customers' | 'suppliers';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer'];

function daysSince(dateIso: string): number {
  const ms = Date.now() - new Date(dateIso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function isOverdue(dueOn: string | null): boolean {
  if (!dueOn) return false;
  return dueOn < new Date().toISOString().slice(0, 10);
}

export function BalancesScreen(_props: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('customers');
  const [layaways, setLayaways] = useState<OpenLayaway[]>([]);
  const [supplierBalances, setSupplierBalances] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [amountMad, setAmountMad] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([listOpenLayaways(), listSuppliersWithBalances()]);
      setLayaways(l);
      setSupplierBalances(s.filter((s) => s.outstandingCentimes > 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const customersOweYou = layaways.reduce((sum, l) => sum + l.outstandingCentimes, 0);
  const youOweSuppliers = supplierBalances.reduce((sum, s) => sum + s.outstandingCentimes, 0);
  const netPosition = customersOweYou - youOweSuppliers;

  function openPayment(id: string) {
    setActiveId(id);
    setAmountMad('');
    setMethod('cash');
  }

  async function handleCustomerPayment(sale: OpenLayaway) {
    const amountCentimes = madToCentimes(parseFloat(amountMad) || 0);
    if (amountCentimes <= 0 || amountCentimes > sale.outstandingCentimes) {
      Alert.alert(t('common.errorGeneric'), t('layaways.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      const { handedOver } = await recordLayawayPayment(sale.id, amountCentimes, method);
      Alert.alert(
        t('layaways.savedTitle'),
        handedOver ? t('layaways.handedOver', { name: sale.customerName }) : t('layaways.paymentRecorded'),
      );
      setActiveId(null);
      load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSupplierPayment(supplier: SupplierBalance) {
    const amountCentimes = madToCentimes(parseFloat(amountMad) || 0);
    if (amountCentimes <= 0 || amountCentimes > supplier.outstandingCentimes) {
      Alert.alert(t('common.errorGeneric'), t('layaways.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await recordSupplierPayment(supplier.id, amountCentimes, method, null);
      setActiveId(null);
      load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function openWhatsApp(phoneE164: string) {
    const digits = phoneE164.replace(/[^\d]/g, '');
    Linking.openURL(`https://wa.me/${digits}`).catch(() => Alert.alert(t('common.errorGeneric')));
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBox}>
        <View style={styles.headerStatsRow}>
          <View style={styles.headerStat}>
            <IconCircle name="people-outline" color={colors.info} backgroundColor={colors.infoSoft} boxSize={32} size={16} />
            <Text style={styles.headerStatLabel}>{t('balances.customersOweYou')}</Text>
            <Text style={styles.headerStatValue}>{formatMad(customersOweYou)}</Text>
          </View>
          <View style={styles.headerStat}>
            <IconCircle name="business-outline" color={colors.onSilverSoft} backgroundColor={colors.silverSoft} boxSize={32} size={16} />
            <Text style={styles.headerStatLabel}>{t('balances.youOweSuppliers')}</Text>
            <Text style={styles.headerStatValue}>{formatMad(youOweSuppliers)}</Text>
          </View>
        </View>
        <View style={styles.netRow}>
          <Text style={styles.headerStatLabel}>{t('balances.netPosition')}</Text>
          <Text style={[styles.headerNet, { color: netPosition >= 0 ? colors.success : colors.danger }]}>
            {formatMad(netPosition)}
          </Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'customers', label: t('balances.customersTab'), icon: 'people-outline' },
            { value: 'suppliers', label: t('balances.suppliersTab'), icon: 'business-outline' },
          ]}
        />
      </View>

      {tab === 'customers' ? (
        <FlatList
          data={layaways}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.ink} colors={[colors.ink]} />}
          contentContainerStyle={layaways.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={<EmptyState icon="checkmark-circle-outline" message={t('layaways.empty')} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{item.customerName}</Text>
              <Text style={styles.rowSubtitle}>
                {t('layaways.total')}: {formatMad(item.totalCentimes)} · {t('layaways.outstanding')}: {formatMad(item.outstandingCentimes)}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.rowSubtitle}>
                  {t('balances.daysOutstanding', { count: daysSince(item.occurredAt) })}
                  {item.dueOn ? ` · ${t('layaways.due')}: ${item.dueOn}` : ''}
                </Text>
                {isOverdue(item.dueOn) && <Badge label={t('balances.overdue')} tone="danger" icon="alert-circle" />}
              </View>

              {activeId === item.id ? (
                <PaymentForm
                  amountMad={amountMad}
                  setAmountMad={setAmountMad}
                  method={method}
                  setMethod={setMethod}
                  saving={saving}
                  onCancel={() => setActiveId(null)}
                  onConfirm={() => handleCustomerPayment(item)}
                />
              ) : (
                <View style={styles.actionRow}>
                  <Button label={t('layaways.recordPayment')} icon="cash-outline" size="sm" onPress={() => openPayment(item.id)} />
                  {item.customerPhoneE164 && (
                    <Button label={t('balances.whatsapp')} icon="logo-whatsapp" size="sm" onPress={() => openWhatsApp(item.customerPhoneE164!)} />
                  )}
                </View>
              )}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={supplierBalances}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.ink} colors={[colors.ink]} />}
          contentContainerStyle={supplierBalances.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={<EmptyState icon="checkmark-circle-outline" message={t('balances.noSupplierDebt')} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>
                {t('purchases.total')}: {formatMad(item.totalPurchasedCentimes)} · {t('layaways.outstanding')}: {formatMad(item.outstandingCentimes)}
              </Text>

              {activeId === item.id ? (
                <PaymentForm
                  amountMad={amountMad}
                  setAmountMad={setAmountMad}
                  method={method}
                  setMethod={setMethod}
                  saving={saving}
                  onCancel={() => setActiveId(null)}
                  onConfirm={() => handleSupplierPayment(item)}
                />
              ) : (
                <Button label={t('layaways.recordPayment')} icon="cash-outline" size="sm" onPress={() => openPayment(item.id)} style={styles.singleAction} />
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function PaymentForm({
  amountMad,
  setAmountMad,
  method,
  setMethod,
  saving,
  onCancel,
  onConfirm,
}: {
  amountMad: string;
  setAmountMad: (v: string) => void;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.paymentBox}>
      <TextInput
        style={styles.input}
        value={amountMad}
        onChangeText={setAmountMad}
        keyboardType="decimal-pad"
        placeholder={t('sale.depositMad')}
        placeholderTextColor={colors.inkMuted}
        autoFocus
      />
      <View style={styles.chipWrap}>
        {METHODS.map((m) => (
          <Chip key={m} label={t(`sale.method_${m}`)} active={method === m} onPress={() => setMethod(m)} icon={PAYMENT_METHOD_ICONS[m]} />
        ))}
      </View>
      <View style={styles.actionRow}>
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={t('layaways.recordPayment')} variant="primary" icon="checkmark" onPress={onConfirm} loading={saving} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBox: { padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.md },
  headerStatsRow: { flexDirection: 'row', gap: spacing.md },
  headerStat: { flex: 1, gap: spacing.xs },
  headerStatLabel: { color: colors.inkSoft, fontSize: 12 },
  headerStatValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  headerNet: { fontSize: 18, fontWeight: '700' },
  tabRow: { padding: spacing.md },
  listContent: { padding: spacing.md, gap: spacing.sm },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  row: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowSubtitle: { color: colors.inkSoft, fontSize: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  singleAction: { marginTop: spacing.sm },
  paymentBox: { marginTop: spacing.sm, gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
