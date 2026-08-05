import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getApiBaseUrl, loadServerUrl } from '../utils/constants';
import { useOfflineStore } from '../stores/offline';

// ── Token Management ─────────────────────────────────────────────────────
// SecureStore only works on native (iOS/Android). On web, fall back to localStorage.
const TOKENS = { access: 'fibre360_access', refresh: 'fibre360_refresh' } as const;

const isWeb = Platform.OS === 'web';

const webStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value); } catch { /* quota exceeded */ }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export let apiClientToken: string | null = null;

export async function loadStoredToken(): Promise<string | null> {
  try {
    // Load the persisted runtime server override before any API call so a
    // changed LAN IP is picked up on app restart without a rebuild.
    await loadServerUrl();
    const token = isWeb
      ? webStorage.getItem(TOKENS.access)
      : await SecureStore.getItemAsync(TOKENS.access);
    if (token) apiClientToken = token;
    return token;
  } catch {
    return null;
  }
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  apiClientToken = access;
  if (isWeb) {
    webStorage.setItem(TOKENS.access, access);
    webStorage.setItem(TOKENS.refresh, refresh);
  } else {
    await SecureStore.setItemAsync(TOKENS.access, access);
    await SecureStore.setItemAsync(TOKENS.refresh, refresh);
  }
}

export async function clearTokens(): Promise<void> {
  apiClientToken = null;
  if (isWeb) {
    webStorage.removeItem(TOKENS.access);
    webStorage.removeItem(TOKENS.refresh);
  } else {
    await SecureStore.deleteItemAsync(TOKENS.access);
    await SecureStore.deleteItemAsync(TOKENS.refresh);
  }
}

async function getRefreshToken(): Promise<string | null> {
  try {
    if (isWeb) return webStorage.getItem(TOKENS.refresh);
    return await SecureStore.getItemAsync(TOKENS.refresh);
  } catch {
    return null;
  }
}

// ── API Error ─────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Fetch Wrapper ─────────────────────────────────────────────────────────

/**
 * Check if the device has network access before making a request.
 * Throws early with a clear message so callers can handle offline gracefully.
 */
function requireOnline(): void {
  const { isOnline } = useOfflineStore.getState();
  if (!isOnline) {
    throw new ApiError(
      'No internet connection. Data will sync automatically when reconnected.',
      0
    );
  }
}

export async function refreshAccessToken(signal?: AbortSignal): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/users/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
      ...(signal ? { signal } : {}),
    });

    if (!res.ok) return null;

    const data = await res.json();
    await saveTokens(data.access, data.refresh ?? refresh);
    return data.access;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { isFormData?: boolean } = {}
): Promise<T> {
  const { isFormData, ...fetchOptions } = options;

  const headers: Record<string, string> = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (apiClientToken) {
    headers['Authorization'] = `Bearer ${apiClientToken}`;
  }

  const url = path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`;

  // Abort early if offline — avoid pointless timeout waits
  requireOnline();

  let res = await fetch(url, { ...fetchOptions, headers });

  // Auto-refresh on 401
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...fetchOptions, headers });
    }
  }

  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch { /* no body */ }
    throw new ApiError(
      `Request failed with status ${res.status}`,
      res.status,
      data
    );
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
