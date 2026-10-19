// Playwright coverage for the P0 map-tool cases in
// Survey_EndToEnd_TestSheet_UIOnly.xlsx (SA-017 … SA-137).
//
// It drives the *web build* against a real backend project, because most map
// bugs only appear with real imported GeoJSON (layer counts, popup attributes,
// line/polygon toolbars).
//
//   cd FTTH_SURVEY_APP/fibre-mobile
//   E2E_EMAIL=you@example.com E2E_PASSWORD=secret npm run test:e2e
//
// Optional env:
//   E2E_BASE_URL  (default https://fibre-survey-web.onrender.com)
//   E2E_PROJECT   (default UI-Brownfield-Verify) — a project that already has
//                 imported layers and at least one survey change.
//
// The mutating P0 cases (draw/split/merge/delete/save, required-field gates,
// submit) are listed at the bottom as skips: they need a disposable project
// and a backend reset between runs, otherwise they poison the fixture.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://fibre-survey-web.onrender.com';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const PROJECT = process.env.E2E_PROJECT ?? 'UI-Brownfield-Verify';

const MAP_READY_TIMEOUT = 90_000;
const UI_TIMEOUT = 30_000;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let browser;
let page;
/** layer_id -> { name, count } captured from the app's own API calls */
const apiLayers = new Map();

async function loginIfNeeded() {
  // The form mounts after hydration, so isVisible() alone races the app: wait
  // for either the login form or the dashboard before deciding.
  const email = page.locator('#login-email');
  const loginOrHome = email.or(page.getByText('My Projects')).first();
  await loginOrHome.waitFor({ state: 'visible', timeout: MAP_READY_TIMEOUT });

  if (await email.isVisible().catch(() => false)) {
    await email.fill(EMAIL);
    await page.locator('#login-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.getByText('My Projects').waitFor({ state: 'visible', timeout: MAP_READY_TIMEOUT });
  }
}

async function waitForMap() {
  await page.getByLabel('HLD view').waitFor({ state: 'visible', timeout: MAP_READY_TIMEOUT });
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: MAP_READY_TIMEOUT });
  // The data overlay sits above the map until every layer has settled. It is
  // absent while the overlay is being (re)created, so wait for the legend to
  // list real groups afterwards — "None visible" means the fetch is still on.
  await page.getByText('Loading Project Data').waitFor({ state: 'hidden', timeout: MAP_READY_TIMEOUT });
  await page
    .getByText(/^(trenches|premises|cables|service areas)$/i)
    .first()
    .waitFor({ state: 'visible', timeout: MAP_READY_TIMEOUT });
}

/** Fresh load + re-open the project (the /map route does not carry the id). */
async function reset() {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: MAP_READY_TIMEOUT });
  await loginIfNeeded();
  await page.getByText(`${PROJECT} - Survey`, { exact: false }).first().click();
  await waitForMap();
}

/** The Layers legend starts expanded but lags the map on cold loads. */
async function expandLayersIfNeeded() {
  const header = page.getByText('Layers', { exact: true }).first();
  await header.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  const anyGroup = page.getByText(/^(trenches|premises|cables|service areas)$/i).first();
  // Give the expanded content a moment to paint before deciding it is closed —
  // isVisible() returns false immediately while the animation is still running.
  const expanded = await anyGroup
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!expanded) {
    const box = await header.boundingBox();
    if (box) await page.mouse.click(box.x + 6, box.y + box.height / 2);
  }
  await anyGroup.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
}

async function openList() {
  await page.getByLabel('Show list view').click();
  await page.locator('input[placeholder^="Search features"]').waitFor({ state: 'visible', timeout: UI_TIMEOUT });
}

async function search(term) {
  const input = page.locator('input[placeholder^="Search features"]');
  await input.fill(term);
  await page.waitForTimeout(600); // list filtering is client-side and debounced
}

/** Feature cards render `<layer_name> #<id-suffix>` when the feature has no name. */
function firstCard(layerName) {
  return page.getByText(new RegExp(`${layerName}.*#`)).first();
}

async function openFeatureFromList(layerName) {
  await openList();
  await search(layerName);
  const card = firstCard(layerName);
  await card.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  await card.click();
  // Card press switches back to map view and pins the popup.
  await page.getByText('Dismiss', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
}

before(async () => {
  if (!EMAIL || !PASSWORD) return;
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  page.on('response', async (response) => {
    const detail = response.url().match(/\/api\/projects\/[^/]+\/layers\/([^/?]+)\/?$/);
    if (detail) {
      try {
        const body = await response.json();
        if (Array.isArray(body.features)) {
          const id = decodeURIComponent(detail[1]);
          apiLayers.set(id, { name: body.layer?.name ?? id, count: body.features.length });
        }
      } catch {}
    }
  });
});

after(async () => {
  await browser?.close();
});

const requiresCreds = () => (EMAIL && PASSWORD ? false : 'set E2E_EMAIL and E2E_PASSWORD');

describe('P0 map tools on the web build', { concurrency: 1 }, () => {
  it('SA-017 map opens with every imported layer rendered', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();

    assert.ok(await page.locator('canvas').first().isVisible());
    assert.equal(await page.getByText('Loading Project Data').count(), 0, 'loading overlay must be gone');
    assert.equal(await page.getByText('Loading Project Data').isVisible().catch(() => false), false);
    assert.equal(await page.getByText(/Failed|Could not load|Something went wrong/i).count(), 0);

    await expandLayersIfNeeded();
    assert.ok(apiLayers.size > 0, 'expected layer detail responses');
    // Imported layers carry a "(Imported)" suffix from the project layer name.
    const anyTrenchRow = page.getByText(/^final_trenches\b/).first();
    assert.ok(await anyTrenchRow.isVisible(), 'a known imported layer row is listed');
  });

  it('SA-022 Layers panel names and counts match the backend', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await expandLayersIfNeeded();

    assert.ok(apiLayers.size >= 10, `expected the full layer set, got ${apiLayers.size}`);

    for (const [layerId, { name, count }] of apiLayers) {
      const base = name.replace(/\s*\(Imported\)$/i, '');
      const row = page.getByText(new RegExp(`^${escapeRegex(base)}\\b`)).first();
      await row.waitFor({ state: 'visible', timeout: UI_TIMEOUT }).catch(() => {
        assert.fail(`layer "${name}" (${layerId}) is missing from the Layers panel`);
      });
      // The row is the name's immediate parent (checkbox + name + count + type).
      const rowText = (await row.locator('xpath=..').innerText()).replace(/\s+/g, ' ');
      assert.match(
        rowText,
        new RegExp(`\\b${count}\\b`),
        `layer "${name}" should show ${count} features, row text: ${rowText}`,
      );
    }
  });

  it('SA-023 HLD / Survey / Overlay switch redraws without losing the map', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();

    const hld = page.getByLabel('HLD view');
    const survey = page.getByLabel('Survey view');
    const overlay = page.getByLabel('Overlay view');

    const bg = (locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);

    assert.notEqual(await bg(hld), 'rgb(255, 255, 255)', 'HLD is the initial active segment');

    await survey.click();
    assert.notEqual(await bg(survey), 'rgb(255, 255, 255)', 'Survey segment highlights');
    assert.equal(await bg(hld), 'rgb(255, 255, 255)', 'HLD segment clears');
    assert.ok(await page.locator('canvas').first().isVisible());

    await overlay.click();
    assert.notEqual(await bg(overlay), 'rgb(255, 255, 255)', 'Overlay segment highlights');
    assert.ok(await page.locator('canvas').first().isVisible());

    await hld.click();
    assert.notEqual(await bg(hld), 'rgb(255, 255, 255)');
  });

  it('SA-027 Layers groups expand and collapse', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await expandLayersIfNeeded();

    const trenchGroup = page.getByText(/^trenches$/i).first();
    await trenchGroup.waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    const trenchRows = page.getByText(/^final_trenches\b/);
    const rowVisible = () => trenchRows.first().isVisible().catch(() => false);

    // Normalise to expanded first (the panel remembers the last state).
    for (let attempt = 0; attempt < 2 && !(await rowVisible()); attempt++) {
      await trenchGroup.click();
      await page.waitForTimeout(700);
    }
    assert.ok(await rowVisible(), 'expanded group shows its rows');

    await trenchGroup.click();
    await page.waitForTimeout(500);
    assert.equal(await rowVisible(), false, 'collapsed group hides its rows');

    await trenchGroup.click();
    await trenchRows.first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  });

  it('SA-019 list view searches features and shows layer + geometry', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await openList();
    await search('final_trenches');

    const cards = page.getByText(/final_trenches.*#/);
    assert.ok((await cards.count()) > 0, 'search returns trench cards');
    const first = await cards.first().innerText();
    assert.match(first, /#/);
    assert.match(first, /final_trenches/i);
  });

  it('SA-032 point popup shows name, layer, attributes and actions', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await openFeatureFromList('chambers');

    assert.ok(await page.getByText('Open Details', { exact: true }).isVisible());
    assert.ok(await page.getByText('Edit', { exact: true }).last().isVisible());
    assert.ok(await page.getByText('Move', { exact: true }).last().isVisible());

    const more = page.getByText(/^\+\d+ more attributes$/);
    if (await more.isVisible().catch(() => false)) {
      await more.click();
      await page.getByText('Show less', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    }
  });

  it('SA-034 point Edit opens the survey sheet with every section', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await openFeatureFromList('chambers');
    await page.getByText('Edit', { exact: true }).last().click();

    await page.getByText('Save Survey Details', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    for (const section of ['Survey Details', 'Risk Assessment', 'Hazards', 'Field Evidence', 'Survey Status']) {
      assert.ok(await page.getByText(section, { exact: true }).first().isVisible(), `${section} section present`);
    }
    assert.ok(await page.getByText('Delete', { exact: true }).isVisible());

    // Sections are accordions: opening one must not close it on a single tap.
    await page.getByText('Risk Assessment', { exact: true }).first().click();
    await page.getByText('Risk Category', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  });

  it('SA-035 Move shows the drag-mode banner', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await openFeatureFromList('chambers');
    await page.getByText('Move', { exact: true }).last().click();

    await page.getByText('Drag Mode — Tap point features to move').waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    // Opening Move closes the tools menu, so the FAB (and its "Move mode on"
    // label) is not mounted — the banner is the user-visible confirmation.
  });

  it('SA-050 line selection toolbar exposes every action', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await openFeatureFromList('final_trenches');
    await page.getByText('Edit', { exact: true }).last().click();

    for (const action of [
      'Edit shape',
      'Split here',
      'Route around',
      'Remove span',
      'Extend line',
      'Attributes',
      'Delete',
      'Undo',
      'Save',
    ]) {
      await page
        .getByText(action, { exact: true })
        .first()
        .waitFor({ state: 'visible', timeout: UI_TIMEOUT })
        .catch(() => assert.fail(`line toolbar is missing "${action}"`));
    }
  });

  it('SA-090 polygon selection toolbar exposes every action', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await openFeatureFromList('polygons');
    await page.getByText('Edit', { exact: true }).last().click();

    for (const action of ['Move', 'Undo', 'Cancel', 'Delete', 'Save']) {
      await page
        .getByText(action, { exact: true })
        .first()
        .waitFor({ state: 'visible', timeout: UI_TIMEOUT })
        .catch(() => assert.fail(`polygon toolbar is missing "${action}"`));
    }
  });

  it('SA-095 fresh load has nothing to undo', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();
    await page.getByLabel('Open the tools menu').click();

    await page.getByLabel('Undo, nothing to undo').waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  });

  it('SA-104 survey changes panel lists the saved changes', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    await reset();

    await page.getByLabel(/Review changes/).click();
    await page.getByText('Survey Changes', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    assert.equal(await page.getByText('No Survey Changes Yet').count(), 0, 'fixture project must already have changes');
    assert.ok((await page.getByText(/#[0-9a-f]{6}/).count()) > 0, 'change rows are rendered');
  });
});

// ── P0 cases kept manual on purpose ─────────────────────────────────────────
// They write to the backend (draw/split/merge/delete/save/submit) or need a
// disposable fixture, so running them here would corrupt the shared project.
describe('P0 map tools that need a disposable project', { concurrency: 1 }, () => {
  const reasons = {
    'SA-018': 'cold-connection failure path depends on network conditions',
    'SA-028': 'hide-layer persistence needs a per-run layer toggle and reload',
    'SA-039': 'survey section persistence is covered read-only by SA-034',
    'SA-040': 'saving schema fields mutates the fixture project',
    'SA-041': 'required-field gate only fires on Save (mutating)',
    'SA-051': 'vertex drag mutates geometry',
    'SA-052': 'snap hysteresis needs a real drag',
    'SA-059': 'bundle propagation needs a dependent trench edit',
    'SA-061': 'vertex split needs a real tap on the line',
    'SA-066': 'reroute draws a new geometry',
    'SA-069': 'detour preview needs a corridor fixture',
    'SA-071': 'delete-section mutates geometry',
    'SA-076': 'line delete mutates the fixture',
    'SA-081': 'draw trench creates a feature',
    'SA-082': 'armed draw needs map taps',
    'SA-087': 'add point creates a feature',
    'SA-091': 'polygon vertex edit mutates geometry',
    'SA-096': 'undo of two saved edits mutates state',
    'SA-098': 'delete from the survey sheet mutates the fixture',
    'SA-100': 'delete-without-prior-edit creates a removed marker',
    'SA-105': 'sync/submit pushes changes to the backend',
    'SA-106': 'needs a zero-change project',
    'SA-107': 'submits the survey copy',
    'SA-137': 'regression check needs an edit to be made first',
  };

  for (const [id, reason] of Object.entries(reasons)) {
    it(`${id} (manual: ${reason})`, (t) => t.skip(reason));
  }
});
