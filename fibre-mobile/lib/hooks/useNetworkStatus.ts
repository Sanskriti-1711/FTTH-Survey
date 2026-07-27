import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useOfflineStore } from '../stores/offline';

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
      };
      const handleOffline = () => {
        useOfflineStore.getState().setOnline(false);
        useOfflineStore.getState().setConnectivitySource('real');
      };

      // Set initial state
      store.setOnline(navigator.onLine);
      store.setConnectivitySource('real');

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
            useOfflineStore.getState().setOnline(online);
            useOfflineStore.getState().setConnectivitySource('real');
          }
        );

        return () => unsubscribe();
      } catch (err) {
        // NetInfo not linked — keep demo mode
        console.warn('[useNetworkStatus] @react-native-community/netinfo unavailable, falling back to demo:', err);
        store.setConnectivitySource('demo');
      }
    }
  }, []);
}
