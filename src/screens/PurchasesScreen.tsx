import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('purchases.supplier')}</Text>
      <TextInput
        style={styles.input}
        value={selectedSupplier ? selectedSupplier.name : supplierQuery}
        onChangeText={(text) => {
          setSelectedSupplier(null);
          setSupplierQuery(text);
          setShowNewSupplierForm(false);
        }}
        placeholder={t('purchases.supplierPlaceholder')}
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
            <Pressable style={styles.smallButton} onPress={() => setShowNewSupplierForm(true)}>
              <Text style={styles.smallButtonText}>{t('purchases.createSupplier', { name: supplierQuery.trim() })}</Text>
            </Pressable>
          ) : (
            <View style={styles.panel}>
              <View style={styles.chipWrap}>
                {SUPPLIER_KINDS.map((k) => (
                  <Pressable key={k} onPress={() => setNewSupplierKind(k)} style={[styles.chip, newSupplierKind === k && styles.chipActive]}>
                    <Text style={[styles.chipText, newSupplierKind === k && styles.chipTextActive]}>{t(`purchases.kind_${k}`)}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.smallButton} onPress={handleCreateSupplier}>
                <Text style={styles.smallButtonText}>{t('common.save')}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {selectedSupplier && (
        <>
          <Text style={styles.label}>{t('purchases.items')}</Text>
          <TextInput style={styles.input} value={itemSearch} onChangeText={setItemSearch} placeholder={t('sale.searchPlaceholder')} />
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
            <View style={styles.panel}>
              <View style={styles.chipWrap}>
                {sizePick.variants.map((v) => (
                  <Pressable key={v.id} style={styles.chip} onPress={() => addItem(sizePick.piece.name, v.id, v.label, v.nominalWeightMg, v.costCentimes)}>
                    <Text style={styles.chipText}>{v.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.smallButton} onPress={() => setSizePick(null)}>
                <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          )}

          {items.map((item) => (
            <View key={item.key} style={styles.itemCard}>
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
              <Pressable onPress={() => removeItem(item.key)}>
                <Text style={styles.removeText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          ))}

          <Text style={styles.label}>{t('purchases.reference')}</Text>
          <TextInput style={styles.input} value={reference} onChangeText={setReference} />
          <Text style={styles.label}>{t('purchases.dueOn')}</Text>
          <TextInput style={styles.input} value={dueOn} onChangeText={setDueOn} placeholder="YYYY-MM-DD" />
          <Text style={styles.label}>{t('piece.notes')}</Text>
          <TextInput style={[styles.input, styles.notesInput]} value={note} onChangeText={setNote} multiline />

          <Pressable style={styles.saveButton} onPress={handleSavePurchase} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('purchases.savePurchase')}</Text>}
          </Pressable>

          <Text style={styles.label}>{t('purchases.history')}</Text>
          {history.length === 0 && <Text style={styles.emptyText}>{t('purchases.noHistory')}</Text>}
          {history.map((p) => (
            <View key={p.id} style={styles.itemCard}>
              <Text style={styles.rowTitle}>{p.reference || p.occurredAt.slice(0, 10)}</Text>
              <Text style={styles.pieceSubtitle}>
                {t('purchases.total')}: {formatMad(p.totalCentimes)} · {t('purchases.paid')}: {formatMad(p.paidCentimes)} · {t('purchases.outstanding')}: {formatMad(p.outstandingCentimes)}
              </Text>
              {p.outstandingCentimes > 0 &&
                (payingPurchaseId === p.id ? (
                  <View style={{ gap: 8 }}>
                    <TextInput style={styles.input} value={payAmountMad} onChangeText={setPayAmountMad} keyboardType="decimal-pad" autoFocus />
                    <View style={styles.chipWrap}>
                      {METHODS.map((m) => (
                        <Pressable key={m} onPress={() => setPayMethod(m)} style={[styles.chip, payMethod === m && styles.chipActive]}>
                          <Text style={[styles.chipText, payMethod === m && styles.chipTextActive]}>{t(`sale.method_${m}`)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable style={styles.smallButton} onPress={() => setPayingPurchaseId(null)}>
                        <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
                      </Pressable>
                      <Pressable style={styles.smallButton} onPress={() => handleRecordPayment(p)}>
                        <Text style={styles.smallButtonText}>{t('layaways.recordPayment')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.smallButton} onPress={() => setPayingPurchaseId(p.id)}>
                    <Text style={styles.smallButtonText}>{t('layaways.recordPayment')}</Text>
                  </Pressable>
                ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4, backgroundColor: '#fff' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6, color: '#333' },
  smallLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  emptyText: { color: '#888', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  suggestionBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 4, paddingHorizontal: 10 },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  pieceSubtitle: { color: '#666', fontSize: 13 },
  panel: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginTop: 8, gap: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  itemCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginTop: 8, gap: 8 },
  variantFieldsRow: { flexDirection: 'row', gap: 8 },
  variantField: { flex: 1 },
  removeText: { color: '#b00020' },
  smallButton: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8, alignSelf: 'flex-start', marginTop: 8 },
  smallButtonText: { fontWeight: '600' },
  saveButton: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
