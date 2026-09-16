import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import type { IconName } from '../theme/icons';

type Variant = 'primary' | 'secondary' | 'text';
type Tone = 'ink' | 'danger';
type Size = 'md' | 'sm';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  tone = 'ink',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const solidBg = tone === 'danger' ? colors.danger : colors.primary;
  const textColor =
    variant === 'primary' ? colors.onPrimary : tone === 'danger' ? colors.danger : colors.ink;
  const iconSize = size === 'md' ? 18 : 16;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        size === 'md' ? styles.md : styles.sm,
        variant === 'primary' && { backgroundColor: solidBg },
        variant === 'secondary' && styles.secondary,
        variant === 'text' && styles.text,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.ink} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'left' && <Ionicons name={icon} size={iconSize} color={textColor} />}
          <Text
            style={[
              size === 'md' ? styles.labelMd : styles.labelSm,
              { color: textColor },
            ]}
          >
            {label}
          </Text>
          {icon && iconPosition === 'right' && <Ionicons name={icon} size={iconSize} color={textColor} />}
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    md: { paddingVertical: 14, paddingHorizontal: spacing.xl, borderRadius: radius.md },
    sm: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.sm },
    secondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
    text: { paddingHorizontal: spacing.xs, backgroundColor: 'transparent' },
    fullWidth: { alignSelf: 'stretch' },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
    labelMd: { fontSize: 16, fontWeight: '700' },
    labelSm: { fontSize: 14, fontWeight: '600' },
  });
