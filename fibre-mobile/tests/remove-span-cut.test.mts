// ── Remove span: cut points + gap planning ─────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// Remove span used to snap to the nearest EXISTING vertex, so a mid-segment
// tap on a long straight trench could never place a cut there — the tool
// appeared to do nothing. These tests pin the fixed behaviour: each tap cuts
// a vertex in under the finger, and the gap between the two cut points is
// what gets removed (leaving one or two independent lines).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cutVertexIndexAtPoint,
  countVerticesBetween,
  planSpanRemoval,
  approximateLength,
} from '../lib/utils/geometry-operations.ts';

const LAT0 = 51.5074;
const LNG0 = -0.1278;
const M_PER_DEG_LAT = 111000;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** Local metres (x east, y north) → [lng, lat] around a fixed origin. */
function at(xM: number, yM: number): [number, number] {
  return [LNG0 + xM / M_PER_DEG_LNG, LAT0 + yM / M_PER_DEG_LAT];
}

/** A straight 300 m trench: A(0,0) → B(300,0), two vertices only. */
const straight: [number, number][] = [at(0, 0), at(300, 0)];

test('a mid-segment tap cuts a new vertex exactly where it was tapped', () => {
  const cut = cutVertexIndexAtPoint(straight, ...at(120, 0));
  assert.ok(cut, 'tap on a straight segment must produce a cut point');
  assert.equal(cut.inserted, true);
  assert.equal(cut.index, 1);
  assert.equal(cut.coordinates.length, 3);
  // The projection lands on the line, at the tap position along it.
  const [lng, lat] = cut.coordinates[1];
  assert.ok(approximateLength([straight[0], [lng, lat]]) - 120 < 1, 'cut sits ~120 m along the line');
  assert.ok(Math.abs(lat - LAT0) < 1e-6, 'cut stays on the line');
});

test('two taps on one straight run bite a real gap out of the middle', () => {
  const first = cutVertexIndexAtPoint(straight, ...at(100, 0));
  assert.ok(first);
  const second = cutVertexIndexAtPoint(first.coordinates, ...at(200, 0));
  assert.ok(second);

  // The earlier cut must keep pointing at its own vertex after the insert.
  const start = second.index <= first.index ? first.index + 1 : first.index;
  const plan = planSpanRemoval(second.coordinates, start, second.index);

  assert.equal(plan.segments.length, 2, 'the line is split in two');
  assert.equal(plan.segments[0].length, 2, 'first piece ends at the 100 m cut');
  assert.equal(plan.segments[1].length, 2, 'second piece starts at the 200 m cut');
  assert.ok(Math.abs(plan.removedM - 100) < 1, `~100 m removed, got ${plan.removedM.toFixed(1)}`);
  // The gap itself is gone: piece 1 ends at x=100, piece 2 starts at x=200.
  assert.ok(approximateLength([at(0, 0), plan.segments[0][1]]) - 100 < 1);
  assert.ok(approximateLength([at(0, 0), plan.segments[1][0]]) - 200 < 1);
});

test('a tap on top of a vertex reuses it instead of adding a duplicate', () => {
  const three: [number, number][] = [at(0, 0), at(100, 0), at(200, 0)];
  const cut = cutVertexIndexAtPoint(three, ...at(100, 0.4));
  assert.ok(cut);
  assert.equal(cut.inserted, false);
  assert.equal(cut.index, 1);
  assert.equal(cut.coordinates.length, 3);
});

test('a gap that covers the whole line leaves nothing to keep', () => {
  const plan = planSpanRemoval(straight, 0, 1);
  assert.equal(plan.segments.length, 0, 'callers must refuse this case');
  assert.ok(Math.abs(plan.removedM - 300) < 1);
});

test('a gap that touches one end trims the line instead of splitting it', () => {
  const four: [number, number][] = [at(0, 0), at(100, 0), at(200, 0), at(300, 0)];
  const plan = planSpanRemoval(four, 0, 2);
  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].length, 2);
  assert.ok(Math.abs(plan.removedM - 200) < 1);
});

test('picks are order-independent and interior vertices are counted only', () => {
  const four: [number, number][] = [at(0, 0), at(100, 0), at(200, 0), at(300, 0)];
  const forward = planSpanRemoval(four, 1, 3);
  const backward = planSpanRemoval(four, 3, 1);
  assert.deepEqual(forward.segments, backward.segments);
  assert.equal(countVerticesBetween(1, 3), 1);
  assert.equal(countVerticesBetween(3, 1), 1);
  assert.equal(countVerticesBetween(2, 3), 0);
});
