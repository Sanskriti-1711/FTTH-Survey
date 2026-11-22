// ── Typed readings ─────────────────────────────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// The tape card lets the engineer type the number when the photo cannot be
// read, and that number lands in the same actual_* field as an OCR reading.
// The failure to pin is an empty or junk field becoming a real measurement: a
// 0 mm depth on a submitted inspection is worse than no reading at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { applySpanInspection, positiveNumber } from '../lib/utils/spanInspection.ts';

test('a number typed off the blade is taken as it was read', () => {
  assert.equal(positiveNumber('350'), 350);
  assert.equal(positiveNumber(' 1,5 '), 1.5);
});

test('nothing typed, or junk, is not a measurement', () => {
  for (const text of ['', ' ', 'abc', '0', '-5', '1.2.3', 'NaN']) {
    assert.equal(positiveNumber(text), null, JSON.stringify(text));
  }
});

test('saving the span form keeps where a tape reading came from', () => {
  const saved = {
    actual_depth_mm: { value: 350, unit: 'mm', source: 'tape_typed', confidence: 1 },
  };

  const next = applySpanInspection(saved, { actual_depth_mm: '350' }, {});

  assert.equal((next.actual_depth_mm as { source?: string }).source, 'tape_typed');
});

test('an edited number replaces the old reading, trail and all', () => {
  const saved = { actual_depth_mm: { value: 350, source: 'tape_ocr', photo_id: 'p1' } };

  const next = applySpanInspection(saved, { actual_depth_mm: '420' }, {});

  assert.deepEqual(next.actual_depth_mm, { value: 420 });
});
