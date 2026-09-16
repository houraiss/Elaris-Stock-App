import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { createSnapshot, listSnapshots, createPost, listPosts, type PostWithPieces } from '../db/repositories/social';
import { searchPieces, type PieceSearchResult } from '../db/repositories/stockIntake';
import { BarChart } from '../charts/BarChart';
import type { SocialSnapshot, SocialPlatform } from '../db/schema/social';
import { SectionHeader } from '../components/SectionHeader';
import { Chip } from '../components/Chip';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { SOCIAL_PLATFORM_ICONS } from '../theme/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Social'>;

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toInt(value: string): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function SocialScreen(_props: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [snapshots, setSnapshots] = useState<SocialSnapshot[]>([]);
  const [posts, setPosts] = useState<PostWithPieces[]>([]);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [showPostForm, setShowPostForm] = useState(false);

  const load = useCallback(async (p: SocialPlatform) => {
    const [snaps, postRows] = await Promise.all([listSnapshots(p), listPosts(p)]);
    setSnapshots(snaps);
    setPosts(postRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(platform);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [platform, load]),
  );

  function handlePlatformChange(p: SocialPlatform) {
    setPlatform(p);
    setShowSnapshotForm(false);
  }

  if (showPostForm) {
    return (
      <NewPostPanel
        platform={platform}
        onDone={() => {
          setShowPostForm(false);
          load(platform);
        }}
        onCancel={() => setShowPostForm(false)}
      />
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.chipWrap}>
        {PLATFORMS.map((p) => (
          <Chip key={p} label={t(`social.platform_${p}`)} active={platform === p} onPress={() => handlePlatformChange(p)} icon={SOCIAL_PLATFORM_ICONS[p]} />
        ))}
      </View>

      <SectionHeader icon="trending-up" title={t('social.followerTrend')} />
      {snapshots.length === 0 ? (
        <EmptyState icon="stats-chart-outline" message={t('social.noSnapshotsYet')} compact />
      ) : (
        <BarChart
          data={snapshots.map((s) => ({ label: s.capturedOn.slice(5, 10), value: s.followers }))}
          valueFormatter={(v) => String(v)}
          barColor={colors.gold}
        />
      )}

      {showSnapshotForm ? (
        <NewSnapshotForm
          platform={platform}
          onDone={() => {
            setShowSnapshotForm(false);
            load(platform);
          }}
          onCancel={() => setShowSnapshotForm(false)}
        />
      ) : (
        <Button label={t('social.addSnapshot')} icon="add-circle-outline" fullWidth onPress={() => setShowSnapshotForm(true)} style={styles.spacedTop} />
      )}

      <View style={styles.postsHeaderRow}>
        <SectionHeader icon="images" title={t('social.posts')} style={styles.noMargin} />
        <Button label={t('social.addPost')} icon="add" size="sm" onPress={() => setShowPostForm(true)} />
      </View>
      {posts.length === 0 ? (
        <EmptyState icon="images-outline" message={t('social.noPostsYet')} compact />
      ) : (
        posts.map((post) => (
          <Card key={post.id} style={styles.postCard}>
            <Text style={styles.postDate}>{post.postedAt.slice(0, 10)}</Text>
            {post.caption ? (
              <Text style={styles.postCaption} numberOfLines={2}>
                {post.caption}
              </Text>
            ) : null}
            <Text style={styles.postStats}>
              {t('social.likes')}: {post.likes} · {t('social.comments')}: {post.comments} · {t('social.views')}: {post.views}
            </Text>
            {post.pieceNames.length > 0 && (
              <View style={styles.chipWrap}>
                {post.pieceNames.map((name) => (
                  <Badge key={name} label={name} tone="gold" icon="diamond-outline" />
                ))}
              </View>
            )}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function NewSnapshotForm({
  platform,
  onDone,
  onCancel,
}: {
  platform: SocialPlatform;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [capturedOn, setCapturedOn] = useState(todayIso());
  const [followers, setFollowers] = useState('');
  const [postsCount, setPostsCount] = useState('');
  const [reach, setReach] = useState('');
  const [profileViews, setProfileViews] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!capturedOn.trim() || followers.trim() === '' || postsCount.trim() === '') {
      Alert.alert(t('common.errorGeneric'), t('social.snapshotValidationError'));
      return;
    }
    setSaving(true);
    try {
      await createSnapshot({
        platform,
        capturedOn: capturedOn.trim(),
        followers: toInt(followers),
        postsCount: toInt(postsCount),
        reach: reach.trim() ? toInt(reach) : null,
        profileViews: profileViews.trim() ? toInt(profileViews) : null,
      });
      onDone();
    } catch (err) {
      Alert.alert(t('common.errorGeneric'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={styles.inlineForm}>
      <Text style={styles.label}>{t('social.capturedOn')}</Text>
      <TextInput style={styles.input} value={capturedOn} onChangeText={setCapturedOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />
      <View style={styles.fieldsRow}>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.followers')}</Text>
          <TextInput style={styles.input} value={followers} onChangeText={setFollowers} keyboardType="number-pad" />
        </View>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.postsCount')}</Text>
          <TextInput style={styles.input} value={postsCount} onChangeText={setPostsCount} keyboardType="number-pad" />
        </View>
      </View>
      <View style={styles.fieldsRow}>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.reach')}</Text>
          <TextInput style={styles.input} value={reach} onChangeText={setReach} keyboardType="number-pad" />
        </View>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.profileViews')}</Text>
          <TextInput style={styles.input} value={profileViews} onChangeText={setProfileViews} keyboardType="number-pad" />
        </View>
      </View>
      <View style={styles.actionRow}>
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={t('common.save')} icon="checkmark" variant="primary" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

function NewPostPanel({
  platform,
  onDone,
  onCancel,
}: {
  platform: SocialPlatform;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [postedAt, setPostedAt] = useState(todayIso());
  const [caption, setCaption] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [shares, setShares] = useState('');
  const [saves, setSaves] = useState('');
  const [views, setViews] = useState('');
  const [pieceQuery, setPieceQuery] = useState('');
  const [pieceSuggestions, setPieceSuggestions] = useState<PieceSearchResult[]>([]);
  const [taggedPieces, setTaggedPieces] = useState<PieceSearchResult[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pieceQuery.trim().length === 0) {
      setPieceSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      const results = await searchPieces(pieceQuery);
      setPieceSuggestions(results.filter((r) => !taggedPieces.some((tp) => tp.id === r.id)));
    }, 300);
    return () => clearTimeout(handle);
  }, [pieceQuery, taggedPieces]);

  function addTag(piece: PieceSearchResult) {
    setTaggedPieces((prev) => [...prev, piece]);
    setPieceQuery('');
    setPieceSuggestions([]);
  }

  function removeTag(pieceId: string) {
    setTaggedPieces((prev) => prev.filter((p) => p.id !== pieceId));
  }

  async function handleSave() {
    if (!postedAt.trim()) {
      Alert.alert(t('common.errorGeneric'), t('social.postValidationError'));
      return;
    }
    setSaving(true);
    try {
      await createPost({
        platform,
        postedAt: postedAt.trim(),
        caption: caption.trim() || null,
        likes: toInt(likes),
        comments: toInt(comments),
        shares: toInt(shares),
        saves: toInt(saves),
        views: toInt(views),
        pieceIds: taggedPieces.map((p) => p.id),
      });
      onDone();
    } catch (err) {
      Alert.alert(t('social.postSaveError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.addPanel} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('social.postedOn')}</Text>
      <TextInput style={styles.input} value={postedAt} onChangeText={setPostedAt} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} />

      <Text style={styles.label}>{t('social.caption')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={caption} onChangeText={setCaption} multiline placeholderTextColor={colors.inkMuted} />

      <View style={styles.fieldsRow}>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.likes')}</Text>
          <TextInput style={styles.input} value={likes} onChangeText={setLikes} keyboardType="number-pad" />
        </View>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.comments')}</Text>
          <TextInput style={styles.input} value={comments} onChangeText={setComments} keyboardType="number-pad" />
        </View>
      </View>
      <View style={styles.fieldsRow}>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.shares')}</Text>
          <TextInput style={styles.input} value={shares} onChangeText={setShares} keyboardType="number-pad" />
        </View>
        <View style={styles.field}>
          <Text style={styles.smallLabel}>{t('social.saves')}</Text>
          <TextInput style={styles.input} value={saves} onChangeText={setSaves} keyboardType="number-pad" />
        </View>
      </View>
      <Text style={styles.smallLabel}>{t('social.views')}</Text>
      <TextInput style={styles.input} value={views} onChangeText={setViews} keyboardType="number-pad" />

      <Text style={styles.label}>{t('social.taggedPieces')}</Text>
      {taggedPieces.length > 0 && (
        <View style={styles.chipWrap}>
          {taggedPieces.map((p) => (
            <Chip key={p.id} label={p.name} active onPress={() => removeTag(p.id)} icon="close-circle" />
          ))}
        </View>
      )}
      <TextInput
        style={styles.input}
        value={pieceQuery}
        onChangeText={setPieceQuery}
        placeholder={t('social.taggedPiecesPlaceholder')}
        placeholderTextColor={colors.inkMuted}
      />
      {pieceSuggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {pieceSuggestions.map((p) => (
            <Pressable key={p.id} style={styles.searchRow} onPress={() => addTag(p)}>
              <Text style={styles.rowTitle}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.finalActionRow}>
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={t('common.save')} icon="checkmark" variant="primary" onPress={handleSave} loading={saving} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  spacedTop: { marginTop: spacing.md },
  postsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xxl },
  noMargin: { marginTop: 0, marginBottom: 0 },
  postCard: { marginTop: spacing.md, gap: spacing.xs },
  postDate: { fontSize: 13, color: colors.inkMuted },
  postCaption: { fontSize: 14, color: colors.ink },
  postStats: { fontSize: 12, color: colors.inkSoft },
  inlineForm: { gap: spacing.sm, marginTop: spacing.md },
  label: { fontSize: 14, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm, color: colors.ink },
  smallLabel: { fontSize: 12, color: colors.inkSoft },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  fieldsRow: { flexDirection: 'row', gap: spacing.sm },
  field: { flex: 1 },
  suggestionBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  finalActionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  addPanel: { flex: 1, backgroundColor: colors.background },
});
