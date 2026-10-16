// ── Extend-line snap + growth tests ────────────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// Extend line failed two ways on site: a tap near another trench's corner
// never snapped to it (only premises points and the selected line were
// snap targets, so trench-to-trench joints always missed by decimetres),
// and Save wrote ONLY the new 2-point segment as the line's geometry — a
// 20-vertex trench became 2 vertices. These tests pin the fixed behaviour:
// corner snapping across lines, whole-line growth at the nearer end, and
// the spur rule (destination far from both ends stays its own segment).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findNearestLineCorner,
  extendLineToPoint,
  extendLineString,
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

function lineLayer(id: string, lines: [number, number][][]): MapLineLayer {
  return {
    id,
    name: id.toUpperCase(),
    features: lines.map((coords, i) => ({
      geometry: { type: 'LineString', coordinates: coords },
      properties: { id: `${id}-f${i}` },
    })),
  };
}

// ── findNearestLineCorner ────────────────────────────────────────────────

test('snaps to another line\u2019s corner within tolerance', () => {
  const layers = [lineLayer('imp-trenches', [[at(0, 0), at(100, 0), at(100, 50)]])];
  // 5 m east of the far corner (100, 50).
  const hit = findNearestLineCorner(layers, ...at(105, 50));
  assert.ok(hit);
  assert.deepEqual(hit.coord, at(100, 50));
  assert.equal(hit.vertexIdx, 2);
  assert.equal(hit.isEndpoint, true);
  assert.equal(hit.featureId, 'imp-trenches-f0');
});

test('interior vertices snap too, flagged non-endpoint', () => {
  const layers = [lineLayer('imp-trenches', [[at(0, 0), at(100, 0), at(200, 0)]])];
  const hit = findNearestLineCorner(layers, ...at(100, 3));
  assert.ok(hit);
  assert.equal(hit.vertexIdx, 1);
  assert.equal(hit.isEndpoint, false);
});

test('returns null when no corner is near', () => {
  const layers = [lineLayer('imp-trenches', [[at(0, 0), at(100, 0)]])];
  assert.equal(findNearestLineCorner(layers, ...at(500, 500)), null);
});

test('ignores temp-preview layers and picks the nearer of two lines', () => {
  const layers = [
    { id: 'temp-preview-abc', name: 'preview', features: [{ geometry: { type: 'LineString', coordinates: [at(50, 1), at(60, 1)] }, properties: { id: 'x' } }] },
    lineLayer('imp-trenches', [[at(0, 0), at(100, 0)]]),
    lineLayer('imp-ducts', [[at(0, 200), at(100, 200)]]),
  ];
  // 2 m from the trench corner, 198 m from the duct corner.
  const hit = findNearestLineCorner(layers, ...at(100, 2));
  assert.ok(hit);
  assert.equal(hit.layerId, 'imp-trenches');
  assert.deepEqual(hit.coord, at(100, 0));
});

test('multi-line first part corners are snappable', () => {
  const layers = [{
    id: 'imp-trenches',
    name: 'TRENCHES',
    features: [{ geometry: { type: 'MultiLineString', coordinates: [[at(0, 0), at(50, 0)]] }, properties: { id: 'm0' } }],
  }];
  const hit = findNearestLineCorner(layers, ...at(50, 2));
  assert.ok(hit);
  assert.equal(hit.featureId, 'm0');
});

// ── extendLineToPoint ────────────────────────────────────────────────────

test('destination near the end appends, keeping every vertex', () => {
  const base = [at(0, 0), at(50, 0), at(100, 0)];
  const grown = extendLineToPoint(base, at(130, 0));
  assert.ok(grown);
  assert.equal(grown.end, 'end');
  assert.equal(grown.coords.length, 4);
  assert.deepEqual(grown.coords.slice(0, 3), base);
  assert.deepEqual(grown.coords[3], at(130, 0));
});

test('destination near the start prepends', () => {
  const base = [at(0, 0), at(50, 0), at(100, 0)];
  const grown = extendLineToPoint(base, at(-30, 0));
  assert.ok(grown);
  assert.equal(grown.end, 'start');
  assert.equal(grown.coords.length, 4);
  assert.deepEqual(grown.coords[0], at(-30, 0));
  assert.deepEqual(grown.coords.slice(1), base);
});

test('a two-vertex line grows to three, never collapses to the segment', () => {
  const base = [at(0, 0), at(100, 0)];
  const grown = extendLineToPoint(base, at(140, 5));
  assert.ok(grown);
  assert.equal(grown.coords.length, 3);
  assert.deepEqual(grown.coords[0], at(0, 0));
});

test('refuses a base that is not a line', () => {
  assert.equal(extendLineToPoint([at(0, 0)], at(10, 0)), null);
  assert.equal(extendLineToPoint([], at(10, 0)), null);
});

// ── extendLineString connect (spur joining two trenches) ─────────────────

test('connect mode bridges two trenches without duplicating joints', () => {
  const a = [at(0, 0), at(100, 0)];
  const seg = [at(100, 0), at(150, 0), at(200, 0)];
  const b = [at(200, 0), at(300, 0)];
  const merged = extendLineString(a, seg, 'connect', b);
  assert.deepEqual(merged, [at(0, 0), at(100, 0), at(150, 0), at(200, 0), at(300, 0)]);
});
