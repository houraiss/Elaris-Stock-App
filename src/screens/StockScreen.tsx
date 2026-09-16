import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, ScrollView, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listPieces, listCategories, type PieceSummary } from '../db/repositories/pieces';
import { listActiveMaterials } from '../db/repositories/materials';
import type { Material } from '../db/schema/materials';
import { getMaterialDisplayName } from '../i18n/materialName';
import { Chip } from '../components/Chip';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { radius, spacing, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

export function StockScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pieces, setPieces] = useState<PieceSummary[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (currentMaterialFilter: string | null, currentCategoryFilter: string | null) => {
    setLoading(true);
    try {
      const [pieceRows, materialRows, categoryRows] = await Promise.all([
        listPieces({
          ...(currentMaterialFilter ? { materialId: currentMaterialFilter } : {}),
          ...(currentCategoryFilter ? { category: currentCategoryFilter } : {}),
        }),
        listActiveMaterials(),
        listCategories(),
      ]);
      setPieces(pieceRows);
      setMaterials(materialRows);
      setCategories(categoryRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(materialFilter, categoryFilter);
      // Reload whenever the screen regains focus (e.g. after adding a piece).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, materialFilter, categoryFilter]),
  );

  const searchTerm = searchQuery.trim().toLowerCase();
  const visiblePieces = useMemo(() => {
    if (!searchTerm) return pieces;
    return pieces.filter((p) => p.name.toLowerCase().includes(searchTerm));
  }, [pieces, searchTerm]);

  const filtersActive = materialFilter !== null || categoryFilter !== null || searchTerm.length > 0;

  function clearFilters() {
    setSearchQuery('');
    setMaterialFilter(null);
    setCategoryFilter(null);
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.inkMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('stock.searchPlaceholder')}
          placeholderTextColor={colors.inkMuted}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>

      {categories.length > 1 && (
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{t('stock.filterByCategory')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label={t('common.all')} active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
            {categories.map((category) => (
              <Chip key={category} label={category} active={categoryFilter === category} onPress={() => setCategoryFilter(category)} />
            ))}
          </ScrollView>
        </View>
      )}

      {materials.length > 1 && (
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{t('stock.filterByMaterial')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label={t('common.all')} active={materialFilter === null} onPress={() => setMaterialFilter(null)} />
            {materials.map((m) => (
              <Chip
                key={m.id}
                label={getMaterialDisplayName(m.code, m.name, t)}
                active={materialFilter === m.id}
                onPress={() => setMaterialFilter(m.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        style={styles.pieceList}
        data={visiblePieces}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => load(materialFilter, categoryFilter)} tintColor={colors.ink} colors={[colors.ink]} />
        }
        contentContainerStyle={visiblePieces.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          filtersActive ? (
            <EmptyState
              icon="search-outline"
              message={t('stock.noMatches')}
              action={<Button label={t('stock.clearFilters')} icon="close-circle-outline" onPress={clearFilters} />}
            />
          ) : (
            <EmptyState
              icon="cube-outline"
              message={t('stock.empty')}
              action={<Button label={t('piece.addTitle')} icon="add" onPress={() => navigation.navigate('AddPiece')} />}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('PieceDetail', { pieceId: item.id })}
          >
            {item.primaryPhotoUri ? (
              <Image source={{ uri: item.primaryPhotoUri }} style={styles.thumb} />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Ionicons name="diamond-outline" size={22} color={colors.inkMuted} />
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>
                {getMaterialDisplayName(item.materialCode, item.materialName, t)} ·{' '}
                {t('stock.variants', { count: item.variantCount })}
              </Text>
              <View style={styles.badgeRow}>
                <Badge label={`${t('stock.available')}: ${item.totalAvailable}`} tone="neutral" />
                {item.totalCommitted > 0 && (
                  <Badge label={`${t('stock.committed')}: ${item.totalCommitted}`} tone="warning" icon="time-outline" />
                )}
                {item.itemType === 'unique' && <Badge label={t('stock.unique')} tone="gold" icon="sparkles-outline" />}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </Pressable>
        )}
      />
      <Pressable style={styles.fabSecondary} onPress={() => navigation.navigate('StockIntake')}>
        <Ionicons name="qr-code-outline" size={18} color={colors.onPrimary} />
        <Text style={styles.fabSecondaryText}>{t('stockIntake.fabLabel')}</Text>
      </Pressable>
      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddPiece')}>
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, height: '100%' },
  filterGroup: { marginTop: spacing.sm },
  filterLabel: { fontSize: 11, fontWeight: '700', color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginStart: spacing.md, marginBottom: spacing.xs },
  chipRow: { paddingHorizontal: spacing.md, gap: spacing.sm },
  pieceList: { flex: 1, marginTop: spacing.sm },
  listContent: { padding: spacing.md, gap: spacing.sm, paddingTop: spacing.xs },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumbPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: spacing.xs },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowSubtitle: { color: colors.inkSoft, fontSize: 13 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginTop: spacing.xs },
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
  fabSecondary: {
    position: 'absolute',
    end: spacing.xl,
    bottom: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...shadow.fab,
  },
  fabSecondaryText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600' },
});
