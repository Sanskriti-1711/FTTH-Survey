import { create } from 'zustand';

// ── Offline / Network Store ───────────────────────────────────────────────

export type ConnectivitySource = 'real' | 'offline';

interface OfflineState {
  /** Whether the device currently has network access */
  isOnline: boolean;
  /** Where the online status comes from — real NetInfo */
  connectivitySource: ConnectivitySource;
  pendingSyncCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;

  setOnline: (online: boolean) => void;
  setConnectivitySource: (source: ConnectivitySource) => void;
  setPendingCount: (count: number) => void;
  incrementPending: () => void;
  decrementPending: () => void;
  setSyncing: (syncing: boolean) => void;
  setLastSync: (time: string) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  connectivitySource: 'real',
  pendingSyncCount: 0,
  lastSyncAt: null,
  isSyncing: false,

  setOnline: (online) => set({ isOnline: online }),
  setConnectivitySource: (source) => set({ connectivitySource: source }),
  setPendingCount: (count) => set({ pendingSyncCount: count }),
  incrementPending: () => set((s) => ({ pendingSyncCount: s.pendingSyncCount + 1 })),
  decrementPending: () =>
    set((s) => ({
      pendingSyncCount: Math.max(0, s.pendingSyncCount - 1),
    })),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSync: (time) => set({ lastSyncAt: time }),
}));
