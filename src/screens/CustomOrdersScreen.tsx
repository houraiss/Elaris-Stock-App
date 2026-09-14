import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  listCustomOrders,
  createCustomOrder,
  advanceCustomOrderStatus,
  cancelCustomOrder,
  recordCustomOrderDeposit,
  deliverCustomOrder,
  type CustomOrderWithDetail,
} from '../db/repositories/customOrders';
import { searchCustomers, createCustomer } from '../db/repositories/customers';
import { searchSuppliers, createSupplier } from '../db/repositories/suppliers';
import { listActiveMaterials } from '../db/repositories/materials';
import { madToCentimes, centimesToMad, formatMad } from '../utils/money';
import { gramsToMg } from '../utils/weight';
import type { Customer } from '../db/schema/customers';
import type { Supplier } from '../db/schema/suppliers';
import type { CustomOrderStatus } from '../db/schema/customOrders';
import type { PaymentMethod } from '../db/schema/supplierPayments';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomOrders'>;

const STATUS_FLOW: CustomOrderStatus[] = ['quoted', 'ordered', 'in_production', 'ready', 'delivered'];
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer'];

function nextStatus(status: CustomOrderStatus): CustomOrderStatus | null {
  const i = STATUS_FLOW.indexOf(status);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null;
}

export function CustomOrdersScreen(_props: Props) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<CustomOrderWithDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeAction, setActiveAction] = useState<{ orderId: string; kind: 'deposit' | 'deliver' } | null>(null);
  const [amountMad, setAmountMad] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [actualWeightGrams, setActualWeightGrams] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await listCustomOrders());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function openAction(orderId: string, kind: 'deposit' | 'deliver', initialAmountCentimes = 0) {
    setActiveAction({ orderId, kind });
    setAmountMad(initialAmountCentimes > 0 ? String(centimesToMad(initialAmountCentimes)) : '');
    setMethod('cash');
    setActualWeightGrams('');
  }

  async function handleAdvance(order: CustomOrderWithDetail) {
    const next = nextStatus(order.status);
    if (!next) return;
    if (next === 'delivered') {
      openAction(order.id, 'deliver', Math.max(0, order.quotedPriceCentimes - order.depositsCentimes));
      return;
    }
    await advanceCustomOrderStatus(order.id, next);
    load();
  }

  async function handleCancel(orderId: string) {
    await cancelCustomOrder(orderId);
    load();
  }

  async function handleDeposit(order: CustomOrderWithDetail) {
    const amountCentimes = madToCentimes(parseFloat(amountMad) || 0);
    if (amountCentimes <= 0) {
      Alert.alert(t('common.errorGeneric'), t('layaways.invalidAmount'));
      return;
    }
    try {
      await recordCustomOrderDeposit(order.id, order.customerId, amountCentimes, method);
      setActiveAction(null);
      load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeliver(order: CustomOrderWithDetail) {
    const finalPaymentCentimes = madToCentimes(parseFloat(amountMad) || 0);
    try {
      const weightMg = actualWeightGrams.trim() ? gramsToMg(parseFloat(actualWeightGrams) || 0) : undefined;
      await deliverCustomOrder(order.id, finalPaymentCentimes, method, weightMg);
      setActiveAction(null);
      Alert.alert(t('customOrders.deliveredTitle'), t('customOrders.deliveredBody', { name: order.customerName }));
      load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.listContainer}>
        {orders.length === 0 && !loading && <Text style={styles.emptyText}>{t('customOrders.empty')}</Text>}
        {orders.map((order) => {
          const remaining = Math.max(0, order.quotedPriceCentimes - order.depositsCentimes);
          const canAdvance = order.status !== 'delivered' && order.status !== 'cancelled';
          return (
            <View key={order.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.rowTitle}>{order.customerName}</Text>
                <View style={[styles.statusBadge, order.overdue && styles.statusBadgeOverdue]}>
                  <Text style={styles.statusBadgeText}>
                    {order.overdue ? t('customOrders.overdue') : t(`customOrders.status_${order.status}`)}
                  </Text>
                </View>
              </View>
              <Text style={styles.pieceSubtitle}>{order.description}</Text>
              {order.craftsmanName && (
                <Text style={styles.pieceSubtitle}>{t('customOrders.craftsman')}: {order.craftsmanName}</Text>
              )}
              {order.promisedOn && (
                <Text style={styles.pieceSubtitle}>{t('customOrders.promisedOn')}: {order.promisedOn.slice(0, 10)}</Text>
              )}
              <Text style={styles.pieceSubtitle}>
                {t('customOrders.quoted')}: {formatMad(order.quotedPriceCentimes)} · {t('customOrders.deposits')}: {formatMad(order.depositsCentimes)}
              </Text>

              {activeAction?.orderId === order.id ? (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {activeAction.kind === 'deliver' && (
                    <>
                      <Text style={styles.smallLabel}>{t('customOrders.remainingDue', { amount: formatMad(remaining) })}</Text>
                      <TextInput
                        style={styles.input}
                        value={actualWeightGrams}
                        onChangeText={setActualWeightGrams}
                        placeholder={t('customOrders.actualWeightGrams')}
                        keyboardType="decimal-pad"
                      />
                    </>
                  )}
                  <TextInput
                    style={styles.input}
                    value={amountMad}
                    onChangeText={setAmountMad}
                    placeholder={t('sale.depositMad')}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <View style={styles.chipWrap}>
                    {METHODS.map((m) => (
                      <Pressable key={m} onPress={() => setMethod(m)} style={[styles.chip, method === m && styles.chipActive]}>
                        <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{t(`sale.method_${m}`)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable style={styles.smallButton} onPress={() => setActiveAction(null)}>
                      <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => (activeAction.kind === 'deposit' ? handleDeposit(order) : handleDeliver(order))}
                    >
                      <Text style={styles.smallButtonText}>
                        {activeAction.kind === 'deposit' ? t('layaways.recordPayment') : t('customOrders.confirmDelivery')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  {canAdvance && (
                    <Pressable style={styles.smallButton} onPress={() => handleAdvance(order)}>
                      <Text style={styles.smallButtonText}>
                        {order.status === 'ready' ? t('customOrders.deliver') : t('customOrders.advance')}
                      </Text>
                    </Pressable>
                  )}
                  {canAdvance && remaining > 0 && (
                    <Pressable style={styles.smallButton} onPress={() => openAction(order.id, 'deposit')}>
                      <Text style={styles.smallButtonText}>{t('customOrders.recordDeposit')}</Text>
                    </Pressable>
                  )}
                  {canAdvance && (
                    <Pressable style={styles.smallButton} onPress={() => handleCancel(order.id)}>
                      <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {showAdd ? (
        <NewCustomOrderPanel
          onDone={() => {
            setShowAdd(false);
            load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <Pressable style={styles.fab} onPress={() => setShowAdd(true)}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

function NewCustomOrderPanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [craftsmanQuery, setCraftsmanQuery] = useState('');
  const [craftsmanSuggestions, setCraftsmanSuggestions] = useState<Supplier[]>([]);
  const [selectedCraftsman, setSelectedCraftsman] = useState<Supplier | null>(null);
  const [description, setDescription] = useState('');
  const [targetSize, setTargetSize] = useState('');
  const [targetWeightGrams, setTargetWeightGrams] = useState('');
  const [quotedMad, setQuotedMad] = useState('');
  const [agreedCostMad, setAgreedCostMad] = useState('');
  const [promisedOn, setPromisedOn] = useState('');
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listActiveMaterials().then((rows) => {
      const silver800 = rows.find((m) => m.code === 'argent_800') ?? rows[0] ?? null;
      setMaterialId(silver800?.id ?? null);
      setMaterialName(silver800?.name ?? '');
    });
  }, []);

  useEffect(() => {
    if (selectedCustomer || customerQuery.trim().length === 0) {
      setCustomerSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => setCustomerSuggestions(await searchCustomers(customerQuery)), 300);
    return () => clearTimeout(handle);
  }, [customerQuery, selectedCustomer]);

  useEffect(() => {
    if (selectedCraftsman || craftsmanQuery.trim().length === 0) {
      setCraftsmanSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => setCraftsmanSuggestions(await searchSuppliers(craftsmanQuery)), 300);
    return () => clearTimeout(handle);
  }, [craftsmanQuery, selectedCraftsman]);

  async function handleSave() {
    const quotedPriceCentimes = madToCentimes(parseFloat(quotedMad) || 0);
    if (!description.trim() || !materialId || quotedPriceCentimes <= 0) {
      Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
      return;
    }

    setSaving(true);
    try {
      let customerId = selectedCustomer?.id ?? null;
      if (!customerId) {
        const name = customerQuery.trim();
        if (!name) {
          Alert.alert(t('common.errorGeneric'), t('sale.layawayNeedsCustomer'));
          setSaving(false);
          return;
        }
        customerId = (await createCustomer({ displayName: name })).id;
      }

      let craftsmanSupplierId: string | null = selectedCraftsman?.id ?? null;
      if (!craftsmanSupplierId && craftsmanQuery.trim()) {
        craftsmanSupplierId = (await createSupplier({ name: craftsmanQuery.trim(), kind: 'craftsman' })).id;
      }

      await createCustomOrder({
        customerId,
        craftsmanSupplierId,
        description: description.trim(),
        materialId,
        targetSize: targetSize.trim() || null,
        targetWeightMg: targetWeightGrams.trim() ? gramsToMg(parseFloat(targetWeightGrams) || 0) : null,
        quotedPriceCentimes,
        agreedCostCentimes: agreedCostMad.trim() ? madToCentimes(parseFloat(agreedCostMad) || 0) : null,
        promisedOn: promisedOn.trim() || null,
      });
      onDone();
    } catch (err) {
      Alert.alert(t('piece.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.addPanel} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('sale.customer')}</Text>
      <TextInput
        style={styles.input}
        value={selectedCustomer ? selectedCustomer.displayName : customerQuery}
        onChangeText={(text) => {
          setSelectedCustomer(null);
          setCustomerQuery(text);
        }}
        placeholder={t('sale.customerPlaceholder')}
      />
      {customerSuggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {customerSuggestions.map((c) => (
            <Pressable key={c.id} style={styles.searchRow} onPress={() => { setSelectedCustomer(c); setCustomerQuery(c.displayName); setCustomerSuggestions([]); }}>
              <Text style={styles.rowTitle}>{c.displayName}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>{t('customOrders.craftsman')} ({t('common.add').toLowerCase()})</Text>
      <TextInput
        style={styles.input}
        value={selectedCraftsman ? selectedCraftsman.name : craftsmanQuery}
        onChangeText={(text) => {
          setSelectedCraftsman(null);
          setCraftsmanQuery(text);
        }}
        placeholder={t('purchases.supplierPlaceholder')}
      />
      {craftsmanSuggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {craftsmanSuggestions.map((s) => (
            <Pressable key={s.id} style={styles.searchRow} onPress={() => { setSelectedCraftsman(s); setCraftsmanQuery(s.name); setCraftsmanSuggestions([]); }}>
              <Text style={styles.rowTitle}>{s.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>{t('customOrders.description')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={description} onChangeText={setDescription} multiline />

      <Text style={styles.label}>{t('customOrders.material')}</Text>
      <Text style={styles.pieceSubtitle}>{materialName}</Text>

      <View style={styles.variantFieldsRow}>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('customOrders.targetSize')}</Text>
          <TextInput style={styles.input} value={targetSize} onChangeText={setTargetSize} />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('customOrders.actualWeightGrams')}</Text>
          <TextInput style={styles.input} value={targetWeightGrams} onChangeText={setTargetWeightGrams} keyboardType="decimal-pad" />
        </View>
      </View>
      <View style={styles.variantFieldsRow}>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('customOrders.quotedPriceMad')}</Text>
          <TextInput style={styles.input} value={quotedMad} onChangeText={setQuotedMad} keyboardType="decimal-pad" />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('customOrders.agreedCostMad')}</Text>
          <TextInput style={styles.input} value={agreedCostMad} onChangeText={setAgreedCostMad} keyboardType="decimal-pad" />
        </View>
      </View>

      <Text style={styles.label}>{t('customOrders.promisedOn')}</Text>
      <TextInput style={styles.input} value={promisedOn} onChangeText={setPromisedOn} placeholder="YYYY-MM-DD" />

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
          <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('common.save')}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  listContainer: { padding: 16, paddingBottom: 80 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginBottom: 12, gap: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  pieceSubtitle: { color: '#666', fontSize: 13 },
  statusBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusBadgeOverdue: { backgroundColor: '#fee2e2' },
  statusBadgeText: { fontSize: 11, fontWeight: '600', color: '#333' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  smallButton: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f0f0f0', borderRadius: 8 },
  smallButtonText: { fontWeight: '600', fontSize: 13 },
  smallLabel: { fontSize: 12, color: '#666' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 6, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  variantFieldsRow: { flexDirection: 'row', gap: 8 },
  variantField: { flex: 1 },
  suggestionBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 4, paddingHorizontal: 10 },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  secondaryButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f0f0f0' },
  secondaryButtonText: { fontWeight: '600', color: '#333' },
  saveButton: { flex: 2, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addPanel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' },
  fab: {
    position: 'absolute',
    end: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
