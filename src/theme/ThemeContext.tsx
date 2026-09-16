import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, type Colors, type ColorScheme } from './palettes';

export type ThemePreference = ColorScheme | 'system';
export type VisualStyle = 'standard' | 'liquidGlass';

const STORAGE_KEY = 'elaris.themePreference';
const STYLE_STORAGE_KEY = 'elaris.visualStyle';

interface ThemeContextValue {
  colors: Colors;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  visualStyle: VisualStyle;
  setVisualStyle: (style: VisualStyle) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isVisualStyle(value: string | null): value is VisualStyle {
  return value === 'standard' || value === 'liquidGlass';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>('standard');
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (isThemePreference(stored)) setPreferenceState(stored);
    });
    AsyncStorage.getItem(STYLE_STORAGE_KEY).then((stored) => {
      if (isVisualStyle(stored)) setVisualStyleState(stored);
    });
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }

  function setVisualStyle(next: VisualStyle) {
    setVisualStyleState(next);
    AsyncStorage.setItem(STYLE_STORAGE_KEY, next);
  }

  const scheme: ColorScheme = preference === 'system' ? systemScheme : preference;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ colors, scheme, preference, setPreference, visualStyle, setVisualStyle }),
    [colors, scheme, preference, visualStyle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
