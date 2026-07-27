// ── Theme Colors ──────────────────────────────────────────────────────────
export const Colors = {
  light: {
    primary: '#0D5CFF',
    onPrimary: '#FFFFFF',
    secondary: '#FF8C00',
    background: '#F7F9FC',
    surface: '#FFFFFF',
    error: '#DC2626',
    success: '#16A34A',
    warning: '#F59E0B',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    outline: '#D1D5DB',
    outlineLight: '#E5E7EB',
    overlay: 'rgba(0,0,0,0.5)',
  },
  dark: {
    primary: '#5C9CFF',
    onPrimary: '#001B3D',
    secondary: '#FFB347',
    background: '#121212',
    surface: '#1E1E1E',
    error: '#FF6B6B',
    success: '#4ADE80',
    warning: '#FACC15',
    textPrimary: '#F3F4F6',
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    outline: '#4B5563',
    outlineLight: '#374151',
    overlay: 'rgba(0,0,0,0.7)',
  },
} as const;

export interface ThemeColors {
  primary: string;
  onPrimary: string;
  secondary: string;
  background: string;
  surface: string;
  error: string;
  success: string;
  warning: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  outline: string;
  outlineLight: string;
  overlay: string;
}

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
export const Touch = {
  minHeight: 56,
  minWidth: 48,
} as const;

// ── Status Colors Map ─────────────────────────────────────────────────────
export const StatusColors = {
  pending: { bg: '#E5E7EB', text: '#6B7280', dot: '#9CA3AF' },
  assigned: { bg: '#DBEAFE', text: '#1D4ED8', dot: '#3B82F6' },
  under_review: { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  approved: { bg: '#D1FAE5', text: '#047857', dot: '#10B981' },
  redo: { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
  in_progress: { bg: '#DBEAFE', text: '#1D4ED8', dot: '#3B82F6' },
  complete: { bg: '#D1FAE5', text: '#047857', dot: '#10B981' },
  flagged: { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  uploaded: { bg: '#D1FAE5', text: '#047857', dot: '#10B981' },
  uploading: { bg: '#DBEAFE', text: '#1D4ED8', dot: '#3B82F6' },
  failed: { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
} as const;

export type StatusKey = keyof typeof StatusColors;
