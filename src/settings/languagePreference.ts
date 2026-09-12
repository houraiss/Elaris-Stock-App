import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { applyTextDirection, isRTL, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';

const STORAGE_KEY = 'elaris.language';

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export async function getStoredLanguage(): Promise<SupportedLanguage | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return isSupportedLanguage(value) ? value : null;
}

/**
 * Applied once at app boot, after the device-detected default from
 * src/i18n/index.ts has already run. A stored preference overrides that
 * default for displayed text immediately; the native RTL/LTR flag only
 * takes effect on the next full app restart (an RN/I18nManager constraint,
 * not something a JS-side call can override mid-session).
 */
export async function applyStoredLanguageOnBoot(): Promise<void> {
  const stored = await getStoredLanguage();
  if (!stored) return;
  if (stored !== i18n.language) {
    await i18n.changeLanguage(stored);
  }
  applyTextDirection(stored);
}

export interface SetLanguageResult {
  requiresRestart: boolean;
}

/** Called from Settings when the user picks a language. */
export async function setLanguage(language: SupportedLanguage): Promise<SetLanguageResult> {
  const requiresRestart = isRTL(language) !== isRTL(i18n.language as SupportedLanguage);
  await AsyncStorage.setItem(STORAGE_KEY, language);
  await i18n.changeLanguage(language);
  applyTextDirection(language);
  return { requiresRestart };
}
