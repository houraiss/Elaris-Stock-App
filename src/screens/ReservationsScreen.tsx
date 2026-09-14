import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listActiveReservations, cancelReservation, type ActiveReservation } from '../db/repositories/reservations';

type Props = NativeStackScreenProps<RootStackParamList, 'Reservations'>;

export function ReservationsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [reservations, setReservations] = useState<ActiveReservation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReservations(await listActiveReservations());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRelease(id: string) {
    try {
      await cancelReservation(id);
      load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    }
  }

  function openWhatsApp(phoneE164: string) {
    const digits = phoneE164.replace(/[^\d]/g, '');
    Linking.openURL(`https://wa.me/${digits}`).catch(() => Alert.alert(t('common.errorGeneric')));
  }

  return (
    <FlatList
      data={reservations}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={reservations.length === 0 ? styles.emptyContainer : styles.listContainer}
      ListEmptyComponent={<Text style={styles.emptyText}>{t('reservations.empty')}</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Pressable onPress={() => navigation.navigate('PieceDetail', { pieceId: item.pieceId })}>
            <Text style={styles.rowTitle}>
              {item.pieceName} · {item.variantLabel}
            </Text>
          </Pressable>
          <Text style={styles.rowSubtitle}>
            {t('reservations.holdQty')}: {item.qty} · {item.customerName}
          </Text>
          {item.expiresAt && <Text style={styles.rowSubtitle}>{t('reservations.expiresOn')}: {item.expiresAt.slice(0, 10)}</Text>}
          <View style={styles.actionRow}>
            <Pressable style={styles.smallButton} onPress={() => handleRelease(item.id)}>
              <Text style={styles.smallButtonText}>{t('reservations.release')}</Text>
            </Pressable>
            {item.customerPhoneE164 && (
              <Pressable style={styles.smallButton} onPress={() => openWhatsApp(item.customerPhoneE164!)}>
                <Text style={styles.smallButtonText}>{t('reservations.whatsapp')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContainer: { paddingBottom: 40 },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', paddingHorizontal: 32, textAlign: 'center' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee', gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: '#666', fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  smallButton: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8, alignSelf: 'flex-start' },
  smallButtonText: { fontWeight: '600' },
});
