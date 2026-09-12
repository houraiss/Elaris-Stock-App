import { useCallback, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listPieces, type PieceSummary } from '../db/repositories/pieces';
import { listActiveMaterials } from '../db/repositories/materials';
import type { Material } from '../db/schema/materials';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

interface MaterialChip {
  id: string | null;
  name: string;
}

export function StockScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [pieces, setPieces] = useState<PieceSummary[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (currentMaterialFilter: string | null) => {
    setLoading(true);
    try {
      const [pieceRows, materialRows] = await Promise.all([
        listPieces(currentMaterialFilter ? { materialId: currentMaterialFilter } : {}),
        listActiveMaterials(),
      ]);
      setPieces(pieceRows);
      setMaterials(materialRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(materialFilter);
      // Reload whenever the screen regains focus (e.g. after adding a piece).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, materialFilter]),
  );

  const chips: MaterialChip[] = [{ id: null, name: t('common.all') }, ...materials];

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={chips}
        keyExtractor={(m) => m.id ?? 'all'}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setMaterialFilter(item.id)}
            style={[styles.chip, materialFilter === item.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, materialFilter === item.id && styles.chipTextActive]}>
              {item.name}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={styles.chipRow}
        showsHorizontalScrollIndicator={false}
      />
      <FlatList
        data={pieces}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(materialFilter)} />}
        contentContainerStyle={pieces.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('stock.empty')}</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('PieceDetail', { pieceId: item.id })}
          >
            {item.primaryPhotoUri ? (
              <Image source={{ uri: item.primaryPhotoUri }} style={styles.thumb} />
            ) : (
              <View style={styles.thumb} />
            )}
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>
                {item.materialName} · {t('stock.variants', { count: item.variantCount })}
              </Text>
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>
                  {t('stock.available')}: {item.totalAvailable}
                </Text>
                {item.totalCommitted > 0 && (
                  <Text style={[styles.badge, styles.badgeHeld]}>
                    {t('stock.committed')}: {item.totalCommitted}
                  </Text>
                )}
                {item.itemType === 'unique' && (
                  <Text style={[styles.badge, styles.badgeUnique]}>{t('stock.unique')}</Text>
                )}
              </View>
            </View>
          </Pressable>
        )}
      />
      <Pressable style={styles.fabSecondary} onPress={() => navigation.navigate('StockIntake')}>
        <Text style={styles.fabSecondaryText}>{t('stockIntake.fabLabel')}</Text>
      </Pressable>
      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddPiece')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  chipRow: { paddingHorizontal: 12, paddingVertical: 8 },
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
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', paddingHorizontal: 32, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: '#666', fontSize: 13 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: {
    fontSize: 12,
    color: '#333',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeHeld: { backgroundColor: '#fde68a' },
  badgeUnique: { backgroundColor: '#dbeafe' },
  fab: {
    position: 'absolute',
    end: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  fabSecondary: {
    position: 'absolute',
    end: 20,
    bottom: 88,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSecondaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
