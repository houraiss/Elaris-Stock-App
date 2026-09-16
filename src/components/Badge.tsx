import { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import type { IconName } from '../theme/icons';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'silver';

interface Props {
  label: string;
  tone?: Tone;
  icon?: IconName;
}

function toneStyles(colors: Colors): Record<Tone, { bg: string; fg: string }> {
  return {
    neutral: { bg: colors.surfaceAlt, fg: colors.inkSoft },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: colors.infoSoft, fg: colors.info },
    gold: { bg: colors.goldSoft, fg: colors.onGoldSoft },
    silver: { bg: colors.silverSoft, fg: colors.onSilverSoft },
  };
}

export function Badge({ label, tone = 'neutral', icon }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(), []);
  const { bg, fg } = toneStyles(colors)[tone];
  return (
    <View style={[styles.base, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={11} color={fg} />}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs - 1,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
      borderRadius: radius.pill,
      alignSelf: 'flex-start',
    },
    label: { fontSize: 11, fontWeight: '700' },
  });
