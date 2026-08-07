import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

// ── Root index ───────────────────────────────────────────────────────────
// Web: if the URL carries the deep-link params (?token=&project=) from the
// platform, hand off to /deeplink (preserving the query string so the
// deeplink screen can read it) which activates the project and opens the
// Map tab. Otherwise (and always on native) go to the login screen.

export default function RootIndex() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('token') && params.get('project')) {
      return <Redirect href={`/deeplink?${params.toString()}`} />;
    }
  }
  return <Redirect href="/(auth)/login" />;
}
