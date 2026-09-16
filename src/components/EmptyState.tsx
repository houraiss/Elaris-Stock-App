import { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { IconCircle } from './IconCircle';
import type { IconName } from '../theme/icons';

interface Props {
  icon: IconName;
  message: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, message, action, compact = false }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <IconCircle name={icon} color={colors.inkMuted} backgroundColor={colors.surfaceAlt} boxSize={56} size={26} />
      <Text style={styles.message}>{message}</Text>
      {action}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
    compact: { paddingVertical: spacing.lg },
    message: { color: colors.inkSoft, fontSize: 14, textAlign: 'center' },
  });
