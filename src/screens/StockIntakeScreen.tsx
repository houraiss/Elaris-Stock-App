import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listActiveMaterials } from '../db/repositories/materials';
import {
  findVariantByBarcode,
  restockVariant,
  searchPieces,
  searchVariantsForRestock,
  getPieceSearchResultById,
  createPieceWithOpeningStock,
  addVariantWithOpeningStock,
  type MatchedVariant,
  type PieceSearchResult,
} from '../db/repositories/stockIntake';
import { addPhoto } from '../db/repositories/piecePhotos';
import { getMaterialDisplayName } from '../i18n/materialName';
import { capturePhoto } from '../media/capturePhoto';
import {
  isVisionAvailable,
  getCandidatePhotos,
  findVisualMatches,
  describeNewPiece,
  VisionNotEnabledError,
  type VisualMatch,
  type PieceDescription,
} from '../vision/visionClient';
import { suggestPrice } from '../pricing/suggestPrice';
import { madToCentimes, centimesToMad } from '../utils/money';
import { gramsToMg } from '../utils/weight';
import { RING_SIZE_PRESETS } from '../catalogue/ringSizes';
import type { Material } from '../db/schema/materials';
import type { ItemType, VariantType } from '../db/schema/pieces';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { SegmentedControl } from '../components/SegmentedControl';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';

type Props = NativeStackScreenProps<RootStackParamList, 'StockIntake'>;

type IntakeMode = 'scan' | 'photoMatch' | 'manual';

type Resolution =
  | { kind: 'none' }
  | { kind: 'matched'; match: MatchedVariant }
  | {
      kind: 'lookup';
      barcode: string | null;
      initialPiece?: PieceSearchResult;
      capturedPhotoUri?: string;
    };

const ITEM_TYPES: ItemType[] = ['model', 'unique'];
const VARIANT_TYPES: VariantType[] = ['none', 'ring_size', 'length'];

export function StockIntakeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const modeOptions: { value: IntakeMode; label: string; icon: 'scan-outline' | 'camera-outline' | 'search-outline' }[] = [
    { value: 'scan', label: t('stockIntake.scan'), icon: 'scan-outline' },
    ...(isVisionAvailable ? ([{ value: 'photoMatch', label: t('stockIntake.photoMatch'), icon: 'camera-outline' }] as const) : []),
    { value: 'manual', label: t('stockIntake.manual'), icon: 'search-outline' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        <SegmentedControl
          value={mode}
          onChange={(m) => {
            setMode(m);
            reset();
          }}
          options={modeOptions}
        />
      </View>

      {resolution.kind === 'matched' && (
        <RestockPanel match={resolution.match} onDone={reset} onCancel={reset} />
      )}

      {resolution.kind === 'lookup' && (
        <PieceLookupPanel
          barcode={resolution.barcode}
          initialPiece={resolution.initialPiece}
          capturedPhotoUri={resolution.capturedPhotoUri}
          onDone={reset}
          onCancel={reset}
        />
      )}

      {resolution.kind === 'none' && mode === 'scan' && (
        <View style={styles.scanArea}>
          {!permission ? (
            <ActivityIndicator color={colors.ink} />
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

      {resolution.kind === 'none' && mode === 'photoMatch' && (
        <PhotoMatchPanel
          onSelectPiece={(piece) => setResolution({ kind: 'lookup', barcode: null, initialPiece: piece })}
          onCreateNew={(photoUri) => setResolution({ kind: 'lookup', barcode: null, capturedPhotoUri: photoUri })}
          onCancel={reset}
        />
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      <Badge label={t('stockIntake.matched')} tone="success" icon="checkmark-circle-outline" />
      <Text style={styles.pieceName}>{match.piece.name}</Text>
      <Text style={styles.pieceSubtitle}>
        {getMaterialDisplayName(match.materialCode, match.materialName, t)} · {match.variant.label}
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
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={t('stockIntake.addStock')} variant="primary" icon="add-circle" onPress={handleSave} loading={saving} style={{ flex: 2 }} />
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        placeholderTextColor={colors.inkMuted}
      />
      {searching && <ActivityIndicator color={colors.ink} style={{ marginTop: spacing.sm }} />}
      <ScrollView style={{ marginTop: spacing.sm }}>
        {results.map((r) => (
          <Pressable key={r.variant.id} style={styles.searchRow} onPress={() => onMatch(r)}>
            <Text style={styles.rowTitle}>{r.piece.name}</Text>
            <Text style={styles.pieceSubtitle}>
              {getMaterialDisplayName(r.materialCode, r.materialName, t)} · {r.variant.label} ·{' '}
              {t('stockIntake.currentOnHand')}: {r.stock.onHand}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Button label={t('stockIntake.createNew')} icon="add" size="sm" onPress={onCreateNew} style={styles.spacedTop} />
    </View>
  );
}

function PhotoMatchPanel({
  onSelectPiece,
  onCreateNew,
  onCancel,
}: {
  onSelectPiece: (piece: PieceSearchResult) => void;
  onCreateNew: (photoUri: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<(VisualMatch & { label: string })[] | null>(null);

  async function handleTakePhoto() {
    setMatches(null);
    try {
      const uri = await capturePhoto('camera');
      if (!uri) return;
      setPhotoUri(uri);
      setLoading(true);
      const candidates = await getCandidatePhotos();
      const labelByPieceId = new Map(candidates.map((c) => [c.pieceId, c.label]));
      const results = await findVisualMatches(uri, candidates);
      setMatches(results.map((r) => ({ ...r, label: labelByPieceId.get(r.pieceId) ?? r.pieceId })));
    } catch (err) {
      if (err instanceof VisionNotEnabledError) {
        Alert.alert(t('stockIntake.proFeatureTitle'), t('stockIntake.proFeatureBody'));
      } else {
        Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectMatch(pieceId: string) {
    const piece = await getPieceSearchResultById(pieceId);
    if (piece) onSelectPiece(piece);
  }

  return (
    <View style={styles.panel}>
      {!photoUri && <Button label={t('stockIntake.takePhoto')} icon="camera" onPress={handleTakePhoto} />}
      {photoUri && <Image source={{ uri: photoUri }} style={styles.matchPhoto} />}
      {loading && <ActivityIndicator color={colors.ink} style={{ marginTop: spacing.md }} />}

      {matches && matches.length === 0 && (
        <Text style={styles.emptyText}>{t('stockIntake.noVisualMatches')}</Text>
      )}
      {matches?.map((m) => (
        <Pressable key={m.pieceId} style={styles.searchRow} onPress={() => handleSelectMatch(m.pieceId)}>
          <Text style={styles.rowTitle}>{m.label}</Text>
          <Text style={styles.pieceSubtitle}>
            {t('stockIntake.matchConfidence', { percent: Math.round(m.confidence * 100) })} · {m.reason}
          </Text>
        </Pressable>
      ))}

      {photoUri && !loading && (
        <View style={styles.inlineButtonRow}>
          <Button label={t('stockIntake.retakePhoto')} icon="camera-reverse-outline" size="sm" onPress={handleTakePhoto} />
          <Button label={t('stockIntake.noneOfThese')} icon="add" size="sm" onPress={() => onCreateNew(photoUri)} />
        </View>
      )}
      <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={onCancel} style={styles.spacedTop} />
    </View>
  );
}

function PieceLookupPanel({
  barcode,
  initialPiece,
  capturedPhotoUri,
  onDone,
  onCancel,
}: {
  barcode: string | null;
  initialPiece?: PieceSearchResult;
  capturedPhotoUri?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [nameQuery, setNameQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PieceSearchResult[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<PieceSearchResult | null>(initialPiece ?? null);
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
  const [describingPhoto, setDescribingPhoto] = useState(false);
  const [pendingMaterialGuessCode, setPendingMaterialGuessCode] = useState<string | null>(null);

  useEffect(() => {
    listActiveMaterials().then((rows) => {
      setMaterials(rows);
      setMaterialId((current) => current ?? rows[0]?.id ?? null);
    });
  }, []);

  // Tier 2: a photo already matched to an existing piece — pre-fill as if selected from search.
  useEffect(() => {
    if (initialPiece) selectSuggestion(initialPiece);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tier 3: no existing piece matched — ask the vision model to pre-fill a new one. Runs
  // once per photo; the material guess (needs the materials list) is applied separately below.
  useEffect(() => {
    if (initialPiece || !capturedPhotoUri) return;
    setDescribingPhoto(true);
    describeNewPiece(capturedPhotoUri)
      .then((description: PieceDescription) => {
        setNameQuery(description.suggestedName);
        setCategory(description.category);
        if (description.materialGuess) setPendingMaterialGuessCode(description.materialGuess);
      })
      .catch(() => {
        // Vision pre-fill is a convenience — fall through to a blank manual form.
      })
      .finally(() => setDescribingPhoto(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedPhotoUri]);

  useEffect(() => {
    if (!pendingMaterialGuessCode) return;
    const guessed = materials.find((m) => m.code === pendingMaterialGuessCode);
    if (guessed) {
      setMaterialId(guessed.id);
      setPendingMaterialGuessCode(null);
    }
  }, [pendingMaterialGuessCode, materials]);

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
        const { piece } = await createPieceWithOpeningStock({
          name: nameQuery.trim(),
          category: category.trim(),
          materialId,
          itemType,
          variantType,
          variants: [
            { label: finalLabel, nominalWeightMg: weightMg, costCentimes, priceCentimes, barcode, quantity: qty },
          ],
        });
        if (capturedPhotoUri) {
          await addPhoto(piece.id, capturedPhotoUri);
        }
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
      {barcode && <Badge label={t('stockIntake.newBarcode', { code: barcode })} tone="success" icon="barcode-outline" />}
      {capturedPhotoUri && (
        <View style={styles.photoPreviewRow}>
          <Image source={{ uri: capturedPhotoUri }} style={styles.matchPhotoSmall} />
          {describingPhoto && (
            <View style={styles.describingRow}>
              <ActivityIndicator color={colors.ink} />
              <Text style={styles.pieceSubtitle}>{t('stockIntake.describingPhoto')}</Text>
            </View>
          )}
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
        placeholderTextColor={colors.inkMuted}
      />
      {suggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {suggestions.map((s) => (
            <Pressable key={s.id} style={styles.searchRow} onPress={() => selectSuggestion(s)}>
              <Text style={styles.rowTitle}>{s.name}</Text>
              <Text style={styles.pieceSubtitle}>
                {getMaterialDisplayName(s.materialCode, s.materialName, t)} ·{' '}
                {t(`piece.itemType${s.itemType === 'model' ? 'Model' : 'Unique'}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {selectedPiece && (
        <View style={styles.hintRow}>
          <Ionicons name="information-circle" size={14} color={colors.success} />
          <Text style={styles.hintText}>{t('stockIntake.attachingToExisting')}</Text>
        </View>
      )}

      <Text style={styles.label}>{t('piece.category')}</Text>
      <TextInput
        style={[styles.input, selectedPiece != null && styles.inputDisabled]}
        value={category}
        onChangeText={setCategory}
        editable={!selectedPiece}
        placeholder={t('piece.categoryPlaceholder')}
        placeholderTextColor={colors.inkMuted}
      />

      <Text style={styles.label}>{t('piece.material')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        {materials.map((m) => (
          <Chip
            key={m.id}
            label={getMaterialDisplayName(m.code, m.name, t)}
            active={materialId === m.id}
            onPress={() => !selectedPiece && setMaterialId(m.id)}
          />
        ))}
      </ScrollView>

      {!selectedPiece && (
        <>
          <Text style={styles.label}>{t('piece.itemType')}</Text>
          <SegmentedControl
            value={itemType}
            onChange={setItemType}
            options={ITEM_TYPES.map((type) => ({
              value: type,
              label: t(`piece.itemType${type === 'model' ? 'Model' : 'Unique'}`),
              icon: type === 'model' ? 'copy-outline' : 'sparkles-outline',
            }))}
          />

          <Text style={styles.label}>{t('piece.variantType')}</Text>
          <SegmentedControl
            value={variantType}
            onChange={setVariantType}
            options={VARIANT_TYPES.map((type) => ({
              value: type,
              label: t(`piece.variantType${type === 'none' ? 'None' : type === 'ring_size' ? 'RingSize' : 'Length'}`),
            }))}
          />
        </>
      )}

      {variantType !== 'none' && (
        <>
          <Text style={styles.label}>{t('piece.variantLabel')}</Text>
          {variantType === 'ring_size' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
              {RING_SIZE_PRESETS.map((size) => (
                <Chip key={size} label={size} active={label === size} onPress={() => setLabel(size)} />
              ))}
            </ScrollView>
          )}
          <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder={t('piece.variantLabel')} placeholderTextColor={colors.inkMuted} />
        </>
      )}

      <View style={styles.variantFieldsRow}>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('piece.weightGrams')}</Text>
          <TextInput style={styles.input} value={weightGrams} onChangeText={setWeightGrams} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.inkMuted} />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('piece.costMad')}</Text>
          <TextInput style={styles.input} value={costMad} onChangeText={setCostMad} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.inkMuted} />
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
            placeholderTextColor={colors.inkMuted}
          />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.smallLabel}>{t('piece.quantity')}</Text>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        </View>
      </View>

      <View style={styles.actionRow}>
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={t('common.save')} icon="checkmark" variant="primary" onPress={handleSave} loading={saving} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  modeRow: { padding: spacing.md },
  scanArea: { flex: 1, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  matchPhoto: { width: '100%', height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm },
  matchPhotoSmall: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  emptyText: { color: colors.inkMuted, marginTop: spacing.sm },
  camera: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.lg,
  },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 14, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  permissionText: { textAlign: 'center', color: colors.inkSoft, paddingHorizontal: 24 },
  panel: { padding: spacing.lg, gap: spacing.xs },
  pieceName: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: spacing.sm },
  pieceSubtitle: { color: colors.inkSoft, fontSize: 13, marginBottom: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.xs },
  hintText: { color: colors.success, fontSize: 12 },
  describingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm, color: colors.ink },
  smallLabel: { fontSize: 12, color: colors.inkSoft, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputDisabled: { backgroundColor: colors.surfaceAlt, color: colors.inkMuted },
  chipScroller: { marginBottom: spacing.xs },
  variantFieldsRow: { flexDirection: 'row', gap: spacing.sm },
  variantField: { flex: 1 },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  suggestionBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  spacedTop: { marginTop: spacing.md },
  inlineButtonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, marginBottom: 40 },
});
