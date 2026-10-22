// ── Split-tap tolerance ────────────────────────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// The split tool takes ONE tap on a 3 px trench, which a gloved thumb cannot
// hit exactly: the hit-test often resolves to empty ground or the neighbouring
// line. map.tsx now accepts a tap within SPLIT_SNAP_M of the selected line and
// projects it onto that line. distanceToPolylineM is what decides "near enough
// to have meant this line", so its metres have to be right — a tolerance that
// reports 0 m for a 20 m miss would silently move the joint off the trench.

import test from 'node:test';
import assert from 'node:assert/strict';

import { distanceToPolylineM, splitLineAtPoint } from '../lib/utils/geometry-operations.ts';

const LAT0 = 51.5074;
const LNG0 = -0.1278;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

/** Local metres (x east, y north) → [lng, lat] around a fixed origin. */
function at(xM: number, yM: number): [number, number] {
  return [LNG0 + xM / M_PER_DEG_LNG, LAT0 + yM / M_PER_DEG_LAT];
}

/** A straight 300 m trench: A(0,0) → B(300,0). */
const straight: [number, number][] = [at(0, 0), at(300, 0)];

test('a tap beside the middle of a trench reports its perpendicular distance', () => {
  const d = distanceToPolylineM(straight, ...at(150, 9));
  assert.ok(Math.abs(d - 9) < 0.6, `expected ~9 m, got ${d.toFixed(2)} m`);
});

test('a tap past the line end measures to the endpoint, not the infinite ray', () => {
  const d = distanceToPolylineM(straight, ...at(340, 0));
  assert.ok(Math.abs(d - 40) < 0.8, `expected ~40 m, got ${d.toFixed(2)} m`);
});

test('a tap on the line is on the line', () => {
  const d = distanceToPolylineM(straight, ...at(120, 0));
  assert.ok(d < 0.5, `expected ~0 m, got ${d.toFixed(2)} m`);
});

test('a bent line reports distance to the nearest segment', () => {
  // L-shape: east 100 m, then north 100 m.
  const bent: [number, number][] = [at(0, 0), at(100, 0), at(100, 100)];
  const nearVertical = distanceToPolylineM(bent, ...at(93, 60));
  assert.ok(Math.abs(nearVertical - 7) < 0.6, `expected ~7 m, got ${nearVertical.toFixed(2)} m`);
});

test('a single-vertex line still has a distance', () => {
  const d = distanceToPolylineM([at(0, 0)], ...at(0, 5));
  assert.ok(Math.abs(d - 5) < 0.5, `expected ~5 m, got ${d.toFixed(2)} m`);
});

test('an empty line is infinitely far away, so no tap is ever accepted', () => {
  assert.equal(distanceToPolylineM([], LNG0, LAT0), Infinity);
});

test('a tolerated off-line tap still splits at the line, not at the finger', () => {
  // 9 m off the trench — inside the 12 m tolerance map.tsx allows.
  const res = splitLineAtPoint(straight, ...at(150, 9));
  assert.ok(res, 'a near miss within tolerance must still split');
  const [cutLng, cutLat] = res.coordsA[res.coordsA.length - 1];
  assert.deepEqual([cutLng, cutLat], res.coordsB[0], 'both halves share the cut vertex');
  const offLine = Math.abs(cutLat - LAT0) * M_PER_DEG_LAT;
  const alongLine = Math.abs(cutLng - at(150, 0)[0]) * M_PER_DEG_LNG;
  assert.ok(offLine < 0.6, `the cut vertex sits on the trench, not 9 m beside it (${offLine.toFixed(2)} m)`);
  assert.ok(alongLine < 2, `the cut vertex lands at the tap's station on the line (${alongLine.toFixed(2)} m off)`);
});
