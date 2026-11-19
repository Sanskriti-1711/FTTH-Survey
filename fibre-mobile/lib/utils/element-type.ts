// ── Element type from the span's layer name ────────────────────────────────
//
// The estimate belongs to a span, and the span's layer names what it is: the
// published `final_trenches` (and the designers' tier mirrors of it) hold
// trenches, `drop_ducts` ducts, `chambers` chambers. Reading the name here
// removes the five chips from the camera screen for every layer that says
// something; the chips survive only for a layer that says nothing.
//
// Kept free of API and React Native imports so it can run under plain node
// (tests/ai-measure.test.mts) and be reused outside the estimate flow.

export type AiElementType = 'trench' | 'duct' | 'cable' | 'chamber' | 'pole';

export const AI_ELEMENT_TYPES: { id: AiElementType; label: string }[] = [
  { id: 'trench', label: 'Trench' },
  { id: 'duct', label: 'Duct' },
  { id: 'cable', label: 'Cable' },
  { id: 'chamber', label: 'Chamber' },
  { id: 'pole', label: 'Pole' },
];

// Order matters, and it is not alphabetical: `drop_ducts` contains the cable
// word `drop`, so duct has to be read first. A layer that is genuinely both
// (`cable_trench`) is a cable layer.
const ELEMENT_KEYWORDS: { id: AiElementType; words: string[] }[] = [
  { id: 'chamber', words: ['chamber', 'manhole', 'vault'] },
  { id: 'duct', words: ['duct', 'conduit'] },
  { id: 'cable', words: ['cable', 'fibre', 'fiber', 'drop'] },
  { id: 'pole', words: ['pole', 'mast', 'tower'] },
  { id: 'trench', words: ['trench', 'excavat', 'open cut'] },
];

/** The element a span's layer name implies, or null when it names neither. */
export function elementTypeFromName(name: string): AiElementType | null {
  const normalised = String(name ?? '').toLowerCase();
  if (!normalised.trim()) return null;
  for (const { id, words } of ELEMENT_KEYWORDS) {
    if (words.some((word) => normalised.includes(word))) return id;
  }
  return null;
}

/** The label the screens print for an element type. */
export function elementLabel(type: AiElementType): string {
  return AI_ELEMENT_TYPES.find((candidate) => candidate.id === type)?.label ?? type;
}
