# P0 map-tool E2E (Playwright)

Automates the read-only P0 map cases from
`Survey_EndToEnd_TestSheet_UIOnly.xlsx` against the **web build** of the survey
app. It talks to a real backend project because the failures these cases guard
against (layer counts, popup attributes, line/polygon toolbars) only appear with
real imported GeoJSON.

```bash
cd FTTH_SURVEY_APP/fibre-mobile
E2E_EMAIL=you@example.com E2E_PASSWORD=secret npm run test:e2e
```

| Env var | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `https://fibre-survey-web.onrender.com` | web build to drive |
| `E2E_EMAIL` / `E2E_PASSWORD` | — (required) | survey login |
| `E2E_PROJECT` | `UI-Brownfield-Verify` | project that already has imported layers and at least one survey change |
| `E2E_ONLY` | — | comma-separated case ids to run (`SA-050,SA-090`); the rest skip with a reason |
| `E2E_SERVER_URL` | — (baked into the build) | repoints the bundle at another backend, e.g. `http://localhost:8000` |
| `E2E_BLOCK_TILES` | — | `1` stops waiting on basemap tiles (no case asserts on them) |

`playwright` is a devDependency; the suite uses the installed Chrome
(`channel: 'chrome'`), so no browser download is needed. A full read-only run
takes ~4–5 minutes: every case re-opens the project because `/map` does not
carry the project id, and the 13 imported layers take ~10 s to load even from a
local backend (measured: 17 API calls, 10.6 s, of which sign-in is another
5 s).

When iterating on one tool, skip the rest of the suite and the remote backend:

```bash
# one toolbar case, against a locally exported build, in ~30 s instead of ~5 min
E2E_ONLY=SA-050 \
E2E_BASE_URL=http://localhost:8081 \
E2E_SERVER_URL=http://localhost:8000 \
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
```

`E2E_SERVER_URL` works on any already-exported bundle: the app persists its API
base in `localStorage` under `fibre360_server_url` and prefers it over the value
compiled in, so pointing a build at a local Django needs no re-export.

## Covered automatically

| Case | What is asserted |
|---|---|
| SA-017 | map opens, loading overlay clears, no error text, a known layer is listed |
| SA-022 | every layer row's name and feature count match that layer's API payload |
| SA-023 | HLD / Survey / Overlay segments highlight in turn and the map survives |
| SA-027 | a layer group collapses and re-expands its rows |
| SA-019 | list search filters to matching cards with layer + geometry |
| SA-032 | point popup shows actions and expands `+N more attributes` |
| SA-034 | point **Edit** opens the survey sheet with all sections; Risk expands |
| SA-035 | point **Move** shows the drag-mode banner |
| SA-050 | line toolbar exposes Edit shape / Split / Route around / Remove span / Extend / Attributes / Delete / Undo / Save |
| SA-090 | polygon toolbar exposes Move / Undo / Cancel / Delete / Save |
| SA-095 | a fresh load has nothing to undo |
| SA-081 | Draw Trench panel shows its guidance and a disabled Save |
| SA-104 | the changes panel lists the fixture's saved changes |
| SA-105 | the commit bar shows the change count and an enabled Submit button (read only) |

## Mutating cases (snapshot, test, restore)

SA-040, SA-041 and SA-098 write survey rows. Each runs inside `mutatingCase()`:

1. `db-snapshot.sh` exports the `business.*` survey rows for `E2E_SURVEY_PROJECT_ID`.
2. `db-fingerprint.sh` hashes the `gis.*` layers of the source project.
3. The case runs on a fresh load.
4. `db-reset.sh` restores the survey rows, always, even when the case fails.
5. The fingerprint is compared again. A change fails the case.

These cases only run when you opt in:

```bash
export E2E_ALLOW_DB_RESET=1
# plus PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE from the repo .env, exported in this shell
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
```

The scripts use `psql`, so it must be on the PATH. Without the opt-in the cases
skip. Do not point the opt-in at a project you need to keep.

## Deliberately manual

The remaining P0 cases need a map gesture at a coordinate (drag, tap on a line,
add point), a fixture with specific state (zero changes, a feature with no prior
edit, two saved edits), or they change project status (SA-107) or need an
offline network (SA-018). They are listed as `skip` entries at the bottom of the
spec with the reason.

## Selector notes (learned the hard way)

- Imported layers render as `<layer> (Imported)`; match with `/^final_trenches\b/`,
  not an exact string.
- Group headings look uppercase but the DOM text is title case
  (`Trenches`); match case-insensitively.
- The Layers legend starts expanded, but `isVisible()` returns false while the
  panel is still animating — wait for the group, don't click blindly.
- The `/map` route has no project id: a reload lands on an empty map, so each
  case goes back through the dashboard.
