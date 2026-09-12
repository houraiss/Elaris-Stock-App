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
import { listActiveMaterials } from '../db/repositories/materials';
import {
  findVariantByBarcode,
  restockVariant,
  searchPieces,
  searchVariantsForRestock,
  createPieceWithOpeningStock,
  addVariantWithOpeningStock,
  type MatchedVariant,
  type PieceSearchResult,
} from '../db/repositories/stockIntake';
import { suggestPrice } from '../pricing/suggestPrice';
import { madToCentimes, centimesToMad } from '../utils/money';
import { gramsToMg } from '../utils/weight';
import { RING_SIZE_PRESETS } from '../catalogue/ringSizes';
import type { Material } from '../db/schema/materials';
import type { ItemType, VariantType } from '../db/schema/pieces';

type Props = NativeStackScreenProps<RootStackParamList, 'StockIntake'>;

type IntakeMode = 'scan' | 'manual';

type Resolution =
  | { kind: 'none' }
  | { kind: 'matched'; match: MatchedVariant }
  | { kind: 'lookup'; barcode: string | null };

const ITEM_TYPES: ItemType[] = ['model', 'unique'];
const VARIANT_TYPES: VariantType[] = ['none', 'ring_size', 'length'];

export function StockIntakeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<IntakeMode>('scan');
  const [resolution, setResolution] = useState<Resolution>({ kind: 'none' });
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scanLocked) return;
    setScanLocked(true);
    resolveBarcode(result.data);
  }

  async function resolveBarcode(code: string) {
    const match = await findVariantByBarcode(code);
    if (match) {
      setResolution({ kind: 'matched', match });
    } else {
      setResolution({ kind: 'lookup', barcode: code });
    }
  }

  function reset() {
    setResolution({ kind: 'none' });
    setScanLocked(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, mode === 'scan' && styles.modeButtonActive]}
          onPress={() => {
            setMode('scan');
            reset();
          }}
        >
          <Text style={[styles.modeButtonText, mode === 'scan' && styles.modeButtonTextActive]}>
            {t('stockIntake.scan')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
          onPress={() => {
            setMode('manual');
            reset();
          }}
        >
          <Text style={[styles.modeButtonText, mode === 'manual' && styles.modeButtonTextActive]}>
            {t('stockIntake.manual')}
          </Text>
        </Pressable>
      </View>

      {resolution.kind === 'matched' && (
        <RestockPanel match={resolution.match} onDone={reset} onCancel={reset} />
      )}

      {resolution.kind === 'lookup' && (
        <PieceLookupPanel barcode={resolution.barcode} onDone={reset} onCancel={reset} />
      )}

      {resolution.kind === 'none' && mode === 'scan' && (
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
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
                }}
                onBarcodeScanned={handleBarcodeScanned}
              />
              <View style={[StyleSheet.absoluteFill, styles.scanOverlay]} pointerEvents="none">
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>{t('stockIntake.scanHint')}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {resolution.kind === 'none' && mode === 'manual' && (
        <ManualSearchPanel
          onMatch={(match) => setResolution({ kind: 'matched', match })}
          onCreateNew={() => setResolution({ kind: 'lookup', barcode: null })}
        />
      )}
    </View>
  );
}

function RestockPanel({
  match,
  onDone,
  onCancel,
}: {
  match: MatchedVariant;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState('1');
  const [costMad, setCostMad] = useState(String(centimesToMad(match.variant.costCentimes)));
  const [priceMad, setPriceMad] = useState(String(centimesToMad(match.variant.priceCentimes)));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const qty = parseInt(quantity, 10);
    const costCentimes = madToCentimes(parseFloat(costMad) || 0);
    const priceCentimes = madToCentimes(parseFloat(priceMad) || 0);
    if (!qty || qty <= 0 || costCentimes <= 0 || priceCentimes <= 0) {
      Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
      return;
    }
    setSaving(true);
    try {
      await restockVariant({ variantId: match.variant.id, quantity: qty, unitCostCentimes: costCentimes, priceCentimes });
      Alert.alert(t('stockIntake.savedTitle'), t('stockIntake.savedRestock', { name: match.piece.name, label: match.variant.label, count: qty }));
      onDone();
    } catch (err) {
      Alert.alert(t('piece.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
      <View style={styles.matchBadge}>
        <Text style={styles.matchBadgeText}>{t('stockIntake.matched')}</Text>
      </View>
      <Text style={styles.pieceName}>{match.piece.name}</Text>
      <Text style={styles.pieceSubtitle}>
        {match.materialName} · {match.variant.label}
      </Text>
      <Text style={styles.pieceSubtitle}>
        {t('stockIntake.currentOnHand')}: {match.stock.onHand}
      </Text>

      <Text style={styles.label}>{t('piece.quantity')}</Text>
      <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />

      <Text style={styles.label}>{t('piece.costMad')}</Text>
      <TextInput style={styles.input} value={costMad} onChangeText={setCostMad} keyboardType="decimal-pad" />

      <Text style={styles.label}>{t('piece.priceMad')}</Text>
      <TextInput style={styles.input} value={priceMad} onChangeText={setPriceMad} keyboardType="decimal-pad" />

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
          <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('stockIntake.addStock')}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ManualSearchPanel({
  onMatch,
  onCreateNew,
}: {
  onMatch: (match: MatchedVariant) => void;
  onCreateNew: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MatchedVariant[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const rows = await searchVariantsForRestock(query);
      setResults(rows);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>{t('stockIntake.searchLabel')}</Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={t('stockIntake.searchPlaceholder')}
      />
      {searching && <ActivityIndicator style={{ marginTop: 8 }} />}
      <ScrollView style={{ marginTop: 8 }}>
        {results.map((r) => (
          <Pressable key={r.variant.id} style={styles.searchRow} onPress={() => onMatch(r)}>
            <Text style={styles.rowTitle}>{r.piece.name}</Text>
            <Text style={styles.pieceSubtitle}>
              {r.materialName} · {r.variant.label} · {t('stockIntake.currentOnHand')}: {r.stock.onHand}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.smallButton} onPress={onCreateNew}>
        <Text style={styles.smallButtonText}>{t('stockIntake.createNew')}</Text>
      </Pressable>
    </View>
  );
}

function PieceLookupPanel({
  barcode,
  onDone,
  onCancel,
}: {
  barcode: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [nameQuery, setNameQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PieceSearchResult[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<PieceSearchResult | null>(null);
  const [category, setCategory] = useState('');
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [itemType, setItemType] = useState<ItemType>('model');
  const [variantType, setVariantType] = useState<VariantType>('none');
  const [label, setLabel] = useState('default');
  const [weightGrams, setWeightGrams] = useState('');
  const [costMad, setCostMad] = useState('');
  const [priceMad, setPriceMad] = useState('');
  const [priceEdited, setPriceEdited] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listActiveMaterials().then((rows) => {
      setMaterials(rows);
      setMaterialId((current) => current ?? rows[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (selectedPiece || nameQuery.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSuggestions(await searchPieces(nameQuery));
    }, 300);
    return () => clearTimeout(handle);
  }, [nameQuery, selectedPiece]);

  useEffect(() => {
    if (priceEdited || !materialId) return;
    const weightMg = gramsToMg(parseFloat(weightGrams) || 0);
    const costCentimes = madToCentimes(parseFloat(costMad) || 0);
    if (weightMg > 0 && costCentimes > 0) {
      try {
        const suggested = suggestPrice(costCentimes, weightMg, materialId, new Date().toISOString());
        setPriceMad(String(centimesToMad(suggested)));
      } catch {
        // No rule covers this weight yet — leave price for manual entry.
      }
    }
  }, [weightGrams, costMad, materialId, priceEdited]);

  function selectSuggestion(piece: PieceSearchResult) {
    setSelectedPiece(piece);
    setNameQuery(piece.name);
    setCategory(piece.category);
    setMaterialId(piece.materialId);
    setItemType(piece.itemType);
    setVariantType(piece.variantType);
    setLabel(piece.variantType === 'none' ? 'default' : '');
    setSuggestions([]);
  }

  function clearSelection() {
    setSelectedPiece(null);
    setCategory('');
    setItemType('model');
    setVariantType('none');
    setLabel('default');
  }

  async function handleSave() {
    const weightMg = gramsToMg(parseFloat(weightGrams) || 0);
    const costCentimes = madToCentimes(parseFloat(costMad) || 0);
    const priceCentimes = madToCentimes(parseFloat(priceMad) || 0);
    const qty = parseInt(quantity, 10) || 0;
    const finalLabel = variantType === 'none' ? 'default' : label.trim();

    if (
      !nameQuery.trim() ||
      !category.trim() ||
      !materialId ||
      !finalLabel ||
      weightMg <= 0 ||
      costCentimes <= 0 ||
      priceCentimes <= 0 ||
      qty <= 0
    ) {
      Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
      return;
    }

    setSaving(true);
    try {
      if (selectedPiece) {
        if (selectedPiece.itemType === 'unique') {
          Alert.alert(t('common.errorGeneric'), t('stockIntake.uniqueCannotAddVariant'));
          return;
        }
        await addVariantWithOpeningStock(selectedPiece.id, {
          label: finalLabel,
          nominalWeightMg: weightMg,
          costCentimes,
          priceCentimes,
          barcode,
          quantity: qty,
        });
      } else {
        await createPieceWithOpeningStock({
          name: nameQuery.trim(),
          category: category.trim(),
          materialId,
          itemType,
          variantType,
          variants: [
            { label: finalLabel, nominalWeightMg: weightMg, costCentimes, priceCentimes, barcode, quantity: qty },
          ],
        });
      }
      Alert.alert(t('stockIntake.savedTitle'), t('stockIntake.savedNew', { name: nameQuery.trim() }));
      onDone();
    } catch (err) {
      Alert.alert(t('piece.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
      {barcode && (
        <View style={styles.matchBadge}>
          <Text style={styles.matchBadgeText}>{t('stockIntake.newBarcode', { code: barcode })}</Text>
        </View>
      )}

      <Text style={styles.label}>{t('piece.name')}</Text>
      <TextInput
        style={styles.input}
        value={nameQuery}
        onChangeText={(text) => {
          setNameQuery(text);
          if (selectedPiece) clearSelection();
        }}
        placeholder={t('piece.namePlaceholder')}
      />
      {suggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {suggestions.map((s) => (
            <Pressable key={s.id} style={styles.searchRow} onPress={() => selectSuggestion(s)}>
              <Text style={styles.rowTitle}>{s.name}</Text>
              <Text style={styles.pieceSubtitle}>
                {s.materialName} · {t(`piece.itemType${s.itemType === 'model' ? 'Model' : 'Unique'}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {selectedPiece && (
        <Text style={styles.hintText}>{t('stockIntake.attachingToExisting')}</Text>
      )}

      <Text style={styles.label}>{t('piece.category')}</Text>
      <TextInput
        style={[styles.input, selectedPiece != null && styles.inputDisabled]}
        value={category}
        onChangeText={setCategory}
        editable={!selectedPiece}
        placeholder={t('piece.categoryPlaceholder')}
      />

      <Text style={styles.label}>{t('piece.material')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        {materials.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => !selectedPiece && setMaterialId(m.id)}
            style={[styles.chip, materialId === m.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, materialId === m.id && styles.chipTextActive]}>{m.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!selectedPiece && (
        <>
          <Text style={styles.label}>{t('piece.itemType')}</Text>
          <View style={styles.toggleRow}>
            {ITEM_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => setItemType(type)}
                style={[styles.toggle, itemType === type && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, itemType === type && styles.toggleTextActive]}>
                  {t(`piece.itemType${type === 'model' ? 'Model' : 'Unique'}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t('piece.variantType')}</Text>
          <View style={styles.toggleRow}>
            {VARIANT_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => setVariantType(type)}
                style={[styles.toggle, variantType === type && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, variantType === type && styles.toggleTextActive]}>
                  {t(`piece.variantType${type === 'none' ? 'None' : type === 'ring_size' ? 'RingSize' : 'Length'}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {variantType !== 'none' && (
        <>
          <Text style={styles.label}>{t('piece.variantLabel')}</Text>
          {variantType === 'ring_size' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
              {RING_SIZE_PRESETS.map((size) => (
                <Pressable
                  key={size}
                  onPress={() => setLabel(size)}
                  style={[styles.chip, label === size && styles.chipActive]}
                >
                  <Text style={[styles.chipText, label === size && styles.chipTextActive]}>{size}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder={t('piece.variantLabel')} />
        </>
      )}

      <View style={styles.variantFieldsRow}>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('piece.weightGrams')}</Text>
          <TextInput style={styles.input} value={weightGrams} onChangeText={setWeightGrams} keyboardType="decimal-pad" placeholder="0" />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('piece.costMad')}</Text>
          <TextInput style={styles.input} value={costMad} onChangeText={setCostMad} keyboardType="decimal-pad" placeholder="0" />
        </View>
      </View>
      <View style={styles.variantFieldsRow}>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('piece.priceMad')}</Text>
          <TextInput
            style={styles.input}
            value={priceMad}
            onChangeText={(text) => {
              setPriceEdited(true);
              setPriceMad(text);
            }}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('piece.quantity')}</Text>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        </View>
      </View>

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
  modeRow: { flexDirection: 'row', padding: 12, gap: 8 },
  modeButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  modeButtonActive: { backgroundColor: '#1a1a1a' },
  modeButtonText: { color: '#333', fontWeight: '600' },
  modeButtonTextActive: { color: '#fff' },
  scanArea: { flex: 1, paddingHorizontal: 12, paddingBottom: 12 },
  camera: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
  },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 14, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  permissionText: { textAlign: 'center', color: '#555', paddingHorizontal: 24 },
  panel: { padding: 16, gap: 4 },
  matchBadge: { alignSelf: 'flex-start', backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  matchBadgeText: { color: '#166534', fontWeight: '600', fontSize: 12 },
  pieceName: { fontSize: 20, fontWeight: '700' },
  pieceSubtitle: { color: '#666', fontSize: 13, marginBottom: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  hintText: { color: '#166534', fontSize: 12, marginTop: 4, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 6, color: '#333' },
  smallLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputDisabled: { backgroundColor: '#f5f5f5', color: '#888' },
  chipScroller: { marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0', marginEnd: 8 },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  toggleActive: { backgroundColor: '#1a1a1a' },
  toggleText: { color: '#333', fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  variantFieldsRow: { flexDirection: 'row', gap: 8 },
  variantField: { flex: 1 },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  suggestionBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 4, paddingHorizontal: 10 },
  smallButton: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8, alignSelf: 'flex-start', marginTop: 12 },
  smallButtonText: { fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 40 },
  secondaryButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f0f0f0' },
  secondaryButtonText: { fontWeight: '600', color: '#333' },
  saveButton: { flex: 2, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
