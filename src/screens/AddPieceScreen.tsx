import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listActiveMaterials } from '../db/repositories/materials';
import { createPieceWithVariants, type NewVariantInput } from '../db/repositories/pieces';
import { addPhoto } from '../db/repositories/piecePhotos';
import { capturePhoto } from '../media/capturePhoto';
import { suggestPrice } from '../pricing/suggestPrice';
import { madToCentimes, centimesToMad } from '../utils/money';
import { gramsToMg } from '../utils/weight';
import { RING_SIZE_PRESETS } from '../catalogue/ringSizes';
import type { Material } from '../db/schema/materials';
import type { ItemType, VariantType } from '../db/schema/pieces';
import { getMaterialDisplayName } from '../i18n/materialName';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SegmentedControl } from '../components/SegmentedControl';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';

type Props = NativeStackScreenProps<RootStackParamList, 'AddPiece'>;

interface VariantDraft {
  key: string;
  label: string;
  weightGrams: string;
  costMad: string;
  priceMad: string;
  priceEdited: boolean;
}

let draftCounter = 0;
function makeVariantDraft(label = ''): VariantDraft {
  draftCounter += 1;
  return {
    key: `draft-${draftCounter}`,
    label,
    weightGrams: '',
    costMad: '',
    priceMad: '',
    priceEdited: false,
  };
}

const ITEM_TYPES: ItemType[] = ['model', 'unique'];
const VARIANT_TYPES: VariantType[] = ['none', 'ring_size', 'length'];

export function AddPieceScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [itemType, setItemType] = useState<ItemType>('model');
  const [variantType, setVariantType] = useState<VariantType>('none');
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([makeVariantDraft('default')]);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listActiveMaterials().then((rows) => {
      setMaterials(rows);
      setMaterialId((current) => current ?? rows[0]?.id ?? null);
    });
  }, []);

  // A fresh sizing scheme starts from a single blank variant.
  useEffect(() => {
    setVariantDrafts([makeVariantDraft(variantType === 'none' ? 'default' : '')]);
  }, [variantType]);

  // Unique pieces have exactly one variant.
  useEffect(() => {
    if (itemType === 'unique') {
      setVariantDrafts((current) => (current.length > 1 ? [current[0]] : current));
    }
  }, [itemType]);

  const allowMultipleVariants = itemType === 'model' && variantType !== 'none';

  function updateVariantDraft(key: string, patch: Partial<VariantDraft>) {
    setVariantDrafts((current) =>
      current.map((draft) => {
        if (draft.key !== key) return draft;
        const merged: VariantDraft = { ...draft, ...patch };

        if ('priceMad' in patch) {
          merged.priceEdited = true;
        } else if (!merged.priceEdited && materialId) {
          const weightMg = gramsToMg(parseFloat(merged.weightGrams) || 0);
          const costCentimes = madToCentimes(parseFloat(merged.costMad) || 0);
          if (weightMg > 0 && costCentimes > 0) {
            try {
              const suggested = suggestPrice(costCentimes, weightMg, materialId, new Date().toISOString());
              merged.priceMad = String(centimesToMad(suggested));
            } catch {
              // No rule covers this weight yet — leave price for manual entry.
            }
          }
        }
        return merged;
      }),
    );
  }

  function addVariantRow() {
    setVariantDrafts((current) => [...current, makeVariantDraft('')]);
  }

  function removeVariantRow(key: string) {
    setVariantDrafts((current) => (current.length > 1 ? current.filter((d) => d.key !== key) : current));
  }

  async function handlePickPhoto(source: 'camera' | 'library') {
    try {
      const uri = await capturePhoto(source);
      if (uri) setPhotoUris((current) => [...current, uri]);
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    }
  }

  function removePhotoAt(index: number) {
    setPhotoUris((current) => current.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!materialId || !name.trim() || !category.trim()) {
      Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
      return;
    }

    const variantInputs: NewVariantInput[] = [];
    for (const draft of variantDrafts) {
      const label = variantType === 'none' ? 'default' : draft.label.trim();
      const weightMg = gramsToMg(parseFloat(draft.weightGrams) || 0);
      const costCentimes = madToCentimes(parseFloat(draft.costMad) || 0);
      const priceCentimes = madToCentimes(parseFloat(draft.priceMad) || 0);
      if (!label || weightMg <= 0 || costCentimes <= 0 || priceCentimes <= 0) {
        Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
        return;
      }
      variantInputs.push({ label, nominalWeightMg: weightMg, costCentimes, priceCentimes });
    }

    setSaving(true);
    try {
      const { piece } = await createPieceWithVariants({
        name: name.trim(),
        category: category.trim(),
        materialId,
        itemType,
        variantType,
        notes: notes.trim() || null,
        variants: variantInputs,
      });
      for (const uri of photoUris) {
        await addPhoto(piece.id, uri);
      }
      navigation.replace('PieceDetail', { pieceId: piece.id });
    } catch (err) {
      Alert.alert(t('piece.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('piece.name')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('piece.namePlaceholder')}
        placeholderTextColor={colors.inkMuted}
      />

      <Text style={styles.label}>{t('piece.category')}</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder={t('piece.categoryPlaceholder')}
        placeholderTextColor={colors.inkMuted}
      />

      <Text style={styles.label}>{t('piece.material')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        <View style={styles.chipScrollerRow}>
          {materials.map((m) => (
            <Chip
              key={m.id}
              label={getMaterialDisplayName(m.code, m.name, t)}
              active={materialId === m.id}
              onPress={() => setMaterialId(m.id)}
            />
          ))}
        </View>
      </ScrollView>

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

      <SectionHeader icon="layers" title={t('piece.variants')} />
      {variantDrafts.map((draft) => (
        <Card key={draft.key} style={styles.variantCard}>
          {variantType !== 'none' && (
            <>
              {variantType === 'ring_size' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
                  <View style={styles.chipScrollerRow}>
                    {RING_SIZE_PRESETS.map((size) => (
                      <Chip key={size} label={size} active={draft.label === size} onPress={() => updateVariantDraft(draft.key, { label: size })} />
                    ))}
                  </View>
                </ScrollView>
              )}
              <TextInput
                style={styles.input}
                value={draft.label}
                onChangeText={(text) => updateVariantDraft(draft.key, { label: text })}
                placeholder={t('piece.variantLabel')}
                placeholderTextColor={colors.inkMuted}
              />
            </>
          )}
          <View style={styles.variantFieldsRow}>
            <View style={styles.variantField}>
              <Text style={styles.smallLabel}>{t('piece.weightGrams')}</Text>
              <TextInput
                style={styles.input}
                value={draft.weightGrams}
                onChangeText={(text) => updateVariantDraft(draft.key, { weightGrams: text })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.inkMuted}
              />
            </View>
            <View style={styles.variantField}>
              <Text style={styles.smallLabel}>{t('piece.costMad')}</Text>
              <TextInput
                style={styles.input}
                value={draft.costMad}
                onChangeText={(text) => updateVariantDraft(draft.key, { costMad: text })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.inkMuted}
              />
            </View>
            <View style={styles.variantField}>
              <Text style={styles.smallLabel}>{t('piece.priceMad')}</Text>
              <TextInput
                style={styles.input}
                value={draft.priceMad}
                onChangeText={(text) => updateVariantDraft(draft.key, { priceMad: text })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.inkMuted}
              />
            </View>
          </View>
          {allowMultipleVariants && variantDrafts.length > 1 && (
            <Button label={t('piece.removeVariant')} tone="danger" variant="text" icon="trash-outline" size="sm" onPress={() => removeVariantRow(draft.key)} style={styles.removeVariantButton} />
          )}
        </Card>
      ))}
      {allowMultipleVariants && (
        <Button label={t('piece.addVariant')} icon="add" size="sm" onPress={addVariantRow} style={styles.spacedTop} />
      )}

      <SectionHeader icon="images" title={t('piece.photos')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        <View style={styles.chipScrollerRow}>
          {photoUris.map((uri, index) => (
            <Pressable key={uri} onLongPress={() => removePhotoAt(index)}>
              <Image source={{ uri }} style={styles.photo} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={styles.photoButtons}>
        <Button label={t('common.camera')} icon="camera-outline" size="sm" onPress={() => handlePickPhoto('camera')} />
        <Button label={t('common.gallery')} icon="images-outline" size="sm" onPress={() => handlePickPhoto('library')} />
      </View>

      <Text style={styles.label}>{t('piece.notes')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.inkMuted} />

      <Button label={t('common.save')} icon="checkmark-circle" variant="primary" fullWidth loading={saving} onPress={handleSave} style={styles.saveButton} />
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  label: { fontSize: 14, fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.ink },
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
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  chipScroller: { marginBottom: spacing.xs },
  chipScrollerRow: { flexDirection: 'row', gap: spacing.sm },
  variantCard: { marginTop: spacing.sm, gap: spacing.sm },
  variantFieldsRow: { flexDirection: 'row', gap: spacing.sm },
  variantField: { flex: 1 },
  removeVariantButton: { alignSelf: 'flex-end' },
  spacedTop: { marginTop: spacing.sm },
  photoButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  photo: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  saveButton: { marginTop: spacing.xl, marginBottom: 40 },
});
