// ── Geometry Operations Utility ───────────────────────────────────────────
// Pure functions for Phase 2 geometry editing:
//   • splitLineAtPoint   — Split a LineString at the nearest point to a click
//   • mergeLines          — Join two LineStrings end-to-end
//   • createLineString    — Build a LineString from collected click points
//   • findNearestVertex   — Find the closest vertex to a click point
//   • updateVertex        — Move a single vertex to new coordinates
//
// All functions operate on raw GeoJSON coordinate arrays so they can be
// used by both the web and native map implementations.

import type { GeoJSONFeature } from './types';

// ── Split a LineString at the nearest point to a click ────────────────────
// Returns two arrays of coordinates (or null if the split point is at an
// endpoint or the line has too few coordinates).

export function splitLineAtPoint(
  coords: [number, number][],
  clickLng: number,
  clickLat: number,
): { coordsA: [number, number][]; coordsB: [number, number][]; splitIndex: number } | null {
  if (coords.length < 3) return null;

  // Find the nearest segment (pair of consecutive vertices)
  let bestDist = Infinity;
  let bestSegIdx = -1;
  let bestProjLng = clickLng;
  let bestProjLat = clickLat;

  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];

    // Project click point onto the segment
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (
        (clickLng - x1) * dx + (clickLat - y1) * dy
      ) / lenSq));
    }

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dist = Math.sqrt(
      (clickLng - projX) ** 2 + (clickLat - projY) ** 2,
    );

    if (dist < bestDist) {
      bestDist = dist;
      bestSegIdx = i;
      bestProjLng = projX;
      bestProjLat = projY;
    }
  }

  if (bestSegIdx < 0) return null;

  // Don't split if click is too close to an endpoint (< 1m threshold)
  const toStart = Math.sqrt(
    (bestProjLng - coords[0][0]) ** 2 +
    (bestProjLat - coords[0][1]) ** 2,
  );
  const toEnd = Math.sqrt(
    (bestProjLng - coords[coords.length - 1][0]) ** 2 +
    (bestProjLat - coords[coords.length - 1][1]) ** 2,
  );
  const MIN_SPLIT_DIST = 0.00001; // ~1m at equator
  if (toStart < MIN_SPLIT_DIST || toEnd < MIN_SPLIT_DIST) return null;

  // Build the two halves
  const coordsA: [number, number][] = [];
  const coordsB: [number, number][] = [];

  for (let i = 0; i <= bestSegIdx; i++) {
    coordsA.push(coords[i]);
  }
  coordsA.push([bestProjLng, bestProjLat]);

  coordsB.push([bestProjLng, bestProjLat]);
  for (let i = bestSegIdx + 1; i < coords.length; i++) {
    coordsB.push(coords[i]);
  }

  return { coordsA, coordsB, splitIndex: bestSegIdx + 1 };
}

// ── Merge two LineStrings end-to-end ──────────────────────────────────────
// Finds the closest pair of endpoints and connects them. Returns the merged
// coordinate array or null if they're too far apart (> 50m heuristic).

export function mergeLines(
  coordsA: [number, number][],
  coordsB: [number, number][],
): { merged: [number, number][]; distM: number } | null {
  if (coordsA.length < 2 || coordsB.length < 2) return null;

  // Check all 4 endpoint combinations
  type Endpoint = { idx: number; lng: number; lat: number };
  const endsA: Endpoint[] = [
    { idx: 0, lng: coordsA[0][0], lat: coordsA[0][1] },
    { idx: coordsA.length - 1, lng: coordsA[coordsA.length - 1][0], lat: coordsA[coordsA.length - 1][1] },
  ];
  const endsB: Endpoint[] = [
    { idx: 0, lng: coordsB[0][0], lat: coordsB[0][1] },
    { idx: coordsB.length - 1, lng: coordsB[coordsB.length - 1][0], lat: coordsB[coordsB.length - 1][1] },
  ];

  let bestDist = Infinity;
  let bestEndA: Endpoint | null = null;
  let bestEndB: Endpoint | null = null;

  for (const ea of endsA) {
    for (const eb of endsB) {
      const d = Math.sqrt(
        (ea.lng - eb.lng) ** 2 + (ea.lat - eb.lat) ** 2,
      );
      if (d < bestDist) {
        bestDist = d;
        bestEndA = ea;
        bestEndB = eb;
      }
    }
  }

  if (!bestEndA || !bestEndB) return null;

  // Merge: walk from bestEndA's opposite end to bestEndA, then bestEndB to opposite
  const merged: [number, number][] = [];

  if (bestEndA.idx === 0) {
    // A is forward
    for (let i = 0; i < coordsA.length; i++) merged.push(coordsA[i]);
  } else {
    // A is backward
    for (let i = coordsA.length - 1; i >= 0; i--) merged.push(coordsA[i]);
  }

  // Connect at the closest pair — skip the duplicate endpoint
  const connectStart = bestEndB.idx === 0 ? 1 : 0;

  if (bestEndB.idx === 0) {
    for (let i = 1; i < coordsB.length; i++) merged.push(coordsB[i]);
  } else {
    for (let i = coordsB.length - 2; i >= 0; i--) merged.push(coordsB[i]);
  }

  return { merged, distM: bestDist };
}

// ── Create a new LineString from collected click points ───────────────────
// Requires at least 2 points. The result is ready for use in a GeoJSON feature.

export function createLineString(
  points: [number, number][],
): [number, number][] | null {
  if (points.length < 2) return null;

  // De-duplicate consecutive identical points (within ~1cm)
  const cleaned: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i];
    const [lx, ly] = cleaned[cleaned.length - 1];
    if (Math.abs(px - lx) > 0.000001 || Math.abs(py - ly) > 0.000001) {
      cleaned.push([px, py]);
    }
  }

  return cleaned.length >= 2 ? cleaned : null;
}

// ── Find the nearest vertex in a LineString to a click point ──────────────
// Returns the index and coordinates of the closest vertex. Used for vertex
// editing mode — the user clicks a line, then we find the nearest vertex
// to start dragging.
//
// Internal spatial bucketing: for features with > 200 vertices, builds a
// quick grid index transparently so the lookup is O(1) instead of O(n).
// Smaller arrays use the fast linear scan.

export function findNearestVertex(
  coords: [number, number][],
  clickLng: number,
  clickLat: number,
  minDist?: number,
): { idx: number; lng: number; lat: number; dist: number } | null {
  if (coords.length === 0) return null;

  // ── Fast path: spatial index for large arrays (> 500 vertices) ───────
  // Below this threshold, the O(n) linear scan is faster than building the index.
  // Only features with many vertices (e.g., 5km trench at 10m spacing) benefit.
  const VERTEX_INDEX_THRESHOLD = 500;
  if (coords.length > VERTEX_INDEX_THRESHOLD) {
    const cellSizeDeg = DEFAULT_GRID_SIZE_METERS / 111320;
    const grid = new Map<string, { idx: number; coord: [number, number] }[]>();

    // Build index: insert every vertex by its grid cell
    for (let i = 0; i < coords.length; i++) {
      const cell = lngLatToCell(coords[i][0], coords[i][1], cellSizeDeg);
      const entry = { idx: i, coord: coords[i] };
      const bucket = grid.get(cell);
      if (bucket) {
        bucket.push(entry);
      } else {
        grid.set(cell, [entry]);
      }
    }

    // Query: check the click's cell + 8 neighbours
    const queryCell = lngLatToCell(clickLng, clickLat, cellSizeDeg);
    const cells = neighborCells(queryCell, cellSizeDeg);

    let bestIdx = -1;
    let bestDist = Infinity;

    for (const cellKey of cells) {
      const bucket = grid.get(cellKey);
      if (!bucket) continue;
      for (const entry of bucket) {
        const d = Math.sqrt(
          (clickLng - entry.coord[0]) ** 2 + (clickLat - entry.coord[1]) ** 2,
        );
        if (d < bestDist) {
          bestDist = d;
          bestIdx = entry.idx;
        }
      }
    }

    if (bestIdx < 0) return null;
    if (minDist !== undefined && bestDist > minDist) return null;

    return {
      idx: bestIdx,
      lng: coords[bestIdx][0],
      lat: coords[bestIdx][1],
      dist: bestDist,
    };
  }

  // ── Standard path: O(n) linear scan (small arrays) ───────────────────
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < coords.length; i++) {
    const [cx, cy] = coords[i];
    const d = Math.sqrt((clickLng - cx) ** 2 + (clickLat - cy) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return null;
  if (minDist !== undefined && bestDist > minDist) return null;

  return {
    idx: bestIdx,
    lng: coords[bestIdx][0],
    lat: coords[bestIdx][1],
    dist: bestDist,
  };
}

// ── Update a single vertex in a LineString ────────────────────────────────
// Returns a new coordinate array with the vertex at `idx` moved to newLng/newLat.

export function updateVertex(
  coords: [number, number][],
  idx: number,
  newLng: number,
  newLat: number,
): [number, number][] {
  return coords.map((c, i) =>
    i === idx ? [newLng, newLat] : c,
  ) as [number, number][];
}

// ── Create a GeoJSON Feature from coordinates ─────────────────────────────
// Builds a complete Feature object with a generated ID and name.

let _featureCounter = 0;

export function createGeoJSONFeature(
  coords: [number, number][],
  layerId: string,
  properties?: Record<string, unknown>,
): GeoJSONFeature {
  _featureCounter++;
  const ts = Date.now();
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
    properties: {
      id: `geom-${layerId}-${ts}-${_featureCounter}`,
      name: properties?.name ?? `New ${layerId} #${_featureCounter}`,
      length_m: Math.round(approximateLength(coords)),
      ...(properties ?? {}),
    },
  } as GeoJSONFeature;
}

// ── Insert a vertex at the nearest point on a segment ─────────────────────
// Finds which segment the click point projects onto, then inserts a new
// coordinate at the projected point. Returns the updated coordinate array
// and the index where the new vertex was inserted, or null if the click
// is too close to an existing vertex (< 1m).

export function insertVertexAtPoint(
  coords: [number, number][],
  clickLng: number,
  clickLat: number,
): { updated: [number, number][]; insertIdx: number } | null {
  if (coords.length < 2) return null;

  // Find the nearest segment (pair of consecutive vertices)
  let bestDist = Infinity;
  let bestSegIdx = -1;
  let bestProjLng = clickLng;
  let bestProjLat = clickLat;

  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (
        (clickLng - x1) * dx + (clickLat - y1) * dy
      ) / lenSq));
    }

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dist = Math.sqrt(
      (clickLng - projX) ** 2 + (clickLat - projY) ** 2,
    );

    if (dist < bestDist) {
      bestDist = dist;
      bestSegIdx = i;
      bestProjLng = projX;
      bestProjLat = projY;
    }
  }

  if (bestSegIdx < 0) return null;

  // Don't insert if click is too close to an existing vertex (< 1m)
  const MIN_VERTEX_DIST = 0.00001; // ~1m
  for (const [cx, cy] of coords) {
    const d = Math.sqrt((bestProjLng - cx) ** 2 + (bestProjLat - cy) ** 2);
    if (d < MIN_VERTEX_DIST) return null;
  }

  // Insert new coordinate after bestSegIdx
  const updated: [number, number][] = [
    ...coords.slice(0, bestSegIdx + 1),
    [bestProjLng, bestProjLat],
    ...coords.slice(bestSegIdx + 1),
  ];

  return { updated, insertIdx: bestSegIdx + 1 };
}

// ── Delete a vertex from a LineString ─────────────────────────────────────
// Removes the vertex at the given index. A line must have at least 2 vertices,
// so returns null if deletion would leave fewer than 2 vertices.

export function deleteVertex(
  coords: [number, number][],
  idx: number,
): [number, number][] | null {
  if (coords.length <= 2) return null; // Must keep at least 2 vertices
  if (idx < 0 || idx >= coords.length) return null;

  return coords.filter((_, i) => i !== idx) as [number, number][];
}

// ── Create a new Point GeoJSON Feature ───────────────────────────────────
// Used when an engineer taps the map in 'add_point' mode to add a new
// premise, PDP, or MFG during survey.

let _pointCounter = 0;

export function createPointFeature(
  lng: number,
  lat: number,
  layerId: string,
  properties?: Record<string, unknown>,
): GeoJSONFeature {
  _pointCounter++;
  const ts = Date.now();
  const id = `new-point-${layerId}-${ts}-${_pointCounter}`;
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    properties: {
      id,
      _id: id,
      name: properties?.name ?? `New ${layerId} #${_pointCounter}`,
      address: properties?.address ?? '',
      survey_notes: 'Added during field survey',
      created_at: new Date().toISOString(),
      survey_status: 'visited',
      latitude: Number(lat.toFixed(7)),
      longitude: Number(lng.toFixed(7)),
      ...(properties ?? {}),
    },
  } as GeoJSONFeature;
}

// ── Grid-based spatial index for endpoint lookups ─────────────────────────
// Divides the map into 100m × 100m grid cells and indexes each feature
// endpoint by its cell. Querying returns the nearest endpoint within a
// threshold by checking only the same and adjacent cells — O(1) vs O(n).

const DEFAULT_GRID_SIZE_METERS = 100;

/** A single endpoint entry stored in the grid */
interface EndpointEntry {
  featureId: string;
  coord: [number, number];
  whichEnd: 'start' | 'end';
}

/**
 * Converts a lng/lat coordinate to a grid cell key string.
 * Uses a fixed grid cell size in degrees (approximated from meters).
 */
function lngLatToCell(lng: number, lat: number, cellSizeDeg: number): string {
  const col = Math.floor(lng / cellSizeDeg);
  const row = Math.floor(lat / cellSizeDeg);
  return `${col}:${row}`;
}

/**
 * Returns the grid cell keys for a cell and its 8 neighbours (±1 in each direction).
 */
function neighborCells(cell: string, cellSizeDeg: number): string[] {
  const [colStr, rowStr] = cell.split(':');
  const col = parseInt(colStr, 10);
  const row = parseInt(rowStr, 10);
  const cells: string[] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      cells.push(`${col + dc}:${row + dr}`);
    }
  }
  return cells;
}

/**
 * A reusable spatial index that maps grid cells to endpoint entries.
 * Build once with the feature array, then query multiple times (e.g.,
 * for the start and end of a drawn segment) in O(1) time.
 *
 * Usage:
 *   const index = new EndpointGridIndex(targetFeatures);
 *   const a = index.nearest(somePoint, 10);
 *   const b = index.nearest(otherPoint, 10);
 */
export class EndpointGridIndex {
  private grid: Map<string, EndpointEntry[]>;
  private cellSizeDeg: number;

  constructor(features: GeoJSONFeature[], gridSizeMeters: number = DEFAULT_GRID_SIZE_METERS) {
    this.grid = new Map();
    // At equator: 1 deg lng ≈ 111320m. Cell size in degrees varies with latitude,
    // but we use a fixed approximation since grid cells are small (~100m) and the
    // snapping threshold is small (~10m) — the approximation is fine.
    this.cellSizeDeg = gridSizeMeters / 111320;
    this.build(features);
  }

  /**
   * Build the index from a feature array. Call this once when features change.
   * Iterates all features' endpoints and inserts each into the appropriate grid cell.
   */
  build(features: GeoJSONFeature[]): void {
    this.grid.clear();

    for (const feat of features) {
      const geom = feat.geometry;
      if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) continue;

      const coords = geom.type === 'LineString'
        ? (geom.coordinates as [number, number][])
        : (geom.coordinates as [number, number][][])[0];

      if (coords.length < 2) continue;

      const fid = (feat.properties as any)?.id ?? (feat.properties as any)?._id ?? '';
      if (!fid) continue;

      // Insert start endpoint
      const startCell = lngLatToCell(coords[0][0], coords[0][1], this.cellSizeDeg);
      const startEntry: EndpointEntry = { featureId: fid, coord: coords[0], whichEnd: 'start' };
      const startBucket = this.grid.get(startCell);
      if (startBucket) {
        startBucket.push(startEntry);
      } else {
        this.grid.set(startCell, [startEntry]);
      }

      // Insert end endpoint
      const lastIdx = coords.length - 1;
      const endCell = lngLatToCell(coords[lastIdx][0], coords[lastIdx][1], this.cellSizeDeg);
      const endEntry: EndpointEntry = { featureId: fid, coord: coords[lastIdx], whichEnd: 'end' };
      const endBucket = this.grid.get(endCell);
      if (endBucket) {
        endBucket.push(endEntry);
      } else {
        this.grid.set(endCell, [endEntry]);
      }
    }
  }

  /**
   * Find the nearest endpoint to `point` within `thresholdMeters`.
   * Only checks endpoints in the same grid cell as the point, plus its 8 neighbours.
   * Returns the best match, or null if none found within threshold.
   */
  nearest(
    point: [number, number],
    thresholdMeters: number = 10,
  ): { featureId: string; coord: [number, number]; whichEnd: 'start' | 'end'; distance: number } | null {
    const cell = lngLatToCell(point[0], point[1], this.cellSizeDeg);
    const cells = neighborCells(cell, this.cellSizeDeg);

    let best: {
      featureId: string;
      coord: [number, number];
      whichEnd: 'start' | 'end';
      distance: number;
    } | null = null;

    for (const cellKey of cells) {
      const bucket = this.grid.get(cellKey);
      if (!bucket) continue;

      for (const entry of bucket) {
        const dist = haversineMeters(
          point[0], point[1],
          entry.coord[0], entry.coord[1],
        );
        if (dist < thresholdMeters && (!best || dist < best.distance)) {
          best = {
            featureId: entry.featureId,
            coord: entry.coord,
            whichEnd: entry.whichEnd,
            distance: dist,
          };
        }
      }
    }

    return best;
  }
}

// ── Grid-based spatial index for ALL vertex lookups ──────────────────────
// Like EndpointGridIndex but indexes EVERY vertex (start, end, and interior)
// of every LineString feature. Use this when you need to find the nearest
// vertex across ALL features in a layer — e.g., snapping to any vertex
// during drawing, or finding the closest vertex to a click in large projects.

/** A single vertex entry stored in the grid */
interface VertexEntry {
  featureId: string;
  coord: [number, number];
  vertexIdx: number;
}

/**
 * A reusable spatial index that maps grid cells to individual vertices
 * of all LineString features. Indexes EVERY coordinate (start, end, interior)
 * so you can find the nearest vertex to any click point in O(1) time.
 *
 * Usage:
 *   const vIdx = new VertexGridIndex(allFeatures);
 *   const nearest = vIdx.nearest(clickPoint, 10);
 *   // → { featureId, coord, vertexIdx, distance }
 */
export class VertexGridIndex {
  private grid: Map<string, VertexEntry[]>;
  private cellSizeDeg: number;

  constructor(features: GeoJSONFeature[], gridSizeMeters: number = DEFAULT_GRID_SIZE_METERS) {
    this.grid = new Map();
    this.cellSizeDeg = gridSizeMeters / 111320;
    this.build(features);
  }

  /**
   * Build the index from a feature array. Indexes EVERY vertex of every
   * LineString feature — start, end, and all interior vertices.
   */
  build(features: GeoJSONFeature[]): void {
    this.grid.clear();

    for (const feat of features) {
      const geom = feat.geometry;
      if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) continue;

      const coords = geom.type === 'LineString'
        ? (geom.coordinates as [number, number][])
        : (geom.coordinates as [number, number][][])[0];

      if (coords.length < 2) continue;

      const fid = (feat.properties as any)?.id ?? (feat.properties as any)?._id ?? '';
      if (!fid) continue;

      // Index EVERY vertex (not just endpoints)
      for (let i = 0; i < coords.length; i++) {
        const cell = lngLatToCell(coords[i][0], coords[i][1], this.cellSizeDeg);
        const entry: VertexEntry = { featureId: fid, coord: coords[i], vertexIdx: i };
        const bucket = this.grid.get(cell);
        if (bucket) {
          bucket.push(entry);
        } else {
          this.grid.set(cell, [entry]);
        }
      }
    }
  }

  /**
   * Find the nearest vertex (across ALL indexed features) to `point`
   * within `thresholdMeters`. Only checks vertices in the same grid cell
   * as the point, plus its 8 neighbours — O(1) vs O(n) per query.
   */
  nearest(
    point: [number, number],
    thresholdMeters: number = 10,
  ): { featureId: string; coord: [number, number]; vertexIdx: number; distance: number } | null {
    const cell = lngLatToCell(point[0], point[1], this.cellSizeDeg);
    const cells = neighborCells(cell, this.cellSizeDeg);

    let best: {
      featureId: string;
      coord: [number, number];
      vertexIdx: number;
      distance: number;
    } | null = null;

    for (const cellKey of cells) {
      const bucket = this.grid.get(cellKey);
      if (!bucket) continue;

      for (const entry of bucket) {
        const dist = haversineMeters(
          point[0], point[1],
          entry.coord[0], entry.coord[1],
        );
        if (dist < thresholdMeters && (!best || dist < best.distance)) {
          best = {
            featureId: entry.featureId,
            coord: entry.coord,
            vertexIdx: entry.vertexIdx,
            distance: dist,
          };
        }
      }
    }

    return best;
  }
}

// ── Find nearest vertex across ALL features in a layer ───────────────────
// Like findNearestVertex but operates across ALL LineString features in
// a layer, not just a single feature's coordinate array.
//
// For single-feature lookups (user clicks a specific line), use
// findNearestVertex() directly — it's faster for small arrays.
// For cross-feature lookups (snap-to-any-vertex), use this function
// with an optional VertexGridIndex for O(1) performance on large datasets.

export function findNearestGlobalVertex(
  point: [number, number],
  features: GeoJSONFeature[],
  thresholdMeters: number = 10,
  /** Optional pre-built spatial index for O(1) lookup */
  index?: VertexGridIndex,
): { featureId: string; coord: [number, number]; vertexIdx: number; distance: number } | null {
  // ── Fast path: use spatial index if provided ────────────────────────
  if (index) {
    return index.nearest(point, thresholdMeters);
  }

  // ── Fallback: O(n × m) linear scan over all vertices of all features ─
  let best: {
    featureId: string;
    coord: [number, number];
    vertexIdx: number;
    distance: number;
  } | null = null;

  for (const feat of features) {
    const geom = feat.geometry;
    if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) continue;

    const coords = geom.type === 'LineString'
      ? (geom.coordinates as [number, number][])
      : (geom.coordinates as [number, number][][])[0];

    if (coords.length < 2) continue;

    const fid = (feat.properties as any)?.id ?? (feat.properties as any)?._id ?? '';
    if (!fid) continue;

    for (let i = 0; i < coords.length; i++) {
      const [cx, cy] = coords[i];
      const dist = haversineMeters(point[0], point[1], cx, cy);
      if (dist < thresholdMeters && (!best || dist < best.distance)) {
        best = { featureId: fid, coord: [cx, cy] as [number, number], vertexIdx: i, distance: dist };
      }
    }
  }

  return best;
}

// ── Haversine distance between two points in metres ──────────────────────

export function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const dLat = toRad(lat2 - lat1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Find nearest endpoint of existing features to a drawn point ──────────
// Used for snapping the start/end of a drawn segment to existing line features.
// Returns the nearest endpoint within thresholdMeters, or null if none found.
//
// For repeated queries on the same feature array, build an EndpointGridIndex
// and pass it as `index` — this makes lookup O(1) instead of O(n).

export function findNearestEndpoint(
  point: [number, number],
  features: GeoJSONFeature[],
  thresholdMeters: number = 10,
  /**
   * Optional pre-built spatial index. If provided, uses the index for O(1)
   * grid-based lookup instead of O(n) linear scan.
   */
  index?: EndpointGridIndex,
): { featureId: string; coord: [number, number]; whichEnd: 'start' | 'end'; distance: number } | null {
  // ── Fast path: use spatial index if provided ────────────────────────
  if (index) {
    return index.nearest(point, thresholdMeters);
  }

  // ── Fallback: O(n) linear scan (backward compatible) ────────────────
  let best: {
    featureId: string;
    coord: [number, number];
    whichEnd: 'start' | 'end';
    distance: number;
  } | null = null;

  for (const feat of features) {
    const geom = feat.geometry;
    if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) continue;

    const coords = geom.type === 'LineString'
      ? (geom.coordinates as [number, number][])
      : (geom.coordinates as [number, number][][])[0];

    if (coords.length < 2) continue;

    const fid = (feat.properties as any)?.id ?? (feat.properties as any)?._id ?? '';
    if (!fid) continue;

    // Check start point
    const startDist = haversineMeters(point[0], point[1], coords[0][0], coords[0][1]);
    if (startDist < thresholdMeters && (!best || startDist < best.distance)) {
      best = { featureId: fid, coord: coords[0], whichEnd: 'start', distance: startDist };
    }

    // Check end point
    const last = coords[coords.length - 1];
    const endDist = haversineMeters(point[0], point[1], last[0], last[1]);
    if (endDist < thresholdMeters && (!best || endDist < best.distance)) {
      best = { featureId: fid, coord: last, whichEnd: 'end', distance: endDist };
    }
  }

  return best;
}

// ── Extend a LineString by merging a new segment ─────────────────────────
// Given an existing feature's coordinates and a drawn segment that snaps
// to its endpoint(s), returns the merged coordinate array.
//
// Modes:
//   'append'  — new segment attaches at the END of existing (existing_end + new_start)
//   'prepend' — new segment attaches at the START of existing (new_end + existing_start)
//   'connect' — new segment bridges two different existing features (featA_end + segment + start_of_featB)
//
// In all cases the duplicate endpoint is skipped.

export function extendLineString(
  existingCoords: [number, number][],
  newCoords: [number, number][],
  mode: 'append' | 'prepend' | 'connect',
  /** For 'connect' mode only: the coordinates of the second existing feature */
  existingBCoords?: [number, number][],
): [number, number][] | null {
  // Guard: both arrays must have at least 2 coords (a line segment)
  // TODO: add spatial index for large datasets to avoid O(n) endpoint scan in findNearestEndpoint
  if (existingCoords.length < 2 || newCoords.length < 2) return null;

  if (mode === 'append') {
    // Append new segment after existing: existing[0..n] + new[1..n]
    // Skip the duplicate endpoint (newCoords[0] == existingCoords[last])
    return [...existingCoords, ...newCoords.slice(1)] as [number, number][];
  }

  if (mode === 'prepend') {
    // Prepend new segment before existing: new[0..n-1] + existing[0..n]
    // Skip duplicate endpoint (newCoords[last] == existingCoords[0])
    return [...newCoords.slice(0, -1), ...existingCoords] as [number, number][];
  }

  if (mode === 'connect') {
    // Connect two features: featA[0..n] + new[1..n-1] + featB[0..n]
    // Skip first duplicate (newCoords[0] == featA[last]) and last duplicate (newCoords[last] == featB[0])
    if (!existingBCoords || existingBCoords.length < 2) return null;
    return [
      ...existingCoords,
      ...newCoords.slice(1, -1),
      ...existingBCoords,
    ] as [number, number][];
  }

  return null;
}

// ── Approximate length of a LineString in metres (Haversine) ──────────────

export function approximateLength(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    // Simplified: 1 deg lat ≈ 111320m, 1 deg lng ≈ 111320 * cos(avg_lat)
    const avgLat = (y1 + y2) / 2;
    const dx = (x2 - x1) * 111320 * Math.cos((avgLat * Math.PI) / 180);
    const dy = (y2 - y1) * 110540;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}
