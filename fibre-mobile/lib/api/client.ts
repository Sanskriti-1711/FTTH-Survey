import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getApiBaseUrl, loadServerUrl } from '../utils/constants';
import { apiErrorMessage } from '../utils/api-error';
import { useOfflineStore } from '../stores/offline';

// ── Token Management ─────────────────────────────────────────────────────
// SecureStore only works on native (iOS/Android). On web, fall back to localStorage.
const TOKENS = { access: 'fibre360_access', refresh: 'fibre360_refresh' } as const;
const USER_KEY = 'fibre360_user';

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

// The user (and therefore the role) must survive the same restart as the
// token. Without it a refreshed SUBADMIN loses every review action because
// `isAdmin` reads user.role.
export async function saveStoredUser(user: unknown): Promise<void> {
  const value = JSON.stringify(user);
  if (isWeb) {
    webStorage.setItem(USER_KEY, value);
  } else {
    await SecureStore.setItemAsync(USER_KEY, value);
  }
}

export async function loadStoredUser<T>(): Promise<T | null> {
  try {
    const raw = isWeb
      ? webStorage.getItem(USER_KEY)
      : await SecureStore.getItemAsync(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function clearStoredUser(): Promise<void> {
  if (isWeb) {
    webStorage.removeItem(USER_KEY);
  } else {
    await SecureStore.deleteItemAsync(USER_KEY);
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

/** What a refresh attempt found: a new access token, or a refusal. */
export interface RefreshResult {
  access: string | null;
  /** The server refused the refresh token — the session cannot continue. */
  rejected: boolean;
}

// A session the server has refused cannot be recovered by retrying, so the auth
// guard has to sign the engineer in again. The store registers here because
// this module cannot import it: the store imports this one.
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function endSession(): Promise<void> {
  apiClientToken = null;
  await clearTokens();
  await clearStoredUser();
  onSessionExpired?.();
}

export async function refreshSession(signal?: AbortSignal): Promise<RefreshResult> {
  const refresh = await getRefreshToken();
  if (!refresh) return { access: null, rejected: false };

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/users/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
      ...(signal ? { signal } : {}),
    });

    if (!res.ok) {
      // Rotation retires the token it just replaced, so a second tab (or a
      // parallel request) can present one that another refresh has already
      // spent. If the stored pair changed underneath us, that newer access
      // token is the live one — use it instead of declaring the session dead.
      const current = await getRefreshToken();
      if (current && current !== refresh) {
        const access = await loadStoredToken();
        if (access) return { access, rejected: false };
      }
      return { access: null, rejected: res.status === 401 || res.status === 403 };
    }

    const data = await res.json();
    await saveTokens(data.access, data.refresh ?? refresh);
    return { access: data.access, rejected: false };
  } catch {
    return { access: null, rejected: false };
  }
}

/** The new access token, or null. Never ends the session on its own: a refusal
 *  matters only once the request itself was also refused as unauthenticated. */
export async function refreshAccessToken(signal?: AbortSignal): Promise<string | null> {
  return (await refreshSession(signal)).access;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { isFormData?: boolean; skipAuth?: boolean } = {}
): Promise<T> {
  const { isFormData, skipAuth, ...fetchOptions } = options;

  const headers: Record<string, string> = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  // Login and registration must not carry an expired access token: DRF's JWT
  // authentication rejects a bad Authorization header before it checks the
  // submitted credentials, which makes a correct password look invalid.
  if (apiClientToken && !skipAuth) {
    headers['Authorization'] = `Bearer ${apiClientToken}`;
  }

  const url = path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`;

  // Abort early if offline — avoid pointless timeout waits
  requireOnline();

  let res = await fetch(url, { ...fetchOptions, headers });

  // Auto-refresh on 401, except for auth endpoints that deliberately skip the
  // stale token (there is nothing to refresh for those requests).
  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshSession();
    if (refreshed.access) {
      headers['Authorization'] = `Bearer ${refreshed.access}`;
      res = await fetch(url, { ...fetchOptions, headers });
    } else if (refreshed.rejected) {
      // A refused access token *and* a refused refresh token: no retry can
      // succeed. Drop the dead session so the auth guard shows sign-in instead
      // of leaving the screen on "Couldn't Load …" with a Try Again that can
      // never work.
      await endSession();
      throw new ApiError('Your session expired. Please sign in again.', 401);
    }
  }

  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch { /* no body */ }
    // The server's own reason, not just the status: a rejected login is
    // "Invalid credentials", a rejected field names the field, and only a
    // body with nothing usable falls back to "Request failed with status N".
    throw new ApiError(apiErrorMessage(data, res.status), res.status, data);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
