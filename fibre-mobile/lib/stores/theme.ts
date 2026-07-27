import { create } from 'zustand';
import { Colors, type ThemeColors } from '../theme/colors';

// ── Theme Store ───────────────────────────────────────────────────────────

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  colors: ThemeColors;

  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'light',
  resolved: 'light',
  colors: Colors.light,

  setMode: (mode) =>
    set({
      mode,
      resolved: mode === 'system' ? 'light' : mode,
      colors: mode === 'dark' ? Colors.dark : Colors.light,
    }),

  toggleTheme: () =>
    set((state) => {
      const next = state.resolved === 'light' ? 'dark' : 'light';
      return {
        mode: next,
        resolved: next,
        colors: next === 'dark' ? Colors.dark : Colors.light,
      };
    }),
}));
