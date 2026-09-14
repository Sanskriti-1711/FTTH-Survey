/**
 * GPS accuracy validation (Tier-1 A2).
 *
 * Survey coordinates drive LLD routing downstream — a fix worse than the
 * layer's accuracy requirement (default 3 m) creates topology failures.
 * Captures are graded before they are saved:
 *
 *   ok     — within requirement, save silently
 *   warn   — exceeds requirement but ≤ 2× — save allowed, amber badge shown
 *   reject — worse than 2× (or garbage) — save blocked unless the engineer
 *            explicitly overrides (quality flag recorded on the feature)
 */

export type GPSGrade = 'ok' | 'warn' | 'reject';

export interface GPSQuality {
  grade: GPSGrade;
  /** Accuracy in metres (null/undefined/NaN → treated as unknown) */
  accuracyM: number | null;
  /** Requirement the grade was evaluated against */
  requiredM: number;
  /** Short human label for badges: "GPS ±2.1m", "GPS ±8m (poor)" … */
  label: string;
  /** True when the capture should be blocked (engineer can override) */
  blocksSave: boolean;
}

/** Default requirement when a layer schema doesn't specify one. */
export const DEFAULT_GPS_ACCURACY_M = 3;

/**
 * Grade a GPS reading against the layer's accuracy requirement.
 *
 * @param accuracyM   Device-reported horizontal accuracy (metres).
 * @param requiredM   Layer requirement in metres (null → 3 m default; 0 → no requirement).
 */
export function gradeGpsAccuracy(
  accuracyM: number | null | undefined,
  requiredM: number | null | undefined,
): GPSQuality {
  // Requirement: null/undefined → default 3 m; 0/negative → "no requirement".
  const req =
    requiredM == null || !Number.isFinite(requiredM)
      ? DEFAULT_GPS_ACCURACY_M
      : requiredM;
  const noRequirement = req <= 0;

  // Unknown / non-finite accuracy → can't verify; warn but don't block.
  const acc =
    accuracyM == null || !Number.isFinite(accuracyM) || accuracyM < 0
      ? null
      : accuracyM;

  if (noRequirement) {
    return {
      grade: 'ok',
      accuracyM: acc,
      requiredM: req,
      label: acc == null ? 'GPS (no requirement)' : `GPS ±${fmt(acc)}m`,
      blocksSave: false,
    };
  }

  if (acc == null) {
    return {
      grade: 'warn',
      accuracyM: null,
      requiredM: req,
      label: 'GPS accuracy unknown',
      blocksSave: false,
    };
  }

  if (acc <= req) {
    return {
      grade: 'ok',
      accuracyM: acc,
      requiredM: req,
      label: `GPS ±${fmt(acc)}m`,
      blocksSave: false,
    };
  }

  if (acc <= req * 2) {
    return {
      grade: 'warn',
      accuracyM: acc,
      requiredM: req,
      label: `GPS ±${fmt(acc)}m (poor)`,
      blocksSave: false,
    };
  }

  return {
    grade: 'reject',
    accuracyM: acc,
    requiredM: req,
    label: `GPS ±${fmt(acc)}m (unusable)`,
    blocksSave: true,
  };
}

/**
 * Haversine distance in metres between two WGS84 points — used to sanity
 * check jumps between consecutive captures (teleport = stale fix).
 */
export function haversineM(
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Detect an implausible jump: consecutive fixes > jumpM apart within
 * seconds indicate a stale/teleported fix. Used to force a re-fix warning.
 */
export function isTeleportJump(
  prev: { latitude: number; longitude: number; timestamp: number } | null | undefined,
  next: { latitude: number; longitude: number; timestamp: number },
  jumpM = 100,
  windowS = 5,
): boolean {
  if (!prev) return false;
  const dtS = (next.timestamp - prev.timestamp) / 1000;
  if (dtS <= 0 || dtS > windowS) return false;
  return haversineM(prev.latitude, prev.longitude, next.latitude, next.longitude) > jumpM;
}

function fmt(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1);
}
