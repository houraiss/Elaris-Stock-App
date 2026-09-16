import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
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
import { getMaterialDisplayName } from '../i18n/materialName';
import { gramsToMg } from '../utils/weight';
import type { Customer } from '../db/schema/customers';
import type { Supplier } from '../db/schema/suppliers';
import type { CustomOrderStatus } from '../db/schema/customOrders';
import type { PaymentMethod } from '../db/schema/supplierPayments';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { radius, spacing, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { CUSTOM_ORDER_STATUS_ICONS, PAYMENT_METHOD_ICONS } from '../theme/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomOrders'>;

const STATUS_FLOW: CustomOrderStatus[] = ['quoted', 'ordered', 'in_production', 'ready', 'delivered'];
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer'];
const STATUS_TONE: Record<CustomOrderStatus, 'neutral' | 'info' | 'warning' | 'success' | 'gold'> = {
  quoted: 'neutral',
  ordered: 'info',
  in_production: 'warning',
  ready: 'success',
  delivered: 'gold',
  cancelled: 'neutral',
};

function nextStatus(status: CustomOrderStatus): CustomOrderStatus | null {
  const i = STATUS_FLOW.indexOf(status);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null;
}

export function CustomOrdersScreen(_props: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        {orders.length === 0 && !loading && <EmptyState icon="hammer-outline" message={t('customOrders.empty')} />}
        {orders.map((order) => {
          const remaining = Math.max(0, order.quotedPriceCentimes - order.depositsCentimes);
          const canAdvance = order.status !== 'delivered' && order.status !== 'cancelled';
          return (
            <Card key={order.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.rowTitle}>{order.customerName}</Text>
                <Badge
                  label={order.overdue ? t('customOrders.overdue') : t(`customOrders.status_${order.status}`)}
                  tone={order.overdue ? 'danger' : STATUS_TONE[order.status]}
                  icon={order.overdue ? 'alert-circle' : CUSTOM_ORDER_STATUS_ICONS[order.status]}
                />
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
                <View style={styles.inlineForm}>
                  {activeAction.kind === 'deliver' && (
                    <>
                      <Text style={styles.smallLabel}>{t('customOrders.remainingDue', { amount: formatMad(remaining) })}</Text>
                      <TextInput
                        style={styles.input}
                        value={actualWeightGrams}
                        onChangeText={setActualWeightGrams}
                        placeholder={t('customOrders.actualWeightGrams')}
                        placeholderTextColor={colors.inkMuted}
                        keyboardType="decimal-pad"
                      />
                    </>
                  )}
                  <TextInput
                    style={styles.input}
                    value={amountMad}
                    onChangeText={setAmountMad}
                    placeholder={t('sale.depositMad')}
                    placeholderTextColor={colors.inkMuted}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <View style={styles.chipWrap}>
                    {METHODS.map((m) => (
                      <Chip key={m} label={t(`sale.method_${m}`)} active={method === m} onPress={() => setMethod(m)} icon={PAYMENT_METHOD_ICONS[m]} />
                    ))}
                  </View>
                  <View style={styles.actionRow}>
                    <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={() => setActiveAction(null)} style={{ flex: 1 }} />
                    <Button
                      label={activeAction.kind === 'deposit' ? t('layaways.recordPayment') : t('customOrders.confirmDelivery')}
                      variant="primary"
                      icon="checkmark"
                      size="sm"
                      onPress={() => (activeAction.kind === 'deposit' ? handleDeposit(order) : handleDeliver(order))}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  {canAdvance && (
                    <Button
                      label={order.status === 'ready' ? t('customOrders.deliver') : t('customOrders.advance')}
                      icon="arrow-forward-circle-outline"
                      size="sm"
                      onPress={() => handleAdvance(order)}
                    />
                  )}
                  {canAdvance && remaining > 0 && (
                    <Button label={t('customOrders.recordDeposit')} icon="cash-outline" size="sm" onPress={() => openAction(order.id, 'deposit')} />
                  )}
                  {canAdvance && (
                    <Button label={t('common.cancel')} tone="danger" variant="text" size="sm" onPress={() => handleCancel(order.id)} />
                  )}
                </View>
              )}
            </Card>
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
          <Ionicons name="add" size={28} color={colors.onPrimary} />
        </Pressable>
      )}
    </View>
  );
}

function NewCustomOrderPanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      setMaterialName(silver800 ? getMaterialDisplayName(silver800.code, silver800.name, t) : '');
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
    <ScrollView style={styles.addPanel} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <SectionHeader icon="person" title={t('sale.customer')} style={styles.firstSection} />
      <TextInput
        style={styles.input}
        value={selectedCustomer ? selectedCustomer.displayName : customerQuery}
        onChangeText={(text) => {
          setSelectedCustomer(null);
          setCustomerQuery(text);
        }}
        placeholder={t('sale.customerPlaceholder')}
        placeholderTextColor={colors.inkMuted}
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
        placeholderTextColor={colors.inkMuted}
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
      <TextInput style={[styles.input, styles.notesInput]} value={description} onChangeText={setDescription} multiline placeholderTextColor={colors.inkMuted} />

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
      <TextInput style={styles.input} value={promisedOn} onChangeText={setPromisedOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />

      <View style={styles.finalActionRow}>
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={t('common.save')} icon="checkmark" variant="primary" onPress={handleSave} loading={saving} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContainer: { padding: spacing.md, paddingBottom: 80, gap: spacing.md },
  card: { gap: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  pieceSubtitle: { color: colors.inkSoft, fontSize: 13 },
  inlineForm: { gap: spacing.sm, marginTop: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  finalActionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginBottom: 40 },
  smallLabel: { fontSize: 12, color: colors.inkSoft },
  firstSection: { marginTop: 0 },
  label: { fontSize: 14, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm, color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  variantFieldsRow: { flexDirection: 'row', gap: spacing.sm },
  variantField: { flex: 1 },
  suggestionBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  addPanel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background },
  fab: {
    position: 'absolute',
    end: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
