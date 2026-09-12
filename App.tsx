import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import './src/i18n';
import { useDbMigrations } from './src/db/useDbMigrations';
import { seedDatabase } from './src/db/seed';

export default function App() {
  const { t } = useTranslation();
  const { success: migrationsReady, error: migrationError } = useDbMigrations();
  const [seedError, setSeedError] = useState<Error | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!migrationsReady) return;
    seedDatabase()
      .then(() => setSeeded(true))
      .catch((err) => setSeedError(err instanceof Error ? err : new Error(String(err))));
  }, [migrationsReady]);

  const error = migrationError ?? seedError;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.appName')}</Text>
      {error ? (
        <Text style={styles.error}>{t('common.errorGeneric')}: {error.message}</Text>
      ) : (
        <Text>{seeded ? 'Database ready' : t('common.loading')}</Text>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  error: {
    color: '#b00020',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
