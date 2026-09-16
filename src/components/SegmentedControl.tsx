import { useMemo } from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import type { IconName } from '../theme/icons';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable key={opt.value} style={[styles.segment, active && styles.segmentActive]} onPress={() => onChange(opt.value)}>
            {opt.icon && <Ionicons name={opt.icon} size={14} color={active ? colors.onPrimary : colors.inkSoft} />}
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.sm },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    label: { color: colors.inkSoft, fontWeight: '600', fontSize: 13 },
    labelActive: { color: colors.onPrimary },
  });
