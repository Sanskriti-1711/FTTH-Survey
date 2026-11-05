import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'fibre360_theme';
const isWeb = Platform.OS === 'web';

export type StoredTheme = 'light' | 'dark';

function parse(value: string | null | undefined): StoredTheme | null {
  return value === 'dark' || value === 'light' ? value : null;
}

/** Synchronous on web, where localStorage is available during module init. */
export function getStoredThemeSync(): StoredTheme | null {
  if (!isWeb) return null;
  try {
    return parse(localStorage.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

/** Native read used once at startup; web already has the synchronous value. */
export async function getStoredTheme(): Promise<StoredTheme | null> {
  if (isWeb) return getStoredThemeSync();
  try {
    return parse(await SecureStore.getItemAsync(THEME_KEY));
  } catch {
    return null;
  }
}

export function storeTheme(theme: StoredTheme): void {
  if (isWeb) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage disabled */
    }
    return;
  }
  void SecureStore.setItemAsync(THEME_KEY, theme).catch(() => {});
}
