import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getPieceDetail, updatePiece, updateVariant, type PieceDetail, type VariantWithStock } from '../db/repositories/pieces';
import { addPhoto } from '../db/repositories/piecePhotos';
import { capturePhoto } from '../media/capturePhoto';
import { createReservation } from '../db/repositories/reservations';
import { searchCustomers, createCustomer } from '../db/repositories/customers';
import { listActiveMaterials } from '../db/repositories/materials';
import { getPostsForPiece, type PostForPiece } from '../db/repositories/social';
import { formatMad, madToCentimes, centimesToMad } from '../utils/money';
import { formatGrams, gramsToMg, mgToGrams } from '../utils/weight';
import type { Customer } from '../db/schema/customers';
import type { Material } from '../db/schema/materials';
import { getMaterialDisplayName } from '../i18n/materialName';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Chip } from '../components/Chip';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { SOCIAL_PLATFORM_ICONS } from '../theme/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'PieceDetail'>;

export function PieceDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { pieceId } = route.params;
  const [detail, setDetail] = useState<PieceDetail | null>(null);
  const [posts, setPosts] = useState<PostForPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPiece, setEditingPiece] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([getPieceDetail(pieceId), getPostsForPiece(pieceId)]);
      setDetail(d);
      setPosts(p);
      if (d) navigation.setOptions({ title: d.name });
    } finally {
      setLoading(false);
    }
  }, [pieceId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        !editingPiece && (
          <Pressable onPress={() => setEditingPiece(true)} hitSlop={8} style={styles.headerEditButton}>
            <Ionicons name="create-outline" size={22} color={colors.ink} />
          </Pressable>
        ),
    });
  }, [navigation, editingPiece]);

  async function handleAddPhoto(source: 'camera' | 'library') {
    try {
      const uri = await capturePhoto(source);
      if (!uri) return;
      await addPhoto(pieceId, uri);
      await load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    }
  }

  if (loading && !detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>{t('pieceDetail.notFound')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={detail.variants}
      keyExtractor={(v) => v.id}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      ListHeaderComponent={
        <View style={styles.header}>
          {editingPiece ? (
            <EditPieceForm
              detail={detail}
              onDone={() => {
                setEditingPiece(false);
                load();
              }}
              onCancel={() => setEditingPiece(false)}
            />
          ) : (
            <Badge label={getMaterialDisplayName(detail.materialCode, detail.materialName, t)} tone="gold" icon="diamond-outline" />
          )}

          <SectionHeader icon="images" title={t('pieceDetail.photos')} style={styles.firstSection} />
          <FlatList
            horizontal
            data={detail.photoUris}
            keyExtractor={(uri) => uri}
            renderItem={({ item }) => <Image source={{ uri: item }} style={styles.photo} />}
            ListEmptyComponent={<EmptyState icon="image-outline" message={t('pieceDetail.noPhotos')} compact />}
            contentContainerStyle={styles.photoRow}
            showsHorizontalScrollIndicator={false}
          />
          <View style={styles.photoButtons}>
            <Button label={t('common.camera')} icon="camera-outline" size="sm" onPress={() => handleAddPhoto('camera')} />
            <Button label={t('common.gallery')} icon="images-outline" size="sm" onPress={() => handleAddPhoto('library')} />
          </View>

          <SectionHeader icon="layers" title={t('pieceDetail.variants')} />
        </View>
      }
      ListFooterComponent={
        <View style={styles.paddedSection}>
          <SectionHeader icon="share-social" title={t('pieceDetail.posts')} />
          {posts.length === 0 ? (
            <EmptyState icon="share-social-outline" message={t('pieceDetail.noPosts')} compact />
          ) : (
            <View style={styles.postsCard}>
              {posts.map((post, index) => (
                <View key={post.id} style={[styles.postRow, index === posts.length - 1 && styles.noBorder]}>
                  <Ionicons name={SOCIAL_PLATFORM_ICONS[post.platform] ?? 'share-social-outline'} size={16} color={colors.info} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postRowTitle}>
                      {t(`social.platform_${post.platform}`)} · {post.postedAt.slice(0, 10)}
                    </Text>
                    {post.caption ? (
                      <Text style={styles.postRowCaption} numberOfLines={2}>
                        {post.caption}
                      </Text>
                    ) : null}
                    <Text style={styles.postRowMeta}>
                      {t('social.likes')}: {post.likes}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => <VariantRow variant={item} onReserved={load} />}
    />
  );
}

function EditPieceForm({
  detail,
  onDone,
  onCancel,
}: {
  detail: PieceDetail;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [name, setName] = useState(detail.name);
  const [category, setCategory] = useState(detail.category);
  const [materialId, setMaterialId] = useState(detail.materialId);
  const [notes, setNotes] = useState(detail.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listActiveMaterials().then(setMaterials);
  }, []);

  async function handleSave() {
    if (!name.trim() || !category.trim()) {
      Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
      return;
    }
    setSaving(true);
    try {
      await updatePiece(detail.id, {
        name: name.trim(),
        category: category.trim(),
        materialId,
        notes: notes.trim() || null,
      });
      onDone();
    } catch (err) {
      Alert.alert(t('piece.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.editForm}>
      <Text style={styles.label}>{t('piece.name')}</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.inkMuted} />

      <Text style={styles.label}>{t('piece.category')}</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholderTextColor={colors.inkMuted} />

      <Text style={styles.label}>{t('piece.material')}</Text>
      <View style={styles.chipWrap}>
        {materials.map((m) => (
          <Chip
            key={m.id}
            label={getMaterialDisplayName(m.code, m.name, t)}
            active={materialId === m.id}
            onPress={() => setMaterialId(m.id)}
          />
        ))}
      </View>

      <Text style={styles.label}>{t('piece.notes')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.inkMuted} />

      <View style={styles.actionRow}>
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={t('common.save')} icon="checkmark" variant="primary" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function VariantRow({ variant, onReserved }: { variant: VariantWithStock; onReserved: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [holding, setHolding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [qty, setQty] = useState('1');
  const [expiresOn, setExpiresOn] = useState('');
  const [saving, setSaving] = useState(false);

  const [editLabel, setEditLabel] = useState(variant.label);
  const [editWeight, setEditWeight] = useState(String(mgToGrams(variant.nominalWeightMg)));
  const [editCost, setEditCost] = useState(String(centimesToMad(variant.costCentimes)));
  const [editPrice, setEditPrice] = useState(String(centimesToMad(variant.priceCentimes)));
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (selectedCustomer || customerQuery.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => setSuggestions(await searchCustomers(customerQuery)), 300);
    return () => clearTimeout(handle);
  }, [customerQuery, selectedCustomer]);

  function openHoldForm() {
    setHolding(true);
    setCustomerQuery('');
    setSelectedCustomer(null);
    setQty('1');
    setExpiresOn('');
  }

  function openEditForm() {
    setEditLabel(variant.label);
    setEditWeight(String(mgToGrams(variant.nominalWeightMg)));
    setEditCost(String(centimesToMad(variant.costCentimes)));
    setEditPrice(String(centimesToMad(variant.priceCentimes)));
    setEditing(true);
  }

  async function handleSaveEdit() {
    const weightMg = gramsToMg(parseFloat(editWeight) || 0);
    const costCentimes = madToCentimes(parseFloat(editCost) || 0);
    const priceCentimes = madToCentimes(parseFloat(editPrice) || 0);
    if (!editLabel.trim() || weightMg <= 0 || costCentimes <= 0 || priceCentimes <= 0) {
      Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
      return;
    }
    setSavingEdit(true);
    try {
      await updateVariant(variant.id, { label: editLabel.trim(), nominalWeightMg: weightMg, costCentimes, priceCentimes });
      setEditing(false);
      onReserved();
    } catch (err) {
      Alert.alert(t('piece.saveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmHold() {
    const quantity = parseInt(qty, 10) || 0;
    if (quantity <= 0) return;

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

      await createReservation({
        variantId: variant.id,
        customerId,
        qty: quantity,
        expiresAt: expiresOn.trim() ? new Date(expiresOn).toISOString() : null,
      });
      Alert.alert(t('reservations.savedTitle'), t('reservations.savedBody', { name: variant.label, customer: selectedCustomer?.displayName ?? customerQuery.trim() }));
      setHolding(false);
      onReserved();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <View style={styles.variantRow}>
        <Text style={styles.label}>{t('piece.variantLabel')}</Text>
        <TextInput style={styles.input} value={editLabel} onChangeText={setEditLabel} placeholderTextColor={colors.inkMuted} />
        <View style={styles.fieldsRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>{t('piece.weightGrams')}</Text>
            <TextInput style={styles.input} value={editWeight} onChangeText={setEditWeight} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>{t('piece.costMad')}</Text>
            <TextInput style={styles.input} value={editCost} onChangeText={setEditCost} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>{t('piece.priceMad')}</Text>
            <TextInput style={styles.input} value={editPrice} onChangeText={setEditPrice} keyboardType="decimal-pad" />
          </View>
        </View>
        <View style={styles.actionRow}>
          <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={() => setEditing(false)} disabled={savingEdit} style={{ flex: 1 }} />
          <Button label={t('common.save')} icon="checkmark" variant="primary" size="sm" onPress={handleSaveEdit} loading={savingEdit} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.variantRow}>
      <View style={styles.variantHeaderRow}>
        <Text style={styles.variantLabel}>{variant.label}</Text>
        <View style={styles.variantHeaderRight}>
          <Text style={styles.variantPrice}>{formatMad(variant.priceCentimes)}</Text>
          <Pressable onPress={openEditForm} hitSlop={8}>
            <Ionicons name="create-outline" size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.variantMeta}>{formatGrams(variant.nominalWeightMg)}</Text>
      <View style={styles.stockRow}>
        <Badge label={`${t('stock.onHand')}: ${variant.stock.onHand}`} tone="neutral" />
        <Badge label={`${t('stock.available')}: ${variant.stock.available}`} tone={variant.stock.available > 0 ? 'success' : 'danger'} />
      </View>

      {holding ? (
        <View style={styles.holdForm}>
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
          {suggestions.length > 0 && (
            <View style={styles.suggestionBox}>
              {suggestions.map((c) => (
                <Pressable key={c.id} style={styles.searchRow} onPress={() => { setSelectedCustomer(c); setCustomerQuery(c.displayName); setSuggestions([]); }}>
                  <Text style={styles.rowTitle}>{c.displayName}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.fieldsRow}>
            <TextInput style={[styles.input, { flex: 1 }]} value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder={t('reservations.holdQty')} placeholderTextColor={colors.inkMuted} />
            <TextInput style={[styles.input, { flex: 2 }]} value={expiresOn} onChangeText={setExpiresOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />
          </View>
          <View style={styles.actionRow}>
            <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={() => setHolding(false)} disabled={saving} />
            <Button label={t('reservations.hold')} icon="bookmark" variant="primary" size="sm" onPress={handleConfirmHold} loading={saving} />
          </View>
        </View>
      ) : (
        variant.stock.available > 0 && (
          <Button label={t('reservations.hold')} icon="bookmark-outline" size="sm" onPress={openHoldForm} style={{ marginTop: spacing.sm }} />
        )
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  notFoundText: { color: colors.inkSoft },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  headerEditButton: { padding: spacing.xs, marginEnd: spacing.xs },
  firstSection: { marginTop: spacing.lg },
  paddedSection: { paddingHorizontal: spacing.lg },
  photoRow: { gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md, marginEnd: spacing.sm, backgroundColor: colors.surfaceAlt },
  photoButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  editForm: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm, color: colors.ink },
  smallLabel: { fontSize: 12, color: colors.inkSoft, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  variantRow: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  variantHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  variantHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  variantLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
  variantPrice: { fontSize: 16, fontWeight: '700', color: colors.gold },
  variantMeta: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  stockRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  holdForm: { gap: spacing.sm, marginTop: spacing.md },
  fieldsRow: { flexDirection: 'row', gap: spacing.sm },
  suggestionBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  postsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  postRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  noBorder: { borderBottomWidth: 0 },
  postRowTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  postRowCaption: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  postRowMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
});
