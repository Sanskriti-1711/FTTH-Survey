// ── Junction + perpendicular branch tests ─────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// Draw trench generates a joint in the MIDDLE of a run (not only at a corner)
// and can lock the next vertex at 90° to that run. Both are pure functions
// while everything around them is not, so they get pinned here: a sign error
// in the projection or a broken interior check otherwise only shows up as a
// crooked branch in the field.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findNearestLineJunction,
  projectPerpendicular,
  type MapLineLayer,
} from '../lib/utils/geometry-operations.ts';

const LAT0 = 51.5074;
const LNG0 = -0.1278;
const M_PER_DEG_LAT = 111000;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** Local metres (x east, y north) → [lng, lat] around a fixed origin. */
function at(xM: number, yM: number): [number, number] {
  return [LNG0 + xM / M_PER_DEG_LNG, LAT0 + yM / M_PER_DEG_LAT];
}

function lineLayer(coords: [number, number][]): MapLineLayer {
  return {
    id: 'imp-trenches',
    name: 'TRENCHES',
    features: [
      {
        geometry: { type: 'LineString', coordinates: coords },
        properties: { id: 'trench-1' },
      },
    ],
  };
}

function offByM(actual: [number, number], expected: [number, number]): number {
  const dx = (actual[0] - expected[0]) * M_PER_DEG_LNG;
  const dy = (actual[1] - expected[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

// ── findNearestLineJunction ──────────────────────────────────────────────

test('a tap beside the middle of a run generates a junction on the run', () => {
  const junction = findNearestLineJunction([lineLayer([at(0, 0), at(100, 0)])], ...at(40, 5));
  assert.ok(junction, 'expected a junction');
  assert.ok(offByM(junction.coord, at(40, 0)) < 0.5, `projected to ${junction.coord}`);
  // dir is a metre-space unit vector along the run, so an east run is (1, 0).
  assert.ok(Math.abs(junction.dir[0] - 1) < 1e-3, `dir ${junction.dir}`);
  assert.ok(Math.abs(junction.dir[1]) < 1e-3, `dir ${junction.dir}`);
});

test('a tap beyond the snap radius is left alone', () => {
  const junction = findNearestLineJunction([lineLayer([at(0, 0), at(100, 0)])], ...at(40, 20));
  assert.equal(junction, null);
});

test('a tap on the line\u2019s end is not a junction — the corner snap owns that', () => {
  // 2 m north of the start: inside the radius, but at t = 0 on the segment.
  const junction = findNearestLineJunction([lineLayer([at(0, 0), at(100, 0)])], ...at(0, 2));
  assert.equal(junction, null);
});

// ── projectPerpendicular ─────────────────────────────────────────────────

test('the projection lands on the 90° axis through the anchor', () => {
  const anchor = at(0, 0);
  const dir: [number, number] = [1, 0]; // east
  // Tap 30 m along the run and 10 m out: the along-run part is dropped, so the
  // vertex sits 10 m out on the 90° axis — a perpendicular leg, not a diagonal.
  const projected = projectPerpendicular(anchor, dir, at(30, 10));
  assert.ok(offByM(projected, at(0, 10)) < 0.5, `projected to ${projected}`);

  // Offset from the anchor is perpendicular to the run.
  const dx = (projected[0] - anchor[0]) * M_PER_DEG_LNG;
  const dy = (projected[1] - anchor[1]) * M_PER_DEG_LAT;
  assert.ok(Math.abs(dx * dir[0] + dy * dir[1]) < 0.05, 'not on the 90° axis');
});

test('a tap behind the anchor still lands on the axis at its own offset', () => {
  const projected = projectPerpendicular(at(0, 0), [1, 0], at(-12, 4));
  assert.ok(offByM(projected, at(0, 4)) < 0.5, `projected to ${projected}`);
});
