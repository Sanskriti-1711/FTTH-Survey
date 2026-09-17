import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { loadStoredToken } from '../lib/api/client';

// ── Root index ───────────────────────────────────────────────────────────
// Web: if the URL carries the deep-link params (?token=&project=) from the
// platform, hand off to /deeplink (preserving the query string so the
// deeplink screen can read it) which activates the project and opens the
// map.
//
// Session restore: if the device already holds a stored access token
// (from a previous login), go straight to the app instead of forcing the
// engineer through the login screen every launch. The token's validity is
// verified by restoreSession() in _layout.tsx + the apiFetch 401→refresh
// path — a stale token simply triggers a refresh (or an eventual logout),
// never a crash. While checking, render nothing (a one-frame blank) to
// avoid a login-screen flash on every start.

export default function RootIndex() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStoredToken().then((token) => {
      if (!cancelled) setHasSession(!!token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('token') && params.get('project')) {
      return <Redirect href={`/deeplink?${params.toString()}`} />;
    }
  }

  // Still checking SecureStore — render nothing rather than flashing login.
  if (hasSession === null) return null;

  if (hasSession) {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Redirect href="/(auth)/login" />;
}
