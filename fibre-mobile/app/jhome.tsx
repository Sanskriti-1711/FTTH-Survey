import { Redirect } from 'expo-router';

// ── /jhome ───────────────────────────────────────────────────────────────
// Portal entry point for the web URL /jhome. The root auth guard in
// _layout.tsx treats this route as protected: a signed-out visitor is sent to
// /login first, and after signing in the portal home is shown.

export default function JHome() {
  return <Redirect href="/(tabs)/home" />;
}
