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

export function findNearestVertex(
  coords: [number, number][],
  clickLng: number,
  clickLat: number,
  minDist?: number,
): { idx: number; lng: number; lat: number; dist: number } | null {
  if (coords.length === 0) return null;

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
