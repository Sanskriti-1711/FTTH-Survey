import { create } from 'zustand';
import { Colors, type ThemeColors } from '../theme/colors';
import { getStoredTheme, getStoredThemeSync, storeTheme, type StoredTheme } from '../utils/theme-storage';

// ── Theme Store ───────────────────────────────────────────────────────────

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  colors: ThemeColors;

  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const initialTheme: StoredTheme = getStoredThemeSync() ?? 'light';

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialTheme,
  resolved: initialTheme,
  colors: initialTheme === 'dark' ? Colors.dark : Colors.light,

  setMode: (mode) => {
    const resolved = mode === 'system' ? 'light' : mode;
    storeTheme(resolved);
    set({
      mode,
      resolved,
      colors: mode === 'dark' ? Colors.dark : Colors.light,
    });
  },

  toggleTheme: () =>
    set((state) => {
      const next = state.resolved === 'light' ? 'dark' : 'light';
      storeTheme(next);
      return {
        mode: next,
        resolved: next,
        colors: next === 'dark' ? Colors.dark : Colors.light,
      };
    }),
}));

/** Native has no synchronous storage: read the saved theme once at startup. */
export async function hydrateTheme(): Promise<void> {
  const stored = await getStoredTheme();
  if (stored && stored !== useThemeStore.getState().resolved) {
    useThemeStore.getState().setMode(stored);
  }
}
