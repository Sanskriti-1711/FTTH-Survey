// ── Region-of-interest auto-zoom ─────────────────────────────────────────
//
// A field engineer opens a project and should see the work area, not a
// postcode. Every camera decision on the map screen routes through these
// pure helpers so the behaviour is testable without a GL context:
//
//   • boundsOfFeatures — the ROI of whatever the map is actually drawing
//     (visible layers only, so hiding a layer re-frames to what is left).
//   • expandBounds    — a single point (or a 2 m stub) is not a region;
//     give it a floor so a tap frames a usable patch of street.
//   • needsReframe    — leave the camera alone when the target is already
//     comfortably on screen. A tap inside the current view must never
//     yank the map. This is the difference between auto-zoom and a
//     camera that fights the user.

export type Bounds = [west: number, south: number, east: number, north: number];

export interface LngLat {
  lng: number;
  lat: number;
}

export interface CameraView {
  zoom: number;
  center: LngLat;
  viewportWidth: number;
  viewportHeight: number;
}

interface MaybeGeometry {
  type?: string;
  coordinates?: unknown;
}

/** Metres per degree of latitude. Good to ~0.5% — plenty for a camera. */
const M_PER_DEG_LAT = 111_320;
const EARTH_CIRCUMFERENCE_M = 40_075_017;

export function metresPerPixel(lat: number, zoom: number): number {
  return (
    (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) /
    (256 * Math.pow(2, zoom))
  );
}

function pointBounds(lng: number, lat: number): Bounds {
  return [lng, lat, lng, lat];
}

function extend(b: Bounds, lng: number, lat: number): Bounds {
  return [
    Math.min(b[0], lng),
    Math.min(b[1], lat),
    Math.max(b[2], lng),
    Math.max(b[3], lat),
  ];
}

function collect(coords: unknown, b: Bounds): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const span = extend(b, coords[0] as number, coords[1] as number);
    b[0] = span[0];
    b[1] = span[1];
    b[2] = span[2];
    b[3] = span[3];
    return;
  }
  for (const child of coords) collect(child, b);
}

/** Bounds of any GeoJSON geometry, or null when it carries no coordinates. */
export function geometryBounds(geometry: MaybeGeometry | null | undefined): Bounds | null {
  if (!geometry || !geometry.type || geometry.coordinates == null) return null;
  if (geometry.type === 'GeometryCollection') {
    const geoms = (geometry as unknown as { geometries?: MaybeGeometry[] }).geometries ?? [];
    let out: Bounds | null = null;
    for (const g of geoms) {
      const gb = geometryBounds(g);
      if (gb) out = out ? mergeBounds(out, gb) : gb;
    }
    return out;
  }
  const seed: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  collect(geometry.coordinates, seed);
  return isFinite(seed[0]) ? seed : null;
}

export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

/** Union of every feature that passes `include` (default: all). */
export function boundsOfFeatures(
  features: ReadonlyArray<{ geometry?: MaybeGeometry | null }>,
  include?: (feature: { geometry?: MaybeGeometry | null }) => boolean,
): Bounds | null {
  let out: Bounds | null = null;
  for (const feature of features) {
    if (include && !include(feature)) continue;
    const b = geometryBounds(feature.geometry);
    if (!b) continue;
    out = out ? mergeBounds(out, b) : b;
  }
  return out;
}

/** Grow a bounds by at least `minSpanM` metres on each axis, about its centre. */
export function expandBounds(b: Bounds, minSpanM: number): Bounds {
  const lat = (b[1] + b[3]) / 2;
  const lngSpanM = Math.max(Math.abs(b[2] - b[0]) * M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180), 0);
  const latSpanM = Math.max(Math.abs(b[3] - b[1]) * M_PER_DEG_LAT, 0);
  const padLat = Math.max(0, minSpanM - latSpanM) / 2 / M_PER_DEG_LAT;
  const lngScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const padLng = Math.max(0, minSpanM - lngSpanM) / 2 / (M_PER_DEG_LAT * lngScale);
  return [b[0] - padLng, b[1] - padLat, b[2] + padLng, b[3] + padLat];
}

export function boundsCenter(b: Bounds): LngLat {
  return { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
}

export function boundsSpanM(b: Bounds): { width: number; height: number } {
  const lat = (b[1] + b[3]) / 2;
  return {
    width: Math.abs(b[2] - b[0]) * M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180),
    height: Math.abs(b[3] - b[1]) * M_PER_DEG_LAT,
  };
}

/**
 * True when `center` lies inside `b`, grown by `slack` (1 = no slack,
 * 1.25 = the point may sit a quarter-view outside).
 */
export function boundsContain(b: Bounds, point: LngLat, slack = 1): boolean {
  const dLng = (b[2] - b[0]) * (slack - 1) / 2;
  const dLat = (b[3] - b[1]) * (slack - 1) / 2;
  return (
    point.lng >= b[0] - dLng &&
    point.lng <= b[2] + dLng &&
    point.lat >= b[1] - dLat &&
    point.lat <= b[3] + dLat
  );
}

/**
 * Decide whether to move the camera for `target`.
 *
 * Returns true when:
 *   • there is no camera yet (first frame), or
 *   • the target's centre is off screen (even with 25% slack), or
 *   • the target occupies less than a third of the shorter viewport edge,
 *     i.e. the engineer is zoomed so far out that the selection is a speck.
 *
 * A feature that already fills a third of the screen is left where it is —
 * tapping a neighbour at working zoom must not re-centre the map.
 */
export function needsReframe(
  target: Bounds,
  view: CameraView | null,
  minFill = 1 / 3,
): boolean {
  if (!view) return true;
  if (!Number.isFinite(view.zoom) || view.viewportWidth <= 0) return true;

  const centre = boundsCenter(target);
  const span = boundsSpanM(target);
  const mpp = metresPerPixel(centre.lat, view.zoom);
  const viewWidthM = view.viewportWidth * mpp;
  const viewHeightM = view.viewportHeight * mpp;

  const viewBounds: Bounds = [
    view.center.lng - viewWidthM / 2 / (M_PER_DEG_LAT * Math.max(0.2, Math.cos((view.center.lat * Math.PI) / 180))),
    view.center.lat - viewHeightM / 2 / M_PER_DEG_LAT,
    view.center.lng + viewWidthM / 2 / (M_PER_DEG_LAT * Math.max(0.2, Math.cos((view.center.lat * Math.PI) / 180))),
    view.center.lat + viewHeightM / 2 / M_PER_DEG_LAT,
  ];

  if (!boundsContain(viewBounds, centre, 1.5)) return true;

  const fill = Math.max(span.width / Math.max(viewWidthM, 1), span.height / Math.max(viewHeightM, 1));
  return fill < minFill;
}

/**
 * Chrome-aware padding for a fit, in device pixels. `right` clears the map
 * rail, `bottom` clears the action dock and the commit bar.
 */
export const FRAME_PADDING = { top: 104, right: 72, bottom: 196, left: 24 } as const;

/**
 * A selected feature also opens the feature card (~380 px) at the bottom, so
 * it is framed into the strip above the card rather than behind it.
 */
export const SELECTION_PADDING = { top: 104, right: 72, bottom: 400, left: 24 } as const;

/** A point or a stub is expanded to this span before framing. */
export const MIN_REGION_SPAN_M = 60;
