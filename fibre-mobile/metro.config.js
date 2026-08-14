const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Windows long-path build fix: the release APK is built from a short-path
// junction (C:\ff -> project) so C++/CMake object files stay under the
// 250-char Windows limit (the ninja "build.ninja still dirty after 100 tries"
// loop). Node, however, resolves junction paths back to the real project
// path, which made Metro's file watcher throw "this and base files have
// different roots". Pinning the project root to the REAL path keeps Metro
// consistent (JS bundling has no 250-char limit), while the C++ build still
// runs through the short junction path.
const REAL_ROOT = fs.realpathSync(__dirname);
config.projectRoot = REAL_ROOT;
config.watchFolders = [REAL_ROOT];

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
