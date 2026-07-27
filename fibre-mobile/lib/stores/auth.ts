import { create } from 'zustand';
import type { User } from '../utils/types';
import { login as apiLogin, register as apiRegister } from '../api/auth';
import { saveTokens, clearTokens, loadStoredToken, apiFetch } from '../api/client';

// ── Auth Store ────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  demoMode: boolean;
  // Actions
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  setDemoMode: (enabled: boolean) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  isRestoring: true,
  error: null,
  demoMode: false,

  restoreSession: async () => {
    try {
      const token = await loadStoredToken();
      if (!token) {
        set({ isRestoring: false });
        return;
      }
      // Try to validate token by refreshing it (with 3s timeout)
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await apiFetch<{ access: string }>('/api/users/token/refresh/', {
          method: 'POST',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res?.access) {
          set({ token: res.access, isRestoring: false });
          return;
        }
      } catch {
        // Token refresh failed — clear and show login
        await clearTokens();
        set({ token: null, isRestoring: false });
        return;
      }
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
        demoMode: false,
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
    set({ user: null, token: null, demoMode: false });
  },

  setDemoMode: (enabled) => {
    set({
      demoMode: enabled,
      user: enabled
        ? {
            id: 'demo-user',
            email: 'demo@fibre360.com',
            full_name: 'Demo Engineer',
            role: 'ENGINEER',
            created_by: null,
            created_at: new Date().toISOString(),
          }
        : null,
      token: enabled ? 'demo-token' : null,
    });
  },

  clearError: () => set({ error: null }),
}));
