// ── Spatial Calculations Utility ──────────────────────────────────────────
// Uses Turf.js for distance and length calculations.
// Automatically recalculates dependent properties when point features are dragged:
//   • Premise moved → update distance_to_pdp to nearest PDP
//   • PDP moved → update distance_to_pdp for ALL premises
//   • Trench/Duct/Cable moved → update length_m

import turfDistance from '@turf/distance';
import turfLength from '@turf/length';
import type { GeoJSONFeature } from './types';

// ── Recalculation entry point ─────────────────────────────────────────────

export interface DragRecalcResult {
  /** The updated GeoJSON map with all recalculated properties */
  geojson: Record<string, GeoJSONFeature[]>;
  /** Human-readable summary of changes for console/logging */
  changes: string[];
}

/**
 * After a point feature is dragged to new coordinates, recalculate
 * all dependent properties across the entire GeoJSON dataset.
 *
 * @param movedLayerId  - The layer ID of the moved feature (may include 'imp-' prefix)
 * @param allGeojson    - The current full GeoJSON map (keyed by layer ID)
 * @param updatedLayerFeatures - The moved layer's features, already updated with new coords
 * @returns Updated GeoJSON map + list of change descriptions
 */
export function recalculateDependentProperties(
  movedLayerId: string,
  allGeojson: Record<string, GeoJSONFeature[]>,
  updatedLayerFeatures: GeoJSONFeature[],
): DragRecalcResult {
  const changes: string[] = [];

  // Start with the existing GeoJSON, replacing the moved layer
  const result: Record<string, GeoJSONFeature[]> = { ...allGeojson };
  result[movedLayerId] = updatedLayerFeatures;

  const cleanLayerId = movedLayerId.startsWith('imp-') ? movedLayerId.slice(4) : movedLayerId;

  if (cleanLayerId === 'objects') {
    // ── Premise moved: recalculate its own distance_to_pdp ───────────
    const pdps = extractAllPDPs(result);
    result[movedLayerId] = updatedLayerFeatures.map((f) => {
      if (f.geometry?.type !== 'Point') return f;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const nearest = findNearest(lng, lat, pdps);
      const distM = nearest ? Math.round(nearest.distanceM) : null;
      changes.push(
        `Premise: distance_to_pdp = ${distM !== null ? distM + 'm' : 'N/A (no PDPs)'}`,
      );
      return {
        ...f,
        properties: { ...(f.properties ?? {}), distance_to_pdp: distM },
      };
    });

    // Also recalculate distance_to_pdp on premises in the paired layer
    // (e.g. if 'objects' changed, also update 'imp-objects' and vice-versa)
    recalcPairedLayer(result, movedLayerId, pdps, 'objects', changes);
  } else if (cleanLayerId === 'pdps') {
    // ── PDP moved: recalculate distance_to_pdp for ALL premises ─────
    const pdps = extractAllPDPs(result);
    for (const [layerKey, features] of Object.entries(result)) {
      const cleanKey = layerKey.startsWith('imp-') ? layerKey.slice(4) : layerKey;
      if (cleanKey !== 'objects') continue;
      result[layerKey] = features.map((f) => {
        if (f.geometry?.type !== 'Point') return f;
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const nearest = findNearest(lng, lat, pdps);
        const distM = nearest ? Math.round(nearest.distanceM) : null;
        return {
          ...f,
          properties: { ...(f.properties ?? {}), distance_to_pdp: distM },
        };
      });
    }
    changes.push(`PDP moved: recalculated distance_to_pdp for all premises`);
  } else if (
    cleanLayerId === 'trenches' ||
    cleanLayerId === 'ducts' ||
    cleanLayerId === 'cables' ||
    cleanLayerId.includes('trench') ||
    cleanLayerId.includes('duct') ||
    cleanLayerId.includes('cable')
  ) {
    // ── Line feature moved: recalculate length_m ────────────────────
    result[movedLayerId] = updatedLayerFeatures.map((f) => {
      if (
        f.geometry?.type !== 'LineString' &&
        f.geometry?.type !== 'MultiLineString'
      ) {
        return f;
      }
      try {
        const len = turfLength(f as any, { units: 'meters' });
        const rounded = Math.round(len);
        changes.push(`${f.properties?.name ?? 'Line'}: length_m = ${rounded}m`);
        return {
          ...f,
          properties: { ...(f.properties ?? {}), length_m: rounded },
        };
      } catch {
        return f;
      }
    });
  }

  return { geojson: result, changes };
}

// ── Internal helpers ──────────────────────────────────────────────────────

interface PDPInfo {
  lng: number;
  lat: number;
}

interface NearestResult {
  distanceM: number;
  index: number;
}

/** Extract all PDP coordinates from the GeoJSON map (both demo and imported) */
function extractAllPDPs(geojson: Record<string, GeoJSONFeature[]>): PDPInfo[] {
  const pdps: PDPInfo[] = [];
  for (const [key, features] of Object.entries(geojson)) {
    const cleanKey = key.startsWith('imp-') ? key.slice(4) : key;
    if (cleanKey !== 'pdps') continue;
    for (const f of features) {
      if (f.geometry?.type === 'Point') {
        const [lng, lat] = f.geometry.coordinates as [number, number];
        pdps.push({ lng, lat });
      }
    }
  }
  return pdps;
}

/** Find the nearest PDP to a given point using Turf.js Haversine distance */
function findNearest(
  lng: number,
  lat: number,
  pdps: PDPInfo[],
): NearestResult | null {
  if (pdps.length === 0) return null;

  let bestDist = Infinity;
  let bestIdx = -1;

  for (let i = 0; i < pdps.length; i++) {
    const d = turfDistance([lng, lat], [pdps[i].lng, pdps[i].lat], {
      units: 'meters',
    });
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  return { distanceM: bestDist, index: bestIdx };
}

/**
 * When a layer has been updated (e.g. 'objects'), also update its paired
 * layer (e.g. 'imp-objects') and vice-versa so the distance_to_pdp stays
 * consistent across both demo and imported premises.
 */
function recalcPairedLayer(
  result: Record<string, GeoJSONFeature[]>,
  movedLayerId: string,
  pdps: PDPInfo[],
  targetLayerId: string,
  changes: string[],
): void {
  const isImported = movedLayerId.startsWith('imp-');
  const pairedKey = isImported
    ? targetLayerId // if 'imp-objects' moved, update 'objects'
    : `imp-${targetLayerId}`; // if 'objects' moved, update 'imp-objects'

  const pairedFeatures = result[pairedKey];
  if (!pairedFeatures) return;

  result[pairedKey] = pairedFeatures.map((f) => {
    if (f.geometry?.type !== 'Point') return f;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const nearest = findNearest(lng, lat, pdps);
    const distM = nearest ? Math.round(nearest.distanceM) : null;
    return {
      ...f,
      properties: { ...(f.properties ?? {}), distance_to_pdp: distM },
    };
  });

  changes.push(
    `Premises (paired layer "${pairedKey}"): recalculated distance_to_pdp`,
  );
}
