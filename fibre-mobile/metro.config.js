const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support for packages that ship .cjs files (lucide-react-native, etc.)
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
];

// ── Android release-crash fix ──────────────────────────────────────────────
// Production builds enable Metro's `inlineRequires` (see
// @react-native/metro-config). That optimization inlines `require()` calls
// into the body of lazily-loaded route modules (map.tsx and its zustand
// store modules), which can resolve a store hook (e.g. useThemeStore /
// useSurveyStore) as `undefined` at first render on device.
// This is the exact `TypeError: undefined is not a function` seen in
// MapScreen's render in the release APK (dev/web mode doesn't inline).
// Disabling it forces hoisted requires with deterministic evaluation order.
config.transformer.inlineRequires = false;

module.exports = config;
