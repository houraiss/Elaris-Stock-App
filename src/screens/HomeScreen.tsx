import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.appName')}</Text>
      <Pressable style={styles.button} onPress={() => navigation.navigate('LogSale')}>
        <Text style={styles.buttonText}>{t('home.logSale')}</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => navigation.navigate('Stock')}>
        <Text style={styles.buttonText}>{t('home.goToStock')}</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => navigation.navigate('Layaways')}>
        <Text style={styles.buttonText}>{t('home.layaways')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700' },
  button: { backgroundColor: '#1a1a1a', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
