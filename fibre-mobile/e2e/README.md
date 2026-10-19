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

`playwright` is a devDependency; the suite uses the installed Chrome
(`channel: 'chrome'`), so no browser download is needed. A run takes ~4–5
minutes: every case re-opens the project because `/map` does not carry the
project id, and a cold Render instance can spend ~20 s fetching 13 layers.

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
| SA-104 | the changes panel lists the fixture's saved changes |

## Deliberately manual

The remaining P0 cases write to the backend (draw, split, merge, delete, save,
required-field gate, submit) or need a disposable project. Running them here
would corrupt the shared fixture, so they are listed as `skip` entries at the
bottom of the spec with the reason. To automate them, point `E2E_PROJECT` at a
throwaway copy and add a reset step between cases.

## Selector notes (learned the hard way)

- Imported layers render as `<layer> (Imported)`; match with `/^final_trenches\b/`,
  not an exact string.
- Group headings look uppercase but the DOM text is title case
  (`Trenches`); match case-insensitively.
- The Layers legend starts expanded, but `isVisible()` returns false while the
  panel is still animating — wait for the group, don't click blindly.
- The `/map` route has no project id: a reload lands on an empty map, so each
  case goes back through the dashboard.
