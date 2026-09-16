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
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.error, { color: colors.danger }]}>
          {t('common.errorGeneric')}: {error.message}
        </Text>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  if (!seeded || !prefsReady) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.ink} />
        <Text style={{ color: colors.ink }}>{t('common.loading')}</Text>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <>
      <RootNavigator />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  error: {
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
