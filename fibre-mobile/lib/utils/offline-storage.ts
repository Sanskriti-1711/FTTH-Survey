import { Platform } from 'react-native';

// The offline edit queue and the local survey features must survive an app
// kill or reload, not just a screen change. Web uses localStorage; native
// writes a JSON document beside the app's other files.
//
// The shape is intentionally loose here: this module only stores bytes, and
// importing the store's types would create a runtime cycle with the store.

const KEY = 'fibre360_offline_v1';
const FILE = 'fibre360-offline.json';
const isWeb = Platform.OS === 'web';

export interface PersistedOfflineState {
  surveyFeatures: Record<string, unknown[]>;
  pendingEdits: unknown[];
}

export async function loadOfflineState(): Promise<PersistedOfflineState | null> {
  try {
    if (isWeb) {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as PersistedOfflineState) : null;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const dir = FileSystem.documentDirectory;
    if (!dir) return null;
    const info = await FileSystem.getInfoAsync(`${dir}${FILE}`);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(`${dir}${FILE}`);
    return raw ? (JSON.parse(raw) as PersistedOfflineState) : null;
  } catch {
    return null;
  }
}

export async function saveOfflineState(state: PersistedOfflineState): Promise<void> {
  try {
    const raw = JSON.stringify(state);
    if (isWeb) {
      localStorage.setItem(KEY, raw);
      return;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const dir = FileSystem.documentDirectory;
    if (!dir) return;
    await FileSystem.writeAsStringAsync(`${dir}${FILE}`, raw);
  } catch {
    /* a full disk or disabled storage must not break editing */
  }
}
