import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listOpenLayaways, recordLayawayPayment, type OpenLayaway } from '../db/repositories/sales';
import { listSuppliersWithBalances, recordSupplierPayment, type SupplierBalance } from '../db/repositories/suppliers';
import { madToCentimes, formatMad } from '../utils/money';
import type { PaymentMethod } from '../db/schema/supplierPayments';

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
        <Text style={styles.headerLine}>{t('balances.customersOweYou')}: {formatMad(customersOweYou)}</Text>
        <Text style={styles.headerLine}>{t('balances.youOweSuppliers')}: {formatMad(youOweSuppliers)}</Text>
        <Text style={styles.headerNet}>{t('balances.netPosition')}: {formatMad(netPosition)}</Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tabButton, tab === 'customers' && styles.tabButtonActive]} onPress={() => setTab('customers')}>
          <Text style={[styles.tabButtonText, tab === 'customers' && styles.tabButtonTextActive]}>{t('balances.customersTab')}</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === 'suppliers' && styles.tabButtonActive]} onPress={() => setTab('suppliers')}>
          <Text style={[styles.tabButtonText, tab === 'suppliers' && styles.tabButtonTextActive]}>{t('balances.suppliersTab')}</Text>
        </Pressable>
      </View>

      {tab === 'customers' ? (
        <FlatList
          data={layaways}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={layaways.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('layaways.empty')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{item.customerName}</Text>
              <Text style={styles.rowSubtitle}>
                {t('layaways.total')}: {formatMad(item.totalCentimes)} · {t('layaways.outstanding')}: {formatMad(item.outstandingCentimes)}
              </Text>
              <Text style={styles.rowSubtitle}>
                {t('balances.daysOutstanding', { count: daysSince(item.occurredAt) })}
                {item.dueOn ? ` · ${t('layaways.due')}: ${item.dueOn}` : ''}
                {isOverdue(item.dueOn) ? ` · ${t('balances.overdue')}` : ''}
              </Text>

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
                  <Pressable style={styles.smallButton} onPress={() => openPayment(item.id)}>
                    <Text style={styles.smallButtonText}>{t('layaways.recordPayment')}</Text>
                  </Pressable>
                  {item.customerPhoneE164 && (
                    <Pressable style={styles.smallButton} onPress={() => openWhatsApp(item.customerPhoneE164!)}>
                      <Text style={styles.smallButtonText}>{t('balances.whatsapp')}</Text>
                    </Pressable>
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
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={supplierBalances.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('balances.noSupplierDebt')}</Text>}
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
                <Pressable style={styles.smallButton} onPress={() => openPayment(item.id)}>
                  <Text style={styles.smallButtonText}>{t('layaways.recordPayment')}</Text>
                </Pressable>
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
  return (
    <View style={styles.paymentBox}>
      <TextInput style={styles.input} value={amountMad} onChangeText={setAmountMad} keyboardType="decimal-pad" placeholder={t('sale.depositMad')} autoFocus />
      <View style={styles.chipWrap}>
        {METHODS.map((m) => (
          <Pressable key={m} onPress={() => setMethod(m)} style={[styles.chip, method === m && styles.chipActive]}>
            <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{t(`sale.method_${m}`)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
          <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={onConfirm} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('layaways.recordPayment')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBox: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee', gap: 2 },
  headerLine: { color: '#555' },
  headerNet: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8 },
  tabButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  tabButtonActive: { backgroundColor: '#1a1a1a' },
  tabButtonText: { color: '#333', fontWeight: '600' },
  tabButtonTextActive: { color: '#fff' },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', paddingHorizontal: 32, textAlign: 'center' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee', gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: '#666', fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  smallButton: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8, alignSelf: 'flex-start' },
  smallButtonText: { fontWeight: '600' },
  paymentBox: { marginTop: 8, gap: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  secondaryButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f0f0f0' },
  secondaryButtonText: { fontWeight: '600', color: '#333' },
  primaryButton: { flex: 2, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
});
