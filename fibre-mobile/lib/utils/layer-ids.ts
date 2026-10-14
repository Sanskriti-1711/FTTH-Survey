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
