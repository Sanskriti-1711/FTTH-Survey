import { create } from 'zustand';

// ── Offline / Network Store ───────────────────────────────────────────────

export type ConnectivitySource = 'real' | 'offline';

interface OfflineState {
  /** Whether the device currently has network access */
  isOnline: boolean;
  /** Where the online status comes from — real NetInfo */
  connectivitySource: ConnectivitySource;
  pendingSyncCount: number;
  /** Items whose last replay attempt failed; they stay queued for retry. */
  failedSyncCount: number;
  /** Why the last replay/sync attempt failed, if it did. */
  syncError: string | null;
  lastSyncAt: string | null;
  isSyncing: boolean;

  setOnline: (online: boolean) => void;
  setConnectivitySource: (source: ConnectivitySource) => void;
  setPendingCount: (count: number) => void;
  incrementPending: () => void;
  decrementPending: () => void;
  setSyncStatus: (patch: {
    pendingSyncCount?: number;
    failedSyncCount?: number;
    syncError?: string | null;
  }) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSync: (time: string) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  connectivitySource: 'real',
  pendingSyncCount: 0,
  failedSyncCount: 0,
  syncError: null,
  lastSyncAt: null,
  isSyncing: false,

  setOnline: (online) => set({ isOnline: online }),
  setConnectivitySource: (source) => set({ connectivitySource: source }),
  setPendingCount: (count) => set({ pendingSyncCount: count }),
  incrementPending: () =>
    set((s) => ({
      pendingSyncCount: s.pendingSyncCount + 1,
      // A new edit invalidates the previous attempt's failure badge; the
      // next replay gets a clean result.
      failedSyncCount: 0,
      syncError: null,
    })),
  decrementPending: () =>
    set((s) => ({
      pendingSyncCount: Math.max(0, s.pendingSyncCount - 1),
    })),
  setSyncStatus: (patch) => set(patch),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSync: (time) => set({ lastSyncAt: time }),
}));
