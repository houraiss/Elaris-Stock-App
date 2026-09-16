import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  DevSettings,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { setLanguage } from '../settings/languagePreference';
import { backupNow } from '../settings/backupExport';
import {
  listMarkupRules,
  appendMarkupRule,
  groupMarkupRules,
  type MarkupRuleGroup,
  type MarkupRuleWithMaterial,
} from '../db/repositories/markupRules';
import { listActiveMaterials } from '../db/repositories/materials';
import { getLowStockThreshold, setLowStockThreshold } from '../settings/lowStockThreshold';
import { mgToGrams, gramsToMg } from '../utils/weight';
import { isCloudConfigured } from '../sync/supabaseClient';
import { runSync, getLastSyncAt } from '../sync/syncEngine';
import { restoreFromCloud, hasLocalCatalogueData } from '../sync/restore';
import type { Material } from '../db/schema/materials';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SegmentedControl, type SegmentOption } from '../components/SegmentedControl';
import { ElarisWordmark } from '../components/ElarisWordmark';
import { getMaterialDisplayName } from '../i18n/materialName';
import { radius, spacing } from '../theme';
import { useTheme, type ThemePreference, type VisualStyle } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';

const INSTAGRAM_HANDLE = 'elaris.925';

const THEME_PREFERENCE_OPTIONS: SegmentOption<ThemePreference>[] = [
  { value: 'light', label: 'settings.appearanceLight', icon: 'sunny-outline' },
  { value: 'dark', label: 'settings.appearanceDark', icon: 'moon-outline' },
  { value: 'system', label: 'settings.appearanceSystem', icon: 'phone-portrait-outline' },
];

const VISUAL_STYLE_OPTIONS: SegmentOption<VisualStyle>[] = [
  { value: 'standard', label: 'settings.visualStyleStandard', icon: 'square-outline' },
  { value: 'liquidGlass', label: 'settings.visualStyleLiquidGlass', icon: 'water-outline' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

type RuleGroup = MarkupRuleGroup;

const NO_UPPER_BOUND = Number.MAX_SAFE_INTEGER;

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
  const { colors, preference, setPreference, visualStyle, setVisualStyle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const [lowStockThreshold, setLowStockThresholdState] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [canRestore, setCanRestore] = useState(false);

  const load = useCallback(async () => {
    const [ruleRows, materialRows, threshold, lastSync, hasData] = await Promise.all([
      listMarkupRules(),
      listActiveMaterials(),
      getLowStockThreshold(),
      getLastSyncAt(),
      hasLocalCatalogueData(),
    ]);
    setRules(ruleRows);
    setMaterials(materialRows);
    setLowStockThresholdState(String(threshold));
    setLastSyncAt(lastSync);
    setCanRestore(isCloudConfigured && !hasData);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = groupMarkupRules(rules);
  const todayIso = new Date().toISOString().slice(0, 10);

  async function handleLowStockThresholdChange(text: string) {
    setLowStockThresholdState(text);
    const parsed = parseInt(text, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      await setLowStockThreshold(parsed);
    }
  }

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

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const result = await runSync();
      if (result) {
        Alert.alert(
          t('settings.syncDoneTitle'),
          t('settings.syncDoneBody', { rows: result.pushedRowCount, photos: result.photosUploaded }),
        );
      }
      await load();
    } catch (err) {
      Alert.alert(t('settings.syncError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleOpenInstagram() {
    const appUrl = `instagram://user?username=${INSTAGRAM_HANDLE}`;
    const webUrl = `https://instagram.com/${INSTAGRAM_HANDLE}`;
    try {
      const canOpenApp = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canOpenApp ? appUrl : webUrl);
    } catch {
      Alert.alert(t('common.errorGeneric'), t('settings.instagramUnavailable'));
    }
  }

  function handleRestore() {
    Alert.alert(t('settings.restoreConfirmTitle'), t('settings.restoreConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.restoreNow'),
        onPress: async () => {
          setRestoring(true);
          try {
            const result = await restoreFromCloud();
            Alert.alert(t('settings.restoreDoneTitle'), t('settings.restoreDoneBody', { photos: result.photosDownloaded }));
            await load();
          } catch (err) {
            Alert.alert(t('settings.restoreError'), err instanceof Error ? err.message : String(err));
          } finally {
            setRestoring(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <SectionHeader icon="language" title={t('settings.language')} style={styles.firstSection} />
      <View style={styles.chipWrap}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Chip key={lang} label={t(`settings.language_${lang}`)} active={false} onPress={() => handlePickLanguage(lang)} />
        ))}
      </View>

      <SectionHeader icon="contrast" title={t('settings.appearance')} />
      <SegmentedControl
        options={THEME_PREFERENCE_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }))}
        value={preference}
        onChange={setPreference}
      />

      <SectionHeader icon="water" title={t('settings.visualStyle')} />
      <SegmentedControl
        options={VISUAL_STYLE_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }))}
        value={visualStyle}
        onChange={setVisualStyle}
      />

      <SectionHeader icon="pricetags" title={t('settings.markupRules')} />
      {groups.map((group) => (
        <Card key={group.key} style={styles.card}>
          <Text style={styles.cardTitle}>
            {group.materialCode && group.materialName
              ? getMaterialDisplayName(group.materialCode, group.materialName, t)
              : t('settings.allMaterials')}{' '}
            · {formatWeightRange(group.minWeightMg, group.maxWeightMg)}
          </Text>
          <Text style={styles.cardValue}>{bpsToPercentLabel(group.active.markupBps)}</Text>
          {group.history.length > 0 && (
            <Text style={styles.historyText}>
              {t('settings.previousRates')}:{' '}
              {group.history.map((h) => `${bpsToPercentLabel(h.markupBps)} (${h.effectiveFrom.slice(0, 10)})`).join(', ')}
            </Text>
          )}

          {editingKey === group.key ? (
            <View style={styles.editForm}>
              <TextInput style={styles.input} value={editPercent} onChangeText={setEditPercent} keyboardType="decimal-pad" placeholder="%" placeholderTextColor={colors.inkMuted} />
              <TextInput style={styles.input} value={editEffectiveFrom} onChangeText={setEditEffectiveFrom} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />
              <View style={styles.actionRow}>
                <Button label={t('common.cancel')} variant="secondary" size="sm" onPress={() => setEditingKey(null)} disabled={savingRule} />
                <Button label={t('common.save')} icon="checkmark" size="sm" onPress={() => handleSaveEdit(group)} loading={savingRule} />
              </View>
            </View>
          ) : (
            <Button label={t('settings.editRule')} icon="create-outline" size="sm" onPress={() => openEdit(group)} style={styles.editButton} />
          )}
        </Card>
      ))}

      {!showAddCustom ? (
        <Button
          label={t('settings.addCustomRule')}
          icon="add"
          size="sm"
          onPress={() => {
            resetCustomForm();
            setShowAddCustom(true);
          }}
          style={styles.spacedTop}
        />
      ) : (
        <Card style={[styles.card, styles.spacedTop]}>
          <Text style={styles.smallLabel}>{t('piece.material')}</Text>
          <View style={styles.chipWrap}>
            <Chip label={t('settings.allMaterials')} active={customMaterialId === null} onPress={() => setCustomMaterialId(null)} />
            {materials.map((m) => (
              <Chip
                key={m.id}
                label={getMaterialDisplayName(m.code, m.name, t)}
                active={customMaterialId === m.id}
                onPress={() => setCustomMaterialId(m.id)}
              />
            ))}
          </View>

          <View style={styles.variantFieldsRow}>
            <View style={styles.variantField}>
              <Text style={styles.smallLabel}>{t('settings.minGrams')}</Text>
              <TextInput style={styles.input} value={customMinGrams} onChangeText={setCustomMinGrams} keyboardType="decimal-pad" placeholderTextColor={colors.inkMuted} />
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
                placeholderTextColor={colors.inkMuted}
              />
            </View>
          </View>
          <Button
            label={customNoUpperBound ? t('settings.hasUpperBound') : t('settings.noUpperBound')}
            size="sm"
            onPress={() => setCustomNoUpperBound((v) => !v)}
            style={styles.spacedTop}
          />

          <Text style={styles.smallLabel}>{t('settings.markupPercent')}</Text>
          <TextInput style={styles.input} value={customPercent} onChangeText={setCustomPercent} keyboardType="decimal-pad" placeholderTextColor={colors.inkMuted} />
          <Text style={styles.smallLabel}>{t('settings.effectiveFrom')}</Text>
          <TextInput style={styles.input} value={customEffectiveFrom} onChangeText={setCustomEffectiveFrom} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />

          <View style={[styles.actionRow, styles.spacedTop]}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setShowAddCustom(false)} disabled={savingRule} style={{ flex: 1 }} />
            <Button label={t('common.save')} icon="checkmark" variant="primary" onPress={handleSaveCustom} loading={savingRule} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      <SectionHeader icon="alert-circle" title={t('settings.lowStockThreshold')} />
      <TextInput
        style={styles.input}
        value={lowStockThreshold}
        onChangeText={handleLowStockThresholdChange}
        keyboardType="number-pad"
        placeholderTextColor={colors.inkMuted}
      />

      <SectionHeader icon="cloud-upload" title={t('settings.backup')} />
      <Button label={t('settings.backupNow')} icon="cloud-upload-outline" variant="primary" fullWidth loading={backingUp} onPress={handleBackup} />

      <SectionHeader icon="sync" title={t('settings.cloudSync')} />
      {!isCloudConfigured ? (
        <View style={styles.cloudStatusRow}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.inkMuted} />
          <Text style={styles.emptyText}>{t('settings.cloudNotConfigured')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.cloudStatusRow}>
            <Ionicons name={lastSyncAt ? 'cloud-done-outline' : 'cloud-offline-outline'} size={16} color={colors.inkSoft} />
            <Text style={styles.smallLabel}>
              {lastSyncAt ? t('settings.lastSync', { date: new Date(lastSyncAt).toLocaleString() }) : t('settings.neverSynced')}
            </Text>
          </View>
          <Button label={t('settings.syncNow')} icon="sync-outline" variant="primary" fullWidth loading={syncing} onPress={handleSyncNow} style={styles.spacedTop} />
          {canRestore && (
            <Button
              label={t('settings.restoreNow')}
              icon="download-outline"
              variant="primary"
              tone="danger"
              fullWidth
              loading={restoring}
              onPress={handleRestore}
              style={styles.spacedTop}
            />
          )}
        </>
      )}

      <SectionHeader icon="sparkles" title={t('settings.aboutElaris')} />
      <Card style={[styles.card, styles.aboutCard]}>
        <ElarisWordmark color={colors.ink} width={140} />
        <Text style={styles.aboutTagline}>{t('settings.aboutTagline')}</Text>
        <Pressable onPress={handleOpenInstagram} style={styles.instagramRow} hitSlop={8}>
          <Ionicons name="logo-instagram" size={18} color={colors.gold} />
          <Text style={styles.instagramHandle}>@{INSTAGRAM_HANDLE}</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  firstSection: { marginTop: 0 },
  smallLabel: { fontSize: 12, color: colors.inkSoft, marginBottom: spacing.xs, marginTop: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { marginTop: spacing.sm, gap: spacing.xs },
  cardTitle: { fontWeight: '600', color: colors.ink },
  cardValue: { fontSize: 20, fontWeight: '700', color: colors.gold },
  historyText: { color: colors.inkMuted, fontSize: 12 },
  editForm: { gap: spacing.sm, marginTop: spacing.sm },
  editButton: { marginTop: spacing.sm },
  spacedTop: { marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputDisabled: { backgroundColor: colors.surfaceAlt },
  variantFieldsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  variantField: { flex: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  cloudStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emptyText: { color: colors.inkMuted, flexShrink: 1 },
  aboutCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  aboutTagline: { color: colors.inkSoft, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  instagramRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  instagramHandle: { color: colors.gold, fontWeight: '600', fontSize: 15 },
});
