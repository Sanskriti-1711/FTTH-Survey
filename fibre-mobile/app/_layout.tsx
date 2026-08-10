import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useThemeStore } from '../lib/stores/theme';
import { useAuthStore } from '../lib/stores/auth';
import { useNetworkStatus } from '../lib/hooks/useNetworkStatus';

// ── Root Layout ───────────────────────────────────────────────────────────

export default function RootLayout() {
  const resolved = useThemeStore((s) => s.resolved);
  const { isRestoring, restoreSession } = useAuthStore();
  const restored = useRef(false);

  // ── Real-time network connectivity detection ───────────────────────────
  useNetworkStatus();

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

  if (isRestoring) {
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
