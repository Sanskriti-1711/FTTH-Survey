import { Redirect } from 'expo-router';

// ── Root index — redirect to auth/login ──────────────────────────────────

export default function RootIndex() {
  return <Redirect href="/(auth)/login" />;
}
