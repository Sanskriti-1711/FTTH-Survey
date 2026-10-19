// ── Layer id normalisation ────────────────────────────────────────────────
//
// The three places a layer id is written do not agree on how to spell it:
//
//   * the HLD package publishes Title_Case names — `Distribution_Trench`,
//     `Garden_Trench`, `Feeder_Trench`, `Served_Premises`, `Pseudo_HH`,
//     `Tangent_Crossings`
//   * the platform's import keeps whatever it is handed, so one survey copy
//     holds `final_trenches` and `Distribution_Trench` side by side
//   * the lookup tables in this app were written in one spelling only
//     (`distribution_trench`)
//
// An exact, case-sensitive lookup against those tables therefore misses
// silently, and it missed in two visible ways on project `24cd3573…`
// (measured 2026-10-14: 23 layers, 3,578 features):
//
//   * `IMPORT_COLORS` matched 8 of the 23 ids, so **15 layers were painted the
//     identical fallback colour `#FF6B6B`** — including all three real trench
//     layers, which is why the map read as one red mass
//   * `DEFAULT_LAYER_GROUPS` matched 8, so `Distribution_Trench` (265),
//     `Garden_Trench` (224) and `Feeder_Trench` (58) — **547 of the 934 trench
//     features** — were listed under "Other" while the "Trenches" group showed
//     only `final_trenches` (387)
//
// Normalising both the id and the table key is the fix, and it has to be one
// function shared by every table: two implementations are how the spellings
// drifted apart in the first place.
//
// Kept deliberately lossy only in ways that cannot merge two real layers —
// case, separators and the store/map prefixes. `final_trenches` and
// `Final_Trenches` are the same layer; `trench_nodes` and `trench_sections`
// are not.

/** Store/map prefixes that decorate an id without identifying a layer. */
const PREFIX_CHAIN = /^(?:(?:imp|survey|temp-preview|ml|src|lyr|out|drag)-)+/i;

export function normalizeLayerId(layerId: string): string {
  return String(layerId ?? '')
    .trim()
    .replace(PREFIX_CHAIN, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // DistributionTrench -> Distribution_Trench
    .replace(/[\s./\\-]+/g, '_')            // spaces, dots, dashes, path separators
    .toLowerCase()
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Layers the field survey does not serve ────────────────────────────────
//
// The app answers questions about the TRENCH being surveyed and the PREMISES
// on it, and the layers that carry them are `final_trenches` and `objects`.
// Everything the designer writes beside those is a cabling input:
//
//   * `pseudo_hh` — the footway end of a garden leg, a point the trench
//     designer derives so the duct graph has something to attach to. It has no
//     address, no household and nothing a surveyor can record against it.
//   * `feeder_trench` / `distribution_trench` / `garden_trench` — the
//     designer's per-tier MIRRORS of the same trench geometry. `Final_Trenches`
//     is the published design layer (ducts and cables are planned on it); the
//     tiers repeat its paths in segments, so a copy shows the same trenches
//     two, three and four times and a surveyor cannot tell which one to open.
//     Measured on project `24cd3573…`: final_trenches 387, Distribution_Trench
//     265, Garden_Trench 224, Feeder_Trench 58 — 547 of its 934 trench features
//     were duplicate design copies of the other 387.
//
// A Survey copy built before this rule carries them — project `24cd3573…`
// holds 23 layers including `Pseudo_HH` (224) beside `objects` (285) — and its
// stored rows are re-served on every fetch. The rule lives in the app because
// the app is what decides what a copy's layer list means; the backend applies
// the same rule when it serves a layer list, builds a package and imports one
// into a copy — `FIELD_SURVEY_EXCLUDED_LAYERS` in
// `fiber-backend/projects/layer_rules.py`, kept in step with the list below.
//
// `trench_nodes` is a trench JOINT layer, not a trench: every node is
// realised by a chamber, which is the published layer the crew records
// against, and the engine's package never carries it. It is hidden here for
// the same reason as the design artefacts.
//
// `final_trenches` (the single published trench layer) stays, and
// `served_premises` / `tangent_crossings` are untouched: they are absent from a
// current package, but hiding them is a different rule, and a layer the field
// side DOES use must never be listed here by accident.
export const FIELD_SURVEY_HIDDEN_LAYERS = [
  'pseudo_hh',
  'feeder_trench',
  'distribution_trench',
  'garden_trench',
  'trench_nodes',
];

/**
 * Does the field-survey app serve this layer?
 *
 * Compared through `normalizeLayerId`, so the package's `Pseudo_HH`, a store
 * prefix (`imp-pseudo_hh`) and a bare `pseudo_hh` are one answer.
 */
export function isFieldSurveyLayer(layerId: string): boolean {
  return !FIELD_SURVEY_HIDDEN_LAYERS.includes(normalizeLayerId(layerId));
}
