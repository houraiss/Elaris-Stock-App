import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchSuppliers, createSupplier, recordSupplierPayment } from '../db/repositories/suppliers';
import { createPurchase, listPurchasesForSupplier, type PurchaseWithProgress } from '../db/repositories/purchases';
import { getPieceDetail } from '../db/repositories/pieces';
import { searchPieces, type PieceSearchResult } from '../db/repositories/stockIntake';
import { madToCentimes, centimesToMad, formatMad } from '../utils/money';
import { gramsToMg, mgToGrams } from '../utils/weight';
import type { Supplier, SupplierKind } from '../db/schema/suppliers';
import type { PaymentMethod } from '../db/schema/supplierPayments';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { PAYMENT_METHOD_ICONS, SUPPLIER_KIND_ICONS } from '../theme/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Purchases'>;

interface ItemDraft {
  key: string;
  variantId: string;
  pieceName: string;
  variantLabel: string;
  qty: string;
  weightGrams: string;
  costMad: string;
}

const SUPPLIER_KINDS: SupplierKind[] = ['wholesaler', 'craftsman'];
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer'];

export function PurchasesScreen(_props: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierSuggestions, setSupplierSuggestions] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [newSupplierKind, setNewSupplierKind] = useState<SupplierKind>('wholesaler');
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<PieceSearchResult[]>([]);
  const [sizePick, setSizePick] = useState<{ piece: PieceSearchResult; variants: { id: string; label: string; nominalWeightMg: number; costCentimes: number }[] } | null>(null);

  const [reference, setReference] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<PurchaseWithProgress[]>([]);
  const [payingPurchaseId, setPayingPurchaseId] = useState<string | null>(null);
  const [payAmountMad, setPayAmountMad] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');

  const loadHistory = useCallback(async () => {
    if (!selectedSupplier) {
      setHistory([]);
      return;
    }
    setHistory(await listPurchasesForSupplier(selectedSupplier.id));
  }, [selectedSupplier]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  useEffect(() => {
    if (selectedSupplier || supplierQuery.trim().length === 0) {
      setSupplierSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => setSupplierSuggestions(await searchSuppliers(supplierQuery)), 300);
    return () => clearTimeout(handle);
  }, [supplierQuery, selectedSupplier]);

  useEffect(() => {
    if (itemSearch.trim().length === 0) {
      setItemResults([]);
      return;
    }
    const handle = setTimeout(async () => setItemResults(await searchPieces(itemSearch)), 300);
    return () => clearTimeout(handle);
  }, [itemSearch]);

  async function handleCreateSupplier() {
    if (!supplierQuery.trim()) return;
    const supplier = await createSupplier({ name: supplierQuery.trim(), kind: newSupplierKind });
    setSelectedSupplier(supplier);
    setSupplierQuery(supplier.name);
    setShowNewSupplierForm(false);
    setSupplierSuggestions([]);
  }

  async function handleSelectPiece(piece: PieceSearchResult) {
    const detail = await getPieceDetail(piece.id);
    if (!detail) return;
    if (piece.variantType === 'none') {
      const v = detail.variants[0];
      addItem(piece.name, v.id, v.label, v.nominalWeightMg, v.costCentimes);
    } else {
      setSizePick({
        piece,
        variants: detail.variants.map((v) => ({ id: v.id, label: v.label, nominalWeightMg: v.nominalWeightMg, costCentimes: v.costCentimes })),
      });
    }
    setItemSearch('');
    setItemResults([]);
  }

  function addItem(pieceName: string, variantId: string, label: string, nominalWeightMg: number, costCentimes: number) {
    setItems((current) => [
      ...current,
      {
        key: `${variantId}-${Date.now()}`,
        variantId,
        pieceName,
        variantLabel: label,
        qty: '1',
        weightGrams: String(mgToGrams(nominalWeightMg)),
        costMad: String(centimesToMad(costCentimes)),
      },
    ]);
    setSizePick(null);
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((i) => i.key !== key));
  }

  async function handleSavePurchase() {
    if (!selectedSupplier) {
      Alert.alert(t('common.errorGeneric'), t('purchases.needSupplier'));
      return;
    }
    if (items.length === 0) {
      Alert.alert(t('common.errorGeneric'), t('purchases.needItems'));
      return;
    }

    const parsedItems = items.map((i) => ({
      variantId: i.variantId,
      qty: parseInt(i.qty, 10) || 0,
      weightMg: gramsToMg(parseFloat(i.weightGrams) || 0),
      unitCostCentimes: madToCentimes(parseFloat(i.costMad) || 0),
    }));
    if (parsedItems.some((i) => i.qty <= 0 || i.weightMg <= 0 || i.unitCostCentimes <= 0)) {
      Alert.alert(t('common.errorGeneric'), t('purchases.invalidItems'));
      return;
    }

    setSaving(true);
    try {
      await createPurchase({
        supplierId: selectedSupplier.id,
        reference: reference.trim() || null,
        dueOn: dueOn.trim() || null,
        note: note.trim() || null,
        items: parsedItems,
      });
      setItems([]);
      setReference('');
      setDueOn('');
      setNote('');
      await loadHistory();
      Alert.alert(t('purchases.savedTitle'), t('purchases.savedBody'));
    } catch (err) {
      Alert.alert(t('purchases.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPayment(purchase: PurchaseWithProgress) {
    if (!selectedSupplier) return;
    const amountCentimes = madToCentimes(parseFloat(payAmountMad) || 0);
    if (amountCentimes <= 0 || amountCentimes > purchase.outstandingCentimes) {
      Alert.alert(t('common.errorGeneric'), t('layaways.invalidAmount'));
      return;
    }
    try {
      await recordSupplierPayment(selectedSupplier.id, amountCentimes, payMethod, purchase.id);
      setPayingPurchaseId(null);
      setPayAmountMad('');
      await loadHistory();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <SectionHeader icon="business" title={t('purchases.supplier')} style={styles.firstSection} />
      <TextInput
        style={styles.input}
        value={selectedSupplier ? selectedSupplier.name : supplierQuery}
        onChangeText={(text) => {
          setSelectedSupplier(null);
          setSupplierQuery(text);
          setShowNewSupplierForm(false);
        }}
        placeholder={t('purchases.supplierPlaceholder')}
        placeholderTextColor={colors.inkMuted}
      />
      {supplierSuggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {supplierSuggestions.map((s) => (
            <Pressable
              key={s.id}
              style={styles.searchRow}
              onPress={() => {
                setSelectedSupplier(s);
                setSupplierQuery(s.name);
                setSupplierSuggestions([]);
              }}
            >
              <Text style={styles.rowTitle}>{s.name}</Text>
              <Text style={styles.pieceSubtitle}>{t(`purchases.kind_${s.kind}`)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!selectedSupplier && supplierQuery.trim().length > 0 && supplierSuggestions.length === 0 && (
        <>
          {!showNewSupplierForm ? (
            <Button label={t('purchases.createSupplier', { name: supplierQuery.trim() })} icon="add" size="sm" onPress={() => setShowNewSupplierForm(true)} style={styles.spacedTop} />
          ) : (
            <Card style={styles.spacedTop}>
              <View style={styles.chipWrap}>
                {SUPPLIER_KINDS.map((k) => (
                  <Chip key={k} label={t(`purchases.kind_${k}`)} active={newSupplierKind === k} onPress={() => setNewSupplierKind(k)} icon={SUPPLIER_KIND_ICONS[k]} />
                ))}
              </View>
              <Button label={t('common.save')} icon="checkmark" variant="primary" size="sm" onPress={handleCreateSupplier} style={styles.spacedTop} />
            </Card>
          )}
        </>
      )}

      {selectedSupplier && (
        <>
          <SectionHeader icon="cube" title={t('purchases.items')} />
          <TextInput style={styles.input} value={itemSearch} onChangeText={setItemSearch} placeholder={t('sale.searchPlaceholder')} placeholderTextColor={colors.inkMuted} />
          {itemResults.length > 0 && (
            <View style={styles.suggestionBox}>
              {itemResults.map((r) => (
                <Pressable key={r.id} style={styles.searchRow} onPress={() => handleSelectPiece(r)}>
                  <Text style={styles.rowTitle}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {sizePick && (
            <Card style={styles.spacedTop}>
              <View style={styles.chipWrap}>
                {sizePick.variants.map((v) => (
                  <Chip key={v.id} label={v.label} onPress={() => addItem(sizePick.piece.name, v.id, v.label, v.nominalWeightMg, v.costCentimes)} />
                ))}
              </View>
              <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={() => setSizePick(null)} style={styles.spacedTop} />
            </Card>
          )}

          {items.map((item) => (
            <Card key={item.key} style={styles.spacedTop}>
              <Text style={styles.rowTitle}>
                {item.pieceName} · {item.variantLabel}
              </Text>
              <View style={styles.variantFieldsRow}>
                <View style={styles.variantField}>
                  <Text style={styles.smallLabel}>{t('piece.quantity')}</Text>
                  <TextInput style={styles.input} value={item.qty} onChangeText={(v) => updateItem(item.key, { qty: v })} keyboardType="number-pad" />
                </View>
                <View style={styles.variantField}>
                  <Text style={styles.smallLabel}>{t('piece.weightGrams')}</Text>
                  <TextInput style={styles.input} value={item.weightGrams} onChangeText={(v) => updateItem(item.key, { weightGrams: v })} keyboardType="decimal-pad" />
                </View>
                <View style={styles.variantField}>
                  <Text style={styles.smallLabel}>{t('piece.costMad')}</Text>
                  <TextInput style={styles.input} value={item.costMad} onChangeText={(v) => updateItem(item.key, { costMad: v })} keyboardType="decimal-pad" />
                </View>
              </View>
              <Button label={t('common.delete')} tone="danger" variant="text" icon="trash-outline" size="sm" onPress={() => removeItem(item.key)} style={styles.spacedTop} />
            </Card>
          ))}

          <SectionHeader icon="document-text" title={t('purchases.reference')} />
          <TextInput style={styles.input} value={reference} onChangeText={setReference} placeholderTextColor={colors.inkMuted} />
          <Text style={styles.smallLabel}>{t('purchases.dueOn')}</Text>
          <TextInput style={styles.input} value={dueOn} onChangeText={setDueOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />
          <Text style={styles.smallLabel}>{t('piece.notes')}</Text>
          <TextInput style={[styles.input, styles.notesInput]} value={note} onChangeText={setNote} multiline placeholderTextColor={colors.inkMuted} />

          <Button label={t('purchases.savePurchase')} icon="checkmark-circle" variant="primary" fullWidth loading={saving} onPress={handleSavePurchase} style={styles.spacedTopLg} />

          <SectionHeader icon="time" title={t('purchases.history')} />
          {history.length === 0 ? (
            <EmptyState icon="receipt-outline" message={t('purchases.noHistory')} compact />
          ) : (
            history.map((p) => (
              <Card key={p.id} style={styles.spacedTop}>
                <Text style={styles.rowTitle}>{p.reference || p.occurredAt.slice(0, 10)}</Text>
                <Text style={styles.pieceSubtitle}>
                  {t('purchases.total')}: {formatMad(p.totalCentimes)} · {t('purchases.paid')}: {formatMad(p.paidCentimes)} · {t('purchases.outstanding')}: {formatMad(p.outstandingCentimes)}
                </Text>
                {p.outstandingCentimes > 0 &&
                  (payingPurchaseId === p.id ? (
                    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                      <TextInput style={styles.input} value={payAmountMad} onChangeText={setPayAmountMad} keyboardType="decimal-pad" autoFocus placeholderTextColor={colors.inkMuted} />
                      <View style={styles.chipWrap}>
                        {METHODS.map((m) => (
                          <Chip key={m} label={t(`sale.method_${m}`)} active={payMethod === m} onPress={() => setPayMethod(m)} icon={PAYMENT_METHOD_ICONS[m]} />
                        ))}
                      </View>
                      <View style={styles.actionRow}>
                        <Button label={t('common.cancel')} variant="secondary" onPress={() => setPayingPurchaseId(null)} style={{ flex: 1 }} />
                        <Button label={t('layaways.recordPayment')} variant="primary" icon="checkmark" onPress={() => handleRecordPayment(p)} style={{ flex: 2 }} />
                      </View>
                    </View>
                  ) : (
                    <Button label={t('layaways.recordPayment')} icon="cash-outline" size="sm" onPress={() => setPayingPurchaseId(p.id)} style={styles.spacedTop} />
                  ))}
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  firstSection: { marginTop: 0 },
  smallLabel: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  suggestionBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  pieceSubtitle: { color: colors.inkSoft, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  variantFieldsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  variantField: { flex: 1 },
  spacedTop: { marginTop: spacing.sm },
  spacedTopLg: { marginTop: spacing.lg },
  actionRow: { flexDirection: 'row', gap: spacing.md },
});
