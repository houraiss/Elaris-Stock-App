import { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import type { IconName } from '../theme/icons';

interface Props {
  icon: IconName;
  title: string;
  tint?: string;
  right?: React.ReactNode;
  style?: object;
}

export function SectionHeader({ icon, title, tint, right, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        <Ionicons name={icon} size={16} color={tint ?? colors.gold} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xxl,
      marginBottom: spacing.md,
    },
    left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  });
