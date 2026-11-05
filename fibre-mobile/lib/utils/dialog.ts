import { Alert, Platform } from 'react-native';

// React Native Web's Alert.alert is an empty function, so every confirmation
// built on it silently did nothing in the browser. Route user-facing dialogs
// through here instead: native keeps the platform dialog, web uses the browser
// primitives that actually exist.

const isWeb = Platform.OS === 'web';

export function notify(title: string, message?: string): void {
  if (isWeb) {
    if (typeof window === 'undefined') return;
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
): Promise<boolean> {
  if (isWeb) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
