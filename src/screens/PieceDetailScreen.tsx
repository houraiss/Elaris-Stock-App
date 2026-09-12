import { useCallback, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getPieceDetail, type PieceDetail } from '../db/repositories/pieces';
import { addPhoto } from '../db/repositories/piecePhotos';
import { capturePhoto } from '../media/capturePhoto';
import { formatMad } from '../utils/money';
import { formatGrams } from '../utils/weight';

type Props = NativeStackScreenProps<RootStackParamList, 'PieceDetail'>;

export function PieceDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { pieceId } = route.params;
  const [detail, setDetail] = useState<PieceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getPieceDetail(pieceId);
      setDetail(d);
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
        <ActivityIndicator />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text>{t('pieceDetail.notFound')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={detail.variants}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.subtitle}>{detail.materialName}</Text>

          <Text style={styles.sectionTitle}>{t('pieceDetail.photos')}</Text>
          <FlatList
            horizontal
            data={detail.photoUris}
            keyExtractor={(uri) => uri}
            renderItem={({ item }) => <Image source={{ uri: item }} style={styles.photo} />}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('pieceDetail.noPhotos')}</Text>}
            contentContainerStyle={styles.photoRow}
            showsHorizontalScrollIndicator={false}
          />
          <View style={styles.photoButtons}>
            <Pressable style={styles.smallButton} onPress={() => handleAddPhoto('camera')}>
              <Text style={styles.smallButtonText}>{t('common.camera')}</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={() => handleAddPhoto('library')}>
              <Text style={styles.smallButtonText}>{t('common.gallery')}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>{t('pieceDetail.variants')}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.variantRow}>
          <Text style={styles.variantLabel}>{item.label}</Text>
          <Text style={styles.variantMeta}>
            {formatGrams(item.nominalWeightMg)} · {formatMad(item.priceCentimes)}
          </Text>
          <Text style={styles.variantStock}>
            {t('stock.onHand')}: {item.stock.onHand} · {t('stock.available')}: {item.stock.available}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  subtitle: { color: '#666', paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  photoRow: { paddingHorizontal: 16, gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 8, marginEnd: 8, backgroundColor: '#eee' },
  emptyText: { color: '#999', paddingHorizontal: 16 },
  photoButtons: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  smallButton: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8 },
  smallButtonText: { fontWeight: '600' },
  variantRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  variantLabel: { fontSize: 16, fontWeight: '600' },
  variantMeta: { color: '#666', fontSize: 13 },
  variantStock: { color: '#333', fontSize: 13, marginTop: 2 },
});
