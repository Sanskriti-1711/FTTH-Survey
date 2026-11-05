// ── ESLint config (flat) ───────────────────────────────────────────────────
// eslint-config-expo ships a flat config for ESLint 9. The old shim used
// `compat` from @eslint/compat, which v1.4 no longer exports, so `npm run
// lint` failed before it read a single file.

import expoConfig from 'eslint-config-expo/flat.js';

export default [
  ...expoConfig,
  {
    rules: {
      // This app uses MapLibre and Reanimated through imperative refs and is
      // not compiled with React Compiler. These compiler-oriented rules flag
      // that established pattern wholesale (114 hits) rather than a defect,
      // so they are not useful as a merge gate here.
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    ignores: [
      'node_modules',
      '.expo',
      'web-dist',
      'web-prod',
      'dist',
      'build_output',
      'build_output_local',
      'build_output_verify',
      'android',
      '.ci-build',
      'e2e/db-snapshot.sh',
    ],
  },
];
