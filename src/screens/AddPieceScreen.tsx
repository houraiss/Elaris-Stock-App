import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('piece.name')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('piece.namePlaceholder')}
      />

      <Text style={styles.label}>{t('piece.category')}</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder={t('piece.categoryPlaceholder')}
      />

      <Text style={styles.label}>{t('piece.material')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        {materials.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => setMaterialId(m.id)}
            style={[styles.chip, materialId === m.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, materialId === m.id && styles.chipTextActive]}>{m.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

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
              {t(
                `piece.variantType${
                  type === 'none' ? 'None' : type === 'ring_size' ? 'RingSize' : 'Length'
                }`,
              )}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('piece.variants')}</Text>
      {variantDrafts.map((draft) => (
        <View key={draft.key} style={styles.variantCard}>
          {variantType !== 'none' && (
            <>
              {variantType === 'ring_size' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
                  {RING_SIZE_PRESETS.map((size) => (
                    <Pressable
                      key={size}
                      onPress={() => updateVariantDraft(draft.key, { label: size })}
                      style={[styles.chip, draft.label === size && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, draft.label === size && styles.chipTextActive]}>
                        {size}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <TextInput
                style={styles.input}
                value={draft.label}
                onChangeText={(text) => updateVariantDraft(draft.key, { label: text })}
                placeholder={t('piece.variantLabel')}
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
              />
            </View>
          </View>
          {allowMultipleVariants && variantDrafts.length > 1 && (
            <Pressable onPress={() => removeVariantRow(draft.key)} style={styles.removeVariantButton}>
              <Text style={styles.removeVariantText}>{t('piece.removeVariant')}</Text>
            </Pressable>
          )}
        </View>
      ))}
      {allowMultipleVariants && (
        <Pressable style={styles.smallButton} onPress={addVariantRow}>
          <Text style={styles.smallButtonText}>{t('piece.addVariant')}</Text>
        </Pressable>
      )}

      <Text style={styles.label}>{t('piece.photos')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        {photoUris.map((uri, index) => (
          <Pressable key={uri} onLongPress={() => removePhotoAt(index)}>
            <Image source={{ uri }} style={styles.photo} />
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.photoButtons}>
        <Pressable style={styles.smallButton} onPress={() => handlePickPhoto('camera')}>
          <Text style={styles.smallButtonText}>{t('common.camera')}</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={() => handlePickPhoto('library')}>
          <Text style={styles.smallButtonText}>{t('common.gallery')}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>{t('piece.notes')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline />

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('common.save')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4, backgroundColor: '#fff' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6, color: '#333' },
  smallLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  chipScroller: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginEnd: 8,
  },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  toggleActive: { backgroundColor: '#1a1a1a' },
  toggleText: { color: '#333', fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  variantCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  variantFieldsRow: { flexDirection: 'row', gap: 8 },
  variantField: { flex: 1 },
  removeVariantButton: { alignSelf: 'flex-end' },
  removeVariantText: { color: '#b00020', fontSize: 13 },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  smallButtonText: { fontWeight: '600' },
  photoButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  photo: { width: 80, height: 80, borderRadius: 8, marginEnd: 8, backgroundColor: '#eee' },
  saveButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
