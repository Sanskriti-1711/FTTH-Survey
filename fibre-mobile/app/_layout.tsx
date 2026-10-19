import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useThemeStore } from '../lib/stores/theme';
import { useAuthStore } from '../lib/stores/auth';
import { useNetworkStatus } from '../lib/hooks/useNetworkStatus';

// ── Root Layout ───────────────────────────────────────────────────────────

export default function RootLayout() {
  const resolved = useThemeStore((s) => s.resolved);
  const { isRestoring, restoreSession, token } = useAuthStore();
  const restored = useRef(false);
  const router = useRouter();
  const segments = useSegments();

  // ── Real-time network connectivity detection ───────────────────────────
  useNetworkStatus();

  // ── Auth guard ─────────────────────────────────────────────────────────
  // Portal screens (home, profile, map, feature, camera, import) need a session.
  // Without one, a direct URL such as /home must go to login first, not render
  // the portal. The login screen, the deeplink (it carries its own token) and
  // the root index (it routes itself) stay reachable.
  const first = segments[0] as string | undefined;
  const isPublicRoute = first === undefined || first === '(auth)' || first === 'deeplink';
  const needsLogin = !isRestoring && !token && !isPublicRoute;

  useEffect(() => {
    if (needsLogin) router.replace('/(auth)/login');
  }, [needsLogin, router]);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    // Safety timeout - force proceed after 5s if restore hangs
    const timeout = setTimeout(() => {
      useAuthStore.setState({ isRestoring: false });
    }, 5000);

    restoreSession()
      .catch((e) => console.warn('Restore session error:', e))
      .finally(() => {
        clearTimeout(timeout);
      });
  }, []);

  if (isRestoring || needsLogin) {
    return (
      <View style={[styles.loading, { backgroundColor: '#0D5CFF' }]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>Fiber360</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="deeplink" />
        <Stack.Screen name="map" options={{ animation: 'fade' }} />
        <Stack.Screen name="feature/[featureId]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="project/import" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="camera" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
