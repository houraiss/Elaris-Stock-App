import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  DevSettings,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { setLanguage } from '../settings/languagePreference';
import { backupNow } from '../settings/backupExport';
import { listMarkupRules, appendMarkupRule, type MarkupRuleWithMaterial } from '../db/repositories/markupRules';
import { listActiveMaterials } from '../db/repositories/materials';
import { mgToGrams, gramsToMg, formatGrams } from '../utils/weight';
import type { Material } from '../db/schema/materials';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

interface RuleGroup {
  key: string;
  materialId: string | null;
  materialName: string | null;
  minWeightMg: number;
  maxWeightMg: number;
  active: MarkupRuleWithMaterial;
  history: MarkupRuleWithMaterial[]; // everything else, newest first
}

const NO_UPPER_BOUND = Number.MAX_SAFE_INTEGER;

function groupRules(rules: MarkupRuleWithMaterial[]): RuleGroup[] {
  const groups = new Map<string, MarkupRuleWithMaterial[]>();
  for (const rule of rules) {
    const key = `${rule.materialId ?? 'all'}|${rule.minWeightMg}|${rule.maxWeightMg}`;
    const list = groups.get(key) ?? [];
    list.push(rule);
    groups.set(key, list);
  }

  const today = new Date().toISOString();
  const result: RuleGroup[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
    const active = sorted.find((r) => r.effectiveFrom <= today) ?? sorted[sorted.length - 1];
    result.push({
      key,
      materialId: active.materialId,
      materialName: active.materialName,
      minWeightMg: active.minWeightMg,
      maxWeightMg: active.maxWeightMg,
      active,
      history: sorted.filter((r) => r.id !== active.id),
    });
  }
  return result.sort((a, b) => a.minWeightMg - b.minWeightMg);
}

function formatWeightRange(minWeightMg: number, maxWeightMg: number): string {
  if (minWeightMg <= 0) return `< ${Math.round(mgToGrams(maxWeightMg))} g`;
  if (maxWeightMg >= NO_UPPER_BOUND / 2) return `> ${Math.round(mgToGrams(minWeightMg))} g`;
  return `${Math.round(mgToGrams(minWeightMg))} – ${Math.round(mgToGrams(maxWeightMg))} g`;
}

function bpsToPercentLabel(bps: number): string {
  return `${(bps / 100).toString()}%`;
}

export function SettingsScreen(_props: Props) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<MarkupRuleWithMaterial[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editPercent, setEditPercent] = useState('');
  const [editEffectiveFrom, setEditEffectiveFrom] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customMaterialId, setCustomMaterialId] = useState<string | null>(null);
  const [customMinGrams, setCustomMinGrams] = useState('');
  const [customMaxGrams, setCustomMaxGrams] = useState('');
  const [customNoUpperBound, setCustomNoUpperBound] = useState(false);
  const [customPercent, setCustomPercent] = useState('');
  const [customEffectiveFrom, setCustomEffectiveFrom] = useState('');
  const [savingRule, setSavingRule] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const load = useCallback(async () => {
    const [ruleRows, materialRows] = await Promise.all([listMarkupRules(), listActiveMaterials()]);
    setRules(ruleRows);
    setMaterials(materialRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = groupRules(rules);
  const todayIso = new Date().toISOString().slice(0, 10);

  async function handlePickLanguage(language: SupportedLanguage) {
    const { requiresRestart } = await setLanguage(language);
    if (requiresRestart) {
      Alert.alert(t('settings.restartTitle'), t('settings.restartBody'), [
        {
          text: t('settings.restartNow'),
          onPress: () => {
            try {
              DevSettings.reload();
            } catch {
              // Not available outside a dev/debug build — the user closes and reopens instead.
            }
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
  }

  function openEdit(group: RuleGroup) {
    setEditingKey(group.key);
    setEditPercent(String(group.active.markupBps / 100));
    setEditEffectiveFrom(todayIso);
  }

  async function handleSaveEdit(group: RuleGroup) {
    const percent = parseFloat(editPercent);
    if (!Number.isFinite(percent) || percent < 0 || !editEffectiveFrom.trim()) {
      Alert.alert(t('common.errorGeneric'), t('settings.invalidRule'));
      return;
    }
    setSavingRule(true);
    try {
      await appendMarkupRule({
        materialId: group.materialId,
        minWeightMg: group.minWeightMg,
        maxWeightMg: group.maxWeightMg,
        markupBps: Math.round(percent * 100),
        effectiveFrom: new Date(editEffectiveFrom).toISOString(),
      });
      setEditingKey(null);
      await load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRule(false);
    }
  }

  function resetCustomForm() {
    setCustomMaterialId(null);
    setCustomMinGrams('');
    setCustomMaxGrams('');
    setCustomNoUpperBound(false);
    setCustomPercent('');
    setCustomEffectiveFrom(todayIso);
  }

  async function handleSaveCustom() {
    const minWeightMg = gramsToMg(parseFloat(customMinGrams) || 0);
    const maxWeightMg = customNoUpperBound ? NO_UPPER_BOUND : gramsToMg(parseFloat(customMaxGrams) || 0);
    const percent = parseFloat(customPercent);
    if (
      minWeightMg < 0 ||
      maxWeightMg <= minWeightMg ||
      !Number.isFinite(percent) ||
      percent < 0 ||
      !customEffectiveFrom.trim()
    ) {
      Alert.alert(t('common.errorGeneric'), t('settings.invalidRule'));
      return;
    }
    setSavingRule(true);
    try {
      await appendMarkupRule({
        materialId: customMaterialId,
        minWeightMg,
        maxWeightMg,
        markupBps: Math.round(percent * 100),
        effectiveFrom: new Date(customEffectiveFrom).toISOString(),
      });
      setShowAddCustom(false);
      resetCustomForm();
      await load();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRule(false);
    }
  }

  async function handleBackup() {
    setBackingUp(true);
    try {
      await backupNow();
    } catch (err) {
      Alert.alert(t('settings.backupError'), err instanceof Error ? err.message : String(err));
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
      <View style={styles.chipWrap}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable key={lang} style={styles.chip} onPress={() => handlePickLanguage(lang)}>
            <Text style={styles.chipText}>{t(`settings.language_${lang}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('settings.markupRules')}</Text>
      {groups.map((group) => (
        <View key={group.key} style={styles.card}>
          <Text style={styles.cardTitle}>
            {group.materialName ?? t('settings.allMaterials')} · {formatWeightRange(group.minWeightMg, group.maxWeightMg)}
          </Text>
          <Text style={styles.cardValue}>{bpsToPercentLabel(group.active.markupBps)}</Text>
          {group.history.length > 0 && (
            <Text style={styles.historyText}>
              {t('settings.previousRates')}:{' '}
              {group.history.map((h) => `${bpsToPercentLabel(h.markupBps)} (${h.effectiveFrom.slice(0, 10)})`).join(', ')}
            </Text>
          )}

          {editingKey === group.key ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <TextInput style={styles.input} value={editPercent} onChangeText={setEditPercent} keyboardType="decimal-pad" placeholder="%" />
              <TextInput style={styles.input} value={editEffectiveFrom} onChangeText={setEditEffectiveFrom} placeholder="YYYY-MM-DD" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable style={styles.smallButton} onPress={() => setEditingKey(null)} disabled={savingRule}>
                  <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable style={styles.smallButton} onPress={() => handleSaveEdit(group)} disabled={savingRule}>
                  {savingRule ? <ActivityIndicator /> : <Text style={styles.smallButtonText}>{t('common.save')}</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.smallButton} onPress={() => openEdit(group)}>
              <Text style={styles.smallButtonText}>{t('settings.editRule')}</Text>
            </Pressable>
          )}
        </View>
      ))}

      {!showAddCustom ? (
        <Pressable
          style={styles.smallButton}
          onPress={() => {
            resetCustomForm();
            setShowAddCustom(true);
          }}
        >
          <Text style={styles.smallButtonText}>{t('settings.addCustomRule')}</Text>
        </Pressable>
      ) : (
        <View style={styles.card}>
          <Text style={styles.smallLabel}>{t('piece.material')}</Text>
          <View style={styles.chipWrap}>
            <Pressable style={[styles.chip, customMaterialId === null && styles.chipActive]} onPress={() => setCustomMaterialId(null)}>
              <Text style={[styles.chipText, customMaterialId === null && styles.chipTextActive]}>{t('settings.allMaterials')}</Text>
            </Pressable>
            {materials.map((m) => (
              <Pressable key={m.id} style={[styles.chip, customMaterialId === m.id && styles.chipActive]} onPress={() => setCustomMaterialId(m.id)}>
                <Text style={[styles.chipText, customMaterialId === m.id && styles.chipTextActive]}>{m.name}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.variantFieldsRow}>
            <View style={styles.variantField}>
              <Text style={styles.smallLabel}>{t('settings.minGrams')}</Text>
              <TextInput style={styles.input} value={customMinGrams} onChangeText={setCustomMinGrams} keyboardType="decimal-pad" />
            </View>
            <View style={styles.variantField}>
              <Text style={styles.smallLabel}>{t('settings.maxGrams')}</Text>
              <TextInput
                style={[styles.input, customNoUpperBound && styles.inputDisabled]}
                value={customNoUpperBound ? '' : customMaxGrams}
                onChangeText={setCustomMaxGrams}
                keyboardType="decimal-pad"
                editable={!customNoUpperBound}
                placeholder={customNoUpperBound ? t('settings.noUpperBound') : undefined}
              />
            </View>
          </View>
          <Pressable style={styles.smallButton} onPress={() => setCustomNoUpperBound((v) => !v)}>
            <Text style={styles.smallButtonText}>
              {customNoUpperBound ? t('settings.hasUpperBound') : t('settings.noUpperBound')}
            </Text>
          </Pressable>

          <Text style={styles.smallLabel}>{t('settings.markupPercent')}</Text>
          <TextInput style={styles.input} value={customPercent} onChangeText={setCustomPercent} keyboardType="decimal-pad" />
          <Text style={styles.smallLabel}>{t('settings.effectiveFrom')}</Text>
          <TextInput style={styles.input} value={customEffectiveFrom} onChangeText={setCustomEffectiveFrom} placeholder="YYYY-MM-DD" />

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Pressable style={styles.smallButton} onPress={() => setShowAddCustom(false)} disabled={savingRule}>
              <Text style={styles.smallButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={handleSaveCustom} disabled={savingRule}>
              {savingRule ? <ActivityIndicator /> : <Text style={styles.smallButtonText}>{t('common.save')}</Text>}
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>{t('settings.backup')}</Text>
      <Pressable style={styles.saveButton} onPress={handleBackup} disabled={backingUp}>
        {backingUp ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('settings.backupNow')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4, backgroundColor: '#fff', paddingBottom: 60 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  smallLabel: { fontSize: 12, color: '#666', marginBottom: 4, marginTop: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginTop: 8, gap: 4 },
  cardTitle: { fontWeight: '600' },
  cardValue: { fontSize: 20, fontWeight: '700' },
  historyText: { color: '#888', fontSize: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  inputDisabled: { backgroundColor: '#f5f5f5' },
  variantFieldsRow: { flexDirection: 'row', gap: 8 },
  variantField: { flex: 1 },
  smallButton: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8, alignSelf: 'flex-start', marginTop: 8 },
  smallButtonText: { fontWeight: '600' },
  saveButton: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
