import { useEffect, useState } from 'react';
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
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getPieceDetail } from '../db/repositories/pieces';
import { searchPieces, findVariantByBarcode, type PieceSearchResult } from '../db/repositories/stockIntake';
import { searchCustomers, createCustomer } from '../db/repositories/customers';
import { createSale, type CartLine } from '../db/repositories/sales';
import { madToCentimes, centimesToMad, formatMad } from '../utils/money';
import type { Customer } from '../db/schema/customers';
import type { SaleChannel } from '../db/schema/sales';
import type { PaymentMethod } from '../db/schema/supplierPayments';

type Props = NativeStackScreenProps<RootStackParamList, 'LogSale'>;

interface DisplayCartLine extends CartLine {
  key: string;
  pieceName: string;
  variantLabel: string;
  materialName: string;
  available: number;
}

type Picker =
  | { kind: 'closed' }
  | { kind: 'search' }
  | { kind: 'scan' }
  | { kind: 'sizePick'; piece: PieceSearchResult; variants: { id: string; label: string; available: number; nominalWeightMg: number; costCentimes: number; priceCentimes: number }[]; materialName: string };

const CHANNELS: SaleChannel[] = ['shop', 'market', 'whatsapp', 'instagram', 'tiktok'];
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer'];

export function LogSaleScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [cart, setCart] = useState<DisplayCartLine[]>([]);
  const [picker, setPicker] = useState<Picker>({ kind: 'closed' });
  const [channel, setChannel] = useState<SaleChannel>('shop');
  const [discountMad, setDiscountMad] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [isLayaway, setIsLayaway] = useState(false);
  const [depositMad, setDepositMad] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedCustomer || customerQuery.trim().length === 0) {
      setCustomerSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => setCustomerSuggestions(await searchCustomers(customerQuery)), 300);
    return () => clearTimeout(handle);
  }, [customerQuery, selectedCustomer]);

  const subtotalCentimes = cart.reduce((sum, line) => sum + line.unitPriceCentimes * line.qty, 0);
  const discountCentimes = madToCentimes(parseFloat(discountMad) || 0);
  const totalCentimes = subtotalCentimes - discountCentimes;

  function addLine(line: Omit<DisplayCartLine, 'key'>) {
    setCart((current) => {
      const existing = current.find((l) => l.variantId === line.variantId);
      if (existing) {
        return current.map((l) => (l.variantId === line.variantId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...current, { ...line, key: line.variantId }];
    });
    setPicker({ kind: 'closed' });
  }

  function updateQty(variantId: string, qty: number) {
    setCart((current) =>
      current
        .map((l) => (l.variantId === variantId ? { ...l, qty: Math.max(0, qty) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function updatePrice(variantId: string, priceMad: string) {
    const priceCentimes = madToCentimes(parseFloat(priceMad) || 0);
    setCart((current) => current.map((l) => (l.variantId === variantId ? { ...l, unitPriceCentimes: priceCentimes } : l)));
  }

  function removeLine(variantId: string) {
    setCart((current) => current.filter((l) => l.variantId !== variantId));
  }

  async function openSizePick(piece: PieceSearchResult) {
    const detail = await getPieceDetail(piece.id);
    if (!detail) return;
    setPicker({
      kind: 'sizePick',
      piece,
      materialName: detail.materialName,
      variants: detail.variants.map((v) => ({
        id: v.id,
        label: v.label,
        available: v.stock.available,
        nominalWeightMg: v.nominalWeightMg,
        costCentimes: v.costCentimes,
        priceCentimes: v.priceCentimes,
      })),
    });
  }

  async function handleSelectSearchResult(piece: PieceSearchResult) {
    if (piece.variantType === 'none') {
      const detail = await getPieceDetail(piece.id);
      const variant = detail?.variants[0];
      if (!variant) return;
      if (variant.stock.available <= 0) {
        Alert.alert(t('sale.outOfStock'));
        return;
      }
      addLine({
        variantId: variant.id,
        qty: 1,
        weightMgActual: variant.nominalWeightMg,
        unitCostCentimes: variant.costCentimes,
        unitPriceCentimes: variant.priceCentimes,
        pieceName: piece.name,
        variantLabel: variant.label,
        materialName: detail!.materialName,
        available: variant.stock.available,
      });
    } else {
      openSizePick(piece);
    }
  }

  function handleSelectSizedVariant(
    piece: PieceSearchResult,
    materialName: string,
    variant: { id: string; label: string; available: number; nominalWeightMg: number; costCentimes: number; priceCentimes: number },
  ) {
    if (variant.available <= 0) {
      Alert.alert(t('sale.outOfStock'));
      return;
    }
    addLine({
      variantId: variant.id,
      qty: 1,
      weightMgActual: variant.nominalWeightMg,
      unitCostCentimes: variant.costCentimes,
      unitPriceCentimes: variant.priceCentimes,
      pieceName: piece.name,
      variantLabel: variant.label,
      materialName,
      available: variant.available,
    });
  }

  async function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (picker.kind !== 'scan') return;
    setPicker({ kind: 'closed' }); // lock immediately to avoid duplicate scans
    const match = await findVariantByBarcode(result.data);
    if (!match) {
      Alert.alert(t('sale.noMatch'));
      return;
    }
    if (match.stock.available <= 0) {
      Alert.alert(t('sale.outOfStock'));
      return;
    }
    addLine({
      variantId: match.variant.id,
      qty: 1,
      weightMgActual: match.variant.nominalWeightMg,
      unitCostCentimes: match.variant.costCentimes,
      unitPriceCentimes: match.variant.priceCentimes,
      pieceName: match.piece.name,
      variantLabel: match.variant.label,
      materialName: match.materialName,
      available: match.stock.available,
    });
  }

  function resetForm() {
    setCart([]);
    setDiscountMad('0');
    setNote('');
    setIsLayaway(false);
    setDepositMad('');
    setDueOn('');
    setCustomerQuery('');
    setSelectedCustomer(null);
    setPicker({ kind: 'closed' });
  }

  async function handleCompleteSale() {
    if (cart.length === 0) {
      Alert.alert(t('common.errorGeneric'), t('sale.emptyCart'));
      return;
    }

    const items: CartLine[] = cart.map((l) => ({
      variantId: l.variantId,
      qty: l.qty,
      weightMgActual: l.weightMgActual,
      unitCostCentimes: l.unitCostCentimes,
      unitPriceCentimes: l.unitPriceCentimes,
    }));

    setSaving(true);
    try {
      if (isLayaway) {
        const depositCentimes = madToCentimes(parseFloat(depositMad) || 0);
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
        if (depositCentimes <= 0 || depositCentimes > totalCentimes) {
          Alert.alert(t('common.errorGeneric'), t('sale.invalidDeposit'));
          setSaving(false);
          return;
        }
        await createSale({
          paymentTerms: 'instalment',
          channel,
          discountCentimes,
          note: note.trim() || null,
          method,
          items,
          customerId,
          depositCentimes,
          dueOn: dueOn.trim() || null,
        });
        Alert.alert(t('sale.savedTitle'), t('sale.savedLayaway', { total: formatMad(totalCentimes), deposit: formatMad(depositCentimes) }));
      } else {
        let customerId: string | null = selectedCustomer?.id ?? null;
        if (!customerId && customerQuery.trim()) {
          customerId = (await createCustomer({ displayName: customerQuery.trim() })).id;
        }
        await createSale({
          paymentTerms: 'immediate',
          channel,
          discountCentimes,
          note: note.trim() || null,
          method,
          items,
          customerId,
        });
        Alert.alert(t('sale.savedTitle'), t('sale.savedImmediate', { total: formatMad(totalCentimes) }));
      }
      resetForm();
    } catch (err) {
      Alert.alert(t('sale.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.addRow}>
        <Pressable style={styles.smallButton} onPress={() => setPicker({ kind: 'scan' })}>
          <Text style={styles.smallButtonText}>{t('sale.scan')}</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={() => setPicker({ kind: 'search' })}>
          <Text style={styles.smallButtonText}>{t('sale.search')}</Text>
        </Pressable>
      </View>

      {picker.kind === 'scan' && <ScanPanel onScanned={handleBarcodeScanned} onCancel={() => setPicker({ kind: 'closed' })} />}
      {picker.kind === 'search' && (
        <SearchPanel onSelect={handleSelectSearchResult} onCancel={() => setPicker({ kind: 'closed' })} />
      )}
      {picker.kind === 'sizePick' && (
        <View style={styles.panel}>
          <Text style={styles.label}>{picker.piece.name}</Text>
          <View style={styles.chipWrap}>
            {picker.variants.map((v) => (
              <Pressable
                key={v.id}
                disabled={v.available <= 0}
                onPress={() => handleSelectSizedVariant(picker.piece, picker.materialName, v)}
                style={[styles.chip, v.available <= 0 && styles.chipDisabled]}
              >
                <Text style={styles.chipText}>
                  {v.label} ({v.available})
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.smallButton} onPress={() => setPicker({ kind: 'closed' })}>
            <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.label}>{t('sale.cart')}</Text>
      {cart.length === 0 && <Text style={styles.emptyText}>{t('sale.cartEmpty')}</Text>}
      {cart.map((line) => (
        <View key={line.key} style={styles.cartLine}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{line.pieceName}</Text>
            <Text style={styles.pieceSubtitle}>
              {line.materialName} · {line.variantLabel}
            </Text>
            <View style={styles.qtyRow}>
              <Pressable style={styles.qtyButton} onPress={() => updateQty(line.variantId, line.qty - 1)}>
                <Text style={styles.qtyButtonText}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{line.qty}</Text>
              <Pressable
                style={styles.qtyButton}
                onPress={() => line.qty < line.available && updateQty(line.variantId, line.qty + 1)}
              >
                <Text style={styles.qtyButtonText}>+</Text>
              </Pressable>
              <TextInput
                style={styles.priceInput}
                value={String(centimesToMad(line.unitPriceCentimes))}
                onChangeText={(text) => updatePrice(line.variantId, text)}
                keyboardType="decimal-pad"
              />
              <Pressable onPress={() => removeLine(line.variantId)}>
                <Text style={styles.removeText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}

      <Text style={styles.label}>{t('sale.channel')}</Text>
      <View style={styles.chipWrap}>
        {CHANNELS.map((c) => (
          <Pressable key={c} onPress={() => setChannel(c)} style={[styles.chip, channel === c && styles.chipActive]}>
            <Text style={[styles.chipText, channel === c && styles.chipTextActive]}>{t(`sale.channel_${c}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('sale.discountMad')}</Text>
      <TextInput style={styles.input} value={discountMad} onChangeText={setDiscountMad} keyboardType="decimal-pad" />

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
            <Pressable
              key={c.id}
              style={styles.searchRow}
              onPress={() => {
                setSelectedCustomer(c);
                setCustomerQuery(c.displayName);
                setCustomerSuggestions([]);
              }}
            >
              <Text style={styles.rowTitle}>{c.displayName}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.toggleFullRow}>
        <Text style={styles.label}>{t('sale.layawayToggle')}</Text>
        <Pressable
          style={[styles.toggleSwitch, isLayaway && styles.toggleSwitchActive]}
          onPress={() => setIsLayaway((v) => !v)}
        >
          <Text style={styles.toggleSwitchText}>{isLayaway ? t('common.yes') : t('common.no')}</Text>
        </Pressable>
      </View>

      {isLayaway ? (
        <>
          <Text style={styles.label}>{t('sale.depositMad')}</Text>
          <TextInput style={styles.input} value={depositMad} onChangeText={setDepositMad} keyboardType="decimal-pad" />
          <Text style={styles.label}>{t('sale.dueOn')}</Text>
          <TextInput style={styles.input} value={dueOn} onChangeText={setDueOn} placeholder="YYYY-MM-DD" />
        </>
      ) : null}

      <Text style={styles.label}>{isLayaway ? t('sale.depositMethod') : t('sale.method')}</Text>
      <View style={styles.chipWrap}>
        {METHODS.map((m) => (
          <Pressable key={m} onPress={() => setMethod(m)} style={[styles.chip, method === m && styles.chipActive]}>
            <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{t(`sale.method_${m}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('piece.notes')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={note} onChangeText={setNote} multiline />

      <View style={styles.totalsBox}>
        <Text style={styles.totalsLine}>{t('sale.subtotal')}: {formatMad(subtotalCentimes)}</Text>
        <Text style={styles.totalsLine}>{t('sale.discount')}: {formatMad(discountCentimes)}</Text>
        <Text style={styles.totalsTotal}>{t('sale.total')}: {formatMad(totalCentimes)}</Text>
      </View>

      <Pressable style={styles.saveButton} onPress={handleCompleteSale} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('sale.completeSale')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

function ScanPanel({
  onScanned,
  onCancel,
}: {
  onScanned: (result: BarcodeScanningResult) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();

  return (
    <View style={styles.scanArea}>
      {!permission ? (
        <ActivityIndicator />
      ) : !permission.granted ? (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>{t('stockIntake.cameraPermission')}</Text>
          <Pressable style={styles.smallButton} onPress={() => requestPermission()}>
            <Text style={styles.smallButtonText}>{t('stockIntake.grantPermission')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={onScanned}
          />
          <View style={[StyleSheet.absoluteFill, styles.scanOverlay]} pointerEvents="none">
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>{t('stockIntake.scanHint')}</Text>
          </View>
        </View>
      )}
      <Pressable style={styles.smallButton} onPress={onCancel}>
        <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

function SearchPanel({
  onSelect,
  onCancel,
}: {
  onSelect: (piece: PieceSearchResult) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PieceSearchResult[]>([]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => setResults(await searchPieces(query)), 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <View style={styles.panel}>
      <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder={t('sale.searchPlaceholder')} autoFocus />
      <ScrollView style={{ maxHeight: 240, marginTop: 8 }}>
        {results.map((r) => (
          <Pressable key={r.id} style={styles.searchRow} onPress={() => onSelect(r)}>
            <Text style={styles.rowTitle}>{r.name}</Text>
            <Text style={styles.pieceSubtitle}>{r.materialName} · {r.category}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.smallButton} onPress={onCancel}>
        <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4, backgroundColor: '#fff' },
  addRow: { flexDirection: 'row', gap: 12 },
  panel: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginTop: 12, gap: 8 },
  scanArea: { height: 320, marginTop: 12, gap: 8 },
  camera: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  scanOverlay: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 200, height: 200, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 16 },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 13, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  permissionText: { textAlign: 'center', color: '#555', paddingHorizontal: 24 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6, color: '#333' },
  emptyText: { color: '#888', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  cartLine: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  pieceSubtitle: { color: '#666', fontSize: 13 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  qtyButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  qtyButtonText: { fontSize: 18, fontWeight: '700' },
  qtyValue: { minWidth: 20, textAlign: 'center', fontWeight: '600' },
  priceInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: 80, marginStart: 8 },
  removeText: { color: '#b00020', marginStart: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  suggestionBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 4, paddingHorizontal: 10 },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  toggleFullRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleSwitch: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: '#f0f0f0' },
  toggleSwitchActive: { backgroundColor: '#1a1a1a' },
  toggleSwitchText: { fontWeight: '600', color: '#333' },
  smallButton: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8, alignSelf: 'flex-start' },
  smallButtonText: { fontWeight: '600' },
  totalsBox: { marginTop: 20, gap: 4 },
  totalsLine: { color: '#555' },
  totalsTotal: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  saveButton: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16, marginBottom: 40 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
