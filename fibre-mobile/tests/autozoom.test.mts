// ── Auto-zoom unit tests ─────────────────────────────────────────────────
// Run with:  npm test
//
// These pin the camera behaviour the field asked for: opening a project
// frames the work area, selecting something frames it only when it is not
// already readable, and a point is never framed as a single pixel.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boundsCenter,
  boundsContain,
  boundsOfFeatures,
  boundsSpanM,
  expandBounds,
  geometryBounds,
  metresPerPixel,
  needsReframe,
  MIN_REGION_SPAN_M,
  type Bounds,
} from '../lib/utils/autozoom.ts';

const LAT0 = 50.94; // the fixture project sits near Aachen
const LNG0 = 6.06;

function at(xM: number, yM: number): [number, number] {
  const mPerDegLat = 111320;
  return [LNG0 + xM / (mPerDegLat * Math.cos((LAT0 * Math.PI) / 180)), LAT0 + yM / mPerDegLat];
}

test('geometryBounds covers points, lines and nested polygons', () => {
  assert.deepEqual(geometryBounds({ type: 'Point', coordinates: [1, 2] }), [1, 2, 1, 2]);

  const line = geometryBounds({
    type: 'LineString',
    coordinates: [at(0, 0), at(100, 80), at(-40, 120)],
  })!;
  assert.ok(Math.abs(line[0] - at(-40, 0)[0]) < 1e-9);
  assert.ok(Math.abs(line[3] - at(0, 120)[1]) < 1e-9);

  const poly = geometryBounds({
    type: 'MultiPolygon',
    coordinates: [
      [
        [at(0, 0), at(20, 0), at(20, 20), at(0, 20), at(0, 0)],
      ],
      [
        [at(50, 50), at(70, 50), at(70, 70), at(50, 50)],
      ],
    ],
  })!;
  assert.ok(poly[2] > at(60, 0)[0], 'second polygon extends the east edge');
  assert.ok(poly[3] > at(0, 30)[1], 'second polygon extends the north edge');

  assert.equal(geometryBounds({ type: 'Point' }), null);
  assert.equal(geometryBounds(null), null);
});

test('boundsOfFeatures unions only the included features', () => {
  const features = [
    { geometry: { type: 'Point', coordinates: at(0, 0) } },
    { geometry: { type: 'Point', coordinates: at(300, 0) } },
    { geometry: null },
  ];
  const all = boundsOfFeatures(features)!;
  assert.ok(Math.abs(boundsSpanM(all).width - 300) < 1, 'span is 300 m');

  // A visibility predicate is how hidden layers drop out of the ROI.
  const onlySecond = boundsOfFeatures(features, (f) => f === features[1])!;
  assert.deepEqual(onlySecond, geometryBounds(features[1].geometry)!);
  assert.equal(boundsOfFeatures(features, () => false), null);
  assert.equal(boundsOfFeatures([]), null);
});

test('expandBounds gives a point a usable region floor', () => {
  const p: Bounds = [...at(0, 0), ...at(0, 0)] as Bounds;
  const grown = expandBounds(p, MIN_REGION_SPAN_M);
  const span = boundsSpanM(grown);
  assert.ok(Math.abs(span.width - MIN_REGION_SPAN_M) < 1, `width ${span.width}`);
  assert.ok(Math.abs(span.height - MIN_REGION_SPAN_M) < 1, `height ${span.height}`);
  // The original point stays at the centre.
  const c = boundsCenter(grown);
  assert.ok(Math.abs(c.lat - LAT0) < 1e-9);
});

test('expandBounds leaves an already-large region alone', () => {
  const big: Bounds = [at(-200, -200)[0], at(-200, -200)[1], at(200, 200)[0], at(200, 200)[1]];
  assert.deepEqual(expandBounds(big, MIN_REGION_SPAN_M), big);
});

test('metresPerPixel matches the Web Mercator reference', () => {
  assert.ok(Math.abs(metresPerPixel(0, 0) - 156543.03) < 0.5);
  // One zoom level halves the ground size of a pixel.
  assert.ok(Math.abs(metresPerPixel(0, 18) - metresPerPixel(0, 17) / 2) < 1e-6);
});

test('needsReframe frames the first load and a speck on screen', () => {
  const target = expandBounds([...at(0, 0), ...at(0, 0)] as Bounds, MIN_REGION_SPAN_M);
  assert.equal(needsReframe(target, null), true, 'no camera yet');

  const zoomedOut = {
    zoom: 12,
    center: { lng: LNG0, lat: LAT0 },
    viewportWidth: 390,
    viewportHeight: 844,
  };
  assert.equal(needsReframe(target, zoomedOut), true, '60 m at z12 is a speck');

  const working = {
    zoom: 19,
    center: { lng: LNG0, lat: LAT0 },
    viewportWidth: 390,
    viewportHeight: 844,
  };
  assert.equal(needsReframe(target, working), false, 'already readable — do not jump');
});

test('needsReframe leaves a selection that is comfortably in view', () => {
  const target: Bounds = [at(-100, -100)[0], at(-100, -100)[1], at(100, 100)[0], at(100, 100)[1]];
  const view = {
    zoom: 17,
    center: { lng: LNG0, lat: LAT0 },
    viewportWidth: 390,
    viewportHeight: 844,
  };
  assert.equal(needsReframe(target, view), false);
});

test('needsReframe pulls back when the target is off screen', () => {
  const target: Bounds = [at(900, 900)[0], at(900, 900)[1], at(1000, 1000)[0], at(1000, 1000)[1]];
  const view = {
    zoom: 18,
    center: { lng: LNG0, lat: LAT0 },
    viewportWidth: 390,
    viewportHeight: 844,
  };
  assert.equal(needsReframe(target, view), true);
});

test('boundsContain honours slack', () => {
  const b: Bounds = [at(-100, -100)[0], at(-100, -100)[1], at(100, 100)[0], at(100, 100)[1]];
  const inside = { lng: LNG0, lat: LAT0 };
  const outside = { lng: at(140, 0)[0], lat: LAT0 };
  assert.equal(boundsContain(b, inside, 1), true);
  assert.equal(boundsContain(b, outside, 1), false);
  assert.equal(boundsContain(b, outside, 1.5), true);
});
