import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import type { IconName } from '../theme/icons';

interface Props {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
}

export function Chip({ label, active = false, onPress, icon, disabled = false }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, active && styles.active, disabled && styles.disabled]}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? colors.onPrimary : colors.inkSoft} />}
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    active: { backgroundColor: colors.primary, borderColor: colors.primary },
    disabled: { opacity: 0.4 },
    label: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
    labelActive: { color: colors.onPrimary },
  });
