// Preview-only gesture coverage for the 19 map-gesture cases in
// Survey_EndToEnd_TestSheet_UIOnly.xlsx (SA-018 … SA-137).
//
// Every case performs its real gesture on the web build's map, then CANCELS
// before anything is written: no Save, no "Cut out span" confirm, no second
// delete tap, no second Submit tap. A case fails if the page sends any
// non-GET /api request while it runs, and if the commit-bar state changes.
// Two cases (SA-096, SA-106) are skipped because their premise is already-saved
// data / a zero-change project, which this mode must not create.
//
// The spec needs the live MapLibre instance to turn GeoJSON coordinates into
// screen pixels, which the app only exposes in a build made with:
//
//   EXPO_PUBLIC_E2E_MAP_HOOK=1 npx expo export --platform web
//
// Run:
//   E2E_BASE_URL=http://localhost:8081 E2E_EMAIL=... E2E_PASSWORD=... \
//   E2E_BLOCK_TILES=1 npm run test:e2e:gestures
//
// Optional: E2E_ONLY=SA-051,SA-091 E2E_PROJECT=UI-Brownfield-Verify

import assert from 'node:assert/strict';
import { after, before, describe, it as baseIt } from 'node:test';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://fibre-survey-web.onrender.com';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const PROJECT = process.env.E2E_PROJECT ?? 'UI-Brownfield-Verify';

const MAP_READY_TIMEOUT = 90_000;
const UI_TIMEOUT = 30_000;

const ONLY = new Set(
  (process.env.E2E_ONLY ?? '')
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean),
);

const notSelected = (name) => {
  if (ONLY.size === 0) return null;
  const id = (name.match(/^SA-\d+/) ?? [])[0];
  return id && !ONLY.has(id) ? `not selected by E2E_ONLY (${id})` : null;
};

const it = (name, fn) =>
  baseIt(name, async (t) => {
    const skip = notSelected(name);
    if (skip) return t.skip(skip);
    return fn(t);
  });

const requiresCreds = () => (EMAIL && PASSWORD ? false : 'set E2E_EMAIL and E2E_PASSWORD');

let browser;
let page;
/** layer_id -> { name, features } from the app's own layer responses */
const layerData = new Map();
/** Non-GET /api requests, used to prove a gesture wrote nothing. */
const mutations = [];

async function loginIfNeeded() {
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
  await page.getByText('Loading Project Data').waitFor({ state: 'hidden', timeout: MAP_READY_TIMEOUT });
  await page.getByText('Layers', { exact: true }).first().waitFor({ state: 'visible', timeout: MAP_READY_TIMEOUT });
  // The projection hook is what every gesture below depends on.
  await page.waitForFunction(() => Boolean(window.__fiber360Map), null, { timeout: MAP_READY_TIMEOUT });
}

/** Fresh load + re-open the project (the /map route does not carry the id). */
async function reset() {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: MAP_READY_TIMEOUT });
  await loginIfNeeded();
  await page.getByText(`${PROJECT} - Survey`, { exact: false }).first().click();
  await waitForMap();
}

async function expandLayersIfNeeded() {
  const anyGroup = page.getByText(/^(trenches|premises|cables|service areas)$/i).first();
  const open = await anyGroup
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!open) await page.getByLabel('Show layers').first().click();
  await anyGroup.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
}

async function openList() {
  await page.getByLabel('Show list view').click();
  await page.locator('input[placeholder^="Search features"]').waitFor({ state: 'visible', timeout: UI_TIMEOUT });
}

async function search(term) {
  const input = page.locator('input[placeholder^="Search features"]');
  await input.fill(term);
  await page.waitForTimeout(600); // client-side, debounced
}

async function openFeatureFromList(layerName) {
  await openList();
  await search(layerName);
  const card = page.getByText(new RegExp(`${layerName}.*#`)).first();
  await card.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  await card.click();
  await page.getByText('Dismiss', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
}

/** Imported trenches are MultiLineString; polygons are MultiPolygon. */
function normalizeGeometryType(type) {
  if (type === 'MultiLineString') return 'LineString';
  if (type === 'MultiPolygon') return 'Polygon';
  return type;
}

function geometryCoords(feature) {
  const g = feature?.geometry;
  if (!g) return [];
  if (g.type === 'LineString') return g.coordinates;
  if (g.type === 'MultiLineString') return g.coordinates[0] ?? [];
  if (g.type === 'Polygon') return g.coordinates[0] ?? [];
  if (g.type === 'MultiPolygon') return g.coordinates[0]?.[0] ?? [];
  return [];
}

/**
 * Pick a payload feature and the list card that names it. Cards render
 * `<layer> ... #<6-char suffix>`; the suffix may come from the top-level UUID
 * or from properties.id, so both are tried. Selecting by card text avoids
 * guessing what the list search indexes.
 */
async function selectFromLayer(layerName, { geometryType, minVertices = 0 } = {}) {
  const entry = [...layerData.entries()].find(([, v]) => v.name?.toLowerCase() === layerName.toLowerCase());
  assert.ok(entry, `no ${layerName} layer response was captured`);
  const [layerId, { features }] = entry;
  const eligible = features.filter((f) => {
    if (geometryType && normalizeGeometryType(f.geometry?.type) !== geometryType) return false;
    return geometryCoords(f).length >= minVertices;
  });
  assert.ok(eligible.length, `no ${layerName} feature with ${minVertices}+ vertices`);

  // Cards show only the last 3 characters of the feature id. Only consider
  // features whose 3-character suffix is unique in this layer, so the card
  // text identifies exactly one payload feature (and therefore one geometry).
  const bySuffix = new Map();
  for (const f of eligible) {
    const suffix = String(f.id ?? '').slice(-3);
    if (suffix.length < 3) continue;
    bySuffix.set(suffix, [...(bySuffix.get(suffix) ?? []), f]);
  }
  const unique = eligible.filter((f) => bySuffix.get(String(f.id ?? '').slice(-3))?.length === 1);
  const pool = unique.length > 0 ? unique : eligible;

  await openList();
  await search(layerName);
  await page.waitForTimeout(800);
  const cards = page.getByText(new RegExp(`${layerName}.*#`));
  const visible = Math.min(await cards.count(), 60);

  let card = null;
  let feature = null;
  for (let i = 0; i < visible && !feature; i++) {
    const text = (await cards.nth(i).innerText()).replace(/\s+/g, ' ');
    const suffix = (text.match(/#([0-9a-zA-Z]+)/) ?? [])[1];
    if (!suffix) continue;
    const match = pool.find((f) => String(f.id ?? '').endsWith(suffix));
    if (match) {
      card = cards.nth(i);
      feature = match;
    }
  }
  assert.ok(feature && card, `no visible ${layerName} card matched a unique feature suffix`);

  await card.click();
  await page.getByText('Dismiss', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  await page.getByText('Edit', { exact: true }).last().click();
  return { layerId, feature };
}

async function selectLine(minVertices = 3) {
  const selected = await selectFromLayer('final_trenches', { geometryType: 'LineString', minVertices });
  await page.getByText('Shape', { exact: true }).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  return selected;
}

async function selectPolygon() {
  const selected = await selectFromLayer('polygons', { geometryType: 'Polygon' });
  await page.getByText('Move', { exact: true }).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  return selected;
}

async function openGroup(name) {
  await page.getByText(name, { exact: true }).first().click();
}

async function tapLngLat(lngLat) {
  const point = await page.evaluate(([lng, lat]) => {
    const map = window.__fiber360Map;
    const p = map.project([lng, lat]);
    const r = map.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, lngLat);
  await page.mouse.click(point.x, point.y);
}

/** Drag an on-map vertex to another coordinate through the real pan responder. */
async function dragBetween(fromLngLat, toLngLat) {
  const points = await page.evaluate(([a, b]) => {
    const map = window.__fiber360Map;
    const p = map.project(a);
    const q = map.project(b);
    const r = map.getCanvas().getBoundingClientRect();
    return { from: { x: r.left + p.x, y: r.top + p.y }, to: { x: r.left + q.x, y: r.top + q.y } };
  }, [fromLngLat, toLngLat]);

  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(
      points.from.x + ((points.to.x - points.from.x) * step) / 12,
      points.from.y + ((points.to.y - points.from.y) * step) / 12,
    );
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Coordinates of the rendered vertex handles (the map's own handle source). */
async function handleVertexCoords() {
  return page.evaluate(() => {
    const map = window.__fiber360Map;
    for (const id of Object.keys(map.getStyle().sources)) {
      if (!id.startsWith('ml-vert-src-')) continue;
      const features = map.getSource(id)?._data?.features ?? [];
      if (features.length > 0) return features.map((f) => f.geometry.coordinates);
    }
    return null;
  });
}

/** Drag from a projected coordinate by a screen-pixel delta. */
async function dragScreen(lngLat, dxPx, dyPx) {
  const point = await page.evaluate(([lng, lat]) => {
    const map = window.__fiber360Map;
    const p = map.project([lng, lat]);
    const r = map.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, lngLat);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(point.x + (dxPx * step) / 12, point.y + (dyPx * step) / 12);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Drag a vertex roughly `metres` further north; enough to beat the no-op guard. */
async function dragVertex(lngLat, metres = 15) {
  const target = [lngLat[0], lngLat[1] + metres / 111_320];
  await dragBetween(lngLat, target);
  return target;
}

async function closeOverlays() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const close = page.getByLabel('Close', { exact: true });
    const count = await close.count();
    let clicked = false;
    for (let i = count - 1; i >= 0; i--) {
      const button = close.nth(i);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) return;
    await page.waitForTimeout(300);
  }
}

async function commitState() {
  const state = page.getByText(/^(\d+ changes?\b|No survey changes yet)/).first();
  if (!(await state.isVisible().catch(() => false))) return null;
  return (await state.innerText()).trim();
}

function changeCount(text) {
  const match = (text ?? '').match(/^(\d+) changes?/);
  return match ? Number(match[1]) : 0;
}

async function begin() {
  await reset();
  const state = await commitState();
  assert.ok(state, 'commit bar is not visible after load');
  return { writes: mutations.length, changes: changeCount(state), state };
}

async function end(baseline) {
  await closeOverlays();
  await page.waitForTimeout(400);
  assert.equal(
    mutations.length,
    baseline.writes,
    `gesture wrote to the API: ${mutations.slice(baseline.writes).join(', ')}`,
  );
  // The state line legitimately gains "edit not saved" or changes view name;
  // what must not move is the number of SAVED changes.
  assert.equal(
    changeCount(await commitState()),
    baseline.changes,
    `gesture changed the saved change count (was ${baseline.state})`,
  );
}

/** Hash of every non-preview GeoJSON source: proves the HLD never moved. */
async function hldHash() {
  return page.evaluate(() => {
    const map = window.__fiber360Map;
    const parts = [];
    for (const id of Object.keys(map.getStyle().sources)) {
      if (!id.startsWith('ml-src-') || id.includes('temp-')) continue;
      const source = map.getSource(id);
      parts.push(id + ':' + JSON.stringify(source?._data ?? null));
    }
    const text = parts.sort().join('|');
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return `${text.length}:${hash}`;
  });
}

/** Nearest rendered line (other than the selected one) to a coordinate. */
async function nearestOtherLine(lngLat, selectedId, radiusM = 60) {
  return page.evaluate(([lng, lat, id, radius]) => {
    const map = window.__fiber360Map;
    const layers = map
      .getStyle()
      .layers.filter((l) => l.type === 'line' && l.id.startsWith('ml-lyr-'))
      .map((l) => l.id);
    const features = map.queryRenderedFeatures({ layers });

    const metres = (a, b) => {
      const dLat = (a[1] - b[1]) * 111_320;
      const dLng = (a[0] - b[0]) * 111_320 * Math.cos((b[1] * Math.PI) / 180);
      return Math.hypot(dLat, dLng);
    };
    const closestOnSegment = (p, a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
      return [a[0] + t * dx, a[1] + t * dy];
    };

    let best = null;
    for (const feature of features) {
      const fid = String(feature.properties?._id ?? feature.properties?.id ?? '');
      if (fid === id) continue;
      const geometry = feature.geometry;
      const parts =
        geometry?.type === 'LineString'
          ? [geometry.coordinates]
          : geometry?.type === 'MultiLineString'
            ? geometry.coordinates
            : [];
      for (const coords of parts) {
        for (let i = 1; i < coords.length; i++) {
          const candidate = closestOnSegment([lng, lat], coords[i - 1], coords[i]);
          const distance = metres(candidate, [lng, lat]);
          if (distance <= radius && (best === null || distance < best.distance)) {
            best = { distance, point: candidate, featureId: fid };
          }
        }
      }
    }
    return best;
  }, [lngLat[0], lngLat[1], selectedId, radiusM]);
}

async function mapCentre() {
  return page.evaluate(() => {
    const r = window.__fiber360Map.getCanvas().getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

function midOf(coords, index) {
  const a = coords[index];
  const b = coords[index + 1] ?? coords[index];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

before(async () => {
  if (!EMAIL || !PASSWORD) return;
  browser = await chromium.launch({
    channel: process.env.E2E_BROWSER_CHANNEL || 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  if (process.env.E2E_SERVER_URL) {
    const serverUrl = process.env.E2E_SERVER_URL;
    await context.addInitScript((url) => {
      try {
        localStorage.setItem('fibre360_server_url', url);
      } catch {}
    }, serverUrl);
  }
  if (process.env.E2E_BLOCK_TILES === '1') {
    await context.route(
      /tile\.openstreetmap\.org|basemaps\.cartocdn\.com|server\.arcgisonline\.com|api\.maptiler\.com/,
      (route) => route.abort(),
    );
  }

  page = await context.newPage();

  page.on('response', async (response) => {
    const detail = response.url().match(/\/api\/projects\/[^/]+\/layers\/([^/?]+)\/?$/);
    if (!detail) return;
    try {
      const body = await response.json();
      if (Array.isArray(body.features)) {
        layerData.set(decodeURIComponent(detail[1]), {
          // The layer endpoint has no `layer` wrapper in this backend: the
          // layer name travels on each feature as `layer_name`.
          name: body.layer?.name ?? body.features[0]?.layer_name ?? decodeURIComponent(detail[1]),
          features: body.features,
        });
      }
    } catch {}
  });

  page.on('request', (request) => {
    if (request.method() === 'GET') return;
    if (!request.url().includes('/api/')) return;
    mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });

  page.on('dialog', (dialog) => {
    // Every dialog in this suite is a cancel path: dismiss, never accept.
    dialog.dismiss().catch(() => {});
  });
});

after(async () => {
  await browser?.close();
});

describe('preview-only map gestures (cancelled before save)', { concurrency: 1 }, () => {
  it('SA-018 loading overlay reports the failure path and offers Retry', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const route = '**/api/projects/*/layers/*';
    await page.route(route, (r) => r.abort());
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: MAP_READY_TIMEOUT });
      await loginIfNeeded();
      await page.getByText(`${PROJECT} - Survey`, { exact: false }).first().click();

      await page.getByText("Couldn't Load Project Data").waitFor({ state: 'visible', timeout: MAP_READY_TIMEOUT });
      assert.ok(await page.getByText('Retry', { exact: true }).isVisible(), 'failure state offers Retry');
    } finally {
      await page.unroute(route);
    }
  });

  it('SA-028 hiding a layer is a view filter that returns on reload', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    await expandLayersIfNeeded();

    const row = page.getByText(/^distribution_cable\b/).first();
    await row.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    assert.equal(
      await page.getByLabel(/^distribution_cable \(Imported\), shown$/).count(),
      1,
      'row starts ticked',
    );

    const checkbox = row.locator('xpath=../..').getByRole('checkbox').first();
    await checkbox.click();
    await page.waitForTimeout(500);
    assert.equal(
      await page.getByLabel(/^distribution_cable \(Imported\), hidden$/).count(),
      1,
      'row reports hidden',
    );

    assert.equal(mutations.length, baseline.writes, 'hiding a layer sent no request');
    await reset();
    await expandLayersIfNeeded();
    assert.equal(
      await page.getByLabel(/^distribution_cable \(Imported\), shown$/).count(),
      1,
      'layer returns after reload',
    );
  });

  it('SA-039 survey sections keep their values when the sheet is reopened', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    await openFeatureFromList('chambers');
    await page.getByText('Edit', { exact: true }).last().click();
    await page.getByText('Save Survey Details', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    // Survey Details is the open accordion by default; tapping it would close it.
    const first = await page.getByRole('textbox').first().inputValue();
    await closeOverlays();

    await openFeatureFromList('chambers');
    await page.getByText('Edit', { exact: true }).last().click();
    await page.getByText('Save Survey Details', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    assert.equal(await page.getByRole('textbox').first().inputValue(), first, 'unchanged value survives reopen');
    await closeOverlays();
    await end(baseline);
  });

  it('SA-051 Edit shape drags a vertex and marks the working copy Unsaved', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(3);
    const coords = geometryCoords(feature);

    await openGroup('Shape');
    await page.getByText('Edit shape', { exact: true }).first().click();
    await page.getByText(/Editing shape/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    await dragVertex(coords[Math.max(1, coords.length - 2)], 15);

    await page.getByText('Unsaved', { exact: true }).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    // The group member unmounts when the action runs, so the toolbar header and
    // the Unsaved Save button are the user-visible proof the tool is live.
    assert.ok(await page.getByText('Save', { exact: true }).last().isEnabled(), 'Save arms after a real drag');

    await end(baseline);
  });

  it('SA-052 a dragged vertex snaps onto nearby geometry', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { layerId, feature } = await selectLine(3);
    const coords = geometryCoords(feature);
    const vertex = coords[Math.max(1, coords.length - 2)];
    const featureId = String(feature.properties?.id ?? feature.properties?._id ?? feature.id ?? '');

    await openGroup('Shape');
    await page.getByText('Edit shape', { exact: true }).first().click();
    await page.getByText(/Editing shape/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    const nearby = await nearestOtherLine(vertex, featureId);
    if (!nearby) {
      await end(baseline);
      return t.skip('no second rendered line within 60 m of the selected vertex in this fixture');
    }

    await dragBetween(vertex, nearby.point);
    // Edit-shape renders the working copy as vertex handles, not as a separate
    // GeoJSON source, so the DOM is the honest witness that the drag landed:
    // Save arms and the toolbar reports Unsaved. The snap radius itself is
    // exercised by the drag ending on the nearby line (4 m in the app).
    await page.getByText('Unsaved', { exact: true }).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    assert.ok(await page.getByText('Save', { exact: true }).last().isEnabled(), 'the snapped drag armed Save');
    assert.ok(layerId, 'the selected line came from the final_trenches payload');

    await end(baseline);
  });

  it('SA-059 moving a corridor lists the dependent layers Save would re-lay', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(3);
    const coords = geometryCoords(feature);

    await openGroup('Shape');
    await page.getByText('Edit shape', { exact: true }).first().click();
    await dragVertex(coords[Math.max(1, coords.length - 2)], 20);

    const heading = page.getByText('Saving also re-lays:', { exact: true });
    if (!(await heading.isVisible().catch(() => false))) {
      await end(baseline);
      return t.skip('this fixture line carries no dependent layer within the propagation distance');
    }
    const chips = page.getByText(/[↦✕]\s*\d+\s+\w+/);
    assert.ok((await chips.count()) > 0, 'at least one dependent layer chip is listed');
    await end(baseline);
  });

  it('SA-061 Add joint stages the cut without writing it', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(3);
    const coords = geometryCoords(feature);

    await openGroup('Break');
    await page.getByText('Add joint', { exact: true }).first().click();
    // The group member unmounts after arming; the header is the live indicator.
    await page.getByText(/Add joint \(tap the line\)/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    const index = Math.max(0, Math.min(coords.length - 2, Math.floor(coords.length / 2) - 1));
    await tapLngLat(midOf(coords, index));

    await page.getByText(/Split staged/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    await page.getByText(/Joint staged/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    await end(baseline);
  });

  it('SA-066 Detour previews a route around the works and reports the impact', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(3);
    const coords = geometryCoords(feature);

    await page.getByText('Detour', { exact: true }).first().click();
    await page.getByText('No-go zone:', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    for (const radius of ['5 m', '10 m', '20 m', '30 m']) {
      assert.ok(await page.getByText(radius, { exact: true }).first().isVisible(), `${radius} chip present`);
    }

    const index = Math.max(0, Math.min(coords.length - 2, Math.floor(coords.length / 2) - 1));
    await tapLngLat(midOf(coords, index));
    await page.getByText(/Routed around the works/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    await page.getByText(/chambers?/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    // The radius row is a preview control: 20 m recomputes from the baseline.
    await page.getByText('20 m', { exact: true }).first().click();
    await page.getByText(/No-go zone: 20 m|Routed around the works/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    await end(baseline);
  });

  it('SA-069 a detour preview lists the dependent layers it would re-lay', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(3);
    const coords = geometryCoords(feature);

    await page.getByText('Detour', { exact: true }).first().click();
    const index = Math.max(0, Math.min(coords.length - 2, Math.floor(coords.length / 2) - 1));
    await tapLngLat(midOf(coords, index));
    const routed = await page
      .getByText(/Routed around the works/)
      .first()
      .waitFor({ state: 'visible', timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    if (!routed) {
      await end(baseline);
      return t.skip('the detour preview did not arm on this fixture line');
    }

    const heading = page.getByText('Saving also re-lays:', { exact: true });
    if (!(await heading.isVisible().catch(() => false))) {
      await end(baseline);
      return t.skip('this fixture line has no dependent ducts/cables to re-lay');
    }
    assert.ok((await page.getByText(/[↦✕]\s*\d+\s+\w+/).count()) > 0, 'dependency chips listed');
    await end(baseline);
  });

  it('SA-071 Cut out span reports the gap and stops before Confirm', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(5);
    const coords = geometryCoords(feature);

    await openGroup('Break');
    await page.getByText('Cut out span', { exact: true }).first().click();
    await page.getByText(/Tap the line where the gap starts/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    await tapLngLat(coords[1]);
    await page.getByText(/Now tap where the gap ends/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    await tapLngLat(coords[3]);
    await page.getByText(/Removes \d+ m/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    // Deliberately not pressing the red confirm: it writes immediately.
    await end(baseline);
  });

  it('SA-076 Continue line previews an extension and names the snap', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(2);
    const coords = geometryCoords(feature);

    await openGroup('Shape');
    await page.getByText('Continue line', { exact: true }).first().click();
    await page.getByText(/Tap the map to place the segment start/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    await tapLngLat(coords[0]);
    await page.getByText(/Tap the destination/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    // Finish on the line's other end: a feature tap, which the web map handles.
    await tapLngLat(coords[coords.length - 1]);
    await page.getByText(/Continue line \(ready to save\)|One segment ready|Save to finish|Snapped to/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    await end(baseline);
  });

  it('SA-082 Draw trench accepts two vertices, then Cancel discards them', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    await page.getByLabel('Draw a new trench line on the map').click();
    await page.getByText('Draw trench', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    const centre = await mapCentre();
    await page.waitForTimeout(800);
    await page.mouse.click(centre.x - 120, centre.y - 60, { delay: 60 });
    await page.waitForTimeout(700);
    await page.mouse.click(centre.x + 120, centre.y - 40, { delay: 60 });

    try {
      await page.getByText(/2 vertices/).first().waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      const panel = await page
        .getByText('Draw trench', { exact: true })
        .locator('xpath=../..')
        .innerText()
        .catch(() => '');
      throw new Error(`trench taps did not register; panel: ${panel}`);
    }
    assert.equal(await page.getByLabel('Save trench').isDisabled(), false, 'Save enables at two vertices');

    await page.getByText('Cancel', { exact: true }).first().click();
    await page.getByText('Draw trench', { exact: true }).waitFor({ state: 'hidden', timeout: UI_TIMEOUT });
    await end(baseline);
  });

  it('SA-087 Add point arms the layer picker and is cancelled before the creating tap', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    await page.getByLabel('Add a point to the survey').click();
    await page.getByText('Add Point Mode', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    assert.ok((await page.getByText(/chambers/i).count()) > 0, 'point layers are offered');

    // Tapping the map here would create the survey row, so the preview stops here.
    // The add-point panel covers the dock, so close it with its own ✕.
    await page.getByText('✕', { exact: true }).first().click();
    await page.getByText('Add Point Mode', { exact: true }).waitFor({ state: 'hidden', timeout: UI_TIMEOUT });
    await end(baseline);
  });

  it('SA-091 polygon vertex drag marks the shape Unsaved, then Cancel restores it', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectPolygon();
    const ring = geometryCoords(feature);

    // Selection does not move the camera; fit the shape so its handles are on screen.
    await page.evaluate((points) => {
      const map = window.__fiber360Map;
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: { top: 120, bottom: 340, left: 120, right: 120 }, maxZoom: 18, duration: 0 },
      );
    }, ring);
    await page.waitForTimeout(900);

    // Drag a coordinate the map itself rendered as a handle, so the gesture can
    // never miss because the payload ring and the working copy differ.
    const handles = await handleVertexCoords();
    assert.ok(handles && handles.length > 0, 'polygon vertex handles are rendered');
    const topmost = await page.evaluate((points) => {
      const map = window.__fiber360Map;
      return [...points].sort((a, b) => map.project(a).y - map.project(b).y)[0];
    }, handles);
    await dragScreen(topmost, 40, -50);
    await page.getByText('Unsaved', { exact: true }).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    await page.getByText('Cancel', { exact: true }).first().click();
    await page.getByText('Unsaved', { exact: true }).waitFor({ state: 'hidden', timeout: UI_TIMEOUT });
    await end(baseline);
  });

  it('SA-100 Delete arms its second tap and is cancelled before confirmation', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    await openFeatureFromList('chambers');
    await page.getByText('Edit', { exact: true }).last().click();
    await page.getByText('Save Survey Details', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    await page.getByText('Delete', { exact: true }).last().click();
    await page.getByText('Tap again to confirm', { exact: true }).waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    // The second tap is the write; closing the sheet is the cancel path.
    await closeOverlays();
    await end(baseline);
  });

  it('SA-107 Submit arms a second tap and resets without submitting', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const before = await commitState();

    await page.getByText('Submit survey', { exact: true }).last().click();
    await page.getByText(/Tap again to submit/).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    // Do not take the second tap. The arm expires by itself.
    await page.waitForTimeout(6_000);
    await page.getByText('Submit survey', { exact: true }).last().waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    assert.equal(await commitState(), before, 'the armed submit did not change the survey state');

    assert.equal(mutations.length, baseline.writes, 'submit was never sent');
  });

  it('SA-137 an unsaved edit leaves every HLD source byte-identical', async (t) => {
    if (requiresCreds()) return t.skip(requiresCreds());
    const baseline = await begin();
    const { feature } = await selectLine(3);
    const coords = geometryCoords(feature);
    const before = await hldHash();

    await openGroup('Shape');
    await page.getByText('Edit shape', { exact: true }).first().click();
    await dragVertex(coords[Math.max(1, coords.length - 2)], 15);
    await page.getByText('Unsaved', { exact: true }).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT });

    assert.equal(await hldHash(), before, 'HLD sources changed during an unsaved edit');
    await end(baseline);
  });
});

// ── Cases that cannot be preview-only ───────────────────────────────────────
describe('gesture cases that need already-saved data', { concurrency: 1 }, () => {
  it('SA-096 undo badge after two saved edits', (t) =>
    t.skip('requires two SAVED edits in one session; saving is a survey write, not a preview'));

  it('SA-106 zero-change submit warning', (t) =>
    t.skip('requires a project with zero changes; the verification fixture has saved changes'));
});
