import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import './src/i18n';
import { useDbMigrations } from './src/db/useDbMigrations';
import { seedDatabase } from './src/db/seed';
import { applyStoredLanguageOnBoot } from './src/settings/languagePreference';
import { runSync } from './src/sync/syncEngine';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  const { t } = useTranslation();
  const { success: migrationsReady, error: migrationError } = useDbMigrations();
  const [seedError, setSeedError] = useState<Error | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    applyStoredLanguageOnBoot().finally(() => setPrefsReady(true));
  }, []);

  useEffect(() => {
    if (!migrationsReady) return;
    seedDatabase()
      .then(() => setSeeded(true))
      .catch((err) => setSeedError(err instanceof Error ? err : new Error(String(err))));
  }, [migrationsReady]);

  useEffect(() => {
    if (!seeded) return;
    // Best-effort background sync — a no-op when cloud isn't configured, and
    // any network/server failure here shouldn't block using the app offline.
    runSync().catch(() => {});
  }, [seeded]);

  const error = migrationError ?? seedError;

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          {t('common.errorGeneric')}: {error.message}
        </Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!seeded || !prefsReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
        <Text>{t('common.loading')}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <>
      <RootNavigator />
      <StatusBar style="auto" />
    </>
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
  error: {
    color: '#b00020',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
