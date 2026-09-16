import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import type { IconName } from '../theme/icons';

interface Props {
  name: IconName;
  color: string;
  backgroundColor: string;
  size?: number;
  boxSize?: number;
  shape?: 'circle' | 'square';
}

export function IconCircle({ name, color, backgroundColor, size = 18, boxSize = 36, shape = 'circle' }: Props) {
  return (
    <View
      style={[
        styles.base,
        {
          width: boxSize,
          height: boxSize,
          backgroundColor,
          borderRadius: shape === 'circle' ? boxSize / 2 : radius.md,
        },
      ]}
    >
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
