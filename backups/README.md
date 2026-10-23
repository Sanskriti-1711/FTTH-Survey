# Backups

## `fibre-mobile-pre-redesign-2026-10-21.tar.gz`

The survey app exactly as it was before the phone redesign (2026-10-21), taken
before any file was edited.

**What it contains:** the full `fibre-mobile/` source — `app/`, `lib/`,
`components/`, `tests/`, `e2e/`, `assets/`, `public/vendor/`, config files and
the docs at that moment.

**What it does not contain** (all regenerable, deliberately excluded to keep it
2.3 MB):

| Excluded | Rebuild with |
|---|---|
| `node_modules/` | `npm install` |
| `android/` | `npx expo prebuild -p android` (or keep the existing folder) |
| `build_output/`, `web-prod/`, `web-dist/`, `web-verify/` | `npx expo export --platform web --output-dir web-prod` |
| `.expo/` | `npx expo start` |

**Restore:**

```bash
cd FTTH_SURVEY_APP
rm -rf fibre-mobile.bak && mv fibre-mobile fibre-mobile.bak   # keep the current one
tar -xzf backups/fibre-mobile-pre-redesign-2026-10-21.tar.gz
cd fibre-mobile && npm install
```

**Git:** the same state is tagged by the branch
`backup/survey-ui-pre-redesign-2026-10-21` (commit `c9cff6c`), so
`git diff backup/survey-ui-pre-redesign-2026-10-21 -- fibre-mobile` shows every
change the redesign made, and a single path/folder can be restored with
`git checkout backup/survey-ui-pre-redesign-2026-10-21 -- fibre-mobile/<path>`.
