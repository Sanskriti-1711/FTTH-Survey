// ── Field-survey layer rule tests ──────────────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// The app answers questions about PREMISES, and `objects` is that layer: one
// point per premise with its address and household count. `Pseudo_HH` is the
// footway end of a garden leg — a point the trench designer derives so the
// duct graph has something to attach to — with no address, no household and
// nothing a surveyor can record against it.
//
// A Survey copy built before the rule carries both (project `24cd3573…` holds
// 23 layers including `Pseudo_HH` (224) beside `objects` (285)), and its stored
// rows are re-served on every fetch, so the artefact came back on the map
// beside the real premises. These tests pin the lookup that keeps it off the
// map, in every spelling the backend and the package use.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_SURVEY_HIDDEN_LAYERS,
  isFieldSurveyLayer,
  normalizeLayerId,
} from '../lib/utils/layer-ids.ts';

test('the rule names the design artefacts, not the layers the survey works in', () => {
  assert.deepEqual(FIELD_SURVEY_HIDDEN_LAYERS, [
    'pseudo_hh',
    'feeder_trench',
    'distribution_trench',
    'garden_trench',
    'trench_nodes',
  ]);
  assert.ok(!FIELD_SURVEY_HIDDEN_LAYERS.includes('objects'));
  assert.ok(!FIELD_SURVEY_HIDDEN_LAYERS.includes('final_trenches'));
});

test('the per-tier trench mirrors are hidden, in every spelling', () => {
  // The designer publishes `Distribution_Trench`; the platform's import keeps
  // whatever it is handed; the store prefixes an imported layer with `imp-`.
  for (const id of [
    'Distribution_Trench',
    'distribution_trench',
    'distribution trench',
    'imp-Distribution_Trench',
    'Garden_Trench',
    'garden_trench',
    'Feeder_Trench',
    'feeder_trench',
  ]) {
    assert.equal(isFieldSurveyLayer(id), false, `${id} must not be served`);
  }
});

test('the single published trench layer is the one the survey keeps', () => {
  for (const id of ['Final_Trenches', 'final_trenches', 'imp-final_trenches']) {
    assert.equal(isFieldSurveyLayer(id), true, `${id} must be served`);
  }
});

test('every spelling of the artefact the platform serves is hidden', () => {
  // The package publishes Title_Case; the platform's import keeps whatever it
  // is handed; the store prefixes an imported layer with `imp-`.
  for (const id of ['pseudo_hh', 'Pseudo_HH', 'PSEUDO_HH', 'pseudo hh', 'imp-Pseudo_HH']) {
    assert.equal(isFieldSurveyLayer(id), false, `${id} must not be served`);
  }
});

test('the object layer is served, in every spelling', () => {
  for (const id of ['objects', 'Objects', 'imp-objects']) {
    assert.equal(isFieldSurveyLayer(id), true, `${id} must be served`);
  }
});

test('trench joints are hidden, in every spelling', () => {
  // A node is realised by a chamber (the published layer); the engine never
  // bundles the joint layer and the results map never shows it.
  for (const id of ['trench_nodes', 'Trench_Nodes', 'trench nodes', 'imp-trench_nodes']) {
    assert.equal(isFieldSurveyLayer(id), false, `${id} must not be served`);
  }
});

test('other layers are untouched', () => {
  // `served_premises` and `tangent_crossings` are absent from a current
  // package, but hiding them is a different rule.
  for (const id of [
    'final_trenches',
    'Final_Trenches',
    'chambers',
    'served_premises',
    'drop_ducts',
    'existing_infrastructure_points',
  ]) {
    assert.equal(isFieldSurveyLayer(id), true, `${id} must be served`);
  }
});

test('the rule is not a substring match', () => {
  // `pseudo_hh` must not hide a layer whose name merely contains it, and the
  // normaliser must not merge two real layers to make this pass either.
  assert.equal(isFieldSurveyLayer('pseudo_hh_extra'), true);
  assert.equal(isFieldSurveyLayer('trench_nodes_extra'), true);
  assert.equal(normalizeLayerId('Pseudo_HH'), 'pseudo_hh');
  assert.equal(normalizeLayerId('Distribution_Trench'), 'distribution_trench');
  assert.notEqual(normalizeLayerId('pseudo_hh'), normalizeLayerId('pseudo_hh_extra'));
});
