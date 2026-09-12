import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';

import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const RTL_LANGUAGES: readonly SupportedLanguage[] = ['ar'];

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  ar: { translation: ar },
};

function detectDeviceLanguage(): SupportedLanguage {
  for (const locale of Localization.getLocales()) {
    const code = locale.languageCode;
    if (code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
      return code as SupportedLanguage;
    }
  }
  return 'en';
}

export function isRTL(language: SupportedLanguage): boolean {
  return RTL_LANGUAGES.includes(language);
}

/**
 * Aligns native layout direction with the given language. Must run before
 * the first render — RN only picks up an I18nManager change after a JS
 * reload, so switching language in Settings later must prompt a restart
 * whenever it crosses the RTL/LTR boundary.
 */
export function applyTextDirection(language: SupportedLanguage): void {
  const shouldBeRTL = isRTL(language);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
  }
}

const initialLanguage = detectDeviceLanguage();
applyTextDirection(initialLanguage);

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
