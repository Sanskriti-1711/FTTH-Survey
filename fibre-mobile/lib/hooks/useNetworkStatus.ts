import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useOfflineStore } from '../stores/offline';
import { useSurveyFeaturesStore } from '../stores/survey-features';

/**
 * Replay survey edits that were queued while the device was offline.
 * Fired every time connectivity comes back (and once on startup, in case a
 * previous flush never completed).
 */
function flushOfflineEdits() {
  useSurveyFeaturesStore
    .getState()
    .flushPendingEdits()
    .then(({ synced, failed }) => {
      if (synced > 0 || failed > 0) {
        console.log(`[Offline] Survey edit replay: ${synced} synced, ${failed} still queued`);
      }
    })
    .catch((err) => console.warn('[Offline] Survey edit replay failed:', err));
}

// ── Real NetInfo integration ─────────────────────────────────────────────
// On native: uses @react-native-community/netinfo
// On web: uses navigator.onLine + online/offline events
// Automatically updates the offline store and marks connectivitySource as 'real'

export function useNetworkStatus() {
  const initiatedRef = useRef(false);

  useEffect(() => {
    if (initiatedRef.current) return;
    initiatedRef.current = true;

    const store = useOfflineStore.getState();

    if (Platform.OS === 'web') {
      // ── Web: navigator.onLine ──────────────────────────────────────────
      const handleOnline = () => {
        useOfflineStore.getState().setOnline(true);
        useOfflineStore.getState().setConnectivitySource('real');
        flushOfflineEdits();
      };
      const handleOffline = () => {
        useOfflineStore.getState().setOnline(false);
        useOfflineStore.getState().setConnectivitySource('real');
      };

      // Set initial state
      store.setOnline(navigator.onLine);
      store.setConnectivitySource('real');
      if (navigator.onLine) flushOfflineEdits();

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    } else {
      // ── Native: @react-native-community/netinfo ────────────────────────
      try {
        // Dynamic require so bundler doesn't fail on web
        const NetInfo = require('@react-native-community/netinfo').default;

        // Set initial state from cached value
        NetInfo.fetch().then((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
          const online = state.isConnected ?? state.isInternetReachable ?? false;
          useOfflineStore.getState().setOnline(online);
          useOfflineStore.getState().setConnectivitySource('real');
        });

        const unsubscribe = NetInfo.addEventListener(
          (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
            const online = state.isConnected ?? state.isInternetReachable ?? false;
            const wasOnline = useOfflineStore.getState().isOnline;
            useOfflineStore.getState().setOnline(online);
            useOfflineStore.getState().setConnectivitySource('real');
            // Back online after an offline stretch → replay queued edits.
            if (online && !wasOnline) flushOfflineEdits();
          }
        );

        return () => unsubscribe();
      } catch (err) {
        // NetInfo not linked — assume online; the API layer will surface real errors
        console.warn('[useNetworkStatus] @react-native-community/netinfo unavailable, assuming online:', err);
        store.setOnline(true);
        store.setConnectivitySource('real');
      }
    }
  }, []);
}
