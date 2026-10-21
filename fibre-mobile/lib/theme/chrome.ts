// ── Field console chrome ─────────────────────────────────────────────────
//
// The map screen is a work surface, not a document. Everything that floats
// over it is chrome: it earns its space or it goes away. These are the
// shared measurements and elevations for that chrome — one header, one
// dock, one rail, one sheet family — so the screen reads as a single
// instrument instead of a pile of panels.

import { Platform, type ViewStyle } from 'react-native';
import type { ThemeColors } from './colors';

/** Fixed heights the map camera has to know about when it frames a region. */
export const Layout = {
  header: 56,
  /** Bottom action dock (Locate / Draw / Add / Undo / Tools). */
  dock: 68,
  dockItem: 54,
  /** Floor for any floating map control. */
  control: 48,
  sheetRadius: 20,
  /** Space the camera must leave for chrome when framing the ROI. */
  cameraPadding: { top: 104, right: 24, bottom: 196, left: 24 },
} as const;

const shadow = (
  offsetY: number,
  opacity: number,
  radius: number,
  elevation: number,
): ViewStyle => ({
  shadowColor: '#0B1220',
  shadowOffset: { width: 0, height: offsetY },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

/**
 * Two elevations only. `float` is for controls that sit on the map, `sheet`
 * for surfaces that own the bottom of the screen. A third level would just
 * be decoration.
 */
export const Elevation = {
  float: shadow(2, 0.14, 8, 4),
  sheet: shadow(-4, 0.16, 20, 12),
} as const;

export interface ChromeColors {
  /** Panel surface — slightly lifted from `colors.surface` on dark. */
  panel: string;
  /** Hairline drawn between chrome and map. */
  hairline: string;
  /** Backdrop behind a sheet. */
  scrim: string;
  /** The grabber on a sheet. */
  handle: string;
  /** Muted fill for icon tiles inside sheets and the dock. */
  tile: string;
  /** Tint used when a control is active but not destructive. */
  activeTile: string;
  /** Disabled glyph / label. */
  muted: string;
}

/**
 * Chrome is derived, not re-picked: it has to move with the theme, and the
 * dark map needs a darker panel than the light map's white one.
 */
export function chromeColors(
  colors: ThemeColors,
  resolved: 'light' | 'dark',
): ChromeColors {
  if (resolved === 'dark') {
    return {
      panel: '#1A1D21',
      hairline: '#2C3138',
      scrim: 'rgba(2, 6, 12, 0.68)',
      handle: '#49505A',
      tile: '#252A30',
      activeTile: colors.primary + '2E',
      muted: colors.iconMuted,
    };
  }
  return {
    panel: '#FFFFFF',
    hairline: '#E3E8EF',
    scrim: 'rgba(11, 18, 32, 0.42)',
    handle: '#CBD5E1',
    tile: '#F1F5F9',
    activeTile: colors.primary + '14',
    muted: colors.iconMuted,
  };
}

/** Platform-safe "no shadow" for controls that sit inside a sheet. */
export const flat: ViewStyle = Platform.OS === 'web' ? { boxShadow: 'none' } : {};
