// ── Theme Colors, Type & Touch scale ──────────────────────────────────────
//
// The floor this file guarantees, checked with the WCAG relative-luminance
// formula (not by eye) — the ratio in each comment is text-on-surface:
//
//   every `text*` token    ≥ 4.5:1   (normal text)
//   every status `text`    ≥ 4.5:1   on its own badge background
//   every status `dot`     ≥ 3.0:1   on its own badge background (graphic)
//   `surveyLine`           ≥ 3.0:1   on the light basemap (graphic)
//   white on `primary`     ≥ 4.5:1
//   `onSecondary` on `secondary` ≥ 4.5:1
//
// Three rules that came out of that check and must not be re-broken:
//
//   1. `iconMuted` (#9CA3AF, 2.54:1) is NOT a text colour. It is for
//      dividers, disabled icons and decoration only — anything a user must
//      read uses textTertiary (#6B7280, 4.83:1) or darker.
//   2. Never put white text on `secondary` (2.33:1). Orange is the survey
//      identity and stays #FF8C00, but text on it is `onSecondary`.
//   3. `secondary` is for fills and geometry. Text that must read as orange
//      uses `secondaryText` (#C2410C, 5.18:1) and map strokes use
//      `surveyLine` (#EA580C, 3.56:1).

export const Colors = {
  light: {
    primary: '#0D5CFF',        // white on it: 5.26
    onPrimary: '#FFFFFF',
    secondary: '#FF8C00',      // survey identity orange — fills & geometry only
    onSecondary: '#1F2937',    // on secondary: 6.29 (never white)
    secondaryText: '#C2410C',  // orange as text: 5.18
    surveyLine: '#EA580C',     // map strokes on the light basemap: 3.56
    background: '#F7F9FC',
    surface: '#FFFFFF',
    error: '#B91C1C',          // as text 6.47 — as a fill, white on it 6.47
    success: '#047857',        // as text 5.48 — as a fill, white on it 5.48
    warning: '#B45309',        // as text 5.02 — as a fill, white on it 5.02
    textPrimary: '#1F2937',    // 14.68
    textSecondary: '#4B5563',  // 7.56
    textTertiary: '#6B7280',   // 4.83
    iconMuted: '#9CA3AF',      // decoration only, see rule 1 — 2.54
    outline: '#D1D5DB',
    outlineLight: '#E5E7EB',
    overlay: 'rgba(0,0,0,0.5)',
  },
  dark: {
    primary: '#5C9CFF',
    onPrimary: '#001B3D',
    secondary: '#FFB347',
    onSecondary: '#1F2937',    // on secondary: 8.24
    secondaryText: '#FFB347',  // orange as text on dark: 9.36
    surveyLine: '#FFB347',     // on the dark basemap: 10.52
    background: '#121212',
    surface: '#1E1E1E',
    error: '#FF6B6B',
    success: '#4ADE80',
    warning: '#FACC15',
    textPrimary: '#F3F4F6',    // 15.15
    textSecondary: '#C7CCD4',  // 10.33
    textTertiary: '#A8AFBA',   // 7.55
    iconMuted: '#6B7280',      // decoration only
    outline: '#4B5563',
    outlineLight: '#374151',
    overlay: 'rgba(0,0,0,0.7)',
  },
} as const;

export interface ThemeColors {
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  secondaryText: string;
  surveyLine: string;
  background: string;
  surface: string;
  error: string;
  success: string;
  warning: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  iconMuted: string;
  outline: string;
  outlineLight: string;
  overlay: string;
}

// ── Type scale ────────────────────────────────────────────────────────────
//
// The floor is 13px. Nothing readable in this app is smaller — a phone in
// sunlight through a glove is not a place for 10px metadata. `meta` is the
// smallest step and is meant for secondary facts, not for primary content.
//
// `maxScale` is the dynamic-type cap: the OS may grow text, but text sitting
// inside a fixed-height row or a 48px control has to stop at 1.3× or it
// clips. Rows that grow freely should not cap.
export const Type = {
  display: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  maxScale: 1.3,
} as const;

// ── Spacing ───────────────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────
export const Radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// ── Touch Targets (Field-friendly) ────────────────────────────────────────
//
// minTarget is the floor for ANY control (44 is the platform minimum, 48 is
// the field minimum). minHeight is for the primary action on a screen. A
// control whose visual must stay smaller gets hitSlop to reach minTarget.
export const Touch = {
  minHeight: 56,
  minTarget: 48,
  minWidth: 48,
} as const;

// ── Status Colors Map ─────────────────────────────────────────────────────
// Every `text` clears 4.5:1 on its own `bg`; every `dot` clears 3.0:1 on its
// own `bg`. Checked, not chosen by eye.
export const StatusColors = {
  pending: { bg: '#E5E7EB', text: '#4B5563', dot: '#6B7280' },
  draft: { bg: '#E5E7EB', text: '#4B5563', dot: '#6B7280' },
  assigned: { bg: '#DBEAFE', text: '#1D4ED8', dot: '#2563EB' },
  active: { bg: '#D1FAE5', text: '#047857', dot: '#059669' },
  submitted: { bg: '#EDE9FE', text: '#6D28D9', dot: '#7C3AED' },
  under_review: { bg: '#FEF3C7', text: '#B45309', dot: '#B45309' },
  reviewed: { bg: '#CFFAFE', text: '#0E7490', dot: '#0891B2' },
  accepted: { bg: '#D1FAE5', text: '#047857', dot: '#059669' },
  redo: { bg: '#FEE2E2', text: '#B91C1C', dot: '#DC2626' },
  completed: { bg: '#D1FAE5', text: '#047857', dot: '#059669' },
  archived: { bg: '#E5E7EB', text: '#4B5563', dot: '#6B7280' },
  approved: { bg: '#D1FAE5', text: '#047857', dot: '#059669' },
  in_progress: { bg: '#DBEAFE', text: '#1D4ED8', dot: '#2563EB' },
  complete: { bg: '#D1FAE5', text: '#047857', dot: '#059669' },
  flagged: { bg: '#FEF3C7', text: '#B45309', dot: '#B45309' },
  uploaded: { bg: '#D1FAE5', text: '#047857', dot: '#059669' },
  uploading: { bg: '#DBEAFE', text: '#1D4ED8', dot: '#2563EB' },
  failed: { bg: '#FEE2E2', text: '#B91C1C', dot: '#DC2626' },
} as const;

export type StatusKey = keyof typeof StatusColors;
