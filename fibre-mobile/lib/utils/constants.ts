// ── App Constants ────────────────────────────────────────────────────────

// Change this to your actual backend URL
// For local dev: http://localhost:8000 (Django on same machine)
// For LAN:       http://YOUR_IP:8000 (other devices on network)
// For cloud:     https://your-domain.com
// During development, always use localhost.
// For production deployment, set the EXPO_PUBLIC_API_URL env var
// or override this constant before deploying.
//
// The base URL is runtime-overridable: engineers on the field can change
// it in-app (login screen → Server settings) without rebuilding the APK.
// This matters because LAN IPs are often DHCP-assigned and change across
// router reboots — a baked-in IP would break every time the IP changes.
// `getApiBaseUrl()` returns the runtime override (persisted on the device)
// falling back to the build-time default below.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';
const SERVER_URL_KEY = 'fibre360_server_url';

const webStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value); } catch { /* quota */ }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

// Runtime override — populated by loadServerUrl() at startup / saveServerUrl()
let runtimeServerUrl: string | null = null;

/** Build-time default: env var (baked by EAS) or localhost fallback. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Effective API base URL. Prefers the runtime override (set by the user in
 * Server settings and persisted on-device), then the baked-in env value.
 */
export function getApiBaseUrl(): string {
  return runtimeServerUrl ?? API_BASE_URL;
}

/** Load the persisted runtime override (call once at app startup). */
export async function loadServerUrl(): Promise<string | null> {
  try {
    const stored = isWeb
      ? webStorage.getItem(SERVER_URL_KEY)
      : await SecureStore.getItemAsync(SERVER_URL_KEY);
    if (stored && stored.trim()) {
      runtimeServerUrl = stored.trim().replace(/\/+$/, '');
      return runtimeServerUrl;
    }
  } catch { /* fall through */ }
  return null;
}

/** Persist a runtime override and apply it immediately. */
export async function saveServerUrl(url: string): Promise<void> {
  const normalized = url.trim().replace(/\/+$/, '');
  runtimeServerUrl = normalized;
  if (isWeb) {
    webStorage.setItem(SERVER_URL_KEY, normalized);
  } else {
    await SecureStore.setItemAsync(SERVER_URL_KEY, normalized);
  }
}

/** Clear the runtime override and return to the baked-in default. */
export async function clearServerUrl(): Promise<void> {
  runtimeServerUrl = null;
  if (isWeb) {
    webStorage.removeItem(SERVER_URL_KEY);
  } else {
    await SecureStore.deleteItemAsync(SERVER_URL_KEY);
  }
}

export const MICROSERVICE_BASE_URL = 'https://fiber-import.zeabur.app';

export const APP_NAME = 'Fiber360';

export const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const LOCATION_INTERVAL_MS = 10_000;    // 10 seconds
export const MAX_PHOTO_SIZE_MB = 10;
export const PAGE_SIZE = 20;

export const FEATURE_STATUSES = [
  'pending',
  'assigned',
  'under_review',
  'approved',
  'redo',
] as const;

export const PROJECT_STATUSES = [
  'draft',
  'in_progress',
  'assigned',
  'active',
  'submitted',
  'under_review',
  'reviewed',
  'accepted',
  'redo',
  'completed',
  'archived',
] as const;

export const SCOPE_OPTIONS = [
  { label: 'Project', value: 'project' },
  { label: 'Layer', value: 'layer' },
  { label: 'Feature', value: 'feature' },
] as const;
