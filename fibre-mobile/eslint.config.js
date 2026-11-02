// ── ESLint config (flat) ───────────────────────────────────────────────────
// `expo lint` auto-installed eslint-config-expo but found no config file, so
// `npm run lint` was unusable. This wires the Expo default ruleset into the
// flat-config format ESLint 9 expects, using the @eslint/compat shim to
// convert the legacy config object — no hand-rolled rule lists.

import { compat } from '@eslint/compat';
import eslintConfigExpo from 'eslint-config-expo/default.js';

export default [
  compat(eslintConfigExpo),
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