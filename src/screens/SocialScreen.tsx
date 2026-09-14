import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { createSnapshot, listSnapshots, createPost, listPosts, type PostWithPieces } from '../db/repositories/social';
import { searchPieces, type PieceSearchResult } from '../db/repositories/stockIntake';
import { BarChart } from '../charts/BarChart';
import type { SocialSnapshot, SocialPlatform } from '../db/schema/social';

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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.chipWrap}>
        {PLATFORMS.map((p) => (
          <Pressable key={p} style={[styles.chip, platform === p && styles.chipActive]} onPress={() => handlePlatformChange(p)}>
            <Text style={[styles.chipText, platform === p && styles.chipTextActive]}>{t(`social.platform_${p}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('social.followerTrend')}</Text>
      {snapshots.length === 0 ? (
        <Text style={styles.emptyText}>{t('social.noSnapshotsYet')}</Text>
      ) : (
        <BarChart
          data={snapshots.map((s) => ({ label: s.capturedOn.slice(5, 10), value: s.followers }))}
          valueFormatter={(v) => String(v)}
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
        <Pressable style={styles.secondaryButtonSmall} onPress={() => setShowSnapshotForm(true)}>
          <Text style={styles.secondaryButtonSmallText}>{t('social.addSnapshot')}</Text>
        </Pressable>
      )}

      <View style={styles.postsHeaderRow}>
        <Text style={styles.sectionTitle}>{t('social.posts')}</Text>
        <Pressable style={styles.smallButton} onPress={() => setShowPostForm(true)}>
          <Text style={styles.smallButtonText}>{t('social.addPost')}</Text>
        </Pressable>
      </View>
      {posts.length === 0 ? (
        <Text style={styles.emptyText}>{t('social.noPostsYet')}</Text>
      ) : (
        posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
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
                  <View key={name} style={styles.pieceTagChip}>
                    <Text style={styles.pieceTagChipText}>{name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
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
    <View style={styles.inlineForm}>
      <Text style={styles.label}>{t('social.capturedOn')}</Text>
      <TextInput style={styles.input} value={capturedOn} onChangeText={setCapturedOn} placeholder="YYYY-MM-DD" />
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
        <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
          <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('common.save')}</Text>}
        </Pressable>
      </View>
    </View>
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
    <ScrollView style={styles.addPanel} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('social.postedOn')}</Text>
      <TextInput style={styles.input} value={postedAt} onChangeText={setPostedAt} placeholder="YYYY-MM-DD" />

      <Text style={styles.label}>{t('social.caption')}</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={caption} onChangeText={setCaption} multiline />

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
            <Pressable key={p.id} style={styles.pieceTagChipRemovable} onPress={() => removeTag(p.id)}>
              <Text style={styles.pieceTagChipText}>{p.name} ×</Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput
        style={styles.input}
        value={pieceQuery}
        onChangeText={setPieceQuery}
        placeholder={t('social.taggedPiecesPlaceholder')}
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

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
          <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('common.save')}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 60, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  emptyText: { color: '#888' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#1a1a1a' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  secondaryButtonSmall: { marginTop: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#f0f0f0' },
  secondaryButtonSmallText: { fontWeight: '600', color: '#333' },
  postsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  smallButton: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f0f0f0', borderRadius: 8 },
  smallButtonText: { fontWeight: '600' },
  postCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginBottom: 12, gap: 4 },
  postDate: { fontSize: 13, color: '#888' },
  postCaption: { fontSize: 14, color: '#333' },
  postStats: { fontSize: 12, color: '#666' },
  pieceTagChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#f0f0f0' },
  pieceTagChipRemovable: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e5e5e5' },
  pieceTagChipText: { fontSize: 12, color: '#333' },
  inlineForm: { gap: 8, marginTop: 8, padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 6, color: '#333' },
  smallLabel: { fontSize: 12, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  fieldsRow: { flexDirection: 'row', gap: 8 },
  field: { flex: 1 },
  suggestionBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 4, paddingHorizontal: 10 },
  searchRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  secondaryButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f0f0f0' },
  secondaryButtonText: { fontWeight: '600', color: '#333' },
  saveButton: { flex: 2, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addPanel: { flex: 1, backgroundColor: '#fff' },
});
