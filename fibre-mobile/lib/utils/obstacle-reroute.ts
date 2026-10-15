// ── Obstacle-aware reroute ─────────────────────────────────────────────────
// Rerouting around roadworks / a closure / any no-dig obstacle is currently a
// manual guess: the engineer drags vertices until the line LOOKS clear, with
// no idea whether it still clips the works, how much longer it got, how many
// extra bends (chambers) it created, or whether it now crosses other trenches.
//
// These helpers make that measurable and repeatable:
//   · does a line cross the obstacle?
//   · replace the part of the line inside the obstacle with an arc that clears
//     it, on a circle of radius + clearance
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

/**
 * Metres from `p` to the nearest part of a polyline. Tapping a works zone that
 * is nowhere near the selected line is a perfectly ordinary mistake, and the
 * engineer should be told the distance rather than "nothing to re-route".
 */
export function distanceToLineM(p: LngLat, coords: LngLat[]): number {
  if (coords.length === 0) return Infinity;
  if (coords.length === 1) return distancePointToSegmentM(p, coords[0], coords[0]);
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    best = Math.min(best, distancePointToSegmentM(p, coords[i], coords[i + 1]));
  }
  return best;
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

type Pt = [number, number];

/** Distance of a frame-local point from the frame origin (the works centre). */
function radiusOf(p: Pt): number {
  return Math.hypot(p[0], p[1]);
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Parameters t ∈ [0, 1] where the segment a→b crosses the circle of `radius`
 * centred on the frame origin, low → high. Empty when the segment never meets
 * the circle — including when BOTH endpoints are already inside it, which the
 * caller has to notice (there is no boundary crossing to cut at).
 */
function circleCrossings(a: Pt, b: Pt, radius: number): number[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const aa = dx * dx + dy * dy;
  if (aa === 0) return [];
  const bb = 2 * (a[0] * dx + a[1] * dy);
  const cc = a[0] * a[0] + a[1] * a[1] - radius * radius;
  const disc = bb * bb - 4 * aa * cc;
  if (disc <= 0) return [];
  const root = Math.sqrt(disc);
  return [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)]
    .filter((t) => t >= 0 && t <= 1)
    .sort((x, y) => x - y);
}

/**
 * Nearest point on the circle of `radius` around the origin, seen from `p`.
 * Used when the line enters the works between two vertices that are both
 * inside: the point is already within the no-go zone, so instead of cutting at
 * a boundary crossing the vertex is pushed out to the boundary. `fallbackDir`
 * only matters when `p` sits exactly on the centre.
 */
function projectOut(p: Pt, radius: number, fallbackDir: Pt): Pt {
  const L = Math.hypot(p[0], p[1]);
  if (L > 1e-9) return [(p[0] / L) * radius, (p[1] / L) * radius];
  const FL = Math.hypot(fallbackDir[0], fallbackDir[1]) || 1;
  return [(fallbackDir[0] / FL) * radius, (fallbackDir[1] / FL) * radius];
}

function normalizeAngle(t: number): number {
  while (t > Math.PI) t -= 2 * Math.PI;
  while (t < -Math.PI) t += 2 * Math.PI;
  return t;
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
 * Every stretch of the line that enters the works is replaced by an arc on a
 * circle of `radiusM + clearanceM` centred on the works, walked between the
 * point where the line enters that circle and the point where it leaves it.
 * The whole arc is outside the works, so the returned line never clips them.
 *
 * The arc — not a pair of tangent points — is what makes this work on real
 * survey trenches: their vertices are a few metres apart, so a works zone
 * tapped on the line can swallow several segments *entirely*. Those segments
 * have no tangent from their endpoints (an endpoint inside the circle has no
 * tangent at all), which is why an endpoint-by-endpoint detour reports
 * "nothing to re-route" on exactly the trench the engineer tapped. Grouping
 * the crossing segments into one run and cutting at the circle boundary
 * removes that failure mode, and drops the surveyed vertices that sit inside
 * the works zone as a bonus.
 *
 * The shorter of the two arcs is taken; when the two are equal (entry and exit
 * opposite each other) the one that does not fold back over the leg the line
 * arrives on wins.
 */
export function routeAroundObstacle(coords: LngLat[], obstacle: Obstacle, clearanceM = 2): DetourResult {
  const n = coords.length;
  if (n < 2) return { coords: coords.map(([lng, lat]) => [lng, lat] as LngLat), insertedVertices: 0, rerouted: false };

  const R = obstacle.radiusM + Math.max(0, clearanceM);
  const frame = frameAt(obstacle.lng, obstacle.lat);
  const centreLL: LngLat = [obstacle.lng, obstacle.lat];
  const m = coords.map(frame.toM);
  const crossesSegment = (k: number) =>
    distancePointToSegmentM(centreLL, coords[k], coords[k + 1]) <= obstacle.radiusM;

  const out: LngLat[] = [];
  let inserted = 0;
  const push = (p: LngLat, isNew = false) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) <= 1e-12) return;
    out.push(p);
    if (isNew) inserted++;
  };

  // The first vertex survives unless it is itself inside the works.
  if (radiusOf(m[0]) > obstacle.radiusM) push(coords[0]);

  let i = 0;
  while (i < n - 1) {
    if (!crossesSegment(i)) {
      push(coords[i + 1]);
      i++;
      continue;
    }

    // One run of segments through the works: vertices i … j, where the first
    // segment after the run (j → j+1) is clear again.
    let j = i;
    while (j < n - 1 && crossesSegment(j)) j++;

    // Entry = where the line first meets the clearance circle walking forward.
    //
    // The run's own first vertex settles it whenever it is already inside (or
    // exactly on) that circle: the boundary there is the vertex pushed out
    // along its own radius, which keeps the joining edge radial — and radial
    // edges cannot cut back across the works. Searching for an intersection
    // instead is not just unnecessary there, it is wrong: a vertex sitting
    // within float noise of the circle loses the t ≈ 0 root, so the search
    // runs on and finds the crossing at the FAR end of the run — collapsing
    // the whole detour into a straight chord through the no-go zone while
    // still reporting success.
    const entryInsideR = radiusOf(m[i]) <= R + 1e-6;
    let entryM: Pt | null = null;
    if (entryInsideR) {
      entryM = projectOut(m[i], R, [m[i + 1][0] - m[i][0], m[i + 1][1] - m[i][1]]);
    } else {
      for (let k = i; k < j && !entryM; k++) {
        const ts = circleCrossings(m[k], m[k + 1], R);
        if (ts.length > 0) entryM = lerp(m[k], m[k + 1], ts[0]);
      }
      if (!entryM) entryM = projectOut(m[i], R, [m[i + 1][0] - m[i][0], m[i + 1][1] - m[i][1]]);
    }

    // Exit = where the line last meets the clearance circle (same reasoning).
    let exitM: Pt | null = null;
    if (radiusOf(m[j]) <= R + 1e-6) {
      exitM = projectOut(m[j], R, [m[j][0] - m[j - 1][0], m[j][1] - m[j - 1][1]]);
    } else {
      for (let k = j - 1; k >= i && !exitM; k--) {
        const ts = circleCrossings(m[k], m[k + 1], R);
        if (ts.length > 0) exitM = lerp(m[k], m[k + 1], ts[ts.length - 1]);
      }
      if (!exitM) exitM = projectOut(m[j], R, [m[j][0] - m[j - 1][0], m[j][1] - m[j - 1][1]]);
    }

    const thetaStart = Math.atan2(entryM[1], entryM[0]);
    const thetaEnd = Math.atan2(exitM[1], exitM[0]);
    const d1 = normalizeAngle(thetaEnd - thetaStart);
    const d2 = d1 > 0 ? d1 - 2 * Math.PI : d1 + 2 * Math.PI;
    let delta: number;
    if (Math.abs(Math.abs(d1) - Math.abs(d2)) < 1e-9) {
      // Diametrically opposed: prefer the side that keeps clear of the leg the
      // line arrives on (its midpoint is the farther from the previous vertex).
      const prevM: Pt | null = i > 0 ? m[i - 1] : null;
      if (prevM) {
        const mid = (dl: number): Pt => {
          const th = thetaStart + dl / 2;
          return [R * Math.cos(th), R * Math.sin(th)];
        };
        const a = mid(d1);
        const b = mid(d2);
        delta =
          Math.hypot(a[0] - prevM[0], a[1] - prevM[1]) >= Math.hypot(b[0] - prevM[0], b[1] - prevM[1]) ? d1 : d2;
      } else {
        delta = d1;
      }
    } else {
      delta = Math.abs(d1) <= Math.abs(d2) ? d1 : d2;
    }

    // ≤20° steps: cos 10° ≈ 0.985 keeps every chord clear of the works radius.
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 9)));
    push(frame.toLngLat(entryM[0], entryM[1]), true);
    for (let s = 1; s <= steps; s++) {
      const th = thetaStart + (delta * s) / steps;
      push(frame.toLngLat(R * Math.cos(th), R * Math.sin(th)), true);
    }

    // Continue on the original path from the first vertex outside the works.
    // Vertices inside the works are dropped: they are surveyed geometry inside
    // a no-go zone, and they are what the arc replaces.
    if (radiusOf(m[j]) > obstacle.radiusM) push(coords[j]);
    i = j;
  }

  const rerouted = out.length !== n || out.some((p, k) => Math.abs(p[0] - coords[k][0]) > 1e-12 || Math.abs(p[1] - coords[k][1]) > 1e-12);
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

export interface DetourPlan {
  /** The no-go zone the tap produced */
  obstacle: Obstacle;
  /** The re-routed coordinates (equal to the baseline when nothing crosses) */
  coords: LngLat[];
  impact: DetourImpact;
  /** Ready-to-show summary, including the "tap is X m away" hint */
  label: string;
  /** Metres from the tap to the nearest part of the baseline */
  tapDistanceM: number;
}

/**
 * Everything the Route-around tool does with one tap, in one pure call: turn
 * the tap into a works zone, re-route the baseline clear of it, and say what
 * it cost. The map screen only has to hold the result.
 *
 * Keeping this here (instead of inline in the screen) means the whole
 * tap → baseline decision is testable: the live failure mode — a tap landing
 * on a densely-vertexed trench reporting "nothing to re-route" — is a unit
 * test, not a manual click-through.
 */
export function planObstacleDetour(
  tap: LngLat,
  radiusM: number,
  baseline: LngLat[],
  otherLines: LngLat[][] = [],
  clearanceM = 2,
): DetourPlan {
  const obstacle: Obstacle = { lng: tap[0], lat: tap[1], radiusM };
  const result = routeAroundObstacle(baseline, obstacle, clearanceM);
  const impact = detourImpact(baseline, result.coords, obstacle, otherLines, result);
  const tapDistanceM = distanceToLineM(tap, baseline);
  return {
    obstacle,
    coords: result.coords,
    impact,
    label: formatDetourImpact(impact, { tapDistanceM, radiusM }),
    tapDistanceM,
  };
}

/** True when two polyline coordinate lists differ. */
function coordsDiffer(a: LngLat[], b: LngLat[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((p, i) => Math.abs(p[0] - b[i][0]) > 1e-12 || Math.abs(p[1] - b[i][1]) > 1e-12);
}

/**
 * What the detour costs, computed BEFORE Save so the ripple is visible:
 * metres added, bends (= chambers), and how many other lines hit the same
 * works (those are the ones that will need their own closure/reroute).
 *
 * Pass the `DetourResult` when you have it: its own `rerouted` flag and added
 * vertex count are authoritative, because a detour can drop more vertices than
 * it adds when the works zone swallows surveyed vertices.
 */
export function detourImpact(
  before: LngLat[],
  after: LngLat[],
  obstacle: Obstacle,
  otherLines: LngLat[][],
  detour?: DetourResult,
): DetourImpact {
  const lengthBeforeM = lineLengthM(before);
  const lengthAfterM = lineLengthM(after);
  const rerouted = detour ? detour.rerouted : coordsDiffer(before, after);
  const insertedVertices = detour ? detour.insertedVertices : Math.max(0, after.length - before.length);
  return {
    lengthBeforeM,
    lengthAfterM,
    lengthDeltaM: lengthAfterM - lengthBeforeM,
    insertedVertices,
    extraChambers: rerouted ? 2 : 0,
    otherLinesCrossing: otherLines.filter((l) => lineCrossesObstacle(l, obstacle)).length,
    rerouted,
  };
}

/**
 * Human summary of the impact, for the toolbar row.
 *
 * `context` carries the tap that produced the zone: a tap that is nowhere near
 * the selected line cannot re-route it, and saying how far away it was is more
 * useful than "nothing to re-route".
 */
export function formatDetourImpact(
  impact: DetourImpact,
  context?: { tapDistanceM: number; radiusM: number },
): string {
  if (!impact.rerouted) {
    if (context && context.tapDistanceM > context.radiusM) {
      return `Works zone is ${Math.round(context.tapDistanceM)} m from this line (radius ${context.radiusM} m) — tap on the line or widen the radius`;
    }
    return 'Line does not cross these works — nothing to re-route';
  }
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
