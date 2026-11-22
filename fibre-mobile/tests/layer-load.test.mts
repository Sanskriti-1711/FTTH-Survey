// ── Layer-load verdict ────────────────────────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// The live bug this pins: the deployed database was one migration behind, so
// every per-layer request answered 500. The screen summed the caught failures
// into zero features and reported "No mapped features" — a broken endpoint
// reading as an empty project, with nothing to retry.

import test from 'node:test';
import assert from 'node:assert/strict';

import { layerLoadMessage, layerLoadVerdict } from '../lib/utils/layer-load.ts';

test('every layer failing is a failure, not an empty project', () => {
  assert.equal(layerLoadVerdict(14, 14), 'failed');
  assert.match(layerLoadMessage(14, 14), /None of this project's 14 layers loaded/);
});

test('a single layer failing is the same failure', () => {
  assert.equal(layerLoadVerdict(1, 1), 'failed');
  assert.match(layerLoadMessage(1, 1), /None of this project's 1 layer loaded/);
});

test('some layers failing still draws the rest, and says so', () => {
  assert.equal(layerLoadVerdict(14, 3), 'partial');
  assert.match(layerLoadMessage(14, 3), /3 of 14 layers failed to load — showing the rest/);
});

test('no failures, or no layers at all, is not an error', () => {
  assert.equal(layerLoadVerdict(14, 0), 'ok');
  assert.equal(layerLoadVerdict(0, 0), 'ok');
});
