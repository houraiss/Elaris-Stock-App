import { useMemo } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, shadow, spacing } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Colors, ColorScheme } from '../theme/palettes';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, style, padded = true, elevated = false }: Props) {
  const { colors, scheme, visualStyle } = useTheme();
  const styles = useMemo(() => makeStyles(colors, scheme), [colors, scheme]);

  if (visualStyle === 'liquidGlass') {
    return (
      <View style={[styles.glassBase, elevated && shadow.raised, style]}>
        <BlurView intensity={40} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={styles.glassTint} pointerEvents="none" />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
          locations={[0.42, 0.5, 0.58]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.85 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={padded && styles.padded}>{children}</View>
      </View>
    );
  }

  return <View style={[styles.base, padded && styles.padded, elevated && shadow.card, style]}>{children}</View>;
}

const makeStyles = (colors: Colors, scheme: ColorScheme) =>
  StyleSheet.create({
    base: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    padded: { padding: spacing.lg },
    glassBase: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
      borderTopColor: 'rgba(255,255,255,0.65)',
      borderLeftColor: 'rgba(255,255,255,0.5)',
    },
    glassTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)',
    },
  });
