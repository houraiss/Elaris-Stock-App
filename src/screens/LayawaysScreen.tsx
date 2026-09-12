import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { listOpenLayaways, recordLayawayPayment, type OpenLayaway } from '../db/repositories/sales';
import { madToCentimes, centimesToMad, formatMad } from '../utils/money';
import type { PaymentMethod } from '../db/schema/supplierPayments';

type Props = NativeStackScreenProps<RootStackParamList, 'Layaways'>;

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer'];

export function LayawaysScreen(_props: Props) {
  const { t } = useTranslation();
  const [layaways, setLayaways] = useState<OpenLayaway[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSaleId, setActiveSaleId] = useState<string | null>(null);
  const [amountMad, setAmountMad] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLayaways(await listOpenLayaways());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function openPaymentFor(saleId: string) {
    setActiveSaleId(saleId);
    setAmountMad('');
    setMethod('cash');
  }

  async function handleRecordPayment(sale: OpenLayaway) {
    const amountCentimes = madToCentimes(parseFloat(amountMad) || 0);
    if (amountCentimes <= 0 || amountCentimes > sale.outstandingCentimes) {
      Alert.alert(t('common.errorGeneric'), t('layaways.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      const { handedOver } = await recordLayawayPayment(sale.id, amountCentimes, method);
      Alert.alert(
        t('layaways.savedTitle'),
        handedOver ? t('layaways.handedOver', { name: sale.customerName }) : t('layaways.paymentRecorded'),
      );
      setActiveSaleId(null);
      load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={layaways}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={layaways.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('layaways.empty')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{item.customerName}</Text>
            <Text style={styles.rowSubtitle}>
              {t('layaways.total')}: {formatMad(item.totalCentimes)} · {t('layaways.outstanding')}: {formatMad(item.outstandingCentimes)}
            </Text>
            {item.dueOn && <Text style={styles.rowSubtitle}>{t('layaways.due')}: {item.dueOn}</Text>}

            {activeSaleId === item.id ? (
              <View style={styles.paymentBox}>
                <TextInput
                  style={styles.input}
                  value={amountMad}
                  onChangeText={setAmountMad}
                  keyboardType="decimal-pad"
                  placeholder={t('sale.depositMad')}
                  autoFocus
                />
                <View style={styles.chipWrap}>
                  {METHODS.map((m) => (
                    <Pressable key={m} onPress={() => setMethod(m)} style={[styles.chip, method === m && styles.chipActive]}>
                      <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{t(`sale.method_${m}`)}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.actionRow}>
                  <Pressable style={styles.secondaryButton} onPress={() => setActiveSaleId(null)} disabled={saving}>
                    <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={() => handleRecordPayment(item)} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('layaways.recordPayment')}</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.smallButton} onPress={() => openPaymentFor(item.id)}>
                <Text style={styles.smallButtonText}>{t('layaways.recordPayment')}</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', paddingHorizontal: 32, textAlign: 'center' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee', gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: '#666', fontSize: 13 },
  smallButton: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8, alignSelf: 'flex-start' },
  smallButtonText: { fontWeight: '600' },
  paymentBox: { marginTop: 8, gap: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f0f0f0' },
  secondaryButtonText: { fontWeight: '600', color: '#333' },
  primaryButton: { flex: 2, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
});
