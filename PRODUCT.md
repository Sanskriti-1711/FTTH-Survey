# Fiber360 — survey app (product context)

## What this is

The field half of the Fibre-FTTH stack. A survey engineer opens a project that
planner software has already designed (HLD: trenches, ducts, cables, PDPs,
premises), walks the route, and records what the design got wrong or missed —
rerouting a trench around roadworks, splitting a span, extending a line,
adding a chamber, correcting attributes, photographing the evidence — then
submits the survey for review.

- **Who uses it:** field survey engineers, outdoors, on Android phones, often
  in gloves, frequently with poor or no connectivity.
- **What success looks like:** every change recorded on site reaches the
  planner, with enough context (geometry, attributes, photos, position) to
  review it without re-visiting the site.
- **What must never happen:** a save that silently fails, a change that
  overwrites the designed HLD geometry, or a survey that cannot be seen
  because the map is covered in chrome.

## The two truths on the map

| | Meaning | Colour |
|---|---|---|
| HLD | the planner's design — read-only | blue `#0D5CFF` |
| Survey | the engineer's edits — the work in progress | orange `#FF8C00` |

Edits are stored as SurveyFeatures against a frozen copy of the HLD feature.
The HLD is never modified on device; Overlay view shows both at once.

## Platforms

Expo / React Native (Router) with `@maplibre/maplibre-react-native` on device
and `maplibre-gl` served locally on web. The web build is the verification and
demo surface; the APK (EAS) is the field surface. Backend: Django + PostGIS
(`fiber-backend`), HLD engine: FastAPI + QGIS (`HLD_Planning_01`).

## Non-negotiables

- Offline work is the normal case, not an error case: saves go to the device
  and sync when connectivity returns. The UI must say which state it is in.
- One commit path. `CommitBar` is the only Submit, on every screen that can
  finish survey work.
- Every mutation is undoable, and undo is always reachable on the map.
- The map screen is the product. Chrome serves it; it never competes with it.

## Design

See `DESIGN.md` for the field-console system (layout, tokens, auto-zoom
rules, motion).
