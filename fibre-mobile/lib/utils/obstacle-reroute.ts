// ── Obstacle-aware reroute ─────────────────────────────────────────────────
// Rerouting around roadworks / a closure / any no-dig obstacle is currently a
// manual guess: the engineer drags vertices until the line LOOKS clear, with
// no idea whether it still clips the works, how much longer it got, how many
// extra bends (chambers) it created, or whether it now crosses other trenches.
//
// These helpers make that measurable and repeatable:
//   · does a line cross the obstacle?
//   · insert the two vertices that take the line around it, with clearance
//   · report the delta (length, bends, chambers, crossings of other lines)
//
// All pure functions on [lng, lat] coordinate arrays, so they can be reasoned
// about (and tested) without a map instance.

export type LngLat = [number, number];

/** A circular no-go area (roadworks, closure, permit stop-work zone). */
export interface Obstacle {
  lng: number;
  lat: number;
  radiusM: number;
}

const M_PER_DEG_LAT = 111000;

/** Metres per degree of longitude at a given latitude. */
export function metersPerDegLng(lat: number): number {
  return Math.max(1, M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
}

/** Distance in metres from a point to a segment (equirectangular, small areas). */
export function distancePointToSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const mLng = metersPerDegLng((a[1] + b[1]) / 2);
  const px = (p[0] - a[0]) * mLng;
  const py = (p[1] - a[1]) * M_PER_DEG_LAT;
  const bx = (b[0] - a[0]) * mLng;
  const by = (b[1] - a[1]) * M_PER_DEG_LAT;
  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Total polyline length in metres. */
export function lineLengthM(coords: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    m += Math.hypot((b[0] - a[0]) * metersPerDegLng((a[1] + b[1]) / 2), (b[1] - a[1]) * M_PER_DEG_LAT);
  }
  return m;
}

/** Indices of the segments that pass through the obstacle (within its radius). */
export function crossingSegmentIndices(coords: LngLat[], obstacle: Obstacle): number[] {
  const centre: LngLat = [obstacle.lng, obstacle.lat];
  const out: number[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    if (distancePointToSegmentM(centre, coords[i], coords[i + 1]) <= obstacle.radiusM) out.push(i);
  }
  return out;
}

/** True when the polyline passes through the obstacle. */
export function lineCrossesObstacle(coords: LngLat[], obstacle: Obstacle): boolean {
  return crossingSegmentIndices(coords, obstacle).length > 0;
}

// ── Local planar frame ────────────────────────────────────────────────────
// The circle maths is done in metres relative to a reference latitude, which
// keeps it exact enough at street scale and readable.
interface Frame {
  refLng: number;
  refLat: number;
  mLng: number;
  toM(p: LngLat): [number, number];
  toLngLat(x: number, y: number): LngLat;
}

function frameAt(refLng: number, refLat: number): Frame {
  const mLng = metersPerDegLng(refLat);
  return {
    refLng,
    refLat,
    mLng,
    toM: (p) => [(p[0] - refLng) * mLng, (p[1] - refLat) * M_PER_DEG_LAT],
    toLngLat: (x, y) => [refLng + x / mLng, refLat + y / M_PER_DEG_LAT],
  };
}

/**
 * Point on the circle of `radius` around the centre that a tangent from `from`
 * touches, on the requested side of the from→centre direction (−1/+1).
 * Returns null when the point is inside the circle (no tangent exists).
 */
function tangentPoint(
  from: [number, number],
  centre: [number, number],
  radius: number,
  side: 1 | -1,
): [number, number] | null {
  const vx = from[0] - centre[0];
  const vy = from[1] - centre[1];
  const L = Math.hypot(vx, vy);
  if (L <= radius + 1e-6) return null;
  const base = Math.atan2(vy, vx);
  const alpha = Math.acos(radius / L);
  const theta = base + side * alpha;
  return [centre[0] + radius * Math.cos(theta), centre[1] + radius * Math.sin(theta)];
}

/** Point where the ray from→to crosses the circle of `radius` (forward exit). */
function rayCircleExit(
  from: [number, number],
  to: [number, number],
  centre: [number, number],
  radius: number,
): [number, number] | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return null;
  const cx = centre[0] - from[0];
  const cy = centre[1] - from[1];
  const cDotD = cx * dx + cy * dy;
  const disc = cDotD * cDotD - lenSq * (cx * cx + cy * cy - radius * radius);
  if (disc <= 0) return null;
  const root = Math.sqrt(disc);
  const t = (cDotD + root) / lenSq; // forward hit
  if (t < 0 || t > 1) return null;
  return [from[0] + t * dx, from[1] + t * dy];
}

export interface DetourResult {
  /** Coordinates with the detour inserted */
  coords: LngLat[];
  /** How many vertices were added */
  insertedVertices: number;
  /** True when the line actually crossed the obstacle and was re-routed */
  rerouted: boolean;
}

/**
 * Route a polyline around a circular obstacle.
 *
 * The detour is built from the TANGENT points of each crossing segment (with
 * the radius inflated by `clearanceM`) plus an arc of intermediate vertices,
 * so every part of the returned line stays outside the works. Inserting only
 * the circle intersection points would not: the chord between them still runs
 * through the middle of the obstacle.
 */
export function routeAroundObstacle(coords: LngLat[], obstacle: Obstacle, clearanceM = 2): DetourResult {
  if (coords.length < 2) return { coords: [...coords], insertedVertices: 0, rerouted: false };
  const R = obstacle.radiusM + Math.max(0, clearanceM);
  const frame = frameAt(obstacle.lng, obstacle.lat);
  const centre: [number, number] = [0, 0]; // the frame IS centred on the obstacle
  const out: LngLat[] = [coords[0]];
  let inserted = 0;
  let rerouted = false;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const aM = frame.toM(a);
    const bM = frame.toM(b);
    const crosses = distancePointToSegmentM([obstacle.lng, obstacle.lat], a, b) <= obstacle.radiusM;
    if (!crosses) {
      out.push(b);
      continue;
    }

    // Route around on the side the line is already leaning towards: the side
    // opposite the previous vertex, so the detour does not cut back across the
    // line. Falls back to the left of travel.
    const prev = i > 0 ? frame.toM(coords[i - 1]) : aM;
    const cross = (bM[0] - aM[0]) * (prev[1] - aM[1]) - (bM[1] - aM[1]) * (prev[0] - aM[0]);
    const side: 1 | -1 = cross >= 0 ? 1 : -1;

    const startM = tangentPoint(aM, centre, R, side) ?? rayCircleExit(aM, bM, centre, R);
    const endM = tangentPoint(bM, centre, R, side);
    if (!startM || !endM) {
      out.push(b);
      continue;
    }

    // Walk the arc between the two tangent points on that side, in ~20° steps
    // (cos 10° ≈ 0.985 keeps every chord outside the un-inflated radius).
    const thetaStart = Math.atan2(startM[1], startM[0]);
    const thetaEnd = Math.atan2(endM[1], endM[0]);
    const norm = (t: number) => {
      while (t > Math.PI) t -= 2 * Math.PI;
      while (t < -Math.PI) t += 2 * Math.PI;
      return t;
    };
    let delta = norm(thetaEnd - thetaStart);
    // Same side of the chord ⇒ the clockwise/counter-clockwise sense is fixed
    // by the chosen side; a >180° sweep means we picked the wrong sense.
    if (Math.abs(delta) > Math.PI) delta = delta > 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI;

    const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 9))); // ≤20°
    for (let s = 0; s <= steps; s++) {
      const theta = thetaStart + (delta * s) / steps;
      const pt = frame.toLngLat(R * Math.cos(theta), R * Math.sin(theta));
      out.push(pt);
      inserted++;
    }
    rerouted = true;
    out.push(b);
  }

  return { coords: out, insertedVertices: inserted, rerouted };
}

export interface DetourImpact {
  lengthBeforeM: number;
  lengthAfterM: number;
  lengthDeltaM: number;
  insertedVertices: number;
  /**
   * Chambers (joints) the detour needs: a diversion has two transition points
   * where the new alignment leaves and rejoins the designed route. The arc
   * vertices in between are geometry, not chambers.
   */
  extraChambers: number;
  /** Other lines (trenches/ducts) that pass through the same obstacle */
  otherLinesCrossing: number;
  rerouted: boolean;
}

/**
 * What the detour costs, computed BEFORE Save so the ripple is visible:
 * metres added, bends (= chambers), and how many other lines hit the same
 * works (those are the ones that will need their own closure/reroute).
 */
export function detourImpact(
  before: LngLat[],
  after: LngLat[],
  obstacle: Obstacle,
  otherLines: LngLat[][],
): DetourImpact {
  const lengthBeforeM = lineLengthM(before);
  const lengthAfterM = lineLengthM(after);
  const insertedVertices = Math.max(0, after.length - before.length);
  return {
    lengthBeforeM,
    lengthAfterM,
    lengthDeltaM: lengthAfterM - lengthBeforeM,
    insertedVertices,
    extraChambers: insertedVertices > 0 ? 2 : 0,
    otherLinesCrossing: otherLines.filter((l) => lineCrossesObstacle(l, obstacle)).length,
    rerouted: insertedVertices > 0,
  };
}

/** Human summary of the impact, for the toolbar row. */
export function formatDetourImpact(impact: DetourImpact): string {
  if (!impact.rerouted) return 'Line does not cross these works — nothing to re-route';
  const d = impact.lengthDeltaM;
  const sign = d >= 0 ? '+' : '−';
  const parts = [
    `${sign}${Math.abs(d) < 1000 ? `${Math.abs(d).toFixed(1)} m` : `${(Math.abs(d) / 1000).toFixed(3)} km`}`,
    `${impact.extraChambers} chamber${impact.extraChambers === 1 ? '' : 's'}`,
    `${impact.insertedVertices} vertex${impact.insertedVertices === 1 ? '' : 'es'}`,
  ];
  if (impact.otherLinesCrossing > 0) {
    parts.push(`${impact.otherLinesCrossing} other line${impact.otherLinesCrossing === 1 ? '' : 's'} in the works`);
  }
  return parts.join(' · ');
}
