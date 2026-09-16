import { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, RefreshControl, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listActiveReservations, cancelReservation, updateReservation, type ActiveReservation } from '../db/repositories/reservations';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';

type Props = NativeStackScreenProps<RootStackParamList, 'Reservations'>;

export function ReservationsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reservations, setReservations] = useState<ActiveReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editExpiresOn, setEditExpiresOn] = useState('');
  const [saving, setSaving] = useState(false);

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

  function openEdit(reservation: ActiveReservation) {
    setEditingId(reservation.id);
    setEditQty(String(reservation.qty));
    setEditExpiresOn(reservation.expiresAt ? reservation.expiresAt.slice(0, 10) : '');
  }

  async function handleSaveEdit(reservation: ActiveReservation) {
    const qty = parseInt(editQty, 10);
    if (!qty || qty <= 0) {
      Alert.alert(t('common.errorGeneric'), t('piece.validationError'));
      return;
    }
    setSaving(true);
    try {
      await updateReservation(reservation.id, {
        qty,
        expiresAt: editExpiresOn.trim() ? new Date(editExpiresOn).toISOString() : null,
      });
      setEditingId(null);
      load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function openWhatsApp(phoneE164: string) {
    const digits = phoneE164.replace(/[^\d]/g, '');
    Linking.openURL(`https://wa.me/${digits}`).catch(() => Alert.alert(t('common.errorGeneric')));
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={reservations}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.ink} colors={[colors.ink]} />}
      contentContainerStyle={reservations.length === 0 ? styles.emptyContainer : styles.listContainer}
      ListEmptyComponent={<EmptyState icon="bookmark-outline" message={t('reservations.empty')} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowHeaderRow}>
            <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('PieceDetail', { pieceId: item.pieceId })}>
              <Text style={styles.rowTitle}>
                {item.pieceName} · {item.variantLabel}
              </Text>
            </Pressable>
            {editingId !== item.id && (
              <Pressable onPress={() => openEdit(item)} hitSlop={8}>
                <Ionicons name="create-outline" size={18} color={colors.inkMuted} />
              </Pressable>
            )}
          </View>
          <Text style={styles.rowSubtitle}>{item.customerName}</Text>

          {editingId === item.id ? (
            <View style={styles.editForm}>
              <View style={styles.fieldsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>{t('reservations.holdQty')}</Text>
                  <TextInput style={styles.input} value={editQty} onChangeText={setEditQty} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.smallLabel}>{t('reservations.expiresOn')}</Text>
                  <TextInput style={styles.input} value={editExpiresOn} onChangeText={setEditExpiresOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />
                </View>
              </View>
              <View style={styles.actionRow}>
                <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={() => setEditingId(null)} disabled={saving} style={{ flex: 1 }} />
                <Button label={t('common.save')} icon="checkmark" variant="primary" size="sm" onPress={() => handleSaveEdit(item)} loading={saving} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.rowSubtitle}>
                {t('reservations.holdQty')}: {item.qty}
                {item.expiresAt ? ` · ${t('reservations.expiresOn')}: ${item.expiresAt.slice(0, 10)}` : ''}
              </Text>
              <View style={styles.actionRow}>
                <Button label={t('reservations.release')} icon="close-circle-outline" size="sm" onPress={() => handleRelease(item.id)} />
                {item.customerPhoneE164 && (
                  <Button label={t('reservations.whatsapp')} icon="logo-whatsapp" size="sm" onPress={() => openWhatsApp(item.customerPhoneE164!)} />
                )}
              </View>
            </>
          )}
        </View>
      )}
    />
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  listContainer: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxxl },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  row: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  rowHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowSubtitle: { color: colors.inkSoft, fontSize: 13 },
  editForm: { gap: spacing.sm, marginTop: spacing.sm },
  fieldsRow: { flexDirection: 'row', gap: spacing.sm },
  smallLabel: { fontSize: 12, color: colors.inkSoft, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
