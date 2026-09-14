import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getPieceDetail, type PieceDetail, type VariantWithStock } from '../db/repositories/pieces';
import { addPhoto } from '../db/repositories/piecePhotos';
import { capturePhoto } from '../media/capturePhoto';
import { createReservation } from '../db/repositories/reservations';
import { searchCustomers, createCustomer } from '../db/repositories/customers';
import { formatMad } from '../utils/money';
import { formatGrams } from '../utils/weight';
import type { Customer } from '../db/schema/customers';

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
      renderItem={({ item }) => <VariantRow variant={item} onReserved={load} />}
    />
  );
}

function VariantRow({ variant, onReserved }: { variant: VariantWithStock; onReserved: () => void }) {
  const { t } = useTranslation();
  const [holding, setHolding] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [qty, setQty] = useState('1');
  const [expiresOn, setExpiresOn] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <View style={styles.variantRow}>
      <Text style={styles.variantLabel}>{variant.label}</Text>
      <Text style={styles.variantMeta}>
        {formatGrams(variant.nominalWeightMg)} · {formatMad(variant.priceCentimes)}
      </Text>
      <Text style={styles.variantStock}>
        {t('stock.onHand')}: {variant.stock.onHand} · {t('stock.available')}: {variant.stock.available}
      </Text>

      {holding ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <TextInput
            style={styles.input}
            value={selectedCustomer ? selectedCustomer.displayName : customerQuery}
            onChangeText={(text) => {
              setSelectedCustomer(null);
              setCustomerQuery(text);
            }}
            placeholder={t('sale.customerPlaceholder')}
          />
          {suggestions.length > 0 && (
            <View style={styles.suggestionBox}>
              {suggestions.map((c) => (
                <Pressable key={c.id} style={styles.searchRow} onPress={() => { setSelectedCustomer(c); setCustomerQuery(c.displayName); setSuggestions([]); }}>
                  <Text>{c.displayName}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { flex: 1 }]} value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder={t('reservations.holdQty')} />
            <TextInput style={[styles.input, { flex: 2 }]} value={expiresOn} onChangeText={setExpiresOn} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable style={styles.smallButton} onPress={() => setHolding(false)} disabled={saving}>
              <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={handleConfirmHold} disabled={saving}>
              {saving ? <ActivityIndicator /> : <Text style={styles.smallButtonText}>{t('reservations.hold')}</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        variant.stock.available > 0 && (
          <Pressable style={styles.smallButton} onPress={openHoldForm}>
            <Text style={styles.smallButtonText}>{t('reservations.hold')}</Text>
          </Pressable>
        )
      )}
    </View>
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
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  suggestionBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, paddingHorizontal: 10 },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
});
