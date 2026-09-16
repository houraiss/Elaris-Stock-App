import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getPieceDetail } from '../db/repositories/pieces';
import { searchPieces, findVariantByBarcode, type PieceSearchResult } from '../db/repositories/stockIntake';
import { searchCustomers, createCustomer } from '../db/repositories/customers';
import { createSale, type CartLine } from '../db/repositories/sales';
import { madToCentimes, centimesToMad, formatMad } from '../utils/money';
import { getMaterialDisplayName } from '../i18n/materialName';
import type { Customer } from '../db/schema/customers';
import type { SaleChannel } from '../db/schema/sales';
import type { PaymentMethod } from '../db/schema/supplierPayments';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { PAYMENT_METHOD_ICONS, SALE_CHANNEL_ICONS } from '../theme/icons';

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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      materialName: getMaterialDisplayName(detail.materialCode, detail.materialName, t),
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
        materialName: getMaterialDisplayName(detail!.materialCode, detail!.materialName, t),
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
      materialName: getMaterialDisplayName(match.materialCode, match.materialName, t),
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
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.addRow}>
        <Button label={t('sale.scan')} icon="barcode-outline" onPress={() => setPicker({ kind: 'scan' })} style={{ flex: 1 }} />
        <Button label={t('sale.search')} icon="search-outline" onPress={() => setPicker({ kind: 'search' })} style={{ flex: 1 }} />
      </View>

      {picker.kind === 'scan' && <ScanPanel onScanned={handleBarcodeScanned} onCancel={() => setPicker({ kind: 'closed' })} />}
      {picker.kind === 'search' && (
        <SearchPanel onSelect={handleSelectSearchResult} onCancel={() => setPicker({ kind: 'closed' })} />
      )}
      {picker.kind === 'sizePick' && (
        <Card style={styles.spacedTop}>
          <Text style={styles.label}>{picker.piece.name}</Text>
          <View style={styles.chipWrap}>
            {picker.variants.map((v) => (
              <Chip
                key={v.id}
                disabled={v.available <= 0}
                onPress={() => handleSelectSizedVariant(picker.piece, picker.materialName, v)}
                label={`${v.label} (${v.available})`}
              />
            ))}
          </View>
          <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={() => setPicker({ kind: 'closed' })} style={styles.spacedTop} />
        </Card>
      )}

      <SectionHeader icon="cart" title={t('sale.cart')} />
      {cart.length === 0 ? (
        <EmptyState icon="cart-outline" message={t('sale.cartEmpty')} compact />
      ) : (
        <View style={styles.cartCard}>
          {cart.map((line, index) => (
            <View key={line.key} style={[styles.cartLine, index === cart.length - 1 && styles.noBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{line.pieceName}</Text>
                <Text style={styles.pieceSubtitle}>
                  {line.materialName} · {line.variantLabel}
                </Text>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.qtyButton} onPress={() => updateQty(line.variantId, line.qty - 1)}>
                    <Ionicons name="remove" size={16} color={colors.ink} />
                  </Pressable>
                  <Text style={styles.qtyValue}>{line.qty}</Text>
                  <Pressable
                    style={styles.qtyButton}
                    onPress={() => line.qty < line.available && updateQty(line.variantId, line.qty + 1)}
                  >
                    <Ionicons name="add" size={16} color={colors.ink} />
                  </Pressable>
                  <TextInput
                    style={styles.priceInput}
                    value={String(centimesToMad(line.unitPriceCentimes))}
                    onChangeText={(text) => updatePrice(line.variantId, text)}
                    keyboardType="decimal-pad"
                  />
                  <Pressable onPress={() => removeLine(line.variantId)} style={styles.removeButton}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <SectionHeader icon="storefront" title={t('sale.channel')} />
      <View style={styles.chipWrap}>
        {CHANNELS.map((c) => (
          <Chip key={c} label={t(`sale.channel_${c}`)} active={channel === c} onPress={() => setChannel(c)} icon={SALE_CHANNEL_ICONS[c]} />
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
        placeholderTextColor={colors.inkMuted}
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
        <Switch
          value={isLayaway}
          onValueChange={setIsLayaway}
          trackColor={{ false: colors.border, true: colors.gold }}
          thumbColor={colors.surface}
        />
      </View>

      {isLayaway ? (
        <>
          <Text style={styles.label}>{t('sale.depositMad')}</Text>
          <TextInput style={styles.input} value={depositMad} onChangeText={setDepositMad} keyboardType="decimal-pad" />
          <Text style={styles.label}>{t('sale.dueOn')}</Text>
          <TextInput style={styles.input} value={dueOn} onChangeText={setDueOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />
        </>
      ) : null}

      <Text style={styles.label}>{isLayaway ? t('sale.depositMethod') : t('sale.method')}</Text>
      <View style={styles.chipWrap}>
        {METHODS.map((m) => (
          <Chip key={m} label={t(`sale.method_${m}`)} active={method === m} onPress={() => setMethod(m)} icon={PAYMENT_METHOD_ICONS[m]} />
        ))}
      </View>

      <Text style={styles.label}>{t('piece.notes')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={note} onChangeText={setNote} multiline placeholderTextColor={colors.inkMuted} />

      <Card style={styles.totalsBox}>
        <View style={styles.totalsLineRow}>
          <Text style={styles.totalsLine}>{t('sale.subtotal')}</Text>
          <Text style={styles.totalsLine}>{formatMad(subtotalCentimes)}</Text>
        </View>
        <View style={styles.totalsLineRow}>
          <Text style={styles.totalsLine}>{t('sale.discount')}</Text>
          <Text style={styles.totalsLine}>{formatMad(discountCentimes)}</Text>
        </View>
        <View style={[styles.totalsLineRow, styles.totalsDivider]}>
          <Text style={styles.totalsTotalLabel}>{t('sale.total')}</Text>
          <Text style={styles.totalsTotal}>{formatMad(totalCentimes)}</Text>
        </View>
      </Card>

      <Button label={t('sale.completeSale')} icon="checkmark-circle" variant="primary" fullWidth loading={saving} onPress={handleCompleteSale} style={styles.spacedTopLg} />
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();

  return (
    <View style={styles.scanArea}>
      {!permission ? (
        <ActivityIndicator color={colors.ink} style={styles.spacedTop} />
      ) : !permission.granted ? (
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={32} color={colors.inkMuted} />
          <Text style={styles.permissionText}>{t('stockIntake.cameraPermission')}</Text>
          <Button label={t('stockIntake.grantPermission')} icon="camera" onPress={() => requestPermission()} />
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
      <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} style={styles.spacedTop} />
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
    <Card style={styles.spacedTop}>
      <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder={t('sale.searchPlaceholder')} placeholderTextColor={colors.inkMuted} autoFocus />
      <ScrollView style={{ maxHeight: 240, marginTop: spacing.sm }}>
        {results.map((r) => (
          <Pressable key={r.id} style={styles.searchRow} onPress={() => onSelect(r)}>
            <Text style={styles.rowTitle}>{r.name}</Text>
            <Text style={styles.pieceSubtitle}>{getMaterialDisplayName(r.materialCode, r.materialName, t)} · {r.category}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={onCancel} style={styles.spacedTop} />
    </Card>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  addRow: { flexDirection: 'row', gap: spacing.md },
  spacedTop: { marginTop: spacing.sm },
  spacedTopLg: { marginTop: spacing.lg, marginBottom: 40 },
  scanArea: { height: 340, marginTop: spacing.md, gap: spacing.sm },
  camera: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  scanOverlay: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 200, height: 200, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: radius.lg },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 13, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  permissionText: { textAlign: 'center', color: colors.inkSoft, paddingHorizontal: 24 },
  label: { fontSize: 14, fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  cartCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  cartLine: { flexDirection: 'row', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  noBorder: { borderBottomWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  pieceSubtitle: { color: colors.inkSoft, fontSize: 13 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  qtyButton: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  qtyValue: { minWidth: 20, textAlign: 'center', fontWeight: '600', color: colors.ink },
  priceInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6, width: 80, marginStart: spacing.sm, color: colors.ink },
  removeButton: { marginStart: spacing.sm, padding: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestionBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  toggleFullRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  totalsBox: { marginTop: spacing.xl, gap: spacing.xs },
  totalsLineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalsLine: { color: colors.inkSoft, fontSize: 14 },
  totalsDivider: { paddingTop: spacing.sm, marginTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  totalsTotalLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
  totalsTotal: { fontSize: 20, fontWeight: '700', color: colors.gold },
});
