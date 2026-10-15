// ── Obstacle reroute tests ─────────────────────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// The load-bearing regression here is the DENSE TRENCH case: real survey
// trenches are digitised with vertices a few metres apart, so a works zone
// tapped on the line swallows whole segments — both endpoints inside the
// radius. The first implementation routed segment-by-segment with tangents
// from each endpoint, which is undefined for an endpoint inside the circle,
// so it silently reported "Line does not cross these works" on the very
// trench the engineer had tapped. These tests pin the run-based behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  routeAroundObstacle,
  detourImpact,
  formatDetourImpact,
  distancePointToSegmentM,
  distanceToLineM,
  lineCrossesObstacle,
  lineLengthM,
  planObstacleDetour,
  type LngLat,
  type Obstacle,
} from '../lib/utils/obstacle-reroute.ts';

const M_PER_DEG_LAT = 111000;
const LAT0 = 51.5074;
const LNG0 = -0.1278;
const MLNG = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** Local metres (x east, y north) → [lng, lat] around a fixed origin. */
function at(xM: number, yM: number): LngLat {
  return [LNG0 + xM / MLNG, LAT0 + yM / M_PER_DEG_LAT];
}

/** A straight trench along +x, sampled every `stepM` from 0 to `lengthM`. */
function denseTrench(lengthM: number, stepM: number): LngLat[] {
  const out: LngLat[] = [];
  for (let x = 0; x <= lengthM + 1e-9; x += stepM) out.push(at(x, 0));
  if (Math.abs(out[out.length - 1][0] - at(lengthM, 0)[0]) > 0) out.push(at(lengthM, 0));
  return out;
}

const obstacleAt = (xM: number, yM: number, radiusM: number): Obstacle => {
  const [lng, lat] = at(xM, yM);
  return { lng, lat, radiusM };
};

/** Shortest distance in metres from the obstacle centre to the polyline. */
function clearanceM(coords: LngLat[], obstacle: Obstacle): number {
  return distanceToLineM([obstacle.lng, obstacle.lat], coords);
}

const MIDPOINT = (c: LngLat[]): LngLat => {
  const i = Math.floor((c.length - 1) / 2);
  const a = c[i];
  const b = c[i + 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
};

// ── The reported bug ───────────────────────────────────────────────────────

test('dense trench: a works zone tapped on the line re-routes (radius 10 m)', () => {
  const trench = denseTrench(200, 6); // vertices every 6 m — both endpoints of
  const tap = MIDPOINT(trench);       // the tapped segment sit inside radius+2
  const obstacle = { lng: tap[0], lat: tap[1], radiusM: 10 };

  const res = routeAroundObstacle(trench, obstacle, 2);

  assert.equal(res.rerouted, true, 'trench tapped on the line must re-route');
  assert.ok(res.insertedVertices > 0, 'a detour must add vertices');
  assert.equal(lineCrossesObstacle(res.coords, obstacle), false, 'detour must clear the works');
  assert.ok(clearanceM(res.coords, obstacle) > obstacle.radiusM, 'detour must keep off the works');
});

test('dense trench: re-routes at radius 30 m too', () => {
  const trench = denseTrench(200, 6);
  const tap = MIDPOINT(trench);
  const obstacle = { lng: tap[0], lat: tap[1], radiusM: 30 };

  const res = routeAroundObstacle(trench, obstacle, 2);

  assert.equal(res.rerouted, true);
  assert.equal(lineCrossesObstacle(res.coords, obstacle), false);
  assert.ok(clearanceM(res.coords, obstacle) > obstacle.radiusM);
});

test('dense trench: every vertex inside the works is dropped from the result', () => {
  const trench = denseTrench(120, 5);
  const obstacle = obstacleAt(60, 0, 12);
  const res = routeAroundObstacle(trench, obstacle, 2);

  assert.equal(res.rerouted, true);
  const inside = res.coords.filter(
    ([lng, lat]) => distancePointToSegmentM([obstacle.lng, obstacle.lat], [lng, lat], [lng, lat]) <= obstacle.radiusM,
  );
  assert.deepEqual(inside, [], `no vertex may stay inside the works, found ${inside.length}`);
});

test('dense diagonal trench: re-routes without clipping', () => {
  const trench: LngLat[] = [];
  for (let t = 0; t <= 160; t += 5) trench.push(at(t * 0.7071, t * 0.7071));
  const obstacle = obstacleAt(60 * 0.7071, 60 * 0.7071, 14);

  const res = routeAroundObstacle(trench, obstacle, 2);

  assert.equal(res.rerouted, true);
  assert.equal(lineCrossesObstacle(res.coords, obstacle), false);
  assert.ok(clearanceM(res.coords, obstacle) > obstacle.radiusM);
});

test('line that starts inside the works is pushed clear of it', () => {
  const trench = denseTrench(80, 4); // vertex 0 sits inside the zone below
  const obstacle = obstacleAt(0, 0, 10);
  const res = routeAroundObstacle(trench, obstacle, 2);

  assert.equal(res.rerouted, true);
  assert.equal(lineCrossesObstacle(res.coords, obstacle), false);
  assert.ok(
    distancePointToSegmentM([obstacle.lng, obstacle.lat], res.coords[0], res.coords[0]) > obstacle.radiusM,
    'first vertex must end up outside the works',
  );
});

// ── Plain geometry ─────────────────────────────────────────────────────────

test('straight line through the middle becomes a half-circle around it', () => {
  const line: LngLat[] = [at(-50, 0), at(50, 0)];
  const obstacle = obstacleAt(0, 0, 10);
  const res = routeAroundObstacle(line, obstacle, 2);

  assert.equal(res.rerouted, true);
  assert.equal(lineCrossesObstacle(res.coords, obstacle), false);

  const impact = detourImpact(line, res.coords, obstacle, [], res);
  // The 24 m of the surveyed line inside the clearance circle (R = 12 m) is
  // replaced by half of that circle — 37.7 m — so the line grows by ~13.7 m.
  assert.ok(impact.lengthDeltaM > 12 && impact.lengthDeltaM < 15, `delta ${impact.lengthDeltaM}`);
  assert.equal(impact.extraChambers, 2);
  assert.equal(impact.rerouted, true);

  // The two ends of the surveyed line survive; the part inside the works is
  // replaced by the arc, so no vertex may sit in the no-go zone.
  assert.deepEqual(res.coords[0], line[0]);
  assert.deepEqual(res.coords[res.coords.length - 1], line[1]);
  for (const c of res.coords) {
    const d = distancePointToSegmentM([obstacle.lng, obstacle.lat], c, c);
    assert.ok(d > obstacle.radiusM, `vertex at ${d.toFixed(2)} m is inside the works`);
  }
});

test('a line that misses the works is returned unchanged', () => {
  const line: LngLat[] = [at(-50, 20), at(50, 20)];
  const obstacle = obstacleAt(0, 0, 10);
  const res = routeAroundObstacle(line, obstacle, 2);

  assert.equal(res.rerouted, false);
  assert.equal(res.insertedVertices, 0);
  assert.deepEqual(res.coords, line);
});

test('a tap far from the line reports the distance, not "nothing to re-route"', () => {
  const line: LngLat[] = [at(-50, 0), at(50, 0)];
  const obstacle = obstacleAt(0, 120, 10); // works tapped 120 m north of the trench
  const res = routeAroundObstacle(line, obstacle, 2);
  assert.equal(res.rerouted, false);

  const tapDistanceM = distanceToLineM([obstacle.lng, obstacle.lat], line);
  assert.ok(tapDistanceM > 115 && tapDistanceM < 125, `measured ${tapDistanceM}`);

  const impact = detourImpact(line, res.coords, obstacle, [], res);
  const label = formatDetourImpact(impact, { tapDistanceM, radiusM: obstacle.radiusM });
  assert.match(label, /120 m from this line/);
  assert.match(label, /radius 10 m/);
});

test('a tap just outside the radius still re-routes', () => {
  const line: LngLat[] = [at(-50, 0), at(50, 0)];
  const obstacle = obstacleAt(0, 5, 10); // centre 5 m off the line, inside the radius
  const res = routeAroundObstacle(line, obstacle, 2);

  assert.equal(res.rerouted, true);
  assert.equal(lineCrossesObstacle(res.coords, obstacle), false);
  assert.ok(clearanceM(res.coords, obstacle) > obstacle.radiusM);
});

test('the detour is recomputed from the baseline, never stacked on a previous one', () => {
  const line: LngLat[] = [at(-50, 0), at(50, 0)];
  const small = obstacleAt(0, 0, 8);
  const large = obstacleAt(0, 0, 20);

  const first = routeAroundObstacle(line, small, 2);
  const second = routeAroundObstacle(line, large, 2);
  const reRun = routeAroundObstacle(first.coords, small, 2);

  assert.equal(first.rerouted, true);
  assert.equal(second.rerouted, true);
  assert.equal(reRun.rerouted, false, 'an already-cleared line must not re-route again');
  assert.deepEqual(reRun.coords, first.coords);
  assert.ok(clearanceM(second.coords, large) > large.radiusM);
  // The wider zone is not the narrow detour plus more: the arc stays on the
  // wider zone's own clearance circle, just outside its radius.
  assert.ok(clearanceM(second.coords, large) < large.radiusM + 4);
});

test('rerouting is deterministic', () => {
  const trench = denseTrench(150, 7);
  const obstacle = obstacleAt(70, 0, 15);
  assert.deepEqual(routeAroundObstacle(trench, obstacle, 2), routeAroundObstacle(trench, obstacle, 2));
});

test('other lines through the same works are counted', () => {
  const line: LngLat[] = [at(-50, 0), at(50, 0)];
  const crossing: LngLat[] = [at(0, -40), at(0, 40)];
  const clear: LngLat[] = [at(0, 60), at(30, 60)];
  const obstacle = obstacleAt(0, 0, 10);

  const res = routeAroundObstacle(line, obstacle, 2);
  const impact = detourImpact(line, res.coords, obstacle, [crossing, clear], res);

  assert.equal(impact.otherLinesCrossing, 1);
  assert.match(formatDetourImpact(impact), /1 other line in the works/);
});

test('a crossing without a detour reports 0 chambers and no route', () => {
  const line: LngLat[] = [at(-50, 0), at(50, 0)];
  const obstacle = obstacleAt(0, 0, 10);
  const impact = detourImpact(line, line, obstacle, []);

  assert.equal(impact.rerouted, false);
  assert.equal(impact.extraChambers, 0);
  assert.equal(impact.insertedVertices, 0);
  assert.equal(formatDetourImpact(impact), 'Line does not cross these works — nothing to re-route');
});

// ── The tap → detour plan the map screen runs ───────────────────────────────
// map.tsx's Route-around handler is a thin wrapper over planObstacleDetour, so
// these cover the live path: tap coordinates in, re-routed copy + label out.

test('plan: a tap on a dense trench mid-segment re-routes and labels the cost', () => {
  const trench = denseTrench(180, 6);
  const tap = MIDPOINT(trench);

  for (const radiusM of [10, 30]) {
    const plan = planObstacleDetour(tap, radiusM, trench, []);

    assert.equal(plan.tapDistanceM < 0.5, true, `tap should sit on the line (${plan.tapDistanceM} m)`);
    assert.equal(plan.impact.rerouted, true, `radius ${radiusM} m must re-route`);
    assert.notDeepEqual(plan.coords, trench);
    assert.equal(lineCrossesObstacle(plan.coords, plan.obstacle), false);
    assert.equal(plan.impact.extraChambers, 2);
    assert.match(plan.label, /chambers/);
    assert.match(plan.label, /vertex|vertices/);
    assert.ok(plan.impact.insertedVertices > 0);
    assert.ok(Number.isFinite(plan.impact.lengthDeltaM));
  }
});

test('plan: widening the radius replaces the diversion instead of stacking it', () => {
  const trench = denseTrench(180, 6);
  const tap = MIDPOINT(trench);

  const narrow = planObstacleDetour(tap, 8, trench, []);
  const wide = planObstacleDetour(tap, 25, trench, []);
  const again = planObstacleDetour(tap, 8, narrow.coords, []);

  assert.equal(narrow.impact.rerouted, true);
  assert.equal(wide.impact.rerouted, true);
  // Re-planning from a cleared line is a no-op: nothing is ever stacked.
  assert.equal(again.impact.rerouted, false);
  assert.deepEqual(again.coords, narrow.coords);
  // Each plan keeps the clearance of its own radius.
  assert.ok(distanceToLineM([wide.obstacle.lng, wide.obstacle.lat], wide.coords) > wide.obstacle.radiusM);
  assert.ok(distanceToLineM([narrow.obstacle.lng, narrow.obstacle.lat], narrow.coords) > narrow.obstacle.radiusM);
});

test('plan: a tap nowhere near the line says how far away it was', () => {
  const trench = denseTrench(120, 8);
  const plan = planObstacleDetour(at(50, 140), 10, trench, []);

  assert.equal(plan.impact.rerouted, false);
  assert.deepEqual(plan.coords, trench);
  assert.ok(plan.label.includes('140 m from this line'), plan.label);
  assert.equal(plan.label.includes('does not cross'), false);
});

test('plan: counts the other lines sitting in the same works zone', () => {
  const trench = denseTrench(120, 8);
  const tap = at(60, 0);
  const plan = planObstacleDetour(tap, 12, trench, [denseTrench(120, 8).map(([lng, lat]) => [lng, lat + 0.00001] as LngLat)]);

  assert.equal(plan.impact.rerouted, true);
  assert.equal(plan.impact.otherLinesCrossing, 1);
  assert.match(plan.label, /1 other line in the works/);
});

// ── Primitives ─────────────────────────────────────────────────────────────

test('distancePointToSegmentM: on-segment, perpendicular, beyond an endpoint', () => {
  const a = at(0, 0);
  const b = at(30, 0);
  assert.ok(distancePointToSegmentM(at(15, 0), a, b) < 0.01, 'point on the segment is 0 m away');
  assert.ok(Math.abs(distancePointToSegmentM(at(15, 12), a, b) - 12) < 0.05, 'perpendicular distance');
  assert.ok(Math.abs(distancePointToSegmentM(at(-10, 0), a, b) - 10) < 0.05, 'clamps to the nearest endpoint');
});

test('distanceToLineM handles a single-vertex line', () => {
  const p = at(3, 4);
  assert.ok(Math.abs(distanceToLineM(at(0, 0), [p]) - 5) < 0.05);
});

test('lineLengthM matches the local metres it was built from', () => {
  const line: LngLat[] = [at(0, 0), at(30, 40), at(60, 40)];
  assert.ok(Math.abs(lineLengthM(line) - 80) < 0.2, `${lineLengthM(line)}`);
});
