const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Windows/FAT32 fix #2: exclude heavy build artifacts from the file crawl.
// Metro hashes every file it crawls; reading the 144MB APK and the exported
// web bundles off a FAT32 drive throws EINVAL in node:fs. Keep them out.
config.resolver.blockList = [
  /app-release-.*\.apk$/,
  /web-prod\//,
  /web-dist\//,
  /web-drag\//,
  /build_output\//,
  /\.expo\//,
];

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

// FAT32 fix #3: single worker - Metro's parallel file-map crawler throws
// EINVAL reads on FAT32 drives; sequential crawling avoids the driver error.
config.maxWorkers = 1;

module.exports = config;
