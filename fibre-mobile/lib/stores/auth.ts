import { create } from 'zustand';
import type { User } from '../utils/types';
import { login as apiLogin, register as apiRegister } from '../api/auth';
import { saveTokens, clearTokens, loadStoredToken, refreshAccessToken } from '../api/client';

// ── Auth Store ────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  // Actions
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  isRestoring: true,
  error: null,

  restoreSession: async () => {
    try {
      const token = await loadStoredToken();
      if (!token) {
        set({ isRestoring: false });
        return;
      }
      // Try to validate token by refreshing it (with 3s timeout).
      // refreshAccessToken reads the stored refresh token and sends it in the body,
      // which Django's SimpleJWT endpoint requires (an empty POST body always 400s).
      // NOTE: refreshAccessToken never throws — it returns null on every failure path.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const newAccess = await refreshAccessToken(controller.signal);
      clearTimeout(timeout);
      if (newAccess) {
        set({ token: newAccess, isRestoring: false });
        return;
      }
      // Refresh failed (e.g. refresh token expired after 1 day) — but the stored
      // access token is valid for 7 days, so keep the session instead of logging
      // the user out. The next 401 will re-attempt refresh via apiFetch.
      set({ token, isRestoring: false });
    } catch {
      set({ isRestoring: false });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiLogin(email, password);
      await saveTokens(data.access, data.refresh);
      set({
        user: data.user,
        token: data.access,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (email, password, fullName, role = 'ENGINEER') => {
    set({ isLoading: true, error: null });
    try {
      await apiRegister(email, password, fullName, role as 'ENGINEER' | 'SUBADMIN');
      // After registration, log the user in
      await get().login(email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    await clearTokens();
    set({ user: null, token: null });
  },

  clearError: () => set({ error: null }),
}));
