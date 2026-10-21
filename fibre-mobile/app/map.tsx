import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore } from '../lib/stores/theme';
import { useMapStore } from '../lib/stores/map';
import { useProjectStore } from '../lib/stores/project';
import { useSurveyStore } from '../lib/stores/survey';
import { useSurveyFeaturesStore, SURVEY_COLOR } from '../lib/stores/survey-features';
import { useOfflineStore } from '../lib/stores/offline';
import { recalculateDependentProperties } from '../lib/utils/spatial';
import { getLayerSchema } from '../lib/stores/layer-schemas';
import { gradeGpsAccuracy } from '../lib/utils/gps-quality';
import { summarizeCommit } from '../lib/utils/commit';
import { normalizeLayerId } from '../lib/utils/layer-ids';
import { insertVertexAtPoint, deleteVertex, splitLineAtPoint, createLineString, findNearestLineCorner, extendLineToPoint, haversineMeters, approximateLength, cutVertexIndexAtPoint, countVerticesBetween, planSpanRemoval } from '../lib/utils/geometry-operations';
import { planObstacleDetour, metersPerDegLng } from '../lib/utils/obstacle-reroute';
// Geometry operation utilities removed — all edits now route through survey-features store
import GeometryEditor from '../lib/components/GeometryEditor';
import type { GeometryMode, EditingFeature } from '../lib/components/GeometryEditor';
import LineSelectionToolbar from '../lib/components/LineSelectionToolbar';
import DrawTrenchPanel from '../lib/components/DrawTrenchPanel';
import type { TrenchLayerOption } from '../lib/components/DrawTrenchPanel';
import PolygonToolbar from '../lib/components/PolygonToolbar';
import SurveyChangesPanel from '../lib/components/SurveyChangesPanel';
import CommitBar from '../lib/components/CommitBar';
import SurveyForm from '../lib/components/SurveyForm';
import type { SurveyFormData } from '../lib/components/SurveyForm';
import { Card, Badge } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Toast } from '../components/ui/Toast';
import MapLibreMap, { BASEMAPS } from '../lib/components/MapLibreMap';
import { buildLayerGroups, DEFAULT_LAYER_GROUPS } from '../lib/components/MapLegend';
// ── Field-console chrome (phone UI) ──────────────────────────────────────
// One header, one dock, one rail, one sheet family. See lib/theme/chrome.ts.
import MapHeader from '../lib/components/map/MapHeader';
import MapDock from '../lib/components/map/MapDock';
import MapRail from '../lib/components/map/MapRail';
import ViewModeSwitch, { type ViewMode } from '../lib/components/map/ViewModeSwitch';
import ToolsSheet from '../lib/components/map/ToolsSheet';
import LayersSheet from '../lib/components/map/LayersSheet';
import BasemapSheet from '../lib/components/map/BasemapSheet';
import {
  boundsOfFeatures,
  expandBounds,
  geometryBounds,
  needsReframe,
  FRAME_PADDING,
  SELECTION_PADDING,
  MIN_REGION_SPAN_M,
  type Bounds,
} from '../lib/utils/autozoom';
import MapFeaturePopup from '../lib/components/MapFeaturePopup';
import * as Location from 'expo-location';
import type { MapLayerData, BasemapStyle } from '../lib/components/MapLibreMap';
import type { GeoJSONFeature, SurveyFeatureData } from '../lib/utils/types';
import { Spacing, Radius, Touch, Type } from '../lib/theme/colors';
import { chromeColors } from '../lib/theme/chrome';
import X from 'lucide-react-native/icons/x';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import List from 'lucide-react-native/icons/list';
import Search from 'lucide-react-native/icons/search';
import Move from 'lucide-react-native/icons/move';
import Satellite from 'lucide-react-native/icons/satellite';
import Layers from 'lucide-react-native/icons/layers';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';

// ── Layer config ──────────────────────────────────────────────────────────
const LAYER_COLORS: Record<string, string> = {
  objects: '#3B82F6',          // Blue
  polygons: '#8B5CF6',         // Violet
  pdps: '#10B981',             // Emerald
  trenches: '#F59E0B',         // Amber
  mfg: '#22D3EE',              // Sky
  mfg_service_areas: '#0EA5E9', // Sky 500 — the cabinet's catchment
  ducts: '#06B6D4',            // Cyan
  cables: '#EF4444',           // Red
  feeder_cable: '#EC4899',     // Pink
  distribution_cable: '#F97316', // Orange
  feeder_ducts: '#84CC16',     // Lime
  distribution_ducts: '#14B8A6', // Teal
  feeder_trench: '#6366F1',    // Indigo
  distribution_trench: '#D946EF', // Fuchsia
  garden_trench: '#8B5CF6',    // Violet
  final_trenches: '#E11D48',   // Rose
};

const LAYER_NAMES: Record<string, string> = {
  objects: 'PREMISES',
  polygons: 'SERVICE AREAS',
  pdps: 'PDP',
  trenches: 'TRENCH',
  mfg: 'MFG',
  mfg_service_areas: 'MFG SERVICE AREA',
  ducts: 'DUCT',
  cables: 'CABLE',
  feeder_cable: 'FEEDER CABLE',
  distribution_cable: 'DISTRIBUTION CABLE',
  feeder_ducts: 'FEEDER DUCTS',
  distribution_ducts: 'DISTRIBUTION DUCTS',
  feeder_trench: 'FEEDER TRENCH',
  distribution_trench: 'DISTRIBUTION TRENCH',
  garden_trench: 'GARDEN TRENCH',
  final_trenches: 'FINAL TRENCHES',
};

// Distinct colors for imported features
// One colour per layer, looked up through normalizeLayerId — see
// lib/utils/layer-ids.ts. Keys are written in lower snake case; the lookup
// normalises both sides, so the package's `Distribution_Trench` gets the entry
// this table keeps for `distribution_trench` instead of falling through to
// IMPORT_FALLBACK_COLOR. Measured 2026-10-14 on project `24cd3573…`: with an
// exact-match lookup only 8 of 23 layers matched and **15 were painted the same
// fallback colour**, which is what made the map unreadable.
const IMPORT_COLORS: Record<string, string> = {
  objects: '#EF4444',                // Red
  polygons: '#D946EF',               // Fuchsia
  pdps: '#F97316',                   // Orange
  trenches: '#14B8A6',               // Teal
  mfg: '#0284C7',                    // Sky Blue
  mfg_service_areas: '#0369A1',      // Sky 700 — darker than the cabinet point
  ducts: '#0891B2',                  // Cyan
  cables: '#E11D48',                 // Rose
  feeder_cable: '#DB2777',           // Pink
  distribution_cable: '#EA580C',     // Dark Orange
  feeder_ducts: '#65A30D',           // Lime
  distribution_ducts: '#0D9488',     // Dark Teal
  feeder_trench: '#4F46E5',          // Indigo
  distribution_trench: '#C026D3',    // Purple
  // Dark green, not the fuchsia this table used to hold: `polygons` (Service
  // Areas) is also #D946EF, and a garden trench drawn in the same colour as the
  // translucent service-area fill over it is the one collision left once the
  // fallback above is gone. The fill keeps its colour — it is context, and this
  // is a layer the engineer is here to look at.
  garden_trench: '#166534',          // Dark Green
  final_trenches: '#BE123C',         // Dark Rose
  // Ducts — the section from the chamber to the premises.
  drop_ducts: '#22D3EE',             // Light Cyan
  // Aerial: the legs a run decided NOT to excavate. Amber is the colour the
  // admin UI already paints these with, kept consistent here; the three are
  // shades of it so "this leg is not being dug" reads at a glance.
  aerial_cable: '#F59E0B',           // Amber
  aerial_spans: '#FBBF24',           // Light Amber
  aerial_drops: '#B45309',           // Dark Amber
  // Nodes and structures. Violet, so a point's layer is still separable from
  // the trench/duct/cable it sits on.
  chambers: '#7C3AED',               // Violet
  coupleurs: '#A78BFA',              // Light Violet
  trench_nodes: '#4C1D95',           // Dark Violet
  // Premises variants — green, against the red of `objects`.
  served_premises: '#22C55E',        // Green
  pseudo_hh: '#059669',              // Emerald
  // Existing plant, which is context rather than design: greys.
  existing_infrastructure: '#64748B',        // Slate
  existing_infrastructure_points: '#94A3B8', // Light Slate
  // Where the route crosses something — brown, distinct from every trench.
  tangent_crossings: '#78350F',      // Brown
};

/** Colour for a layer id this table does not know. */
const IMPORT_FALLBACK_COLOR = '#FF6B6B';

const IMPORT_ID_PREFIX = 'imp-';

// Basemaps are a matter of appearance, so the switcher shows the appearance: a
// colour chip per basemap instead of an emoji that renders differently on every
// device and says nothing to a screen reader.
const BASEMAP_SWATCH: Record<string, string> = {
  streets: '#DCE3EC',
  satellite: '#2F4F3A',
  light: '#F1F3F6',
};

// ── Bundle reroute propagation (the whole corridor moves together) ────────
// Rerouting ANY line layer in the survey means that route has a problem
// (constricted area, etc.) — the whole corridor follows: the feeder,
// distribution and garden/drop sections plus the duct/cable riding on them
// all move to the NEW path in the SAME survey change, so the approved
// dataset carries the entire bundle and the LLD never re-creates the old
// path. Only the moved REGION is re-laid; shared endpoints and parts on
// other (unmoved) lines stay exactly where they are. "Editing the layers
// altogether."
const BUNDLE_LINE_LAYERS = [
  'final_trenches',
  'feeder_ducts',
  'feeder_cable',
  'distribution_ducts',
  'distribution_cable',
  'drop_ducts',
  'trenches',
  'ducts',
  'cables',
];

/** Equirectangular distance in meters (accurate enough at ~meter scale). */
function distM(a: [number, number], b: [number, number]): number {
  const mLng = 111320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dLng = (b[0] - a[0]) * mLng;
  const dLat = (b[1] - a[1]) * 110540;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}

/** Distance from point p to segment [a, b], in meters. */
function nearestPointOnLine(path: [number, number][], p: [number, number]): [number, number] {
  let best: [number, number] = path[0] ?? p;
  let bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const denom = dx * dx + dy * dy;
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denom));
    const q: [number, number] = [a[0] + t * dx, a[1] + t * dy];
    const d = distM(p, q);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

function pointSegDistM(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const seg2 = dx * dx + dy * dy;
  let t = seg2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / seg2;
  t = Math.max(0, Math.min(1, t));
  return distM(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Nearest point on a polyline path to p; returns the point + distance in meters. */
function nearestOnPathM(
  p: [number, number],
  path: [number, number][],
): { pt: [number, number]; d: number } {
  let best: [number, number] = p;
  let bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const seg2 = dx * dx + dy * dy;
    let t = seg2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / seg2;
    t = Math.max(0, Math.min(1, t));
    const q: [number, number] = [a[0] + t * dx, a[1] + t * dy];
    const d = distM(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return { pt: best, d: bestD };
}

/**
 * Re-lay a dependent line onto the rerouted support line, REGION-ONLY:
 * vertices riding on the moved region of the old path are snapped onto the
 * new path; vertices outside it (shared endpoints, parts on other lines)
 * stay exactly where they are. Returns null when nothing moved.
 */
function relayDependentCoords(
  depCoords: [number, number][],
  oldPath: [number, number][],
  newPath: [number, number][],
  tolM: number,
): [number, number][] | null {
  // 1. Old-path segments the new path no longer covers = the moved region.
  const movedSegs: Array<[[number, number], [number, number]]> = [];
  for (let i = 0; i < oldPath.length - 1; i++) {
    const a = oldPath[i];
    const b = oldPath[i + 1];
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (nearestOnPathM(mid, newPath).d > tolM) movedSegs.push([a, b]);
  }
  if (movedSegs.length === 0) return null;

  // 2. Snap vertices riding on the moved region onto the new path.
  const out = depCoords.map((p) => {
    const onMoved = movedSegs.some(([a, b]) => pointSegDistM(p, a, b) <= tolM);
    return onMoved ? nearestOnPathM(p, newPath).pt : p;
  });

  // 3. Nothing actually changed → report null (no upsert).
  const changed = out.some((p, i) => distM(p, depCoords[i]) > 1e-6);
  return changed ? out : null;
}

/**
 * Apply the region relay to a dependent feature geometry (LineString or
 * MultiLineString). Returns the new geometry or null when nothing moved.
 */
function relayFeatureGeom(
  geom: { type: string; coordinates: unknown } | null | undefined,
  oldPath: [number, number][],
  newPath: [number, number][],
  tolM: number,
): { type: string; coordinates: unknown } | null {
  if (!geom) return null;
  if (geom.type === 'LineString') {
    const out = relayDependentCoords(geom.coordinates as [number, number][], oldPath, newPath, tolM);
    return out ? { type: 'LineString', coordinates: out } : null;
  }
  if (geom.type === 'MultiLineString') {
    let changed = false;
    const lines = (geom.coordinates as [number, number][][]).map((line) => {
      const out = relayDependentCoords(line, oldPath, newPath, tolM);
      if (out) {
        changed = true;
        return out;
      }
      return line;
    });
    return changed ? { type: 'MultiLineString', coordinates: lines } : null;
  }
  return null;
}

/** Clean a map layer id (imp-/survey- prefixes) to the raw survey layer key. */
function cleanLayerId(layerId: string): string {
  return layerId.replace(/^imp-/, '').replace(/^survey-/, '').replace(/^temp-preview-/, '').replace(/^ml-/, '');
}

// ── Bundle reroute PLAN (what Save is about to do) ────────────────────────
// Rerouting a support line silently relays every corridor layer riding the
// moved region — a big consequence the engineer only discovered in the LLD.
// This plan is computed BEFORE Save from the same candidates and the same
// co-location tolerance the propagation uses, so the toolbar can say
// "this also moves 3 feeder_ducts, 2 feeder_cable" and let each layer be
// opted out, without the two ever disagreeing.
type BundlePlanItem = { hldId: string | null; sfId: string | null; label: string; create: boolean };
type BundlePlanGroup = { layerId: string; layerName: string; mapKey: string; items: BundlePlanItem[] };

function planBundleReroute(
  activeGeojson: Record<string, GeoJSONFeature[]>,
  surveyFeatures: Record<string, SurveyFeatureData[]>,
  supportLayerId: string,
  oldPath: [number, number][],
  newPath: [number, number][],
  tolM = 8,
): BundlePlanGroup[] {
  const cleanLayer = cleanLayerId(supportLayerId);
  const groups: BundlePlanGroup[] = [];
  for (const depLayer of BUNDLE_LINE_LAYERS) {
    if (depLayer === cleanLayer) continue;
    const depMapKey = `${IMPORT_ID_PREFIX}${depLayer}`;
    const hldFeats = activeGeojson[depMapKey] ?? [];
    const surveySfs = surveyFeatures[depMapKey] ?? [];
    const items: BundlePlanItem[] = [];
    const seenHld = new Set<string>();

    for (const f of hldFeats) {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const hldId = String(props.id ?? props._id ?? props.feature_id ?? '');
      if (!hldId) continue;
      const geom = f.geometry as { type: string; coordinates: unknown } | null;
      if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) continue;
      if (!relayFeatureGeom(geom, oldPath, newPath, tolM)) continue;
      const existingSf = surveySfs.find(
        (s) => s.original_hld_feature === hldId && s.survey_status !== 'removed',
      );
      seenHld.add(hldId);
      items.push({
        hldId,
        sfId: existingSf?.id ?? null,
        label: `#${hldId.slice(-6)}`,
        create: !existingSf,
      });
    }

    for (const sf of surveySfs) {
      if (sf.survey_status === 'removed') continue;
      const sGeom = sf.survey_geometry as { type?: string; coordinates?: unknown } | null;
      if (!sGeom || (sGeom.type !== 'LineString' && sGeom.type !== 'MultiLineString')) continue;
      if (sf.original_hld_feature && seenHld.has(sf.original_hld_feature)) continue;
      if (!relayFeatureGeom(sGeom as { type: string; coordinates: unknown }, oldPath, newPath, tolM)) continue;
      items.push({
        hldId: sf.original_hld_feature,
        sfId: sf.id,
        label: `#${sf.id.slice(-6)}`,
        create: false,
      });
    }

    if (items.length > 0) {
      groups.push({
        layerId: depLayer,
        layerName: LAYER_NAMES[depLayer] ?? depLayer.toUpperCase(),
        mapKey: depMapKey,
        items,
      });
    }
  }
  return groups;
}

// ── Extract all [lng, lat] pairs from any GeoJSON geometry ───────────────-
function extractCoords(geom: { type: string; coordinates: unknown }): [number, number][] {
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates as [number, number];
    return [[lng, lat]];
  }
  if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
    return geom.coordinates as [number, number][];
  }
  if (geom.type === 'MultiLineString' || geom.type === 'Polygon') {
    const rings = geom.coordinates as [number, number][][];
    return rings.flat();
  }
  if (geom.type === 'MultiPolygon') {
    const polygons = geom.coordinates as [number, number][][][];
    return polygons.flat(2);
  }
  return [];
}

// ── Build map layers from GeoJSON features ────────────────────────────────
function detectGeoType(features: GeoJSONFeature[]): 'Point' | 'LineString' | 'Polygon' {
  for (const f of features) {
    const t = f.geometry?.type;
    if (t === 'MultiLineString' || t === 'LineString') return 'LineString';
    if (t === 'MultiPolygon' || t === 'Polygon') return 'Polygon';
    if (t === 'MultiPoint') return 'Point';
  }
  return 'Point';
}

/**
 * Where a layer's geometry belongs in the map's z-order.
 *
 * Lower is drawn first (further back). Edit layers — survey copies and the live
 * previews — are always on top: they are what the engineer is being asked to
 * look at, and they are the only thing on screen that is not the HLD.
 */
function drawRank(layer: MapLayerData): number {
  if (layer.id.startsWith('survey-') || layer.id.startsWith('temp-preview-')) return 3;
  const geom = layer.geometryType ?? detectGeoType(layer.features);
  if (geom === 'Polygon') return 0;  // service areas — context, underneath
  if (geom === 'Point') return 1;    // premises, nodes, couplers
  return 2;                          // trenches, ducts, cables on top
}

/**
 * Order layers the way they should be painted, first layer at the back.
 *
 * The array's order *is* the z-order: the map adds each layer in turn, so the
 * last one added paints on top. That array used to arrive in the API's order,
 * which is sorted by layer name — so the premises/node circles and the
 * service-area fill landed after the trench, duct and cable lines. On project
 * `24cd3573…` (2026-10-14) that drew ~1,200 circles and 31 polygons over a
 * 1,269-feature network, which is why the network could not be read on the map
 * even though every layer was loaded.
 *
 * `Array.prototype.sort` is stable, so layers of equal rank keep the order the
 * API returned them in.
 */
export function orderLayersForDrawing(layers: MapLayerData[]): MapLayerData[] {
  return [...layers].sort((a, b) => drawRank(a) - drawRank(b));
}

function buildMapLayerData(
  geojsonData: Record<string, GeoJSONFeature[]>,
  layerVisibility: Record<string, boolean>,
  layerNames: Record<string, string> = LAYER_NAMES,
  /** Map of layerId → array of feature IDs (in order matching GeoJSON) */
  featureIdMap?: Record<string, string[]>,
  /** Map of layerId → color overrides */
  layerColors?: Record<string, string>
): MapLayerData[] {
  return Object.entries(geojsonData).map(([id, features]) => {
    const color = layerColors?.[id] ?? LAYER_COLORS[id] ?? '#6B7280';
    const idList = featureIdMap?.[id];
    const geomType = detectGeoType(features);
    return {
      id,
      name: layerNames[id] ?? id.toUpperCase(),
      geometryType: geomType,
      features: features.map((f, i) => {
        // ── Inject coordinate properties for popup display ────────
        // These stay in sync when features are dragged or vertices moved
        const extraProps: Record<string, unknown> = {};
        const geom = f.geometry;
        if (geom?.type === 'Point') {
          const [lng, lat] = geom.coordinates as [number, number];
          extraProps.latitude = Number(lat.toFixed(7));
          extraProps.longitude = Number(lng.toFixed(7));
        } else if (geom?.type === 'LineString') {
          const coords = geom.coordinates as [number, number][];
          extraProps.vertex_count = coords.length;
          if (coords.length > 0) {
            extraProps.start_lat = Number(coords[0][1].toFixed(7));
            extraProps.start_lng = Number(coords[0][0].toFixed(7));
            extraProps.end_lat = Number(coords[coords.length - 1][1].toFixed(7));
            extraProps.end_lng = Number(coords[coords.length - 1][0].toFixed(7));
          }
        } else if (geom?.type === 'Polygon') {
          const rings = geom.coordinates as [number, number][][];
          const outer = rings[0];
          extraProps.vertex_count = outer?.length ?? 0;
          if (outer?.length) {
            // Approximate centroid for display
            const avgLng = outer.reduce((s, c) => s + c[0], 0) / outer.length;
            const avgLat = outer.reduce((s, c) => s + c[1], 0) / outer.length;
            extraProps.latitude = Number(avgLat.toFixed(7));
            extraProps.longitude = Number(avgLng.toFixed(7));
          }
        }

        return {
          ...f,
          properties: {
            ...f.properties,
            ...extraProps,  // Live geometry coords OVERRIDE any stale HLD properties
            id: (f.properties?.id as string | undefined) ?? idList?.[i] ?? `${id}-${i}`,
            _id: (f.properties?.id as string | undefined) ?? idList?.[i] ?? `${id}-${i}`,  // Alias for MapLibreMap click handlers
            _layer_name: layerNames[id] ?? id.toUpperCase(),
            _layer_id: id,  // Layer ID for MapLibreMap click handlers
          },
        };
      }),
      visible: layerVisibility[id] !== false,
      color,
    };
  });
}

// ── Snap-to-object: find the nearest point feature within a radius ─────────
// Used by the Draw Segment tool so the final vertex of a drawn path lands
// EXACTLY on a nearby object/pdp/mfg point (e.g. a newly created premise),
// making the connection readable by LLD automation.
function findNearestSnapPoint(
  layers: MapLayerData[],
  lng: number,
  lat: number,
  radiusM = 15
): {
  id: string;
  layerId: string;
  name: string;
  lng: number;
  lat: number;
  properties: Record<string, unknown>;
} | null {
  let best: {
    id: string;
    layerId: string;
    name: string;
    lng: number;
    lat: number;
    properties: Record<string, unknown>;
  } | null = null;
  let bestDist = radiusM;

  for (const layer of layers) {
    if (layer.id.startsWith('temp-preview-')) continue;
    for (const feat of layer.features) {
      if (feat.geometry?.type !== 'Point') continue;
      const [flng, flat] = feat.geometry.coordinates as [number, number];
      const props = feat.properties ?? {};
      const fid = String(props._id ?? props.id ?? '');
      if (!fid) continue;
      const avgLat = (lat + flat) / 2;
      const dx = (lng - flng) * 111320 * Math.cos((avgLat * Math.PI) / 180);
      const dy = (lat - flat) * 110540;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          id: fid,
          layerId: layer.id,
          name: layer.name,
          lng: flng,
          lat: flat,
          properties: props as Record<string, unknown>,
        };
      }
    }
  }
  return best;
}

// ── Resolve geometry type from layer ID ────────────────────────────────────
function resolveGeometryType(layerId: string): string {
  const normalized = layerId
    .replace(/^survey-/, '')
    .replace(/^imp-/, '')
    .replace(/^temp-preview-/, '')
    .replace(/^ml-/, '');

  if (normalized === 'trenches' || normalized === 'ducts' || normalized === 'cables'
    || normalized.includes('trench') || normalized.includes('duct') || normalized.includes('cable')) {
    return 'LineString';
  }
  if (normalized === 'polygons' || normalized.includes('polygon') || normalized.includes('service_area') || normalized.includes('zone') || normalized.includes('area')) return 'Polygon';
  return 'Point';
}

// ── Map Screen ────────────────────────────────────────────────────────────
export default function MapScreen() {
  const colors = useThemeStore((s) => s.colors);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolvedTheme);
  const {
    layers: storeLayers,
    selectedFeaturePopup,
    userLocation,
    followUser,
    selectFeature,
    setFollowUser,
    setUserLocation,
  } = useMapStore();
  const { projects } = useProjectStore();
  const { recordPointMove } = useSurveyStore();
  const {
    surveyFeatures,
    isLoaded: surveyFeaturesLoaded,
    displayMode,
    setDisplayMode,
    focusFeatureId,
    setFocusFeature,
    isolateFeatureId,
    setIsolateFeature,
    fetchSurveyFeatures,
    clearSurveyFeatures,
    upsertSurveyFeature,
    updateSurveyFeature,
    deleteSurveyFeature,
    getSurveyFeatureForHld,
  } = useSurveyFeaturesStore();

  // ── Save feedback: toasts for every survey save (success / failure / no-op) ──
  // Release builds strip console.log, so the Toast is the ONLY way the
  // engineer can see whether a reroute save reached the server. Without it,
  // a dead API connection silently swallows saves and reroutes "do nothing".
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('info');
  const showToast = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // ── GPS: track the device's real location ─────────────────────────────
  // Requests foreground permission on mount, reads the current fix, then
  // keeps watching so the blue dot + crosshair FAB stay accurate.
  useEffect(() => {
    let watchSub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? null,
        });
        watchSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
          (p) => {
            if (!cancelled) {
              setUserLocation({
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracyM: p.coords.accuracy ?? null,
            });
            }
          },
        );
      } catch (e) {
        console.warn('[GPS] Location unavailable:', e);
      }
    })();

    return () => {
      cancelled = true;
      watchSub?.remove();
    };
  }, [setUserLocation]);

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [layerFeaturePanel, setLayerFeaturePanel] = useState<{ visible: boolean; layerId: string | null; layerName: string; featureCount: number }>({ visible: false, layerId: null, layerName: '', featureCount: 0 });
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [selectedMapFeatureId, setSelectedMapFeatureId] = useState<string | null>(null);
  const [activeBasemap, setActiveBasemap] = useState<string>('streets');
  // ── Chrome sheets ────────────────────────────────────────────────────
  // One sheet open at a time. The survey-changes panel keeps its own boolean
  // because it is a full review surface, not a chooser.
  const [activeSheet, setActiveSheet] = useState<'tools' | 'layers' | 'basemap' | null>(null);
  // ── Camera / auto-zoom ──────────────────────────────────────────────
  // `fitRequest` asks the map to frame a region; `zoomRequest` is the rail's
  // +/-. `cameraView` is the last settled zoom/centre, used to decide whether
  // a re-frame is worth the motion.
  const [fitRequest, setFitRequest] = useState<{
    bounds: [number, number, number, number];
    padding: { top: number; right: number; bottom: number; left: number };
    ts: number;
  } | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ delta: number; ts: number } | null>(null);
  const [cameraView, setCameraView] = useState<{ zoom: number; center: { lng: number; lat: number } } | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const [featureNotes, setFeatureNotes] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState('');
  const [popupScreenCoords, setPopupScreenCoords] = useState<{ x: number; y: number } | null>(null);
  // ── Overlapping features at the last tap ─────────────────────────────────
  // A premise/PDP point sitting on a trench means one tap hits several
  // features. The stack (point-first, then top-most) lets the popup offer a
  // "cycle" chip so the object point is reachable without zooming in.
  const [tapStack, setTapStack] = useState<{ featureId: string; layerId: string; geometryType: string }[]>([]);
  const [tapStackLngLat, setTapStackLngLat] = useState<[number, number] | null>(null);
  const [tapStackScreenPt, setTapStackScreenPt] = useState<{ x: number; y: number } | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragMode, setDragMode] = useState(false);
  // Fly-to-user request — bumped each time the crosshair FAB is pressed
  const [flyToUserTarget, setFlyToUserTarget] = useState<{ lng: number; lat: number; zoom: number; ts: number } | null>(null);

  // ── HLD/Survey Display Mode ──────────────────────────────────────────────
  // 'hld' = blue only (original HLD), 'survey' = orange only (engineer edits),
  // 'overlay' = both HLD + Survey visible simultaneously
  // displayMode is managed by useSurveyFeaturesStore (declared above)

  // ── Isolation hard-lock: entering review isolation disables all editing ──
  // The planner sees a read-only view — no drag mode, no geometry tools, so
  // the dimmed original HLD (and the survey feature) can never be modified.
  useEffect(() => {
    if (isolateFeatureId) {
      setDragMode(false);
      setGeoMode('select');
    }
  }, [isolateFeatureId]);

  // ── Geometry Editor State (simplified: select, add_point, delete_feature only) ──
  // ── Geometry Editor State (simplified: select, add_point only) ──
  const [geoMode, setGeoMode] = useState<GeometryMode>('select');
  const [geomBusy, setGeomBusy] = useState(false);

  // ── Editing mode state (viewing → editing flow) ──────────────────────
  const [editingFeature, setEditingFeature] = useState<EditingFeature | null>(null);

  // ── Line Feature Selection state — shows the bottom toolbar when a line is tapped ──
  // Only one feature can be selected at a time. Toolbar disappears when deselected.
  const [selectedLineFeature, setSelectedLineFeature] = useState<EditingFeature | null>(null);
  const [selectedPolygonFeature, setSelectedPolygonFeature] = useState<EditingFeature | null>(null);
  const [polygonMoveMode, setPolygonMoveMode] = useState(false);
  const [polygonEditCoords, setPolygonEditCoords] = useState<[number, number][] | null>(null);
  const [polygonEditOriginal, setPolygonEditOriginal] = useState<[number, number][] | null>(null);
  // Original geometry/attributes captured from the RENDERED layer at edit-start.
  // Used by handlePolygonSave as a fallback when the raw-store lookup fails
  // (imported polygons whose rendered _id differs from raw properties.id).
  const [polygonEditOrigGeom, setPolygonEditOrigGeom] = useState<Record<string, unknown> | null>(null);
  const [polygonEditOrigAttrs, setPolygonEditOrigAttrs] = useState<Record<string, unknown> | null>(null);

  // ── Line Move Mode state ──
  // When active, vertex handles are displayed for the selected line.
  // tempLineCoords holds the working copy of coordinates — HLD is never touched.
  // The user must press Save to persist changes to the survey-features store.
  const [lineMoveMode, setLineMoveMode] = useState(false);
  const [tempLineCoords, setTempLineCoords] = useState<[number, number][] | null>(null);
  const [tempLineOriginal, setTempLineOriginal] = useState<[number, number][] | null>(null);

  // ── Delete Section state ──────────────────────────────────────────────
  const [lineToolMode, setLineToolMode] = useState<
    'delete-section' | 'continue-line' | 'split-here' | 'route-around' | null
  >(null);

  // ── Route around works (roadworks / closure / permit stop-work zone) ─────
  const [obstacleCentre, setObstacleCentre] = useState<{ lng: number; lat: number } | null>(null);
  const [obstacleRadiusM, setObstacleRadiusM] = useState(10);
  const [detourImpactLabel, setDetourImpactLabel] = useState<string | null>(null);

  // ── Draw trench state (polyline CREATE tool) ───────────────────────────
  // The design can be missing a trench entirely; this places a brand new
  // survey LineString with a 2-tap minimum instead of editing a designed one.
  const [drawTrenchActive, setDrawTrenchActive] = useState(false);
  const [drawTrenchPoints, setDrawTrenchPoints] = useState<[number, number][]>([]);
  const [drawTrenchLayer, setDrawTrenchLayer] = useState<string>('');
  const [drawTrenchSnapLabel, setDrawTrenchSnapLabel] = useState<string | null>(null);
  const [drawTrenchBusy, setDrawTrenchBusy] = useState(false);

  // Layers opted OUT of the bundle reroute relay (pre-Save explanation row).
  const [bundleSkipLayers, setBundleSkipLayers] = useState<string[]>([]);
  const [deleteSectionRange, setDeleteSectionRange] = useState<[number, number] | null>(null);
  // Every Remove span pick, so "Last tap" can step back one cut point without
  // rebuilding the line from scratch (and without leaving range indices
  // pointing at coordinates that no longer exist).
  const deleteSectionHistoryRef = useRef<
    { coordinates: [number, number][]; range: [number, number] }[]
  >([]);

  // ── Continue Line state ──────────────────────────────────────────────
  const [continueLineAnchor, setContinueLineAnchor] = useState<number | null>(null);
  // The free-placed start coordinate of the draw segment (first tap). The
  // destination is placed by the second tap; the two points become the
  // saved segment. null until the first tap.
  const [continueStartPt, setContinueStartPt] = useState<[number, number] | null>(null);
  // Number of points appended so far (0 = none yet). Drives the toolbar step UI
  // and lets the connect handler append A→B→C→D instead of re-truncating.
  const [continueLinePoints, setContinueLinePoints] = useState(0);
  // The object point the draw-segment path snapped to (if any). When the final
  // vertex lands on/near an object/pdp/mfg point, this captures its details so
  // they merge into the line's SurveyFeature on save (LLD automation chain).
  const [continueSnapTarget, setContinueSnapTarget] = useState<{
    id: string;
    layerId: string;
    name: string;
    lng: number;
    lat: number;
    properties: Record<string, unknown>;
    /** 'object' = premise/pdp/mfg point, 'line' = another line's corner */
    kind: 'object' | 'line';
    /** Corner index on the snapped line (kind === 'line' only) */
    vertexIdx?: number;
    /** Whether the snapped corner is a line endpoint (kind === 'line' only) */
    isEndpoint?: boolean;
  } | null>(null);
  // Draw-segment outcome decided at the second tap: 'extend' grows the
  // selected line to the destination, 'spur' saves [start, dest] as its own
  // new trench feature so a segment drawn away from the line can never
  // overwrite (destroy) the selected line's geometry on Save.
  const [continueIsSpur, setContinueIsSpur] = useState(false);
  // Dedupe guard: the native map fires BOTH the Map onPress AND the
  // GeoJSONSource onPress for a single tap, so handleContinueLineTap can
  // fire twice with the same lngLat. Without this guard every tap would
  // append TWO points in multi-segment mode.
  const lastContinueTapRef = useRef<{ lng: number; lat: number; t: number } | null>(null);
  // Split here (staged): span 2 waits here until Save writes it.
  const pendingSplitRef = useRef<{
    hldFeatureId: string; layerId: string; layerName: string;
    origGeom: Record<string, unknown> | null; origAttrs: Record<string, unknown> | null;
    coordsB: [number, number][]; reason: string;
  } | null>(null);

  // Holds the latest writeSplitSpan2 so handleSaveLine (declared earlier) can call it.
  const writeSplitSpan2Ref = useRef<((
    p: NonNullable<typeof pendingSplitRef.current>,
    coordsA: [number, number][],
  ) => void) | null>(null);

  // ── Add Point state ────────────────────────────────────────────────
  const [addPointTargetLayer, setAddPointTargetLayer] = useState<string>('');
  // addPointLayers is computed below from allPanelLayers
  // Auto-select first point layer when entering add_point mode (see useEffect below)

  // ── New Point Form state — shows editable fields after adding a point ─
  const [surveyForm, setSurveyForm] = useState<SurveyFormData | null>(null);

  // ── Survey Changes Panel state — toggle to review all engineer edits ──
  const [surveyPanelVisible, setSurveyPanelVisible] = useState(false);

  // ── Commit path state — one submit for the whole survey ──────────────
  // The CommitBar at the bottom of this screen is the survey's only Submit;
  // `submittingSurvey` keeps the bar honest while the request is in flight.
  const [submittingSurvey, setSubmittingSurvey] = useState(false);
  // Measured, not hardcoded: the changes panel floats above the bar, and the
  // bar grows with the user's font size like everything else.
  const [commitBarHeight, setCommitBarHeight] = useState(0);

  // ── Undo Stack for drag + geometry operations ─────────────────────────
  // Single-feature entries track old/new coordinates.
  // Multi-feature entries (split, merge, create, delete) store a full layer
  // snapshot so the undo handler can restore the entire layer to its prior state.
  const MAX_UNDO = 50;
  type UndoEntry = {
    featureId: string;
    layerId: string;
    oldLng: number;
    oldLat: number;
    newLng: number;
    newLat: number;
    timestamp: number;
    /** For vertex drags — the index of the vertex that was moved */
    vertexIdx?: number;
    /** For full geometry restore (e.g., vertex deletion) — replaces all coordinates */
    fullCoords?: [number, number][];
    /** For multi-feature operations (split, merge, create, delete) — snapshot of the entire layer */
    layerSnapshot?: {
      layerId: string;
      previousFeatures: GeoJSONFeature[];
      description: string;
    };
    /** For survey-feature operations — restores the previous survey feature state */
    surveyUndo?: {
      surveyFeatureId: string;
      layerId: string;
      previousGeometry: Record<string, unknown>;
      previousAttributes: Record<string, unknown>;
      previousStatus: SurveyFeatureData['survey_status'];
      description: string;
      /** Created features have nothing to restore — undo deletes them */
      deleteOnUndo?: boolean;
      /**
       * Sibling rows created by the same operation (Remove span writes one row
       * per surviving piece). Undo must retract them in the same step — undoing
       * only the first piece left the rest of the split behind on the map and
       * in the planner's data.
       */
      relatedDeleteIds?: string[];
    };
  };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  // Refs that track values declared later — avoids TDZ in hooks that reference them
  const activeGeojsonRef = useRef<Record<string, GeoJSONFeature[]>>({});
  const allPanelLayersRef = useRef<any[]>([]);
  const panelLayerDataRef = useRef<any[]>([]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO - 1)), entry];
    setUndoCount(undoStackRef.current.length);
  }, []);

  const handlePolygonUndo = useCallback(() => {
    // For polygon editing, undo reverts polygonEditCoords to polygonEditOriginal
    if (selectedPolygonFeature && polygonEditCoords && polygonEditOriginal) {
      setPolygonEditCoords([...polygonEditOriginal]);
      console.log('[PolygonUndo] Reverted polygon to original coordinates');
    }
  }, [selectedPolygonFeature, polygonEditCoords, polygonEditOriginal]);

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;

    const entry = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    setUndoCount(undoStackRef.current.length);

    // ── SURVEY UNDO: restore a survey feature's previous geometry/attributes ──
    if (entry.surveyUndo) {
      const { surveyFeatureId, layerId, previousGeometry, previousAttributes, previousStatus, description } = entry.surveyUndo;
      console.log(`[Undo] Restoring survey feature ${surveyFeatureId.slice(-8)}: ${description}`);

      // Retract every sibling row the same operation created (Remove span's
      // extra pieces), so one Undo puts the line back exactly as it was.
      for (const relatedId of entry.surveyUndo.relatedDeleteIds ?? []) {
        const st = useSurveyFeaturesStore.getState();
        const list = st.surveyFeatures[layerId] ?? [];
        useSurveyFeaturesStore.setState({
          surveyFeatures: {
            ...st.surveyFeatures,
            [layerId]: list.filter((sf) => sf.id !== relatedId),
          },
        });
        void deleteSurveyFeature(relatedId, layerId).catch((e) =>
          console.warn('[Undo] Server delete of a split segment failed, local removal stands:', e instanceof Error ? e.message : e)
        );
        console.log(`[Undo] Removed split segment ${relatedId.slice(-8)} with the same step`);
      }

      // ── Created features (spur trench, draw segment): undo removes them ──
      if (entry.surveyUndo.deleteOnUndo) {
        const store = useSurveyFeaturesStore.getState();
        const features = store.surveyFeatures[layerId] ?? [];
        useSurveyFeaturesStore.setState({
          surveyFeatures: {
            ...store.surveyFeatures,
            [layerId]: features.filter((sf) => sf.id !== surveyFeatureId),
          },
        });
        void deleteSurveyFeature(surveyFeatureId, layerId).catch((e) =>
          console.warn('[Undo] Server delete failed, local removal stands:', e instanceof Error ? e.message : e)
        );
        console.log(`[Undo] Removed created survey feature ${surveyFeatureId.slice(-8)}`);
        return;
      }

      // ── Locally-created features (prefix 'local-sf-'): directly remove from store ──
      if (surveyFeatureId.startsWith('local-sf-')) {
        const store = useSurveyFeaturesStore.getState();
        const features = store.surveyFeatures[layerId] ?? [];
        useSurveyFeaturesStore.setState({
          surveyFeatures: {
            ...store.surveyFeatures,
            [layerId]: features.filter((sf) => sf.id !== surveyFeatureId),
          },
        });
        console.log(`[Undo] Removed local survey feature ${surveyFeatureId.slice(-8)}`);
        return;
      }

      // Optimistic local restore so the map re-renders immediately.
      const store = useSurveyFeaturesStore.getState();
      const features = store.surveyFeatures[layerId] ?? [];
      const exists = features.some((sf) => sf.id === surveyFeatureId);
      const nextFeatures = exists
        ? features.map((sf) =>
            sf.id === surveyFeatureId
              ? {
                  ...sf,
                  survey_geometry: previousGeometry,
                  survey_attributes: previousAttributes,
                  survey_status: previousStatus,
                }
              : sf
          )
        : // Feature was hard-deleted → re-insert it so the map shows it again.
          [
            ...features,
            {
              id: surveyFeatureId,
              original_hld_feature: null,
              hld_feature_id: null,
              project: useProjectStore.getState().activeProject?.id ?? '',
              project_name: useProjectStore.getState().activeProject?.name ?? '',
              engineer: '',
              engineer_name: '',
              layer_id: layerId,
              layer_name: layerId.replace(/^imp-/, '').toUpperCase(),
              original_geometry: null,
              original_attributes: previousAttributes,
              survey_geometry: previousGeometry,
              survey_attributes: previousAttributes,
              survey_status: previousStatus,
              version_number: 1,
              sync_status: 'pending' as const,
              change_reason: description,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
      useSurveyFeaturesStore.setState({
        surveyFeatures: {
          ...store.surveyFeatures,
          [layerId]: nextFeatures,
        },
      });
      // Persist to the backend when the DB record still exists (hard-deleted
      // records can only be restored locally — the DB row is gone).
      if (exists) {
        updateSurveyFeature(surveyFeatureId, layerId, {
          survey_geometry: previousGeometry,
          survey_attributes: previousAttributes,
          survey_status: previousStatus,
        });
      }
      console.log(`[Undo] Restored survey feature ${surveyFeatureId.slice(-8)}${exists ? ' + synced to DB' : ' (re-inserted locally — DB row was hard-deleted)'}`);
      return;
    }

    // ── SNAPSHOT RESTORE: multi-feature operations (split, merge, create, delete) ──
    if (entry.layerSnapshot) {
      const { layerId, previousFeatures, description } = entry.layerSnapshot;
      console.log(`[Undo] Restoring layer "${layerId}" snapshot: ${description}`);

      if (layerId.startsWith(IMPORT_ID_PREFIX)) {
        const cleanKey = layerId.slice(IMPORT_ID_PREFIX.length);
        const current = useProjectStore.getState().projectGeojsons;
        useProjectStore.getState().setProjectGeojsons({
          ...current,
          [cleanKey]: previousFeatures,
        });
      }
      return;
    }

    // ── SINGLE-FEATURE RESTORE: coordinate-based (point drag, vertex move, vertex delete) ──

    // Helper to map a feature array and restore old coordinates
    const restoreCoords = (layerFeatures: GeoJSONFeature[]) => {
      let found = false;
      const updated = layerFeatures.map((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        if (fid === entry.featureId) {
          if (entry.fullCoords) {
            // Full geometry restore (e.g., vertex deletion undone)
            found = true;
            return { ...f, geometry: { ...f.geometry, coordinates: entry.fullCoords } };
          }
          if (f.geometry?.type === 'Point') {
            found = true;
            return { ...f, geometry: { ...f.geometry, coordinates: [entry.oldLng, entry.oldLat] } };
          }
          if ((f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString') && entry.vertexIdx !== undefined) {
            found = true;
            const coords = [...(f.geometry.coordinates as [number, number][])];
            if (coords[entry.vertexIdx] !== undefined) {
              coords[entry.vertexIdx] = [entry.oldLng, entry.oldLat];
            }
            return { ...f, geometry: { ...f.geometry, coordinates: coords } };
          }
        }
        return f;
      });
      return found ? updated : null;
    };

    console.log(`[Undo] Restoring ${entry.featureId} to [${entry.oldLng.toFixed(6)}, ${entry.oldLat.toFixed(6)}]`);

    if (entry.layerId.startsWith(IMPORT_ID_PREFIX)) {
      const cleanKey = entry.layerId.slice(IMPORT_ID_PREFIX.length);
      const currentGeojsons = useProjectStore.getState().projectGeojsons;
      const layerFeatures = currentGeojsons[cleanKey];
      let updatedFeatures = layerFeatures ? restoreCoords(layerFeatures) : null;
      if (updatedFeatures) {
        // Recalculate dependent properties
        const fullGeojson: Record<string, GeoJSONFeature[]> = {};
        for (const [k, v] of Object.entries(currentGeojsons)) fullGeojson[`imp-${k}`] = v;
        fullGeojson[entry.layerId] = updatedFeatures;
        const recalc = recalculateDependentProperties(entry.layerId, fullGeojson, updatedFeatures);
        updatedFeatures = recalc.geojson[entry.layerId] ?? updatedFeatures;

        useProjectStore.getState().setProjectGeojsons({
          ...currentGeojsons,
          [cleanKey]: updatedFeatures,
        });
      }
    }
  }, [updateSurveyFeature, deleteSurveyFeature]);

  // Refs are kept in sync INSIDE the respective useMemo/useState hooks below
  // to avoid TDZ errors from referencing later-declared const variables in dependency arrays.

  // ── Ctrl+Z keyboard shortcut (web only) ──────────────────────────────
  // NOTE: must check for a REAL browser `window` — on React Native, `window`
  // is aliased to `global` and has NO addEventListener (crash: undefined is not a function).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo]);

  // Key for surveyPointGeometries: `${layerId}:${featureId}` to prevent cross-layer collisions
  const surveyPointKey = useCallback((layerId: string, featureId: string) => `${layerId}:${featureId}`, []);

  const currentBasemapStyle = BASEMAPS[activeBasemap]?.style ?? BASEMAPS.streets.style;

  // Init visibility from store layers
  useEffect(() => {
    if (storeLayers.length > 0) {
      setLayerVisibility((prev) => {
        const next = { ...prev };
        for (const l of storeLayers) {
          if (next[l.id] === undefined) next[l.id] = l.visible;
        }
        return next;
      });
    }
  }, [storeLayers]);

  // ── Determine GeoJSON source: prefix imported data with 'imp-' ────────
  const {
    projectGeojsons,
    projectLayers,
    activeProject: storeActiveProject,
    fetchProjectGeojsons,
    layerFetchProgress,
    layerLoadFailed,
    submitSurveyCopy,
    isLoading: storeIsLoading,
    error: storeError,
  } = useProjectStore();
  const hasImportedData = Object.keys(projectGeojsons).length > 0;

  // ── Auto-fetch GeoJSON from backend when a real project is active but empty ──
  // The guard remembers WHICH project it fetched, not merely that it fetched
  // once: a plain boolean meant only the first project of a session ever loaded.
  const fetchAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      storeActiveProject &&
      !storeActiveProject.id.startsWith('imported-') &&
      !hasImportedData &&
      fetchAttemptedRef.current !== storeActiveProject.id
    ) {
      fetchAttemptedRef.current = storeActiveProject.id;
      console.log('[Map] Active project found but GeoJSON empty — fetching from backend');
      fetchProjectGeojsons(storeActiveProject.id).catch((err) => {
        console.log('[Map] ⚠️ Project data fetch failed:', err);
        fetchAttemptedRef.current = null;
      });
    }
  }, [storeActiveProject?.id, hasImportedData]);

  // Active GeoJSON = the active project's layers, prefixed with 'imp-'
  const activeGeojson = useMemo(() => {
    const onlyImported: Record<string, GeoJSONFeature[]> = {};
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      onlyImported[importedKey] = features;
    }
    activeGeojsonRef.current = onlyImported;
    return onlyImported;
  }, [projectGeojsons]);

  // ── Fetch Survey Features when the active project changes ────────────────
  // This loads all engineer survey edits from the backend so they can be
  // rendered as orange survey layers alongside the blue HLD layers.
  useEffect(() => {
    if (storeActiveProject && !storeActiveProject.id.startsWith('imported-')) {
      fetchSurveyFeatures(storeActiveProject.id);
    } else {
      clearSurveyFeatures();
    }
  }, [storeActiveProject?.id, fetchSurveyFeatures, clearSurveyFeatures]);

  // ── Always open a project in the HLD view first ────────────────────────
  // Re-entering a project (or switching projects) resets the display mode so
  // the engineer always starts from the blue HLD view. Deep-link feature
  // focus and review isolation are exempt — they force Overlay themselves.
  useEffect(() => {
    const focus = useSurveyFeaturesStore.getState().focusFeatureId;
    const isolate = useSurveyFeaturesStore.getState().isolateFeatureId;
    if (!focus && !isolate) {
      setDisplayMode('hld');
    }
  }, [storeActiveProject?.id, setDisplayMode]);

  // ── Deep-link focus: fly to + highlight one survey feature ────────────
  // When the planner opens a survey change via the Job Approval page, the
  // deeplink sets displayMode='overlay' + focusFeatureId. Once the survey
  // features are loaded, select the target (the map auto-flies to it) and
  // clear the focus so it only happens once.
  useEffect(() => {
    if (!focusFeatureId) return;
    if (!surveyFeaturesLoaded) return;

    // Find the target feature across all layers
    let found: { sf: (typeof surveyFeatures)[string][number]; layerId: string } | null = null;
    for (const [layerId, list] of Object.entries(surveyFeatures)) {
      const sf = list.find((x) => String(x.id) === String(focusFeatureId));
      if (sf) {
        found = { sf, layerId };
        break;
      }
    }
    if (!found) return;

    // Make sure survey layers are visible (overlay mode shows both)
    setDisplayMode('overlay');

    const layerName = String(found.layerId).replace('imp-', '').toUpperCase();
    setSelectedMapFeatureId(String(found.sf.id));
    selectFeature(String(found.sf.id), {
      id: String(found.sf.id),
      name: `Survey: ${layerName} #${String(found.sf.id).slice(-4)}`,
      layerName: `Survey: ${layerName}`,
      status: found.sf.survey_status === 'removed' ? 'removed' : 'modified',
      layerId: found.layerId,
    });
    setPopupScreenCoords(null);
    setFocusFeature(null);
  }, [focusFeatureId, surveyFeaturesLoaded, surveyFeatures, setDisplayMode, setFocusFeature, selectFeature]);

  // ── Draggable layer IDs — HLD point layers + survey point layers ──
  // HLD layers: from activeGeojsonRef (blue points)
  // Survey layers: from surveyFeatures store (orange points) — prefixed with 'survey-'
  // Both are draggable so the engineer can re-adjust either the original or the survey copy.
  const draggableLayerIds = useMemo(() => {
    const ids = new Set<string>();

    // ── HLD point layers ──
    const geo = activeGeojsonRef.current;
    for (const [id, features] of Object.entries(geo)) {
      if (features.length === 0) continue;
      if (features[0]?.geometry?.type === 'Point') {
        ids.add(id);
      }
    }

    // ── Survey point layers (orange) ──
    // Only include survey layers whose features are Point geometry and not 'removed'
    for (const [layerId, sfList] of Object.entries(surveyFeatures)) {
      const visible = sfList.filter((sf) => sf.survey_status !== 'removed');
      if (visible.length === 0) continue;
      const geomType = (visible[0]?.survey_geometry as any)?.type;
      if (geomType === 'Point') {
        ids.add(`survey-${layerId}`);
      }
    }

    return ids;
  }, [activeGeojson, surveyFeatures]);

  // Build layer names: base defaults + imported layer names with '(Imported)' suffix
  const activeLayerNames = useMemo(() => {
    const names: Record<string, string> = { ...LAYER_NAMES };
    if (hasImportedData) {
      for (const [key] of Object.entries(projectGeojsons)) {
        const found = projectLayers.find((l) => l.layer_id === key);
        const baseName = found ? found.layer_name : key.toUpperCase();
        names[`${IMPORT_ID_PREFIX}${key}`] = `${baseName} (Imported)`;
      }
    }
    return names;
  }, [hasImportedData, projectGeojsons, projectLayers]);

  // Merge colors: base defaults + imported colors
  const activeLayerColors = useMemo(() => {
    const colors: Record<string, string> = { ...LAYER_COLORS };
    if (hasImportedData) {
      for (const [key] of Object.entries(projectGeojsons)) {
        colors[`${IMPORT_ID_PREFIX}${key}`] = IMPORT_COLORS[normalizeLayerId(key)] ?? IMPORT_FALLBACK_COLOR;
      }
    }
    return colors;
  }, [hasImportedData, projectGeojsons]);

  // Initialize visibility for imported layers
  useEffect(() => {
    if (hasImportedData) {
      setLayerVisibility((prev) => {
        const next = { ...prev };
        for (const [key] of Object.entries(projectGeojsons)) {
          const importedKey = `${IMPORT_ID_PREFIX}${key}`;
          if (next[importedKey] === undefined) next[importedKey] = true;
        }
        return next;
      });
    }
  }, [hasImportedData, projectGeojsons]);

  // Feature ID map for imported features
  const importFeatureIdMap = useMemo(() => {
    if (!hasImportedData) return undefined;
    const map: Record<string, string[]> = {};
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      map[importedKey] = features.map((_, i) => `imp-feat-${key}-${i + 1}`);
    }
    return map;
  }, [hasImportedData, projectGeojsons]);

  const activeProject = storeActiveProject ?? projects[0] ?? null;
  const mapProjectName = activeProject?.name ?? 'Survey Map';

  // ── Survey progress summary (shown under the title in the header) ──────
  const surveyChangeCount = useMemo(() => {
    let total = 0;
    for (const list of Object.values(surveyFeatures)) total += list.length;
    return total;
  }, [surveyFeatures]);

  const surveySummaryLabel =
    surveyChangeCount > 0
      ? `${surveyChangeCount} survey change${surveyChangeCount === 1 ? '' : 's'} · ${
          displayMode === 'survey' ? 'Survey view' : displayMode === 'overlay' ? 'Overlay view' : 'HLD view'
        }`
      : '';

  // One line of state under the project name. Offline first — it is the fact
  // that changes how the engineer should behave.
  const headerSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (!isOnline) parts.push('Offline — saving on device');
    if (surveyChangeCount > 0) {
      parts.push(`${surveyChangeCount} change${surveyChangeCount === 1 ? '' : 's'}`);
    }
    parts.push(
      displayMode === 'survey' ? 'Survey view' : displayMode === 'overlay' ? 'Overlay view' : 'HLD view',
    );
    return parts.join(' · ');
  }, [isOnline, surveyChangeCount, displayMode]);

  // ── Build feature list for list view (from the active project's layers) ──
  const mergedFeatureList = useMemo(() => {
    const list: any[] = [];
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      const layerName = activeLayerNames[importedKey] ?? key.toUpperCase();
      features.forEach((feat, i) => {
        const props = feat.properties ?? {};
        // Use the real backend feature id (properties.id) so the feature
        // detail screen can fetch field measurements, typed survey data and
        // the survey-feature diff. Fall back to a synthetic id for features
        // without a backend id (e.g. locally-created points).
        const realId = (props.id ?? props._feature_id) as string | undefined;
        const featureId = realId || `imp-feat-${key}-${i + 1}`;
        list.push({
          feature: {
            id: featureId,
            layer_name: layerName,
            layer_id: importedKey,
            properties: props,
            field_schema: null,
            field_measurements: null,
            comparison_notes: '',
            status: 'assigned' as const,
            photo_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          geojson: feat,
        });
      });
    }
    return list;
  }, [hasImportedData, projectGeojsons, activeLayerNames]);

  const filteredFeatures = useMemo(() => {
    let list = selectedLayer
      ? mergedFeatureList.filter((f) => f.feature.layer_id === selectedLayer)
      : mergedFeatureList;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        const props = item.feature.properties ?? {};
        const allValues = [
          item.feature.id,
          item.feature.layer_name,
          ...Object.values(props).map((v) => String(v ?? '')),
        ];
        return allValues.some((val) => val.toLowerCase().includes(q));
      });
    }

    return list;
  }, [mergedFeatureList, selectedLayer, searchQuery]);

  // Modify buildMapLayerData to use activeLayerColors
  // ── In 'overlay' mode, HLD layers are forced to blue ──
  const effectiveLayerColors = useMemo(() => {
    if (displayMode === 'overlay') {
      const overridden: Record<string, string> = {};
      for (const [key, color] of Object.entries(activeLayerColors)) {
        overridden[key] = '#2563EB'; // Blue for HLD in overlay mode
      }
      return overridden;
    }
    return activeLayerColors;
  }, [activeLayerColors, displayMode]);

  const mapLayerData = useMemo(() => {
    // ── Isolated review mode: show ONLY the target survey feature ──────
    // plus its original HLD counterpart (dimmed blue). Everything else is
    // hidden so the reviewer sees exactly one change at a time.
    if (isolateFeatureId) {
      // Find the target survey feature across all layers
      let targetSf: (typeof surveyFeatures)[string][number] | null = null;
      let targetLayerId = '';
      for (const [layerId, sfList] of Object.entries(surveyFeatures)) {
        const hit = sfList.find((sf) => String(sf.id) === String(isolateFeatureId));
        if (hit) {
          targetSf = hit;
          targetLayerId = layerId;
          break;
        }
      }
      if (!targetSf) return [];

      const isolated: any[] = [];

      // Original HLD feature — dimmed blue, immutable (never draggable)
      const hldId = targetSf.original_hld_feature || targetSf.hld_feature_id;
      if (hldId) {
        for (const [layerId, feats] of Object.entries(activeGeojson)) {
          const orig = feats.find((f) => {
            const pid = (f.properties as Record<string, unknown> | undefined)?.id;
            const pfeat = (f.properties as Record<string, unknown> | undefined)?.feature_id;
            return String(pid ?? pfeat ?? '') === String(hldId);
          });
          if (orig) {
            isolated.push({
              id: layerId,
              name: `Original HLD: ${activeLayerNames[layerId] ?? layerId.toUpperCase()}`,
              features: [{
                ...orig,
                properties: {
                  ...(orig.properties as Record<string, unknown>),
                  _id: String(hldId),
                  _layer_id: layerId,
                  _is_hld_original: true,
                },
              }],
              visible: true,
              color: 'rgba(37, 99, 235, 0.35)', // dimmed blue
              geometryType: (orig.geometry?.type as any) ?? 'Point',
            });
            break;
          }
        }
      }

      // Survey feature — highlighted orange
      if (targetSf.survey_status !== 'removed') {
        isolated.push({
          id: `survey-${targetLayerId}`,
          name: `Survey: ${activeLayerNames[targetLayerId] ?? targetLayerId.toUpperCase()}`,
          features: [{
            type: 'Feature' as const,
            geometry: targetSf.survey_geometry as { type: string; coordinates: unknown[] },
            properties: {
              ...targetSf.survey_attributes,
              id: targetSf.id,
              _id: targetSf.id,
              _layer_id: `survey-${targetLayerId}`,
              _is_survey: true,
              _hld_feature_id: targetSf.original_hld_feature,
              _survey_status: targetSf.survey_status,
            },
          }],
          visible: true,
          color: SURVEY_COLOR, // Orange
          geometryType: ((targetSf.survey_geometry as any)?.type as any) ?? 'Point',
        });
      }
      return isolated;
    }

    // ── HLD layers (blue in overlay, normal otherwise) ──
    const hldLayers = displayMode === 'survey'
      ? [] // In survey-only mode, hide HLD layers
      : buildMapLayerData(activeGeojson, layerVisibility, activeLayerNames,
          importFeatureIdMap, effectiveLayerColors);

    // ── Survey layers (orange) — only when survey features exist ──


    const surveyLayers: any[] = [];
    for (const [layerId, sfList] of Object.entries(surveyFeatures)) {
      if (sfList.length === 0) continue;
      const visibleFeatures = sfList
        .filter((sf) => sf.survey_status !== 'removed')
        .map((sf) => ({
          type: 'Feature' as const,
          geometry: sf.survey_geometry as { type: string; coordinates: unknown[] },
          properties: {
            ...sf.survey_attributes,
            id: sf.id,
            _id: sf.id,
            _layer_id: `survey-${layerId}`,
            _is_survey: true,
            _hld_feature_id: sf.original_hld_feature,
            _survey_status: sf.survey_status,
          },
        }));

      if (visibleFeatures.length === 0) continue;

      const geomType = (visibleFeatures[0]?.geometry?.type as any) ?? 'Point';
      surveyLayers.push({
        id: `survey-${layerId}`,
        name: `Survey: ${activeLayerNames[layerId] ?? layerId.toUpperCase()}`,
        features: visibleFeatures,
        visible: true,
        color: SURVEY_COLOR, // Orange
        geometryType: geomType,
      });
    }

    // ── Staged edits (orange): split span 2 held until Save, and the works
    // zone while routing around it. Shown in every view, including HLD.
    const stagedLayers: any[] = [];
    const pendingSplitPreview = pendingSplitRef.current;
    if (pendingSplitPreview && pendingSplitPreview.coordsB.length >= 2) {
      stagedLayers.push({
        id: 'temp-split-span2',
        name: 'Split: span 2',
        features: [{
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: pendingSplitPreview.coordsB },
          properties: { id: 'temp-split-span2', _id: 'temp-split-span2', _layer_id: 'temp-split-span2', _is_preview: true },
        }],
        visible: true,
        color: SURVEY_COLOR,
        geometryType: 'LineString' as const,
      });
    }
    if (lineToolMode === 'route-around' && obstacleCentre) {
      const dLat = obstacleRadiusM / 111000;
      const dLng = obstacleRadiusM / metersPerDegLng(obstacleCentre.lat);
      const ring: [number, number][] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * 2 * Math.PI;
        ring.push([obstacleCentre.lng + dLng * Math.cos(a), obstacleCentre.lat + dLat * Math.sin(a)]);
      }
      stagedLayers.push({
        id: 'temp-works-zone',
        name: 'Works zone',
        features: [{
          type: 'Feature' as const,
          geometry: { type: 'Polygon' as const, coordinates: [ring] },
          properties: { id: 'temp-works-zone', _id: 'temp-works-zone', _layer_id: 'temp-works-zone', _is_preview: true },
        }],
        visible: true,
        color: SURVEY_COLOR,
        geometryType: 'Polygon' as const,
      });
    }

    // HLD view shows the HLD layers plus every survey edit in orange, so
    // reroutes, spans, work-arounds and splits are visible without Overlay.
    if (displayMode === 'hld') return [...hldLayers, ...surveyLayers, ...stagedLayers];

    // ── Temp Move Preview layer (orange) — shown during line move mode ──
    // Provides an orange preview of the line being edited, independent of
    // the blue HLD layer. Vertex markers render on this preview layer's
    // source so they follow tempLineCoords instead of original HLD coords.
    const previewLayers: any[] = [];
    // In Draw Segment (continue-line) mode the preview only appears once
    // the two-point segment has actually been drawn — never the whole line.
    const showLinePreview =
      lineMoveMode || (lineToolMode === 'continue-line' && continueLinePoints >= 1) || lineToolMode === 'route-around';
    if (showLinePreview && tempLineCoords && selectedLineFeature) {
      const previewFeature = {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString',
          coordinates: tempLineCoords,
        },
        properties: {
          id: `temp-preview-${selectedLineFeature.id}`,
          _id: `temp-preview-${selectedLineFeature.id}`,
          _layer_id: `temp-preview-${selectedLineFeature.layerId}`,
          _is_preview: true,
        },
      };
      previewLayers.push({
        id: `temp-preview-${selectedLineFeature.layerId}`,
        name: `Preview: ${activeLayerNames[selectedLineFeature.layerId] ?? selectedLineFeature.layerId.toUpperCase()}`,
        features: [previewFeature],
        visible: true,
        color: SURVEY_COLOR, // Orange
        geometryType: 'LineString' as const,
      });
    }

    // ── Remove span: show the gap that will disappear (red) + its cut points ──
    // Without this the tool gave no feedback at all until Confirm: the engineer
    // could not see which slice of trench had been selected. Red = removed,
    // orange = the line that stays.
    if (lineToolMode === 'delete-section' && tempLineCoords && deleteSectionRange) {
      const [a, b] = deleteSectionRange;
      const cutStart = Math.min(a, b), cutEnd = Math.max(a, b);
      if (cutEnd > cutStart) {
        previewLayers.push({
          id: 'temp-preview-remove-span',
          name: 'Removing this span',
          features: [{
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: tempLineCoords.slice(cutStart, cutEnd + 1) },
            properties: { id: 'temp-preview-remove-span', _id: 'temp-preview-remove-span', _layer_id: 'temp-preview-remove-span', _is_preview: true },
          }],
          visible: true,
          color: '#DC2626',
          geometryType: 'LineString' as const,
        });
      }
      const cutPoints = (cutStart === cutEnd
        ? [tempLineCoords[cutStart]]
        : [tempLineCoords[cutStart], tempLineCoords[cutEnd]]
      ).filter(Boolean) as [number, number][];
      if (cutPoints.length > 0) {
        previewLayers.push({
          id: 'temp-preview-cut-points',
          name: 'Cut points',
          features: cutPoints.map((coords, i) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: coords },
            properties: { id: `temp-preview-cut-${i}`, _id: `temp-preview-cut-${i}`, _layer_id: 'temp-preview-cut-points', _is_preview: true },
          })),
          visible: true,
          color: '#DC2626',
          geometryType: 'Point' as const,
        });
      }
    }

    // ── Temp Polygon Preview layer (orange) — shown during polygon edit mode ──
    // Mirrors the line preview: renders polygonEditCoords so the polygon shape
    // follows live vertex drags, and the vertex markers + highlight render on
    // this layer (via polygonEditTarget) so they move with the edits.
    if (selectedPolygonFeature && polygonEditCoords) {
      const polygonPreviewFeature = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon',
          coordinates: [polygonEditCoords],
        },
        properties: {
          id: `temp-preview-${selectedPolygonFeature.id}`,
          _id: `temp-preview-${selectedPolygonFeature.id}`,
          _layer_id: `temp-preview-${selectedPolygonFeature.layerId}`,
          _is_preview: true,
        },
      };
      previewLayers.push({
        id: `temp-preview-${selectedPolygonFeature.layerId}`,
        name: `Preview: ${activeLayerNames[selectedPolygonFeature.layerId] ?? selectedPolygonFeature.layerId.toUpperCase()}`,
        features: [polygonPreviewFeature],
        visible: true,
        color: SURVEY_COLOR, // Orange
        geometryType: 'Polygon' as const,
      });
    }

    // ── Draw trench working copy (orange) ──
    // The drawn trench is NOT a survey feature until Save. Show the vertices
    // placed so far: a single vertex as a dot (a 1-vertex LineString renders
    // as nothing), two or more as the growing line.
    if (drawTrenchActive && drawTrenchPoints.length > 0) {
      const isSingle = drawTrenchPoints.length === 1;
      previewLayers.push({
        id: 'temp-preview-trench-draw',
        name: 'Draw trench',
        features: [{
          type: 'Feature' as const,
          geometry: isSingle
            ? { type: 'Point' as const, coordinates: drawTrenchPoints[0] }
            : { type: 'LineString' as const, coordinates: drawTrenchPoints },
          properties: {
            id: 'temp-preview-trench-draw',
            _id: 'temp-preview-trench-draw',
            _layer_id: 'temp-preview-trench-draw',
            _is_preview: true,
          },
        }],
        visible: true,
        color: SURVEY_COLOR, // Orange
        geometryType: (isSingle ? 'Point' : 'LineString') as 'Point' | 'LineString',
      });
    }

    return [...hldLayers, ...previewLayers, ...surveyLayers, ...stagedLayers];
  }, [activeGeojson, layerVisibility, activeLayerNames, hasImportedData, importFeatureIdMap, effectiveLayerColors, displayMode, surveyFeatures, lineMoveMode, lineToolMode, continueLinePoints, tempLineCoords, selectedLineFeature, selectedPolygonFeature, polygonEditCoords, isolateFeatureId, drawTrenchActive, drawTrenchPoints, obstacleCentre, obstacleRadiusM, deleteSectionRange]);

  // Build visible layers from the active project's layers
  const visibleLayers = useMemo(() => {
    const imported: any[] = [];
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      imported.push({
        id: importedKey,
        name: activeLayerNames[importedKey] ?? key.toUpperCase(),
        visible: layerVisibility[importedKey] !== false,
        featureCount: features.length,
        geometryType: (features[0]?.geometry?.type as any) ?? resolveGeometryType(key),
      });
    }
    return imported.filter((l) => layerVisibility[l.id] !== false);
  }, [projectGeojsons, activeLayerNames, layerVisibility]);

  // All layers for the panel
  const allPanelLayers = useMemo(() => {
    const imported: any[] = [];
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      imported.push({
        id: importedKey,
        name: activeLayerNames[importedKey] ?? key.toUpperCase(),
        visible: layerVisibility[importedKey] !== false,
        featureCount: features.length,
        geometryType: (features[0]?.geometry?.type as any) ?? resolveGeometryType(key),
      });
    }
    allPanelLayersRef.current = imported;
    return imported;
  }, [projectGeojsons, activeLayerNames, layerVisibility]);

  // ── Transform allPanelLayers into LegendLayer format (for MapLegend) ────
  const panelLayerData = useMemo(
    () => {
      const result = allPanelLayers.map((l) => ({
        id: l.id,
        name: l.name,
        color: activeLayerColors[l.id] ?? '#6B7280',
        featureCount: l.featureCount,
        geometryType: l.geometryType,
        imported: l.id.startsWith('imp-'),
        visible: layerVisibility[l.id] !== false,
      }));
      panelLayerDataRef.current = result;
      return result;
    },
    [allPanelLayers, activeLayerColors, layerVisibility]
  );

  // ── The legend lists what the map is actually drawing ────────────────────
  // In Survey view the HLD layers are hidden on purpose (see the hldLayers
  // guard in mapLayerData), so a panel built from every *loaded* layer listed
  // 23 layers with their toggles on beside an empty map, and the map's own
  // overlay said "No Layers Visible". Measured 2026-10-14: both were on screen
  // at once, contradicting each other. The panel now follows the view mode.
  const legendPanelLayers = useMemo(() => {
    const drawn = new Set(mapLayerData.map((l) => l.id));
    return panelLayerData.filter((l) => drawn.has(l.id));
  }, [panelLayerData, mapLayerData]);

  // ── Build grouped legend from the CURRENT panel data (not a stale ref) ──
  const legendGroups = useMemo(
    () => buildLayerGroups(legendPanelLayers, DEFAULT_LAYER_GROUPS),
    [legendPanelLayers]
  );

  // ── Draw order: the network above the dots (see orderLayersForDrawing) ──
  const orderedMapLayers = useMemo(() => orderLayersForDrawing(mapLayerData), [mapLayerData]);

  // ── Region of interest + auto-zoom ──────────────────────────────────────
  // The ROI is whatever the map is drawing right now: hiding a layer shrinks
  // it, switching to Survey view frames only the edits.
  const roiBounds = useMemo<Bounds | null>(() => {
    const drawn = orderedMapLayers.filter((l) => l.visible);
    return boundsOfFeatures(drawn.flatMap((l) => l.features));
  }, [orderedMapLayers]);

  // The map is inset by the header, the dock and the commit bar. Feeding the
  // real numbers here keeps `needsReframe` honest about what is on screen.
  const frameViewport = useMemo(
    () =>
      cameraView
        ? {
            ...cameraView,
            viewportWidth: windowWidth,
            viewportHeight: Math.max(320, windowHeight - 190),
          }
        : null,
    [cameraView, windowWidth, windowHeight],
  );

  /**
   * Frame `target`, unless it is already comfortably in view.
   * Returns false when nothing is on the map, so callers can say so.
   */
  const frameBounds = useCallback(
    (
      target: Bounds | null,
      opts?: {
        force?: boolean;
        minSpan?: number;
        padding?: { top: number; right: number; bottom: number; left: number };
      },
    ) => {
      if (!target) return false;
      const padded = expandBounds(target, opts?.minSpan ?? MIN_REGION_SPAN_M);
      if (!opts?.force && !needsReframe(padded, frameViewport)) return true;
      setFitRequest({
        bounds: padded,
        padding: opts?.padding ?? { ...FRAME_PADDING },
        ts: Date.now(),
      });
      return true;
    },
    [frameViewport],
  );

  // Frame the project's work area.
  //
  // Layers arrive one at a time, so the very first ROI is a fragment: fitting
  // it once put the camera at street level in the middle of a 600 m project.
  // While the project is still loading the camera re-fits (debounced) to the
  // growing union; when the load settles there is exactly one final fit, and
  // after that the camera only moves when the engineer asks it to.
  //
  // The helpers are reached through refs because `frameBounds` changes with
  // every camera settle — depending on it here would re-arm the timer on each
  // fit and loop.
  const frameBoundsRef = useRef(frameBounds);
  frameBoundsRef.current = frameBounds;

  const roiKey = useMemo(
    () => (roiBounds ? roiBounds.map((n) => n.toFixed(6)).join(',') : null),
    [roiBounds],
  );

  const projectDataLoading = Boolean(
    storeActiveProject && !storeActiveProject.id.startsWith('imported-') && !hasImportedData,
  );

  useEffect(() => {
    if (!projectDataLoading || !roiBounds) return;
    const timer = setTimeout(() => {
      frameBoundsRef.current(roiBounds, { force: true, minSpan: MIN_REGION_SPAN_M });
    }, 400);
    return () => clearTimeout(timer);
  }, [roiKey, projectDataLoading]);

  // One fit when the data settles (and for imported packages, which never
  // enter the loading state).
  const settledProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roiBounds || projectDataLoading) return;
    const projectId = activeProject?.id ?? 'local';
    if (settledProjectRef.current === projectId) return;
    settledProjectRef.current = projectId;
    frameBoundsRef.current(roiBounds, { force: true, minSpan: MIN_REGION_SPAN_M });
  }, [roiKey, projectDataLoading, activeProject?.id]);

  // Selecting a feature pulls the camera to it only when it is a speck or off
  // screen — a tap on a neighbour at working zoom must not move the map.
  const framedFeatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedMapFeatureId) {
      framedFeatureRef.current = null;
      return;
    }
    if (framedFeatureRef.current === selectedMapFeatureId) return;
    for (const layer of orderedMapLayers) {
      for (const feature of layer.features) {
        const props = feature.properties as Record<string, unknown> | undefined;
        const fid = props?.id ?? props?._id;
        if (fid !== selectedMapFeatureId) continue;
        framedFeatureRef.current = selectedMapFeatureId;
        const bounds = geometryBounds(feature.geometry as { type?: string; coordinates?: unknown });
        // The feature card owns the bottom ~400 px once a feature is
        // selected, so frame the feature into the strip above it.
        if (bounds) frameBounds(bounds, { minSpan: 90, padding: SELECTION_PADDING });
        return;
      }
    }
  }, [selectedMapFeatureId, orderedMapLayers, frameBounds]);

  const handleFrameRegion = useCallback(() => {
    if (!frameBounds(roiBounds, { force: true })) {
      showToast('No layers on the map to frame', 'info');
    }
  }, [frameBounds, roiBounds]);

  const handleZoomRail = useCallback((delta: number) => {
    setZoomRequest({ delta, ts: Date.now() });
  }, []);

  // ── Empty-state copy, per view mode ─────────────────────────────────────
  // "All layers are currently hidden or contain no features. Toggle layers on
  // using the layers panel." is the wrong thing to say in Survey view, where
  // the HLD layers are hidden *by design* and there is nothing to toggle: a
  // project with no recorded changes is legitimately empty there.
  const mapEmptyState = useMemo(() => {
    if (displayMode !== 'survey') return undefined; // HLD / Overlay keep the default copy
    return {
      title: 'No survey changes yet',
      description:
        'Survey view shows only the changes the engineer records.' +
        '\nOpen HLD view to see the design this survey starts from.',
    };
  }, [displayMode]);

  // ── Compute point layers for Add Point mode layer picker ────────────────
  const addPointLayers = useMemo(() => {
    return allPanelLayers
      .filter((l) => l.geometryType === 'Point')
      .map((l) => ({ id: l.id, name: l.name }));
  }, [allPanelLayers]);

  // Line layer editing (Split, Merge, Draw, Vertices) removed by user request.
  // Custom rules for lines & polygons will be added later.

  // Auto-select first point layer when entering add_point mode
  useEffect(() => {
    if (geoMode === 'add_point' && !addPointTargetLayer && addPointLayers.length > 0) {
      setAddPointTargetLayer(addPointLayers[0].id);
    }
  }, [geoMode, addPointLayers]);

  // ── Calculate auto-zoom center from imported features ────────────────
  const flyToCenter = useMemo(() => {
    if (!hasImportedData) return null;

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    let found = false;

    for (const features of Object.values(projectGeojsons)) {
      for (const f of features) {
        const coords = extractCoords(f.geometry);
        for (const [lng, lat] of coords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          found = true;
        }
      }
    }

    if (!found) return null;

    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    // Estimate zoom from bounding box span
    const lngSpan = Math.abs(maxLng - minLng);
    const latSpan = Math.abs(maxLat - minLat);
    const maxSpan = Math.max(lngSpan, latSpan, 0.0001);
    // Rough zoom: smaller span → higher zoom
    const zoom = Math.max(12, Math.min(18, Math.round(15 - Math.log2(maxSpan * 111))));

    return { lng: centerLng, lat: centerLat, zoom };
  }, [hasImportedData, projectGeojsons]);

  // ── Resolve feature properties from map layers for bottom sheet ──────────
  const selectedFeatureProps = useMemo(() => {
    if (!selectedFeaturePopup?.id) return [];
    for (const layer of mapLayerData) {
      for (const feat of layer.features) {
        if ((feat.properties?.id ?? '') === selectedFeaturePopup.id) {
          return Object.entries(feat.properties ?? {}).filter(
            ([k]) => !k.startsWith('_') && k !== 'id'
          );
        }
      }
    }
    return [];
  }, [mapLayerData, selectedFeaturePopup?.id]);

  // ── Reset notes draft when selected feature changes ─────────────────────
  useEffect(() => {
    if (selectedFeaturePopup?.id) {
      setNotesDraft(featureNotes[selectedFeaturePopup.id] ?? '');
    }
  }, [selectedFeaturePopup?.id]);

  // ── Map feature click handler ───────────────────────────────────────────
  const handleMapFeatureClick = useCallback(
    (featureId: string, layerId: string, lngLat: [number, number], screenPoint?: { x: number; y: number }) => {
      // Skip temp preview features (shown during line move mode) —
      // these are for visual feedback only and should not show a popup.
      if (layerId.startsWith('temp-preview-')) return;

      // Store screen position for the pin-anchored popup
      if (screenPoint) {
        setPopupScreenCoords(screenPoint);
      }

      // ── Determine geometry type for this feature ──────────────────────
      const matchedLayer = mapLayerData.find((layer) => layer.id === layerId);
      const geomType = (matchedLayer?.geometryType ?? resolveGeometryType(layerId)) as 'Point' | 'LineString' | 'Polygon';

      // ── Detect survey features (orange markers) via 'survey-' prefix ─
      const isSurveyFeature = layerId.startsWith('survey-');

      let featureName: string;
      let layerName: string;
      let popupLayerId = layerId;
      if (isSurveyFeature) {
        const baseLayerId = layerId.replace('survey-', '');
        const baseName = activeLayerNames[baseLayerId] ?? baseLayerId.replace('imp-', '').toUpperCase();
        featureName = `Survey: ${baseName} #${featureId.slice(-4)}`;
        layerName = `Survey: ${baseName}`;
        popupLayerId = baseLayerId;
      } else {
        featureName = (activeLayerNames[layerId] ?? layerId.toUpperCase()) + ' #' + featureId.slice(-3);
        layerName = activeLayerNames[layerId] ?? layerId.toUpperCase();
      }
      const status = isSurveyFeature ? 'modified' : 'assigned';

      // ── POLYGON features: open inline editing handles for the selected polygon ──
      if (geomType === 'Polygon') {
        // Already editing this polygon? Keep current drag progress — don't restart.
        if (selectedPolygonFeature && selectedPolygonFeature.id === featureId) {
          setSelectedMapFeatureId(featureId);
          return;
        }
        setSelectedLineFeature(null);
        setSelectedMapFeatureId(featureId);
        selectFeature(featureId, {
          id: featureId,
          name: featureName,
          layerName,
          status,
          layerId: popupLayerId,
        });
        handlePolygonEditStart({
          id: featureId,
          layerId: popupLayerId,
          geometryType: 'Polygon',
          name: featureName,
          layerName,
        });
        return;
      }

      // ── LINE features: open the line toolbar DIRECTLY (tap → edit tools) ──
      // One hop: Reroute / Del Section / Draw Segment / Undo / Save are
      // immediately available. A separate "View popup → Edit → toolbar"
      // chain made the interaction feel broken.
      if (geomType === 'LineString') {
        setSelectedMapFeatureId(featureId);
        setSelectedLineFeature({
          id: featureId,
          layerId: popupLayerId,
          geometryType: 'LineString',
          name: featureName,
          layerName,
        });
        selectFeature(null);
        setPopupScreenCoords(null);
        return;
      }

      // ── Non-line features: show the popup as before ──────────────────
      // Clear any previous line selection
      setSelectedLineFeature(null);
      setSelectedPolygonFeature(null);
      setPolygonEditCoords(null);
      setPolygonEditOriginal(null);
      setPolygonEditOrigGeom(null);
      setPolygonEditOrigAttrs(null);

      // Build popup from GeoJSON
      selectFeature(featureId, {
        id: featureId,
        name: featureName,
        layerName,
        status,
        layerId: popupLayerId,
      });
      setSelectedMapFeatureId(featureId);
    },
    [selectFeature, activeLayerNames, mapLayerData, selectedPolygonFeature]
  );

  // ── Toggle layer visibility (multi-select checkboxes) ─────────────────
  // Each legend checkbox toggles ONE layer's visibility independently, so the
  // engineer can show 2+ layers at once. No isolation is applied.
  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayerVisibility((prev) => {
      const next = { ...prev };
      next[layerId] = prev[layerId] === false;
      return next;
    });
  }, []);

  // ── Helper: find an HLD feature's original geometry + attributes from active GeoJSON ──
  // Used when creating a SurveyFeature — we need to freeze the original HLD state.
  const findHldFeatureOriginal = useCallback(
    (featureId: string, layerId: string): {
      geometry: Record<string, unknown> | null;
      attributes: Record<string, unknown> | null;
    } => {
      const features = activeGeojsonRef.current[layerId];
      if (!features) return { geometry: null, attributes: null };
      const found = features.find((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        return fid === featureId;
      });
      if (!found) return { geometry: null, attributes: null };
      return {
        geometry: found.geometry as Record<string, unknown> | null,
        attributes: { ...(found.properties as Record<string, unknown>) },
      };
    },
    [],
  );

  // ── Helper: auto-switch to overlay mode when a survey edit is made ──
  // So the engineer immediately sees blue HLD + orange survey side by side.
  const autoOverlayOnEdit = useCallback(() => {
    // When entering edit mode, always switch to overlay so both HLD and
    // Survey layers are visible. This ensures the vertex marker effect
    // can find the HLD feature in the rendered layers (MapLibreMap's
    // layersRef searches rendered layers, not raw GeoJSON).
    if (displayMode !== 'overlay') {
      setDisplayMode('overlay');
    }
  }, [displayMode, setDisplayMode]);

  // ── Point drag end handler — routes through SurveyFeature store (HLD stays read-only) ──
  // Two cases:
  //   A) Engineer drags a BLUE HLD point → creates/updates a SurveyFeature (orange appears)
  //   B) Engineer drags an ORANGE survey point → updates the existing SurveyFeature directly
  // In both cases, the HLD GeoJSON is NEVER mutated.
  const handleFeatureDragEnd = useCallback(
    (featureId: string, layerId: string, newLng: number, newLat: number) => {
      // ════════════════════════════════════════════════════════════════════
      // CASE B: Dragging an orange SURVEY point (layerId starts with 'survey-')
      // The featureId IS the SurveyFeature ID — update it directly.
      // ════════════════════════════════════════════════════════════════════
      if (layerId.startsWith('survey-')) {
        const baseLayerId = layerId.slice('survey-'.length);
        const sfList = surveyFeatures[baseLayerId] ?? [];
        const sf = sfList.find((s) => s.id === featureId);
        if (!sf) {
          console.warn(`[Drag] Survey feature ${featureId} not found in ${layerId}`);
          return;
        }

        // Get old coordinates from the survey geometry
        const oldCoords = (sf.survey_geometry as any)?.coordinates as [number, number] | undefined;
        if (!oldCoords) return;
        const [oldLng, oldLat] = oldCoords;

        // Check if the point actually moved (threshold ~0.5m)
        const dist = Math.sqrt((newLng - oldLng) ** 2 + (newLat - oldLat) ** 2) * 111000;
        if (dist < 0.5) {
          console.log(`[Drag] Survey point ${featureId.slice(-8)} didn't move enough (${dist.toFixed(1)}m) — ignoring`);
          return;
        }

        // Push undo with previous survey state
        pushUndo({
          featureId,
          layerId: baseLayerId,
          oldLng,
          oldLat,
          newLng,
          newLat,
          timestamp: Date.now(),
          surveyUndo: {
            surveyFeatureId: sf.id,
            layerId: baseLayerId,
            previousGeometry: sf.survey_geometry,
            previousAttributes: sf.survey_attributes,
            previousStatus: sf.survey_status,
            description: `Re-drag survey point back to [${oldLng.toFixed(6)}, ${oldLat.toFixed(6)}]`,
          },
        });

        // Update the survey feature's geometry
        updateSurveyFeature(sf.id, baseLayerId, {
          survey_geometry: { type: 'Point', coordinates: [newLng, newLat] },
          survey_status: 'modified',
        });

        console.log(
          `[Drag] Re-dragged survey point ${featureId.slice(-8)}: [${oldLng.toFixed(6)},${oldLat.toFixed(6)}] → [${newLng.toFixed(6)},${newLat.toFixed(6)}] (${dist.toFixed(1)}m)`
        );
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // CASE A: Dragging a BLUE HLD point → create/update a SurveyFeature
      // ════════════════════════════════════════════════════════════════════
      const layerFeatures = activeGeojsonRef.current[layerId];
      if (!layerFeatures) return;

      // Find the HLD feature to get its original coordinates
      const hldFeature = layerFeatures.find((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        return fid === featureId && f.geometry?.type === 'Point';
      });
      if (!hldFeature) return;

      const [oldLng, oldLat] = hldFeature.geometry.coordinates as [number, number];

      // Check if the point actually moved (threshold ~0.5m)
      const dist = Math.sqrt((newLng - oldLng) ** 2 + (newLat - oldLat) ** 2) * 111000;
      if (dist < 0.5) {
        console.log(`[Drag] Point ${featureId} didn't move enough (${dist.toFixed(1)}m) — ignoring`);
        return;
      }

      // ── Build the new survey geometry (Point at new location) ──
      const newSurveyGeometry = {
        type: 'Point',
        coordinates: [newLng, newLat],
      };

      // ── Check if a SurveyFeature already exists for this HLD feature ──
      const existingSurvey = getSurveyFeatureForHld(featureId);
      const layerName = activeLayerNames[layerId] ?? layerId.toUpperCase();

      // ── Get original HLD geometry + attributes (frozen snapshot) ──
      const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(featureId, layerId);

      if (existingSurvey) {
        // ── UPDATE: push undo with previous state, then update via store ──
        pushUndo({
          featureId,
          layerId,
          oldLng,
          oldLat,
          newLng,
          newLat,
          timestamp: Date.now(),
          surveyUndo: {
            surveyFeatureId: existingSurvey.id,
            layerId,
            previousGeometry: existingSurvey.survey_geometry,
            previousAttributes: existingSurvey.survey_attributes,
            previousStatus: existingSurvey.survey_status,
            description: `Drag point ${featureId.slice(-8)} back to [${oldLng.toFixed(6)}, ${oldLat.toFixed(6)}]`,
          },
        });

        updateSurveyFeature(existingSurvey.id, layerId, {
          survey_geometry: newSurveyGeometry,
          survey_status: 'modified',
        });
      } else {
        // ── CREATE: upsert a new SurveyFeature referencing the HLD feature ──
        upsertSurveyFeature(
          featureId,           // hldFeatureId
          layerId,             // layerId
          layerName,           // layerName
          newSurveyGeometry,   // surveyGeometry
          origAttrs ?? {},     // surveyAttributes (copy from HLD)
          origGeom,            // originalGeometry (frozen)
          origAttrs,           // originalAttributes (frozen)
          `Dragged point from [${oldLng.toFixed(6)}, ${oldLat.toFixed(6)}] to [${newLng.toFixed(6)}, ${newLat.toFixed(6)}]`,
        ).then((sf) => {
          if (sf) {
            pushUndo({
              featureId,
              layerId,
              oldLng,
              oldLat,
              newLng,
              newLat,
              timestamp: Date.now(),
              surveyUndo: {
                surveyFeatureId: sf.id,
                layerId,
                previousGeometry: origGeom as Record<string, unknown>,
                previousAttributes: origAttrs as Record<string, unknown>,
                previousStatus: 'new',
                description: `Undo: remove survey feature for ${featureId.slice(-8)}`,
              },
            });
          }
        });
      }

      // ── Auto-switch to overlay mode so engineer sees both HLD + survey ──
      autoOverlayOnEdit();

      // ── Also record SurveyChange for audit trail (existing mechanism) ──
      const compositeKey = surveyPointKey(layerId, featureId);
      recordPointMove(featureId, compositeKey, layerId, oldLng, oldLat, newLng, newLat);

      console.log(
        `[Drag] SurveyFeature ${existingSurvey ? 'updated' : 'upserting...'} for ${featureId}: [${oldLng.toFixed(6)},${oldLat.toFixed(6)}] → [${newLng.toFixed(6)},${newLat.toFixed(6)}] (${dist.toFixed(1)}m) — HLD untouched`
      );
    },
    [pushUndo, recordPointMove, getSurveyFeatureForHld, findHldFeatureOriginal, activeLayerNames, upsertSurveyFeature, updateSurveyFeature, autoOverlayOnEdit, surveyFeatures]
  );

  // ── Handle GeoJSON changes from GeometryEditor ──────────────────────────
  const onGeometryChange = useCallback(
    (layerId: string, action: 'create',
      updatedFeatures: any[], description: string) => {
      setGeomBusy(true);

      // ── Push snapshot-based undo entry BEFORE applying changes ─────
      const prevFeatures = activeGeojsonRef.current[layerId];
      if (prevFeatures && prevFeatures.length > 0) {
        const snapshot: GeoJSONFeature[] = JSON.parse(JSON.stringify(prevFeatures));
        pushUndo({
          featureId: '',
          layerId,
          oldLng: 0,
          oldLat: 0,
          newLng: 0,
          newLat: 0,
          timestamp: Date.now(),
          layerSnapshot: {
            layerId,
            previousFeatures: snapshot,
            description: `Before: ${description}`,
          },
        });
      }

      // Update the active GeoJSON
      if (layerId.startsWith(IMPORT_ID_PREFIX)) {
        const cleanKey = layerId.slice(IMPORT_ID_PREFIX.length);
        const current = useProjectStore.getState().projectGeojsons;
        useProjectStore.getState().setProjectGeojsons({
          ...current,
          [cleanKey]: updatedFeatures,
        });
      }

      // ── Sync geometry changes to backend ────────────────────────────
      const syncProjectId = useProjectStore.getState().activeProject?.id;
      if (syncProjectId) {
        for (const feat of updatedFeatures) {
          const featId = (feat.properties as any)?.id ?? (feat.properties as any)?._id ?? '';
          if (featId && feat.geometry) {
            useProjectStore.getState().syncFeatureEdit(syncProjectId, featId, {
              geometry: feat.geometry as Record<string, unknown>,
              properties: feat.properties as Record<string, unknown>,
            });
          }
        }
      }

      console.log(`[Geometry] ${description}`);
      setGeomBusy(false);
    },
    [setGeomBusy, pushUndo],
  );

  // ── Start editing a feature (viewing → GeometryEditor editing mode) ─
  // For Points and Polygons (non-LineString features).
  const handlePointSurveyForm = useCallback((feature: EditingFeature) => {
    // ── Popup Edit on a POINT feature opens the SurveyForm ────────────────
    // The form is pre-filled with any existing survey attributes, falling
    // back to the HLD feature's original attributes. Saving creates/updates
    // a SurveyFeature — the HLD GeoJSON is never touched.
    //
    // The tapped point could be:
    //   A) An ORANGE survey point → feature.id IS the SurveyFeature id
    //   B) A BLUE HLD point → feature.id is the HLD id, linked survey optional
    const surveyById = surveyFeatures[feature.layerId]?.find((s) => s.id === feature.id);
    const surveyByHld = surveyById ?? getSurveyFeatureForHld(feature.id);
    const { attributes: origAttrs } = findHldFeatureOriginal(feature.id, feature.layerId);

    // Prefer existing survey attributes when the engineer has already entered
    // data; otherwise pre-fill from the original HLD attributes.
    const hasSurveyData = surveyByHld?.survey_attributes && Object.keys(surveyByHld.survey_attributes).length > 0;
    const initialValues = hasSurveyData ? surveyByHld.survey_attributes : (origAttrs ?? {});

    setSurveyForm({
      layerId: feature.layerId,
      featureId: surveyByHld?.id ?? feature.id,
      // Photo upload target: prefer the HLD feature id (routes to the HLD
      // endpoint). For engineer-created survey points with no HLD row, the
      // survey feature id is used — the image store routes it to the survey
      // feature photo endpoint (backend now supports survey-feature photos).
      photoTargetId: surveyByHld?.original_hld_feature ?? feature.id,
      featureName: feature.name,
      initialValues: initialValues as Record<string, unknown>,
      isNewPoint: false,
    });

    // Close the popup when the form opens
    selectFeature(null);
    setSelectedMapFeatureId(null);
    setPopupScreenCoords(null);
    // Auto-switch to overlay so a newly created orange survey point is visible
    autoOverlayOnEdit();
    console.log(`[SurveyForm] Opened form for point ${feature.id.slice(-8)} on ${feature.layerId}`);
  }, [surveyFeatures, getSurveyFeatureForHld, findHldFeatureOriginal, selectFeature, autoOverlayOnEdit]);

  // ── Start editing a LINE feature from the popup (viewing → toolbar) ─
  // Closes the popup and opens the LineSelectionToolbar.
  const handleLineEditFromPopup = useCallback((feature: EditingFeature) => {
    setSelectedLineFeature(feature);
    selectFeature(null);
    setSelectedMapFeatureId(null);
    setPopupScreenCoords(null);
    console.log(`[LineEdit] Opening toolbar for "${feature.name}"`);
  }, [selectFeature]);

  // ── Done editing (editing → viewing mode) ───────────────────────────
  const handleDoneEditing = useCallback(() => {
    setEditingFeature(null);
    setDragMode(false);
    // Clear line selection when exiting edit mode
    setSelectedLineFeature(null);
    setSelectedMapFeatureId(null);
    console.log('[Edit] Done editing');
  }, []);

  // ── Handle delete feature — mark SurveyFeature as 'removed' (HLD stays intact) ──
  // If the feature has a SurveyFeature, we set its status to 'removed' so it
  // disappears from the orange survey layer. The blue HLD feature remains untouched.
  // If the feature was engineer-created (no HLD original), we delete the SurveyFeature entirely.
  const handleDeleteFeature = useCallback(
    (featureId: string, layerId: string) => {
      // A delete can be aimed at the HLD feature or straight at the survey copy
      // (the survey view shows the SurveyFeature id), so resolve both.
      const baseLid = layerId.replace(/^survey-/, '');
      const existingSurvey =
        getSurveyFeatureForHld(featureId) ??
        (surveyFeatures[baseLid] ?? []).find((s) => s.id === featureId);

      if (existingSurvey && existingSurvey.original_hld_feature) {
          // ── HLD-backed → keep the record and mark it removed (logical delete).
          // The planner/LLD queue drops dependents off this marker, so the row
          // must survive; deleting it made "Logical delete" a silent no-op.
          pushUndo({
            featureId,
            layerId,
            oldLng: 0,
            oldLat: 0,
            newLng: 0,
            newLat: 0,
            timestamp: Date.now(),
            surveyUndo: {
              surveyFeatureId: existingSurvey.id,
              layerId: baseLid,
              previousGeometry: existingSurvey.survey_geometry,
              previousAttributes: existingSurvey.survey_attributes,
              previousStatus: existingSurvey.survey_status,
              description: `Undo: restore survey feature ${featureId.slice(-8)}`,
            },
          });
          // Optimistic local status flip so the map drops it at once; the row
          // itself stays, with its status, for the planner to review.
          const store = useSurveyFeaturesStore.getState();
          const currentLayer = store.surveyFeatures[baseLid] ?? [];
          useSurveyFeaturesStore.setState({
            surveyFeatures: {
              ...store.surveyFeatures,
              [baseLid]: currentLayer.map((sf) =>
                sf.id === existingSurvey.id ? { ...sf, survey_status: 'removed' as const } : sf
              ),
            },
          });
          updateSurveyFeature(existingSurvey.id, baseLid, { survey_status: 'removed' });
          console.log(`[Delete] SurveyFeature ${existingSurvey.id.slice(-8)} marked removed — HLD untouched`);
          return;
      }

      if (existingSurvey) {
        // ── Engineer-created (no HLD original): nothing to keep, so remove the
        // row outright — a removed marker with no design feature is noise.
        pushUndo({
          featureId, layerId: baseLid,
          oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
          timestamp: Date.now(),
          surveyUndo: {
            surveyFeatureId: existingSurvey.id, layerId: baseLid,
            previousGeometry: existingSurvey.survey_geometry,
            previousAttributes: existingSurvey.survey_attributes,
            previousStatus: existingSurvey.survey_status,
            description: `Undo: restore survey feature ${existingSurvey.id.slice(-8)}`,
          },
        });
        const store = useSurveyFeaturesStore.getState();
        const current = store.surveyFeatures[baseLid] ?? [];
        useSurveyFeaturesStore.setState({
          surveyFeatures: {
            ...store.surveyFeatures,
            [baseLid]: current.filter((sf) => sf.id !== existingSurvey.id),
          },
        });
        deleteSurveyFeature(existingSurvey.id, baseLid);
        console.log(`[Delete] Engineer-created survey feature ${existingSurvey.id.slice(-8)} deleted (map + DB)`);
        return;
      }

      {
        // ── No SurveyFeature yet: this is a pure HLD feature. Record the
        // removal as a survey change (Logical Delete) and keep it.
        const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(featureId, layerId);
        if (!origGeom) {
          console.warn(`[Delete] Cannot find HLD geometry for ${featureId} in ${layerId} — cannot create removed entry`);
          return;
        }
        const layerName = activeLayerNames[layerId] ?? layerId.toUpperCase();
        // The removal is tied to the HLD feature it replaces
        // (original_hld_feature = featureId): the LLD review groups changes by
        // that link, so a removal with no parent reads as a brand-new field
        // feature instead of a removal of this one.
        upsertSurveyFeature(
          featureId,
          layerId,
          layerName,
          origGeom as Record<string, unknown>,
          origAttrs ?? {},
          origGeom,
          origAttrs,
          `Feature removed from survey`,
          undefined,
          undefined,
          'removed',
        ).then((removedSf) => {
          if (removedSf) {
            pushUndo({
              featureId,
              layerId,
              oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
              timestamp: Date.now(),
              surveyUndo: {
                surveyFeatureId: removedSf.id,
                layerId,
                previousGeometry: removedSf.survey_geometry,
                previousAttributes: removedSf.survey_attributes,
                previousStatus: removedSf.survey_status,
                description: `Undo: restore removed feature ${featureId.slice(-8)}`,
              },
            });
            console.log(`[Delete] HLD ${featureId.slice(-8)} marked removed (survey_status=removed, kept for review)`);
          }
        }).catch((err) => {
          console.error(`[Delete] Failed to create removed survey feature:`, err);
        });
      }
    },
    [getSurveyFeatureForHld, surveyFeatures, updateSurveyFeature, deleteSurveyFeature, pushUndo, findHldFeatureOriginal, upsertSurveyFeature, activeLayerNames],
  );

  // ── Handle logical delete of a LINE feature with confirmation dialog ──
  // HLD is NEVER touched — only the SurveyFeature is marked as 'removed'.
  const handleLineDelete = useCallback(() => {
    if (!selectedLineFeature) return;
    const name = selectedLineFeature.name ?? 'this feature';
    const message = `Remove "${name}" from the survey?\n\nThis will NOT delete the original HLD feature.`;
    // Web: use window.confirm. Native: use Alert.alert.
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(message)) return;
    } else {
      // Native: Alert.alert is async, so we wrap in a promise-like pattern
      // by immediately executing via a flag set in the callback.
      // We use a simple approach: show alert and handle in callback.
      const { Alert } = require('react-native');
      Alert.alert('Remove Feature', message, [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        { text: 'Delete', style: 'destructive', onPress: () => {
          handleDeleteFeature(selectedLineFeature.id, selectedLineFeature.layerId);
          setSelectedLineFeature(null);
          setSelectedMapFeatureId(null);
          setPopupScreenCoords(null);
          setLineToolMode(null);
          setContinueLineAnchor(null);
          setContinueLinePoints(0);
          lastContinueTapRef.current = null;
          setDeleteSectionRange(null);
        }},
      ]);
      return;
    }
    handleDeleteFeature(selectedLineFeature.id, selectedLineFeature.layerId);
    setSelectedLineFeature(null);
    setSelectedMapFeatureId(null);
    setPopupScreenCoords(null);
    setLineToolMode(null);
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    lastContinueTapRef.current = null;
    setDeleteSectionRange(null);
  }, [selectedLineFeature, handleDeleteFeature]);

  // ── Deselect the currently selected line feature ──────────────────────
  const handleLineDeselect = useCallback(() => {
    setSelectedLineFeature(null);
    setSelectedMapFeatureId(null);
    // Exit move mode + clear temp state + exit any line tool mode so the
    // map tap handler returns to normal popup/selection behavior.
    setLineMoveMode(false);
    setTempLineCoords(null);
    setTempLineOriginal(null);
    setLineToolMode(null);
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    setContinueSnapTarget(null);
    setContinueStartPt(null);
    setContinueIsSpur(false);
    lastContinueTapRef.current = null;
    setDeleteSectionRange(null);
  }, []);

  // ── Toggle Move Mode for the selected line ────────────────────────────
  // On activate: extract the HLD line's coordinates into tempLineCoords (working copy)
  // On deactivate: discard temp changes (user must press Save to persist)
  const handleToggleMove = useCallback(() => {
    if (!selectedLineFeature) {
      console.warn('[MoveMode] GUARD 1: no selectedLineFeature');
      return;
    }

    // Toggle against the ACTIVE TOOL, not the shared edit flag: an armed
    // tool (Del Section / Draw Segment) also sets lineMoveMode, and clicking
    // Reroute then must SWITCH to Reroute instead of exiting every tool.
    if (lineMoveMode && lineToolMode === null) {
      // ── Exit Move Mode — discard temp changes ──
      setBundleSkipLayers([]);
      setLineMoveMode(false);
      setTempLineCoords(null);
      setTempLineOriginal(null);
      setLineToolMode(null);
      setContinueLineAnchor(null);
      setContinueLinePoints(0);
      setContinueSnapTarget(null);
      setContinueStartPt(null);
    setContinueIsSpur(false);
      lastContinueTapRef.current = null;
      setDeleteSectionRange(null);
      console.log('[MoveMode] Exited — temp changes discarded');
    } else {
      // ── Keep an already-dirty working copy ──
      // Switching tools (e.g. Split here → Edit shape) must not silently throw
      // away a bend the engineer just placed: if the working copy already
      // differs from its baseline, keep it and only change the active tool.
      const copyIsDirty =
        !!tempLineCoords && !!tempLineOriginal &&
        tempLineCoords.length >= 2 && tempLineCoords.length === tempLineOriginal.length
          ? tempLineCoords.some((c, i) => {
              const b = tempLineOriginal![i];
              return Math.hypot(c[0] - b[0], c[1] - b[1]) * 111000 > 0.5;
            })
          : !!tempLineCoords && !!tempLineOriginal && tempLineCoords.length !== tempLineOriginal.length;
      if (copyIsDirty) {
        setLineToolMode(null);
        setDeleteSectionRange(null);
        setContinueLineAnchor(null);
        setContinueLinePoints(0);
        setContinueSnapTarget(null);
        setContinueStartPt(null);
    setContinueIsSpur(false);
        lastContinueTapRef.current = null;
        setLineMoveMode(true);
        autoOverlayOnEdit();
        console.log('[MoveMode] Switched to Edit shape — keeping the unsaved working copy');
        return;
      }

      // ── Enter Move Mode — extract HLD coordinates into temp copy ──
      const { id: featureId, layerId } = selectedLineFeature;
      console.log(`[MoveMode] DEBUG: featureId=${featureId}, layerId=${layerId}, hasImported=${hasImportedData}`);
      const features = activeGeojsonRef.current[layerId];
      if (!features) {
        console.warn(`[MoveMode] GUARD 2: no features in activeGeojsonRef for layerId=${layerId}. Available keys: ${Object.keys(activeGeojsonRef.current).join(', ')}`);
        return;
      }

      // Try direct ID match first
      let hldFeature = features.find((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        return fid === featureId;
      });

      // Fallback: match by index in the layer's feature ID map
      // This handles cases where the map feature's _id (from buildMapLayerData)
      // differs from the original GeoJSON feature's .id (in activeGeojsonRef).
      if (!hldFeature) {
        const idMap = importFeatureIdMap?.[layerId];
        const idMapSize = idMap?.length ?? 0;
        console.log(`[MoveMode] DEBUG: direct match failed, trying fallback. idMap=${!!idMap}, idMapSize=${idMapSize}, features.length=${features.length}`);
        if (idMap) {
          const idx = idMap.indexOf(featureId);
          console.log(`[MoveMode] DEBUG: fallback idx=${idx}`);
          if (idx >= 0 && idx < features.length) {
            hldFeature = features[idx];
            console.log(`[MoveMode] DEBUG: fallback found feature, geomType=${hldFeature?.geometry?.type}`);
          }
        }
      }

      // Fallback #2: the tapped feature may be a SURVEY feature (a previous
      // survey edit). Its id is the SurveyFeature UUID, which never exists in
      // the HLD/imported GeoJSON or the import id map. Re-editing it must use
      // the CURRENT survey geometry as the baseline so the engineer continues
      // from their last saved change — and Save updates that same survey
      // feature instead of creating a duplicate.
      if (!hldFeature) {
        const sfList = surveyFeatures[layerId] ?? [];
        const surveySf = sfList.find((sf) => sf.id === featureId);
        if (surveySf) {
          const sGeom = surveySf.survey_geometry as { type?: string; coordinates?: unknown[] } | null;
          const sType = sGeom?.type;
          if (sGeom && (sType === 'LineString' || sType === 'MultiLineString')) {
            hldFeature = {
              type: 'Feature',
              geometry: sGeom as { type: string; coordinates: unknown[] },
              properties: {
                ...(surveySf.survey_attributes ?? {}),
                _survey_feature_id: surveySf.id,
                _hld_feature_id: surveySf.original_hld_feature,
              },
            };
            console.log(`[MoveMode] Re-editing survey feature ${surveySf.id.slice(-8)} — baseline = survey geometry (${surveySf.survey_status})`);
          } else {
            console.warn(`[MoveMode] Survey feature ${featureId.slice(-12)} has unsupported geom=${sType}`);
          }
        } else {
          console.warn(`[MoveMode] GUARD 3b: not found in HLD data or survey store, featureId=${featureId.slice(-12)}`);
        }
      }

      // Accept both LineString and MultiLineString (multi-line features are common in imports).
      // If this HLD feature already carries a survey change, the reroute tool
      // must show and continue from the CURRENT survey geometry (the engineer's
      // change), not the original HLD path — otherwise the saved edits appear
      // "lost" the moment the tool opens.
      let baselineGeom: { type: string; coordinates: unknown[] } | null = hldFeature?.geometry ?? null;
      const surveyBaseline = getSurveyFeatureForHld(featureId);
      if (surveyBaseline) {
        const sGeom = surveyBaseline.survey_geometry as { type?: string; coordinates?: unknown[] } | null;
        const sType = sGeom?.type;
        if (sGeom && (sType === 'LineString' || sType === 'MultiLineString')) {
          baselineGeom = sGeom as { type: string; coordinates: unknown[] };
          console.log(`[MoveMode] Baseline = survey geometry for ${featureId.slice(-8)} (status=${surveyBaseline.survey_status})`);
        }
      }
      const geomType = baselineGeom?.type;
      if (!baselineGeom || (geomType !== 'LineString' && geomType !== 'MultiLineString')) {
        console.warn(`[MoveMode] GUARD 3: unsupported geom=${geomType}, featureId=${featureId.slice(-12)}`);
        return;
      }

      // Extract coordinates: MultiLineString uses the first line's coordinate array.
      const rawCoords =
        geomType === 'MultiLineString'
          ? (baselineGeom.coordinates as [number, number][][])[0] ?? []
          : (baselineGeom.coordinates as [number, number][]);
      const coords = rawCoords as [number, number][];
      const coordsCopy = coords.map(([lng, lat]) => [lng, lat] as [number, number]);
      const originalCopy = coords.map(([lng, lat]) => [lng, lat] as [number, number]);

      setBundleSkipLayers([]);
      setTempLineCoords(coordsCopy);
      setTempLineOriginal(originalCopy);
      // Starting Reroute disarms any other line tool so exactly one
      // tool is ever active (and the hint matches the active tool).
      setLineToolMode(null);
      setDeleteSectionRange(null);
      setContinueLineAnchor(null);
      setContinueLinePoints(0);
      setContinueSnapTarget(null);
      setContinueStartPt(null);
    setContinueIsSpur(false);
      lastContinueTapRef.current = null;
      setLineMoveMode(true);
      autoOverlayOnEdit();
      console.log(`[MoveMode] Activated for ${featureId.slice(-8)} — ${coordsCopy.length} vertices`);
    }
  }, [selectedLineFeature, lineMoveMode, lineToolMode, autoOverlayOnEdit, importFeatureIdMap, surveyFeatures, getSurveyFeatureForHld, tempLineCoords, tempLineOriginal]);

  // ── Bundle reroute propagation ──────────────────────────────────────────
  // Rerouting a support line (trench/duct) means that route has a problem —
  // every layer riding on it (duct rides in trench, cable rides in duct)
  // must follow the NEW path in the same survey change. Only the moved
  // REGION is re-laid; shared endpoints and parts on other lines stay put.
  const propagateBundleReroute = useCallback(
    (
      supportFeatureId: string,
      supportLayerId: string,
      oldPath: [number, number][],
      newPath: [number, number][],
      /** Layer ids the engineer unticked in the pre-Save bundle list */
      skipLayers: string[] = [],
    ) => {
      const cleanLayer = cleanLayerId(supportLayerId);
      // The whole corridor follows: every other line layer (feeder, distribution,
      // garden/drop, duct, cable) that rides on the moved region is re-laid onto
      // the new path. The region relay keeps anything not co-located untouched.
      const dependents = BUNDLE_LINE_LAYERS.filter((l) => l !== cleanLayer);
      if (dependents.length === 0) {
        console.log(`[Bundle] No other corridor layers for ${cleanLayer} — nothing to relay`);
        return;
      }
      const tolM = 8; // co-location tolerance (meters) — a vertex is "riding on" the moved region within this
      let relayedCount = 0;
      const relayedDesc: string[] = [];

      for (const depLayer of dependents) {
        if (skipLayers.includes(depLayer)) {
          console.log(`[Bundle] ${depLayer} opted out of the reroute relay — left untouched`);
          continue;
        }
        const depLayerName = (LAYER_NAMES[depLayer] ?? depLayer.toUpperCase());
        // Survey store + map layers are keyed by the map layer id ('imp-' prefix)
        const depMapKey = `${IMPORT_ID_PREFIX}${depLayer}`;
        const hldFeats = activeGeojsonRef.current[depMapKey] ?? [];
        const surveySfs = surveyFeatures[depMapKey] ?? [];

        // ── Build candidate list: HLD features + existing survey features ──
        const candidates: Array<{
          hldId: string | null;
          sfId: string | null;
          baseGeom: { type: string; coordinates: unknown } | null;
          origGeom: Record<string, unknown> | null;
          origAttrs: Record<string, unknown> | null;
        }> = [];

        for (const f of hldFeats) {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const hldId = String(props.id ?? props._id ?? props.feature_id ?? '');
          if (!hldId) continue;
          const geom = f.geometry as { type: string; coordinates: unknown } | null;
          if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) continue;
          candidates.push({ hldId, sfId: null, baseGeom: geom, origGeom: geom, origAttrs: props });
        }

        for (const sf of surveySfs) {
          if (sf.survey_status === 'removed') continue;
          const sGeom = sf.survey_geometry as { type?: string; coordinates?: unknown } | null;
          if (!sGeom || (sGeom.type !== 'LineString' && sGeom.type !== 'MultiLineString')) continue;
          // Skip if already covered via an HLD candidate for the same hld id
          if (sf.original_hld_feature && candidates.some((c) => c.hldId === sf.original_hld_feature)) continue;
          candidates.push({
            hldId: sf.original_hld_feature,
            sfId: sf.id,
            baseGeom: sGeom as { type: string; coordinates: unknown },
            origGeom: (sf.original_geometry as Record<string, unknown> | null) ?? null,
            origAttrs: (sf.survey_attributes ?? {}) as Record<string, unknown>,
          });
        }

        for (const cand of candidates) {
          const newGeom = relayFeatureGeom(cand.baseGeom, oldPath, newPath, tolM);
          if (!newGeom) continue;

          const reason = `Rerouted with ${cleanLayer} ${supportFeatureId.slice(-8)} (bundle propagation)`;
          if (cand.sfId) {
            // Existing survey feature (standalone / previously created)
            updateSurveyFeature(cand.sfId, depMapKey, {
              survey_geometry: newGeom as Record<string, unknown>,
              survey_status: 'modified',
            });
            relayedCount++;
            relayedDesc.push(`${depLayerName} #${cand.sfId.slice(-6)} (updated)`);
          } else if (cand.hldId) {
            // Existing HLD feature → create/update a survey copy
            const existingSf = surveySfs.find((s) => s.original_hld_feature === cand.hldId);
            if (existingSf) {
              updateSurveyFeature(existingSf.id, depMapKey, {
                survey_geometry: newGeom as Record<string, unknown>,
                survey_status: 'modified',
              });
              relayedCount++;
              relayedDesc.push(`${depLayerName} #${existingSf.id.slice(-6)} (updated)`);
            } else {
              upsertSurveyFeature(
                cand.hldId, depMapKey, depLayerName,
                newGeom as Record<string, unknown>,
                cand.origAttrs ?? {},
                cand.origGeom,
                cand.origAttrs,
                reason,
              ).then((sf) => {
                if (sf) console.log(`[Bundle] Relayed ${depLayerName} ${sf.id.slice(-6)} with ${cleanLayer}`);
              });
              relayedCount++;
              relayedDesc.push(`${depLayerName} #${cand.hldId.slice(-6)} (created)`);
            }
          }
        }
      }

      if (relayedCount > 0) {
        console.log(`[Bundle] ${cleanLayer} reroute relayed to ${relayedCount} dependent feature(s): ${relayedDesc.join(', ')}`);
      } else {
        console.log(`[Bundle] ${cleanLayer} reroute: no other corridor layers ride the moved region`);
      }
    },
    [activeGeojsonRef, surveyFeatures, updateSurveyFeature, upsertSurveyFeature],
  );

  // ── Save the temporary line geometry to the survey-features store ──────
  // Creates or updates a SurveyFeature with the modified geometry.
  // HLD geometry is never touched.
  const handleSaveLine = useCallback(async () => {
    if (!selectedLineFeature || !tempLineCoords || !tempLineOriginal) return;
    // Draw Segment: block saving before both points are placed.
    // Extensions keep continueLinePoints at 0 (re-armed for the next step), so a
    // grown working copy (longer than the baseline) is still a valid save.
    if (
      lineToolMode === 'continue-line' &&
      continueLinePoints === 0 &&
      tempLineCoords.length === tempLineOriginal.length
    ) {
      console.log('[Continue] Draw the segment first — tap start, then destination');
      return;
    }

    const { id: featureId, layerId, layerName } = selectedLineFeature;
    // Resolve the existing survey feature BEFORE the no-op guard (it decides
    // whether the baseline is the previous survey edit or the HLD original).
    const surveyById = surveyFeatures[layerId]?.find((s) => s.id === featureId);
    const existingSurvey = surveyById ?? getSurveyFeatureForHld(featureId);
    const surveyGeometry = { type: 'LineString', coordinates: tempLineCoords };

    // ── No-op guard: a save whose geometry is identical to the baseline
    // (or within ~0.5 m) must NOT create/update a SurveyFeature. Silent
    // no-op saves are how "changes" with zero before/after difference end
    // up in the database — the LLD then sees old_path == new_path and has
    // nothing to enforce, so reroutes appear to "not change the trenches".
    // When the baseline is itself a survey edit (re-edit), compare against
    // the PREVIOUS survey geometry; otherwise against the HLD original.
    const baselineForNoop = (() => {
      if (existingSurvey?.survey_geometry) {
        const sg = existingSurvey.survey_geometry as { type?: string; coordinates?: unknown } | null;
        if (sg && sg.type === 'LineString' && Array.isArray(sg.coordinates)) {
          return sg.coordinates as [number, number][];
        }
      }
      return tempLineOriginal;
    })();
    if (baselineForNoop && baselineForNoop.length === tempLineCoords.length) {
      let maxShift = 0;
      for (let i = 0; i < baselineForNoop.length; i++) {
        const a = baselineForNoop[i] as [number, number];
        const b = tempLineCoords[i] as [number, number];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) * 111000;
        if (d > maxShift) maxShift = d;
      }
      if (maxShift < 0.5) {
        console.log(`[MoveMode] Save blocked — line ${featureId.slice(-8)} unchanged (max shift ${maxShift.toFixed(1)}m). No SurveyFeature written.`);
        showToast('No change detected — drag a vertex before saving', 'warning');
        setTempLineCoords(null);
        setTempLineOriginal(null);
        setLineMoveMode(false);
        return;
      }
    }

    // Check if a SurveyFeature already exists for this feature (resolved above
    // for the no-op guard). The HLD feature's frozen geometry/attributes are
    // the before-state of the change.
    const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(featureId, layerId);

    // ── Merge the snapped object's details into the line's attributes ──
    // When the draw-segment path ended on an object point (premise/pdp/mfg),
    // record the connection + key attributes so LLD automation can trace a
    // continuous route: PDP → path → premise. Only the line carries the
    // reference (object points don't hold connected-line data).
    let surveyAttrs: Record<string, unknown> = existingSurvey
      ? (existingSurvey.survey_attributes ?? origAttrs ?? {})
      : (origAttrs ?? {});
    if (continueSnapTarget) {
      const rawLayer = continueSnapTarget.layerId
        .replace(/^survey-/, '')
        .replace(/^imp-/, '');
      if (continueSnapTarget.kind === 'line') {
        // Trench-to-trench joint: which line, which corner, endpoint or not.
        // LLD automation traces a continuous route through these joints.
        surveyAttrs = {
          ...surveyAttrs,
          connected_line_id: continueSnapTarget.id,
          connected_line_layer: rawLayer,
          connected_line_name: continueSnapTarget.name,
          connected_line_vertex: continueSnapTarget.vertexIdx ?? null,
          connected_line_endpoint: continueSnapTarget.isEndpoint ?? false,
          connected_line_lng: continueSnapTarget.lng,
          connected_line_lat: continueSnapTarget.lat,
        };
      } else {
        const cleanProps = Object.fromEntries(
          Object.entries(continueSnapTarget.properties ?? {}).filter(([k]) => !k.startsWith('_'))
        );
        surveyAttrs = {
          ...surveyAttrs,
          connected_object_id: continueSnapTarget.id,
          // Store the RAW base layer id (strip survey-/imp- prefixes) so LLD
          // automation gets a clean layer reference: e.g. 'objects' not 'survey-objects'.
          connected_object_layer: rawLayer,
          connected_object_name: continueSnapTarget.name,
          connected_object_lng: continueSnapTarget.lng,
          connected_object_lat: continueSnapTarget.lat,
          ...cleanProps, // merge the object's own attributes (premise_id, address, etc.)
        };
      }
    }

    // ── Spur save: the segment becomes its OWN trench feature ──
    // A spur must never overwrite the selected line — it is created with no
    // HLD parent (like Add Point / Draw Trench output) and carries the
    // connection attributes above so the joint is traceable.
    if (lineToolMode === 'continue-line' && continueIsSpur) {
      const segGeometry = { type: 'LineString', coordinates: tempLineCoords };
      try {
        const sf = await upsertSurveyFeature(
          null, layerId, layerName,
          segGeometry,
          surveyAttrs,
          null, null,
          continueSnapTarget
            ? `Drew spur trench to ${continueSnapTarget.name} #${continueSnapTarget.id.slice(-6)}`
            : 'Drew spur trench segment',
        );
        if (sf) {
          pushUndo({
            featureId, layerId,
            oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
            timestamp: Date.now(),
            surveyUndo: {
              surveyFeatureId: sf.id,
              layerId,
              previousGeometry: segGeometry as Record<string, unknown>,
              previousAttributes: {},
              previousStatus: 'new',
              description: `Undo: remove spur trench for ${featureId.slice(-8)}`,
              deleteOnUndo: true,
            },
          });
          showToast(
            useOfflineStore.getState().isOnline
              ? 'Saved — spur trench created as its own feature'
              : 'Saved on device — spur trench will sync when back online',
            'success',
          );
        } else if (activeProject?.id.startsWith('imported-')) {
          showToast('Imported project — edit kept on device only', 'info');
        } else {
          showToast('Save failed — check the server connection and retry', 'error');
          return;
        }
      } catch (err) {
        console.error('[Continue] Spur save failed:', err);
        showToast('Save failed — check the server connection and retry', 'error');
        return;
      }
      setTempLineCoords(null);
      setTempLineOriginal(null);
      setLineMoveMode(false);
      setLineToolMode(null);
      setContinueLineAnchor(null);
      setContinueLinePoints(0);
      setContinueSnapTarget(null);
      setContinueStartPt(null);
      setContinueIsSpur(false);
      lastContinueTapRef.current = null;
      setDeleteSectionRange(null);
      console.log(`[Continue] Spur trench saved for ${featureId.slice(-8)}${continueSnapTarget ? ` (joined to ${continueSnapTarget.name})` : ''}`);
      return;
    }

    if (existingSurvey) {
      // Update existing survey feature
      pushUndo({
        featureId,
        layerId,
        oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
        timestamp: Date.now(),
        surveyUndo: {
          surveyFeatureId: existingSurvey.id,
          layerId,
          previousGeometry: existingSurvey.survey_geometry,
          previousAttributes: existingSurvey.survey_attributes,
          previousStatus: existingSurvey.survey_status,
          description: `Undo line move for ${featureId.slice(-8)}`,
        },
      });
      try {
        await updateSurveyFeature(existingSurvey.id, layerId, {
          survey_geometry: surveyGeometry,
          survey_attributes: surveyAttrs,
          survey_status: 'modified',
        });
        showToast(
          useOfflineStore.getState().isOnline
            ? `Saved — ${layerName || 'line'} updated`
            : `Saved on device — ${layerName || 'line'} will sync when back online`,
          'success',
        );
      } catch (err) {
        console.error('[MoveMode] Save failed:', err);
        showToast('Save failed — check the server connection and retry', 'error');
        return; // keep the temp geometry so the engineer can retry without redrawing
      }
    } else {
      // Create new survey feature
      try {
        const sf = await upsertSurveyFeature(
          featureId, layerId, layerName,
          surveyGeometry,
          surveyAttrs,
          origGeom, origAttrs,
          continueSnapTarget
            ? `Drew segment to ${continueSnapTarget.name} #${continueSnapTarget.id.slice(-6)} (${tempLineOriginal.length} → ${tempLineCoords.length} vertices)`
            : `Moved line vertices (original: ${tempLineOriginal.length} vertices, new: ${tempLineCoords.length} vertices)`,
        );
        if (sf) {
          pushUndo({
            featureId, layerId,
            oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
            timestamp: Date.now(),
            surveyUndo: {
              surveyFeatureId: sf.id, layerId,
              previousGeometry: { type: 'LineString', coordinates: tempLineOriginal } as Record<string, unknown>,
              previousAttributes: origAttrs as Record<string, unknown> ?? {},
              previousStatus: 'new',
              description: `Undo: remove survey feature for line ${featureId.slice(-8)}`,
            },
          });
          showToast(
            sf.sync_status === 'pending'
              ? 'Saved on device — will sync when back online'
              : `Saved — ${layerName || 'line'} change recorded`,
            'success',
          );
        } else if (activeProject?.id.startsWith('imported-')) {
          showToast('Imported project — edit kept on device only', 'info');
        } else {
          showToast('Save failed — check the server connection and retry', 'error');
          return;
        }
      } catch (err) {
        console.error('[MoveMode] Save failed:', err);
        showToast('Save failed — check the server connection and retry', 'error');
        return;
      }
    }

    // Staged split: span 1 has just saved, so create span 2 now.
    const pendingSplit = pendingSplitRef.current;
    const wasSplit = pendingSplit !== null && pendingSplit.hldFeatureId === featureId;
    pendingSplitRef.current = null;
    if (wasSplit && pendingSplit) {
      writeSplitSpan2Ref.current?.(pendingSplit, tempLineCoords);
    }

    // Bundle propagation belongs only to Reroute. Draw Segment is an
    // independent two-point addition and must never rewrite neighbouring
    // corridor features as if the selected line had been diverted.
    // Propagation runs OUTSIDE the save try/catch and must never take a
    // successful save down with it: a relay throw used to leave the toolbar
    // open on saved geometry, and the retry then hit the no-op guard
    // ("No change detected") — the reroute looked unsavable when it was
    // already saved. The detour itself is persisted above; a failed relay
    // only warns.
    if (lineToolMode !== 'continue-line' && !wasSplit) {
      try {
        propagateBundleReroute(featureId, layerId, tempLineOriginal, tempLineCoords, bundleSkipLayers);
      } catch (bundleErr) {
        console.warn('[MoveMode] Bundle relay failed after save — detour itself is saved:', bundleErr instanceof Error ? bundleErr.message : bundleErr);
        showToast('Saved — but neighbouring lines did not follow. Re-save to retry the relay.', 'warning');
      }
    }
    setBundleSkipLayers([]);

    // Clear temp state + exit move mode + exit any line tool mode so the
    // map tap handler returns to normal popup/selection behavior.
    setTempLineCoords(null);
    setTempLineOriginal(null);
    setLineMoveMode(false);
    setLineToolMode(null);
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    setContinueSnapTarget(null);
    setContinueStartPt(null);
    setContinueIsSpur(false);
    lastContinueTapRef.current = null;
    setDeleteSectionRange(null);
    console.log(`[MoveMode] Saved line geometry for ${featureId.slice(-8)} — SurveyFeature ${existingSurvey ? 'updated' : 'created'}${continueSnapTarget ? ` (snapped to ${continueSnapTarget.name})` : ''}`);
  },    [selectedLineFeature, tempLineCoords, tempLineOriginal, getSurveyFeatureForHld, findHldFeatureOriginal, pushUndo, updateSurveyFeature, upsertSurveyFeature, continueSnapTarget, surveyFeatures, propagateBundleReroute, lineToolMode, continueLinePoints, continueIsSpur, showToast, bundleSkipLayers]);

  // ── Delete Section handlers ────────────────────────────────────────────

  const handleDeleteSectionToggle = useCallback(() => {
    if (!selectedLineFeature) return;
    if (lineToolMode === 'delete-section') {
      setLineMoveMode(false);
      setLineToolMode(null);
      setDeleteSectionRange(null);
      deleteSectionHistoryRef.current = [];
      setTempLineCoords(null);
      setTempLineOriginal(null);
      return;
    }
    const { id: featureId, layerId } = selectedLineFeature;
    const features = activeGeojsonRef.current[layerId];
    if (!features) return;
    let hldFeature = features.find((f) => {
      const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
      return fid === featureId;
    });
    if (!hldFeature) {
      const idMap = importFeatureIdMap?.[layerId];
      if (idMap) { const idx = idMap.indexOf(featureId); if (idx >= 0 && idx < features.length) hldFeature = features[idx]; }
    }
    const geomType = hldFeature?.geometry?.type;
    if (!hldFeature?.geometry || (geomType !== 'LineString' && geomType !== 'MultiLineString')) return;
    const rawCoords =
      geomType === 'MultiLineString'
        ? (hldFeature.geometry.coordinates as [number, number][][])[0] ?? []
        : (hldFeature.geometry.coordinates as [number, number][]);
    const coords = (rawCoords as [number, number][]).map(([lng, lat]) => [lng, lat] as [number, number]);
    setTempLineCoords(coords);
    setTempLineOriginal(coords.map(([lng, lat]) => [lng, lat] as [number, number]));
    setLineMoveMode(true);
    setLineToolMode('delete-section');
    setDeleteSectionRange(null);
    deleteSectionHistoryRef.current = [];
    // Drop any Draw Segment progress so the two tools cannot both be live.
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    setContinueSnapTarget(null);
    setContinueStartPt(null);
    setContinueIsSpur(false);
    lastContinueTapRef.current = null;
    autoOverlayOnEdit();
  }, [selectedLineFeature, lineToolMode, importFeatureIdMap, autoOverlayOnEdit]);

  // ── Continue Line handler ────────────────────────────────────────────
  // Activates vertex markers. User taps endpoint vertex, then taps a Point
  // feature to extend the line from that endpoint to the point.
  const handleContinueToggle = useCallback(() => {
    if (!selectedLineFeature) return;
    if (lineToolMode === 'continue-line') {
      // ── Deactivate ──
      setLineMoveMode(false);
      setLineToolMode(null);
      setContinueLineAnchor(null);
      setContinueLinePoints(0);
      setContinueSnapTarget(null);
      setContinueStartPt(null);
      setContinueIsSpur(false);
      lastContinueTapRef.current = null;
      setTempLineCoords(null);
      setTempLineOriginal(null);
      return;
    }
    // ── Activate: extract HLD coordinates, show vertex markers ──
    const { id: featureId, layerId } = selectedLineFeature;
    const features = activeGeojsonRef.current[layerId];
    if (!features) return;
    let hldFeature = features.find((f) => {
      const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
      return fid === featureId;
    });
    if (!hldFeature) {
      const idMap = importFeatureIdMap?.[layerId];
      if (idMap) { const idx = idMap.indexOf(featureId); if (idx >= 0 && idx < features.length) hldFeature = features[idx]; }
    }
    const geomType = hldFeature?.geometry?.type;
    if (!hldFeature?.geometry || (geomType !== 'LineString' && geomType !== 'MultiLineString')) return;
    const rawCoords =
      geomType === 'MultiLineString'
        ? (hldFeature.geometry.coordinates as [number, number][][])[0] ?? []
        : (hldFeature.geometry.coordinates as [number, number][]);
    const coords = (rawCoords as [number, number][]).map(([lng, lat]) => [lng, lat] as [number, number]);
    setTempLineCoords(coords);
    setTempLineOriginal(coords.map(([lng, lat]) => [lng, lat] as [number, number]));
    // Draw Segment is a free two-point tool: NO reroute vertex handles, NO
    // tap-on-the-line requirement. lineMoveMode stays OFF so the map renders
    // no vertex markers and taps anywhere on the map are accepted.
    setLineToolMode('continue-line');
    setDeleteSectionRange(null);
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    setContinueSnapTarget(null);
    setContinueStartPt(null);
    setContinueIsSpur(false);
    lastContinueTapRef.current = null;
    autoOverlayOnEdit();
  }, [selectedLineFeature, lineToolMode, importFeatureIdMap, autoOverlayOnEdit]);

  const handleDeleteSectionConfirm = useCallback(async () => {
    if (!deleteSectionRange || !tempLineCoords || !tempLineOriginal || !selectedLineFeature) return;
    const [a, b] = deleteSectionRange;
    if (a === b) {
      showToast('Pick both ends of the gap first — tap the line a second time', 'warning');
      return;
    }
    // ── Split into disconnected segments at the deletion boundary ──
    // Keep B and D as endpoints of the remaining segments — only delete
    // vertices BETWEEN them. Pure so the split can be unit-tested.
    const { start, end, segments, removedM } = planSpanRemoval(tempLineCoords, a, b);
    if (segments.length === 0) {
      // Both ends of the line were picked: there is nothing left to keep, and
      // silently doing nothing is what made this tool feel broken. Keep the
      // tool armed and say what the engineer should use instead.
      console.warn('[DeleteSection] No valid segments remain after deletion — aborting');
      showToast('That is the whole line — use Delete to retire the feature instead', 'warning');
      return;
    }

    const { id: featureId, layerId, layerName } = selectedLineFeature;
    const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(featureId, layerId);
    const reason = end > start + 1
      ? `Removed section (vertices ${start + 2}–${end})`
      : `Split at vertices ${start + 1}–${end + 1}`;

    // ── First segment: update existing Survey Feature (or create new, tied to HLD) ──
    const existingSurvey = getSurveyFeatureForHld(featureId);
    const firstGeom = { type: 'LineString', coordinates: segments[0] } as Record<string, unknown>;
    // One removal writes one or two rows. Both are recorded in a SINGLE undo
    // entry: pressing Undo once has to put the line back whole. Two entries left
    // the engineer with the original line plus a stray extra piece after one
    // press — a silent duplicate in the planner's data.
    const createdSegmentIds: string[] = [];
    let undoMain: NonNullable<UndoEntry['surveyUndo']> | null = null;

    if (existingSurvey) {
      undoMain = {
        surveyFeatureId: existingSurvey.id,
        layerId,
        previousGeometry: existingSurvey.survey_geometry,
        previousAttributes: existingSurvey.survey_attributes,
        previousStatus: existingSurvey.survey_status,
        description: `Undo section removal for ${featureId.slice(-8)}`,
      };
      updateSurveyFeature(existingSurvey.id, layerId, { survey_geometry: firstGeom, survey_status: 'modified', change_reason: reason });
    } else {
      const sf = await upsertSurveyFeature(featureId, layerId, layerName, firstGeom, origAttrs ?? {}, origGeom, origAttrs, reason);
      if (sf) {
        // There was no survey row before this cut, so undoing it deletes the row
        // instead of restoring one — the project ends up exactly as it started.
        undoMain = {
          surveyFeatureId: sf.id,
          layerId,
          previousGeometry: firstGeom,
          previousAttributes: {},
          previousStatus: 'new',
          description: `Undo: remove survey feature for ${featureId.slice(-8)}`,
          deleteOnUndo: true,
        };
      }
    }

    // ── Additional segments: their OWN backend features, like spur trenches ──
    // They used to be local-only mocks with a synthetic hldFeatureId (which
    // 500s on the API), so a separation silently vanished on reload — the
    // planner never saw the second half. Created parentless; offline they
    // are kept locally + queued by the store itself.
    for (let i = 1; i < segments.length; i++) {
      const segGeom = { type: 'LineString', coordinates: segments[i] } as Record<string, unknown>;
      const segReason = `${reason} (segment ${i + 1})`;
      try {
        const segSf = await upsertSurveyFeature(
          null, layerId, layerName, segGeom,
          (origAttrs ?? {}) as Record<string, unknown>,
          null, null, segReason,
        );
        if (segSf) {
          console.log(`[DeleteSection] Created backend segment ${i + 1} (${segSf.id.slice(-8)}) for ${featureId.slice(-8)}`);
          createdSegmentIds.push(segSf.id);
        } else {
          console.warn(`[DeleteSection] Segment ${i + 1} not persisted (imported project or server refusal) — kept in map only for this session`);
        }
      } catch (err) {
        console.warn(`[DeleteSection] Segment ${i + 1} save failed:`, err instanceof Error ? err.message : err);
      }
    }
    // The first piece failed to persist but a later piece did — still keep the
    // created row retractable rather than stranding it on the map.
    if (!undoMain && createdSegmentIds.length > 0) {
      const [firstId, ...rest] = createdSegmentIds;
      undoMain = {
        surveyFeatureId: firstId,
        layerId,
        previousGeometry: { type: 'LineString', coordinates: segments[segments.length - 1] } as Record<string, unknown>,
        previousAttributes: {},
        previousStatus: 'new',
        description: `Undo: remove segment for ${featureId.slice(-8)}`,
        deleteOnUndo: true,
        relatedDeleteIds: rest.length > 0 ? rest : undefined,
      };
    }

    if (undoMain) {
      pushUndo({
        featureId,
        layerId,
        oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
        timestamp: Date.now(),
        surveyUndo: {
          ...undoMain,
          // Every created piece except the one this entry already owns (the
          // fallback above may have adopted the first created id as its main
          // row). Undo retracts these in the same step.
          relatedDeleteIds: (() => {
            const siblings = createdSegmentIds.filter((id) => id !== undoMain!.surveyFeatureId);
            return siblings.length > 0 ? siblings : undefined;
          })(),
        },
      });
    }

    const leavesText = segments.length === 2 ? 'two separate lines' : 'one shortened line';
    showToast(`Removed ${Math.round(removedM)} m — ${leavesText} remain. One Undo puts the line back.`, 'success');
    setLineMoveMode(false); setLineToolMode(null); setDeleteSectionRange(null); deleteSectionHistoryRef.current = []; setContinueLineAnchor(null); setContinueLinePoints(0); setContinueSnapTarget(null); setContinueStartPt(null); setContinueIsSpur(false); lastContinueTapRef.current = null; setTempLineCoords(null); setTempLineOriginal(null);
  }, [deleteSectionRange, tempLineCoords, tempLineOriginal, selectedLineFeature, getSurveyFeatureForHld, findHldFeatureOriginal, pushUndo, updateSurveyFeature, upsertSurveyFeature, activeProject, showToast]);

  // ── Delete Section: tap handler ────────────────────────────────────────
  // Two taps define the GAP to remove. Each tap CUTS a vertex into the line
  // exactly where the finger landed (projected onto the nearest segment), so
  // a long straight trench can be bitten out in the middle without first
  // dragging vertices into place — the old tool only snapped to vertices that
  // already existed, which mid-segment taps could never hit.
  //
  // The earlier cut point keeps its identity when the second tap inserts a
  // vertex before it (index shifts by one). After both ends are picked the
  // span is frozen; "Last tap" steps back, which is why every pick is stored
  // in deleteSectionHistoryRef.
  const handleDeleteSectionTap = useCallback(
    (featureId: string, layerId: string, lngLat: [number, number]) => {
      if (lineToolMode !== 'delete-section' || !selectedLineFeature || !tempLineCoords) return;

      // Both ends picked → the selection is final until the engineer steps back.
      if (deleteSectionRange && deleteSectionRange[0] !== deleteSectionRange[1]) {
        showToast('Both cut points are set — use Last tap to change one', 'info');
        return;
      }

      const cut = cutVertexIndexAtPoint(tempLineCoords, lngLat[0], lngLat[1]);
      if (!cut) return;

      const prev = deleteSectionRange;
      const anchor = prev
        ? (cut.inserted && cut.index <= prev[0] ? prev[0] + 1 : prev[0])
        : cut.index;
      const range: [number, number] =
        anchor === cut.index
          ? [anchor, cut.index]
          : [Math.min(anchor, cut.index), Math.max(anchor, cut.index)];

      const gapM = approximateLength(cut.coordinates.slice(range[0], range[1] + 1));

      // A second tap on the first cut point (easy: its dot sits on the line)
      // would otherwise commit a zero-length gap. Nothing is applied.
      if (prev && gapM < 1) {
        showToast('That is the same spot — tap further along the line for the other end', 'warning');
        return;
      }

      deleteSectionHistoryRef.current = [
        ...deleteSectionHistoryRef.current,
        { coordinates: cut.coordinates, range },
      ];
      setTempLineCoords(cut.coordinates);
      setDeleteSectionRange(range);

      if (!prev) {
        console.log(`[DeleteSection] Cut start at vertex ${cut.index} (${cut.inserted ? 'new vertex' : 'existing vertex'})`);
        showToast('Cut point added where you tapped — now tap where the gap ends', 'info');
        return;
      }

      const interior = countVerticesBetween(range[0], range[1]);
      console.log(`[DeleteSection] Gap ${range[0]}→${range[1]} (${gapM} m, ${interior} vertices inside)`);
      showToast(`Gap selected: ${Math.round(gapM)} m. The red preview is what will be removed.`, 'info');
    },
    [lineToolMode, selectedLineFeature, tempLineCoords, deleteSectionRange, showToast],
  );

  // Step back one cut point: restores the coordinates snapshot from before
  // that tap, so any vertex the tap cut into the line is removed again.
  const handleDeleteSectionUndoPick = useCallback(() => {
    const history = deleteSectionHistoryRef.current;
    if (history.length === 0) return;
    history.pop();
    const previous = history[history.length - 1];
    if (!previous) {
      const base = tempLineOriginal ?? tempLineCoords ?? [];
      setTempLineCoords(base.map(([lng, lat]) => [lng, lat] as [number, number]));
      setDeleteSectionRange(null);
      showToast('Cut points cleared', 'info');
      return;
    }
    setTempLineCoords(previous.coordinates);
    setDeleteSectionRange(previous.range);
    showToast('Last cut point removed', 'info');
  }, [tempLineOriginal, tempLineCoords, showToast]);

  // What the Remove span panel reports before the engineer commits: metres in
  // the gap, how many vertices disappear with it, and how many lines remain.
  // "Leaves 0" means the picks cover the whole line, so the action is refused.
  const deleteSectionSummary = useMemo(() => {
    if (lineToolMode !== 'delete-section' || !deleteSectionRange || !tempLineCoords) return null;
    const [a, b] = deleteSectionRange;
    const start = Math.min(a, b), end = Math.max(a, b);
    if (start === end) return null;
    const removed = tempLineCoords.slice(start, end + 1);
    const leaves = (start > 0 ? 1 : 0) + (end < tempLineCoords.length - 1 ? 1 : 0);
    return {
      lengthLabel: `${Math.round(approximateLength(removed))} m`,
      vertices: countVerticesBetween(start, end),
      leaves,
      canRemove: leaves > 0,
    };
  }, [lineToolMode, deleteSectionRange, tempLineCoords]);

  // ── Split here: cut the working copy into two spans at the tapped point ──
  // Wires splitLineAtPoint (until now dead code) so routing a new chamber into
  // the middle of a straight trench no longer means dragging an endpoint and
  // changing the whole corridor. The cut is an explicit, undoable create — it
  // is NOT a working-copy drag: span 1 becomes the survey geometry of the HLD
  // line, span 2 is created as an independent survey feature (same local-create
  // path Remove span already uses for its extra segments).
  const loadSelectedLineCoords = useCallback((): [number, number][] | null => {
    if (!selectedLineFeature) return null;
    const { id: featureId, layerId } = selectedLineFeature;
    const features = activeGeojsonRef.current[layerId];
    if (!features) return null;
    let hldFeature = features.find((f) => {
      const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
      return fid === featureId;
    });
    if (!hldFeature) {
      const idMap = importFeatureIdMap?.[layerId];
      if (idMap) { const idx = idMap.indexOf(featureId); if (idx >= 0 && idx < features.length) hldFeature = features[idx]; }
    }
    const geomType = hldFeature?.geometry?.type;
    if (!hldFeature?.geometry || (geomType !== 'LineString' && geomType !== 'MultiLineString')) return null;
    const rawCoords =
      geomType === 'MultiLineString'
        ? (hldFeature.geometry.coordinates as [number, number][][])[0] ?? []
        : (hldFeature.geometry.coordinates as [number, number][]);
    return (rawCoords as [number, number][]).map(([lng, lat]) => [lng, lat] as [number, number]);
  }, [selectedLineFeature, importFeatureIdMap]);

  const handleSplitToggle = useCallback(() => {
    if (!selectedLineFeature) return;
    if (lineToolMode === 'split-here') {
      setLineMoveMode(false);
      setLineToolMode(null);
      setTempLineCoords(null);
      setTempLineOriginal(null);
      return;
    }
    // Prefer an in-progress working copy (the engineer may have already moved a
    // vertex); otherwise load the line's current coordinates.
    const coords = tempLineCoords
      ? tempLineCoords.map(([lng, lat]) => [lng, lat] as [number, number])
      : loadSelectedLineCoords();
    if (!coords || coords.length < 3) {
      showToast('This line is too short to split — extend it to 3+ vertices first', 'warning');
      return;
    }
    setTempLineCoords(coords);
    setTempLineOriginal(coords.map(([lng, lat]) => [lng, lat] as [number, number]));
    // One tool at a time: arming Split here disarms every other line tool.
    setDeleteSectionRange(null);
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    setContinueSnapTarget(null);
    setContinueStartPt(null);
    setContinueIsSpur(false);
    lastContinueTapRef.current = null;
    setLineMoveMode(true);
    setLineToolMode('split-here');
    autoOverlayOnEdit();
    console.log(`[Split] Armed for ${selectedLineFeature.id.slice(-8)} — tap the line at the new chamber`);
  }, [selectedLineFeature, lineToolMode, tempLineCoords, loadSelectedLineCoords, autoOverlayOnEdit, showToast]);

  const handleSplitTap = useCallback(
    (featureId: string, layerId: string, lngLat: [number, number]) => {
      if (lineToolMode !== 'split-here' || !selectedLineFeature || !tempLineCoords) return;
      const expectedPreview = `temp-preview-${selectedLineFeature.layerId}`;
      const onSelectedLine =
        layerId === expectedPreview ||
        (featureId === selectedLineFeature.id && layerId === selectedLineFeature.layerId);
      if (!onSelectedLine) {
        showToast('Tap on the selected line to place the split', 'warning');
        return;
      }
      const res = splitLineAtPoint(tempLineCoords, lngLat[0], lngLat[1]);
      if (!res) {
        showToast('Could not split here — tap further from the line ends', 'warning');
        return;
      }
      // ── Staged: nothing is written on tap. Span 1 becomes the working copy
      // (saved by Save like any line edit); span 2 is held here and created
      // by handleSaveLine, so a split can still be cancelled before Save.
      const { id: hldFeatureId, layerId: targetLayerId, layerName } = selectedLineFeature;
      const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(hldFeatureId, targetLayerId);
      pendingSplitRef.current = {
        hldFeatureId, layerId: targetLayerId, layerName,
        origGeom, origAttrs,
        coordsB: res.coordsB,
        reason: `Split at vertex ${res.splitIndex + 1} — new chamber (${tempLineCoords.length} → ${res.coordsA.length} + ${res.coordsB.length} vertices)`,
      };
      setTempLineCoords(res.coordsA);
      setLineToolMode(null);
      setLineMoveMode(true);
      showToast(`Split staged — span 1: ${res.coordsA.length} vertices, span 2: ${res.coordsB.length}. Press Save to keep it.`, 'info');
      return;
    },
    [lineToolMode, selectedLineFeature, tempLineCoords, findHldFeatureOriginal, showToast],
  );

  // ── Span 2 is created by Save (handleSaveLine) from pendingSplitRef. Span 1
  // is the working copy and is saved by the normal line save path. ──
  const writeSplitSpan2 = useCallback(
    (pending: NonNullable<typeof pendingSplitRef.current>, coordsA: [number, number][]) => {
      const { hldFeatureId, layerId: targetLayerId, layerName, origGeom, origAttrs, reason } = pending;

      // ── Span 2: independent survey feature, local-only (synthetic HLD FK
      // would 500 on the backend — same reason Remove span creates locally).
      const segHldId = `${hldFeatureId}-split-2-${Date.now()}`;
      const secondGeom = { type: 'LineString', coordinates: pending.coordsB } as Record<string, unknown>;
      const mockSf: SurveyFeatureData = {
        id: `local-sf-split-${Date.now()}`,
        original_hld_feature: segHldId,
        hld_feature_id: segHldId,
        project: activeProject?.id ?? '',
        project_name: activeProject?.name ?? '',
        engineer: '',
        engineer_name: '',
        layer_id: targetLayerId,
        layer_name: layerName,
        original_geometry: origGeom,
        original_attributes: origAttrs ?? null,
        survey_geometry: secondGeom,
        survey_attributes: origAttrs ?? {},
        survey_status: 'new' as const,
        version_number: 1,
        sync_status: 'pending' as const,
        change_reason: `${reason} (span 2)`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const store = useSurveyFeaturesStore.getState();
      useSurveyFeaturesStore.setState({
        surveyFeatures: {
          ...store.surveyFeatures,
          [targetLayerId]: [...(store.surveyFeatures[targetLayerId] ?? []), mockSf],
        },
      });
      pushUndo({
        featureId: hldFeatureId, layerId: targetLayerId,
        oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
        timestamp: Date.now(),
        surveyUndo: {
          surveyFeatureId: mockSf.id,
          layerId: targetLayerId,
          previousGeometry: secondGeom,
          previousAttributes: (origAttrs as Record<string, unknown>) ?? {},
          previousStatus: 'removed',
          description: `Undo: remove split span 2 for ${hldFeatureId.slice(-8)}`,
        },
      });
      console.log(`[Split] ${hldFeatureId.slice(-8)} → ${coordsA.length} + ${pending.coordsB.length} vertices (local span ${mockSf.id})`);
      showToast(`Split saved — span 1: ${coordsA.length} vertices, span 2: ${pending.coordsB.length} vertices`, 'success');
    },
    [activeProject, pushUndo, showToast],
  );

  useEffect(() => {
    writeSplitSpan2Ref.current = writeSplitSpan2;
  }, [writeSplitSpan2]);

  // ── Attributes for the selected LINE ────────────────────────────────────
  // Same SurveyForm the point popup opens — one form, two entry points — so
  // trench field data is captured without leaving the map or the edit session.
  const handleLineAttributes = useCallback(() => {
    if (!selectedLineFeature) return;
    handlePointSurveyForm(selectedLineFeature);
  }, [selectedLineFeature, handlePointSurveyForm]);

  // ── Route around works ─────────────────────────────────────────────────
  // The engineer taps the works location and the line is re-routed clear of a
  // no-go zone there, with the cost shown before Save: metres added, chambers
  // (2 transition joints), vertices, and how many OTHER lines sit in the same
  // zone — those are the ones that also need their own closure/reroute. The
  // detour is always recomputed from the BASELINE, so changing the radius
  // replaces the diversion instead of stacking detours on top of each other.
  const otherLineCoords = useMemo<[number, number][][]>(() => {
    const out: [number, number][][] = [];
    for (const layer of mapLayerData) {
      for (const f of layer.features) {
        const g = f.geometry as { type?: string; coordinates?: unknown } | null;
        let c: [number, number][] = [];
        if (g?.type === 'LineString') c = (g.coordinates as [number, number][]) ?? [];
        else if (g?.type === 'MultiLineString') c = ((g.coordinates as [number, number][][])[0] ?? []) as [number, number][];
        if (c.length < 2) continue;
        const fid = String((f.properties as any)?.id ?? (f.properties as any)?._id ?? '');
        if (selectedLineFeature && fid === selectedLineFeature.id && layer.id === selectedLineFeature.layerId) continue;
        out.push(c);
      }
    }
    return out;
  }, [mapLayerData, selectedLineFeature]);

  const applyObstacleDetour = useCallback(
    (centre: { lng: number; lat: number }, radiusM: number, baseline: [number, number][]) => {
      // The whole tap→baseline decision lives in planObstacleDetour (pure and
      // unit-tested): this screen only holds the result. The reroute is always
      // computed from the baseline, so changing the radius replaces the
      // diversion instead of stacking detours on top of each other.
      const plan = planObstacleDetour([centre.lng, centre.lat], radiusM, baseline, otherLineCoords, 2);
      setTempLineCoords(plan.coords);
      setDetourImpactLabel(plan.label);
      showToast(plan.impact.rerouted ? `Routed around the works — ${plan.label}` : plan.label, plan.impact.rerouted ? 'success' : 'warning');
      console.log(
        `[RouteAround] radius ${radiusM} m, tap ${plan.tapDistanceM.toFixed(1)} m from the line → ` +
          `${plan.impact.rerouted ? 'rerouted' : 'no crossing'}, ${plan.impact.insertedVertices} new vertices, ` +
          `${plan.impact.lengthDeltaM >= 0 ? '+' : ''}${plan.impact.lengthDeltaM.toFixed(1)} m, ` +
          `${plan.impact.extraChambers} chambers, ${plan.impact.otherLinesCrossing} other lines in the zone`,
      );
    },
    [otherLineCoords, showToast],
  );

  const handleRouteAroundToggle = useCallback(() => {
    if (!selectedLineFeature) return;
    if (lineToolMode === 'route-around') {
      setLineMoveMode(false);
      setLineToolMode(null);
      setObstacleCentre(null);
      setDetourImpactLabel(null);
      setTempLineCoords(null);
      setTempLineOriginal(null);
      return;
    }
    const coords = tempLineCoords
      ? tempLineCoords.map(([lng, lat]) => [lng, lat] as [number, number])
      : loadSelectedLineCoords();
    if (!coords || coords.length < 2) {
      showToast('Select a line with at least two vertices first', 'warning');
      return;
    }
    setTempLineCoords(coords);
    setTempLineOriginal(coords.map(([lng, lat]) => [lng, lat] as [number, number]));
    setDeleteSectionRange(null);
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    setContinueSnapTarget(null);
    setContinueStartPt(null);
    setContinueIsSpur(false);
    lastContinueTapRef.current = null;
    setObstacleCentre(null);
    setDetourImpactLabel(null);
    setLineMoveMode(true);
    setLineToolMode('route-around');
    autoOverlayOnEdit();
    console.log(`[RouteAround] Armed for ${selectedLineFeature.id.slice(-8)} — tap the works location`);
  }, [selectedLineFeature, lineToolMode, tempLineCoords, loadSelectedLineCoords, autoOverlayOnEdit, showToast]);

  const handleObstacleRadiusChange = useCallback(
    (radiusM: number) => {
      setObstacleRadiusM(radiusM);
      if (!obstacleCentre || !tempLineOriginal) return;
      applyObstacleDetour(obstacleCentre, radiusM, tempLineOriginal);
    },
    [obstacleCentre, tempLineOriginal, applyObstacleDetour],
  );

  const handleRouteAroundTap = useCallback(
    (lngLat: [number, number]) => {
      if (lineToolMode !== 'route-around' || !tempLineOriginal) return;
      const centre = { lng: lngLat[0], lat: lngLat[1] };
      setObstacleCentre(centre);
      applyObstacleDetour(centre, obstacleRadiusM, tempLineOriginal);
    },
    [lineToolMode, tempLineOriginal, obstacleRadiusM, applyObstacleDetour],
  );

  // ── Draw trench: polyline CREATE tool ──────────────────────────────────
  // Creates a NEW survey LineString (never rewrites a designed corridor).
  // Each tap appends a vertex, snapped to the nearest object point or duct/
  // chamber endpoint within ~8 m so the drawn trench joins the network
  // cleanly; nothing reaches the store until Save.
  const drawLineLayers = useMemo<TrenchLayerOption[]>(() => {
    const seen = new Set<string>();
    const out: TrenchLayerOption[] = [];
    for (const l of mapLayerData) {
      if (l.geometryType !== 'LineString') continue;
      if (l.id.startsWith('survey-') || l.id.startsWith('temp-preview-')) continue;
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push({ id: l.id, name: l.name ?? activeLayerNames[l.id] ?? l.id.toUpperCase() });
    }
    // Trench/duct layers first — they are what an engineer usually draws into.
    out.sort((a, b) => {
      const rank = (x: TrenchLayerOption) => (/trench|duct/i.test(`${x.id} ${x.name}`) ? 0 : 1);
      return rank(a) - rank(b);
    });
    return out;
  }, [mapLayerData, activeLayerNames]);

  useEffect(() => {
    if (!drawTrenchActive) return;
    if (drawTrenchLayer && drawLineLayers.some((l) => l.id === drawTrenchLayer)) return;
    if (drawLineLayers.length > 0) setDrawTrenchLayer(drawLineLayers[0].id);
  }, [drawTrenchActive, drawTrenchLayer, drawLineLayers]);

  const drawTrenchLengthM = useMemo(() => {
    let m = 0;
    for (let i = 1; i < drawTrenchPoints.length; i++) {
      const a = drawTrenchPoints[i - 1];
      const b = drawTrenchPoints[i];
      m += Math.hypot(a[0] - b[0], a[1] - b[1]) * 111000;
    }
    return m;
  }, [drawTrenchPoints]);

  const findTrenchSnap = useCallback(
    (pt: [number, number]): { lng: number; lat: number; label: string | null } => {
      // 1) Object points (premise / PDP / MFG / chamber) — same resolver the
      //    draw-segment tool uses, so snapping behaves identically.
      const snapPt = findNearestSnapPoint(mapLayerData, pt[0], pt[1]);
      if (snapPt) {
        const label = snapPt.name
          ? `${snapPt.name} #${String(snapPt.id ?? '').slice(-6)}`
          : `#${String(snapPt.id ?? '').slice(-6)}`;
        return { lng: snapPt.lng, lat: snapPt.lat, label };
      }
      // 2) Duct / trench / cable ENDPOINTS — the second thing a drawn trench
      //    must connect to. Only endpoints and vertices, within ~8 m.
      const maxDeg = 8 / 111000;
      let best: { lng: number; lat: number; label: string | null } | null = null;
      let bestD = Infinity;
      for (const layer of mapLayerData) {
        for (const f of layer.features) {
          const g = f.geometry as { type?: string; coordinates?: unknown } | null;
          let coords: [number, number][] = [];
          if (g?.type === 'LineString') coords = (g.coordinates as [number, number][]) ?? [];
          else if (g?.type === 'MultiLineString') coords = ((g.coordinates as [number, number][][])[0] ?? []) as [number, number][];
          if (coords.length < 2) continue;
          const candidates = [coords[0], coords[coords.length - 1]];
          for (const c of candidates) {
            if (!c) continue;
            const d = Math.hypot(c[0] - pt[0], c[1] - pt[1]);
            if (d < bestD) {
              const fid = String((f.properties as any)?.id ?? (f.properties as any)?._id ?? '');
              bestD = d;
              best = { lng: c[0], lat: c[1], label: `${layer.name ?? layer.id} end #${fid.slice(-4)}` };
            }
          }
        }
      }
      if (best && bestD <= maxDeg) return best;
      return { lng: pt[0], lat: pt[1], label: null };
    },
    [mapLayerData],
  );

  const handleTrenchTap = useCallback((lngLat: [number, number]) => {
    const snap = findTrenchSnap(lngLat);
    setDrawTrenchSnapLabel(snap.label);
    setDrawTrenchPoints((prev) => [...prev, [snap.lng, snap.lat] as [number, number]]);
  }, [findTrenchSnap]);

  const handleTrenchToggle = useCallback(() => {
    setActiveSheet(null);
    if (drawTrenchActive) {
      setDrawTrenchActive(false);
      setDrawTrenchPoints([]);
      setDrawTrenchSnapLabel(null);
      return;
    }
    // Draw trench replaces any armed line-edit tool: one tool at a time.
    setLineMoveMode(false);
    setLineToolMode(null);
    setDeleteSectionRange(null);
    setContinueLineAnchor(null);
    setContinueLinePoints(0);
    setContinueSnapTarget(null);
    setContinueStartPt(null);
    setContinueIsSpur(false);
    lastContinueTapRef.current = null;
    setTempLineCoords(null);
    setTempLineOriginal(null);
    setSelectedLineFeature(null);
    setDrawTrenchPoints([]);
    setDrawTrenchSnapLabel(null);
    setDrawTrenchActive(true);
    console.log('[DrawTrench] Armed — tap the map to place vertices');
  }, [drawTrenchActive]);

  const handleTrenchUndoPoint = useCallback(() => {
    setDrawTrenchPoints((prev) => prev.slice(0, -1));
    setDrawTrenchSnapLabel(null);
  }, []);

  const handleTrenchCancel = useCallback(() => {
    setDrawTrenchActive(false);
    setDrawTrenchPoints([]);
    setDrawTrenchSnapLabel(null);
  }, []);

  const handleTrenchSave = useCallback(async () => {
    if (drawTrenchBusy || drawTrenchPoints.length < 2 || !drawTrenchLayer) return;
    const coords = createLineString(drawTrenchPoints);
    if (!coords) {
      showToast('Draw at least two distinct vertices before saving', 'warning');
      return;
    }
    const layerName = activeLayerNames[drawTrenchLayer] ?? drawTrenchLayer.toUpperCase();
    const geometry = { type: 'LineString', coordinates: coords } as Record<string, unknown>;
    const lengthM = drawTrenchLengthM;
    setDrawTrenchBusy(true);
    try {
      // hldFeatureId = null → engineer-created survey feature (no HLD row).
      const sf = await upsertSurveyFeature(
        null,
        drawTrenchLayer,
        layerName,
        geometry,
        {},
        null,
        null,
        `Engineer-drew trench (${coords.length} vertices, ${lengthM.toFixed(1)} m)`,
      );
      if (!sf) {
        showToast('Save failed — check the server connection and retry', 'error');
        return; // keep the drawn vertices so a retry does not lose the line
      }
      pushUndo({
        featureId: sf.id,
        layerId: drawTrenchLayer,
        oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
        timestamp: Date.now(),
        surveyUndo: {
          surveyFeatureId: sf.id,
          layerId: drawTrenchLayer,
          previousGeometry: geometry,
          previousAttributes: {},
          previousStatus: 'removed',
          description: 'Undo: remove drawn trench',
        },
      });
      showToast(
        sf.sync_status === 'pending'
          ? `Trench kept on device (${coords.length} vertices) — will sync when back online`
          : `Trench saved — ${coords.length} vertices, ${lengthM >= 1000 ? `${(lengthM / 1000).toFixed(3)} km` : `${lengthM.toFixed(1)} m`}`,
        'success',
      );
      setDrawTrenchPoints([]);
      setDrawTrenchSnapLabel(null);
      setDrawTrenchActive(false);
      autoOverlayOnEdit();
      // A trench that was just drawn is unclassified: open the same field sheet
      // the point popup opens so its trench classification (depth, width,
      // surface, crossings, permit) is captured while the engineer is standing
      // on it, instead of only if they remember to tap the line again.
      handlePointSurveyForm({
        id: sf.id,
        layerId: drawTrenchLayer,
        geometryType: 'LineString',
        name: `Trench ${sf.id.slice(-8)}`,
        layerName,
      });
      console.log(`[DrawTrench] Saved ${sf.id} — ${coords.length} vertices on ${drawTrenchLayer}`);
    } catch (err) {
      console.error('[DrawTrench] Save failed:', err);
      showToast('Save failed — check the server connection and retry', 'error');
    } finally {
      setDrawTrenchBusy(false);
    }
  }, [drawTrenchBusy, drawTrenchPoints, drawTrenchLayer, drawTrenchLengthM, activeLayerNames, upsertSurveyFeature, pushUndo, showToast, autoOverlayOnEdit, handlePointSurveyForm]);

  // ── Draw Segment: independent two-point tool ───────────────────────────
  // Unlike Reroute, this tool never edits the selected line's existing path.
  // It creates exactly one new LineString from the nearest point on the
  // selected line to the nearest existing point (or the tapped location).
  // There is no continuation state and no bundle propagation.
  const handleContinueLineTap = useCallback(
    (featureId: string, layerId: string, lngLat: [number, number]) => {
      if (lineToolMode !== 'continue-line' || !selectedLineFeature || !tempLineCoords) return;

      // ── Dedupe guard ──
      // Native MapLibre fires both the Map onPress and the GeoJSONSource
      // onPress for a single tap → this handler runs twice with the same
      // lngLat. In multi-segment mode a double-fire would append 2 points,
      // so ignore the second call within 300 ms at (nearly) the same spot.
      const now = Date.now();
      const last = lastContinueTapRef.current;
      if (
        last &&
        now - last.t < 300 &&
        Math.abs(last.lng - lngLat[0]) < 1e-6 &&
        Math.abs(last.lat - lngLat[1]) < 1e-6
      ) {
        console.log('[Continue] Deduped duplicate tap');
        return;
      }
      lastContinueTapRef.current = { lng: lngLat[0], lat: lngLat[1], t: now };

      // ── Free two-point flow ────────────────────────────────────────────
      // Draw Segment is a standalone two-point tool: the FIRST tap places
      // the start point anywhere on the map, the SECOND tap places the
      // destination. Each tap snaps to the nearest point feature (within
      // ~15 m) or, failing that, to the nearest point on the selected line.
      // No tap is required to land on the selected line and no reroute
      // vertex handles are shown — the map only draws the new orange
      // segment once both points are placed.
      const resolveTap = (pt: [number, number]) => {
        // 1) Snap to the nearest point feature (premise/pdp/mfg/object).
        const snap = findNearestSnapPoint(mapLayerData, pt[0], pt[1]);
        if (snap) {
          return {
            lng: snap.lng,
            lat: snap.lat,
            snapTarget: {
              id: snap.id,
              layerId: snap.layerId,
              name: snap.name,
              lng: snap.lng,
              lat: snap.lat,
              properties: { ...snap.properties },
              kind: 'object' as const,
            },
          };
        }
        // 1b) Snap to the nearest corner of ANY line — this is what joins
        // trench to trench. Point-only snapping could never land exactly on
        // another line's vertex, so two trenches drawn corner-to-corner
        // always missed by decimetres and the network never connected.
        const corner = findNearestLineCorner(mapLayerData, pt[0], pt[1]);
        if (corner) {
          return {
            lng: corner.coord[0],
            lat: corner.coord[1],
            snapTarget: {
              id: corner.featureId,
              layerId: corner.layerId,
              name: `${corner.layerName} corner`,
              lng: corner.coord[0],
              lat: corner.coord[1],
              properties: {},
              kind: 'line' as const,
              vertexIdx: corner.vertexIdx,
              isEndpoint: corner.isEndpoint,
            },
          };
        }
        // 2) Otherwise snap to the nearest point on the selected line
        //    (within ~15 m) so the segment connects cleanly to the network.
        const onLine = nearestPointOnLine(tempLineCoords!, pt);
        const dLine = (onLine[0] - pt[0]) ** 2 + (onLine[1] - pt[1]) ** 2;
        if (dLine <= 0.00015 ** 2) {
          return { lng: onLine[0], lat: onLine[1], snapTarget: null };
        }
        // 3) Exact tap location.
        return { lng: pt[0], lat: pt[1], snapTarget: null };
      };

      // ── Step 1: place the start point ──
      if (continueLineAnchor === null) {
        const s = resolveTap(lngLat);
        setContinueStartPt([s.lng, s.lat]);
        setContinueLineAnchor(0); // marker: start chosen
        console.log(`[Continue] Start ${s.snapTarget ? `snapped to ${s.snapTarget.name} #${s.snapTarget.id.slice(-6)}` : 'placed'} at [${s.lng.toFixed(6)}, ${s.lat.toFixed(6)}]`);
        return;
      }

      // ── Step 2: place the destination — extend the line or spur off it ──
      // Saving ONLY the new 2-point segment as the line's geometry used to
      // destroy the selected line (a 20-vertex trench became 2 vertices).
      // Now the full line is always kept: a destination near either end
      // GROWS the line to it, while a destination drawn away from the line
      // becomes a SPUR — its own new trench feature — on Save.
      if (continueLinePoints === 0 && continueStartPt) {
        const s = resolveTap(lngLat);
        const dest: [number, number] = [s.lng, s.lat];
        // Guard against a zero-length segment.
        if (continueStartPt[0] === dest[0] && continueStartPt[1] === dest[1]) {
          console.log('[Continue] Start and destination are the same point — ignoring');
          return;
        }
        const base = (tempLineCoords ?? []) as [number, number][];
        const first = base[0];
        const last = base[base.length - 1];
        const nearEnd =
          base.length >= 2 &&
          Math.min(
            haversineMeters(dest[0], dest[1], first[0], first[1]),
            haversineMeters(dest[0], dest[1], last[0], last[1]),
          ) <= 15;
        if (nearEnd) {
          const grown = extendLineToPoint(base, dest);
          if (!grown) {
            console.log('[Continue] Cannot extend — selected line has no usable geometry');
            return;
          }
          setContinueSnapTarget(s.snapTarget);
          setContinueIsSpur(false);
          setTempLineCoords(grown.coords);
          // Multi-step: re-arm from the NEW end so the next tap extends again.
          // The grown line stays in the working copy until Save.
          setContinueStartPt(grown.end === 'end' ? grown.coords[grown.coords.length - 1] : grown.coords[0]);
          setContinueLinePoints(0);
          console.log(`[Continue] Line extended at ${grown.end} ${s.snapTarget ? `→ snapped to ${s.snapTarget.name} #${s.snapTarget.id.slice(-6)}` : ''} — ${grown.coords.length} vertices`);
        } else {
          // Spur: a trench of its own. tempLineCoords holds just the new
          // segment; Save creates a feature for it instead of touching the
          // selected line.
          setContinueSnapTarget(s.snapTarget);
          setContinueIsSpur(true);
          setTempLineCoords([continueStartPt, dest]);
          setContinueLinePoints(1);
          console.log(`[Continue] Spur drawn ${s.snapTarget ? `→ snapped to ${s.snapTarget.name} #${s.snapTarget.id.slice(-6)}` : ''} — saves as its own trench`);
        }
        return;
      }

      // Segment already ready — ignore extra taps (Save to finish).
      console.log('[Continue] Segment ready — tap Save to finish');
    },
    [lineToolMode, selectedLineFeature, tempLineCoords, continueLineAnchor, continueLinePoints, continueStartPt, mapLayerData],
  );

  // ── Check if temp line has unsaved changes ──
  // ── Check if temp line has unsaved changes ──
  // Dirty means the WORKING COPY differs from the baseline by a real distance.
  // Merely opening an edit tool (Reroute / Del Section / Draw Segment) must
  // never show "Unsaved" or arm Save — nothing has moved yet. The 0.5 m
  // threshold matches handleSaveLine's no-op guard, so a Save that would be
  // rejected can never look armed.
  const hasUnsavedLineChanges = useMemo(() => {
    if (!tempLineCoords || !tempLineOriginal) return false;
    if (tempLineCoords.length !== tempLineOriginal.length) return true;
    for (let i = 0; i < tempLineCoords.length; i++) {
      const a = tempLineCoords[i];
      const b = tempLineOriginal[i];
      if (!a || !b) return true;
      const meters = Math.hypot(a[0] - b[0], a[1] - b[1]) * 111000;
      if (meters > 0.5) return true;
    }
    return false;
  }, [tempLineCoords, tempLineOriginal]);

  // ── Exactly ONE active line tool at a time (D2) ─────────────────────────
  // lineMoveMode is the shared "line is being edited" flag (it drives the temp
  // preview layer + vertex handles), so it stays true for every tool. The
  // ACTIVE tool — what the buttons, hint and header advertise — is the armed
  // lineToolMode, falling back to plain Reroute when no tool is armed.
  const activeLineTool: 'move' | 'delete-section' | 'continue-line' | 'split-here' | 'route-around' | null =
    lineToolMode ?? (lineMoveMode ? 'move' : null);

  // ── Memoized vertex drag target — points at the temp preview layer during move mode.
  // Vertex markers render on this temp layer so they follow tempLineCoords state.
  // The HLD layer stays untouched (blue). On Save, a SurveyFeature is created.
  const memoizedVertexTarget = useMemo(() => {
    if (!lineMoveMode || !tempLineCoords || !selectedLineFeature) return null;
    return {
      featureId: `temp-preview-${selectedLineFeature.id}`,
      layerId: `temp-preview-${selectedLineFeature.layerId}`,
      vertexIdx: -1,
    };
  }, [lineMoveMode, tempLineCoords, selectedLineFeature]);

  // ── Vertex drag handler for Move Mode ──────────────────────────────────
  // Updates the tempLineCoords working copy — does NOT touch HLD or survey store.
  const handleVertexDragEnd = useCallback(
    (featureId: string, layerId: string, vertexIdx: number, newLng: number, newLat: number) => {
      setTempLineCoords((prev) => {
        if (!prev) return prev;
        const updated = [...prev];
        if (vertexIdx >= 0 && vertexIdx < updated.length) {
          updated[vertexIdx] = [newLng, newLat];
        }
        return updated;
      });
      console.log(`[MoveMode] Vertex ${vertexIdx} moved to [${newLng.toFixed(6)}, ${newLat.toFixed(6)}]`);
    },
    [],
  );

  // ── Pre-Save bundle plan ───────────────────────────────────────────────
  // Reroute relays every corridor layer riding the moved region. Show exactly
  // which ones (and how many features) before Save, with per-layer opt-out,
  // instead of relaying silently and letting the engineer find out later.
  // Only plain Reroute relays a bundle: Remove span / Extend line / Split here
  // are independent operations on the selected line.
  const bundlePlan = useMemo<BundlePlanGroup[]>(() => {
    if (!lineMoveMode || lineToolMode !== null) return [];
    if (!selectedLineFeature || !tempLineCoords || !tempLineOriginal) return [];
    if (!hasUnsavedLineChanges) return [];
    return planBundleReroute(
      activeGeojson,
      surveyFeatures,
      selectedLineFeature.layerId,
      tempLineOriginal,
      tempLineCoords,
      8,
    );
  }, [lineMoveMode, lineToolMode, selectedLineFeature, tempLineCoords, tempLineOriginal, hasUnsavedLineChanges, activeGeojson, surveyFeatures]);

  // ── Long-press on the working copy: add a bend / remove a vertex ──────
  // Both gestures edit the temp working copy only — nothing reaches the
  // survey-features store until Save, and Undo restores the baseline.
  const handleSegmentLongPress = useCallback(
    (_featureId: string, _layerId: string, lng: number, lat: number) => {
      setTempLineCoords((prev) => {
        if (!prev) return prev;
        // insertVertexAtPoint projects the press onto the nearest segment
        // and refuses a point that lands on top of an existing vertex.
        const res = insertVertexAtPoint(prev, lng, lat);
        if (!res) {
          showToast('Too close to an existing vertex — no bend added', 'warning');
          return prev;
        }
        showToast(`Bend added at vertex ${res.insertIdx} — drag it to route around the works`, 'success');
        return res.updated;
      });
    },
    [showToast],
  );

  const handleVertexLongPress = useCallback(
    (_featureId: string, _layerId: string, vertexIdx: number) => {
      setTempLineCoords((prev) => {
        if (!prev) return prev;
        const updated = deleteVertex(prev, vertexIdx);
        if (!updated) {
          showToast('A line keeps at least 2 vertices — that one stays', 'warning');
          return prev;
        }
        showToast(`Vertex ${vertexIdx} removed — ${prev.length} → ${updated.length} vertices`, 'success');
        return updated;
      });
    },
    [showToast],
  );

  // ── Undo for in-progress LINE edits ────────────────────────────────────
  // Reverts the temp line back to its original coordinates when in move mode
  // with unsaved changes; otherwise falls back to the global survey undo.
  const handleLineUndo = useCallback(() => {
    if (lineMoveMode && tempLineCoords && tempLineOriginal) {
      setTempLineCoords(tempLineOriginal.map(([lng, lat]) => [lng, lat] as [number, number]));
      setContinueLinePoints(0);
      setContinueLineAnchor(null);
      // Cut indices point at coordinates that the revert just replaced —
      // leaving them set made the red preview slice the wrong slice.
      setDeleteSectionRange(null);
      deleteSectionHistoryRef.current = [];
      showToast('Line reverted to its saved shape', 'info');
      console.log('[LineUndo] Reverted line to original coordinates');
      return;
    }
    handleUndo();
  }, [lineMoveMode, tempLineCoords, tempLineOriginal, handleUndo, showToast]);

  // ── Polygon edit handlers ───────────────────────────────────────────
  const handlePolygonEditStart = useCallback((feature: EditingFeature) => {
    console.log(`[PolygonEdit] Starting edit for feature ${feature.id.slice(-8)} on layer ${feature.layerId}`);
    // ── Search the RENDERED map layers first ──
    // The click handler resolves feature IDs from the RENDERED layers (injected
    // _id/_layer_id), so searching those ALWAYS matches what the user tapped.
    // The raw activeGeojsonRef can differ for imported data (imp- prefix,
    // synthetic imp-feat-* ids) and contains NO survey features (their ids live
    // in the survey-features store) — which caused "Feature NOT found" before.
    let hldFeature: GeoJSONFeature | undefined;
    let matchedLayerId = feature.layerId;

    for (const layerData of mapLayerData) {
      const fidMatch = layerData.features.find((item: GeoJSONFeature) => {
        const fid = (item.properties as any)?.id ?? (item.properties as any)?._id ?? '';
        return fid === feature.id;
      });
      if (fidMatch) {
        const g = fidMatch.geometry;
        if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
          hldFeature = fidMatch;
          matchedLayerId = layerData.id;
          break;
        }
      }
    }

    // Fallback: raw store search
    if (!hldFeature) {
      const exactLayers = activeGeojsonRef.current[feature.layerId];
      if (exactLayers) {
        hldFeature = exactLayers.find((item) => {
          const fid = (item.properties as any)?.id ?? (item.properties as any)?._id ?? '';
          return fid === feature.id;
        });
      }
      if (!hldFeature) {
        for (const [layerId, layerFeatures] of Object.entries(activeGeojsonRef.current)) {
          const found = layerFeatures.find((item) => {
            const fid = (item.properties as any)?.id ?? (item.properties as any)?._id ?? '';
            return fid === feature.id;
          });
          if (found && (found.geometry?.type === 'Polygon' || found.geometry?.type === 'MultiPolygon')) {
            hldFeature = found;
            matchedLayerId = layerId;
            break;
          }
        }
      }
    }

    if (!hldFeature) {
      console.warn(`[PolygonEdit] Feature ${feature.id.slice(-8)} NOT found in rendered layers (${mapLayerData.map((l) => l.id).join(', ')}) or raw store`);
      return;
    }
    if (hldFeature.geometry?.type !== 'Polygon' && hldFeature.geometry?.type !== 'MultiPolygon') {
      console.warn(`[PolygonEdit] Feature is ${hldFeature.geometry?.type}, not Polygon/MultiPolygon — aborting`);
      return;
    }
    console.log(`[PolygonEdit] Found feature in ${matchedLayerId}: geometry type = ${hldFeature.geometry?.type}`);

    const ring: [number, number][] = hldFeature.geometry.type === 'MultiPolygon'
      ? ((hldFeature.geometry.coordinates as [number, number][][][])[0]?.[0] ?? []) as [number, number][]
      : ((hldFeature.geometry.coordinates as [number, number][][])[0] ?? []) as [number, number][];
    const coordsCopy = ring.map(([lng, lat]) => [lng, lat] as [number, number]);
    const originalCopy = ring.map(([lng, lat]) => [lng, lat] as [number, number]);

    // Use the matched layer ID (not the original feature.layerId) for correct save wiring
    const matchedFeature = { ...feature, layerId: matchedLayerId };
    setSelectedPolygonFeature(matchedFeature);
    setPolygonEditCoords(coordsCopy);
    setPolygonEditOriginal(originalCopy);
    // Capture the original geometry/attributes from the found feature so the
    // save path doesn't depend on a raw-store lookup that may fail for
    // imported polygons (rendered _id vs raw properties.id mismatch).
    setPolygonEditOrigGeom(hldFeature.geometry as Record<string, unknown>);
    setPolygonEditOrigAttrs({ ...(hldFeature.properties as Record<string, unknown>) });
    autoOverlayOnEdit();
  }, [autoOverlayOnEdit, mapLayerData]);

  const handlePolygonVertexDragEnd = useCallback(
    (featureId: string, layerId: string, vertexIdx: number, newLng: number, newLat: number) => {
      setPolygonEditCoords((prev) => {
        if (!prev) return prev;
        const updated = [...prev];
        if (vertexIdx >= 0 && vertexIdx < updated.length) {
          updated[vertexIdx] = [newLng, newLat];
          // GeoJSON linear rings must remain closed when an endpoint is moved.
          if (vertexIdx === 0 && updated.length > 1) {
            updated[updated.length - 1] = [newLng, newLat];
          } else if (vertexIdx === updated.length - 1 && updated.length > 1) {
            updated[0] = [newLng, newLat];
          }
        }
        return updated;
      });
      console.log(`[PolygonEdit] Vertex ${vertexIdx} moved to [${newLng.toFixed(6)}, ${newLat.toFixed(6)}]`);
    },
    []
  );

  // ── Whole-polygon Move: translate EVERY ring vertex by a shared delta ──
  // The map reports a CUMULATIVE [dLng, dLat] from the drag START. We anchor
  // to the coords captured at the first move event and re-derive from there
  // on every event, so the delta never double-applies (applying cumulative
  // deltas to already-shifted coords would drift the ring).
  const polygonMoveBaseRef = useRef<[number, number][] | null>(null);
  const handlePolygonMove = useCallback(
    (featureId: string, layerId: string, dLng: number, dLat: number) => {
      setPolygonEditCoords((prev) => {
        // First move event: snapshot the current ring as the anchor.
        if (!polygonMoveBaseRef.current && prev) {
          polygonMoveBaseRef.current = prev.map(([lng, lat]) => [lng, lat] as [number, number]);
        }
        const base = polygonMoveBaseRef.current;
        if (!base) return prev;
        return base.map(([lng, lat]) => [lng + dLng, lat + dLat] as [number, number]);
      });
    },
    []
  );

  // On release the map gives the FINAL cumulative delta; clear the anchor so
  // the next drag starts fresh (the live preview already shows the final
  // position — this only resets state).
  const handlePolygonMoveEnd = useCallback(
    (featureId: string, layerId: string, dLng: number, dLat: number) => {
      polygonMoveBaseRef.current = null;
      console.log(`[PolygonEdit] Whole-polygon move ended Δ[${dLng.toFixed(6)}, ${dLat.toFixed(6)}]`);
    },
    []
  );

  // Toggle whole-polygon Move mode (toolbar Move button).
  const handleTogglePolygonMove = useCallback(() => {
    if (!selectedPolygonFeature) {
      console.warn('[PolygonMove] GUARD: no selected polygon');
      return;
    }
    setPolygonMoveMode((v) => !v);
  }, [selectedPolygonFeature]);

  const handlePolygonSave = useCallback(() => {
    if (!selectedPolygonFeature || !polygonEditCoords || !polygonEditOriginal) return;
    setPolygonMoveMode(false);
    polygonMoveBaseRef.current = null;

    const { id: featureId, layerId } = selectedPolygonFeature;
    const surveyGeometry = { type: 'Polygon', coordinates: [polygonEditCoords] };

    // ── SURVEY polygon (orange, layerId starts with 'survey-') ──
    // featureId IS the survey feature's ID (it lives in the survey-features
    // store, not in the raw HLD store). Update it directly.
    if (layerId.startsWith('survey-')) {
      const baseLayerId = layerId.slice('survey-'.length);
      const sfList = surveyFeatures[baseLayerId] ?? [];
      const sf = sfList.find((s) => s.id === featureId);
      if (sf) {
        pushUndo({
          featureId,
          layerId: baseLayerId,
          oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
          timestamp: Date.now(),
          surveyUndo: {
            surveyFeatureId: sf.id,
            layerId: baseLayerId,
            previousGeometry: sf.survey_geometry,
            previousAttributes: sf.survey_attributes,
            previousStatus: sf.survey_status,
            description: `Undo polygon edit for ${featureId.slice(-8)}`,
          },
        });
        updateSurveyFeature(sf.id, baseLayerId, {
          survey_geometry: surveyGeometry,
          survey_status: 'modified',
        });
        console.log(`[PolygonEdit] Saved survey polygon ${featureId.slice(-8)} (${baseLayerId})`);
      }
      setSelectedPolygonFeature(null);
      setPolygonEditCoords(null);
      setPolygonEditOriginal(null);
      setPolygonEditOrigGeom(null);
      setPolygonEditOrigAttrs(null);
      return;
    }

    // ── HLD polygon (blue): create/update a SurveyFeature tied to the HLD ──
    const existingSurvey = getSurveyFeatureForHld(featureId);
    // Prefer the originals captured at edit-start (works for imported polygons
    // whose rendered _id doesn't match the raw store); fall back to the raw
    // store lookup fallback.
    const { geometry: rawGeom, attributes: rawAttrs } = findHldFeatureOriginal(featureId, layerId);
    const origGeom = polygonEditOrigGeom ?? rawGeom;
    const origAttrs = polygonEditOrigAttrs ?? rawAttrs;

    if (existingSurvey) {
      pushUndo({
        featureId,
        layerId,
        oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
        timestamp: Date.now(),
        surveyUndo: {
          surveyFeatureId: existingSurvey.id,
          layerId,
          previousGeometry: existingSurvey.survey_geometry,
          previousAttributes: existingSurvey.survey_attributes,
          previousStatus: existingSurvey.survey_status,
          description: `Undo polygon edit for ${featureId.slice(-8)}`,
        },
      });
      updateSurveyFeature(existingSurvey.id, layerId, {
        survey_geometry: surveyGeometry,
        survey_status: 'modified',
      });
    } else {
      upsertSurveyFeature(
        featureId,
        layerId,
        activeLayerNames[layerId] ?? layerId.toUpperCase(),
        surveyGeometry,
        origAttrs ?? {},
        origGeom,
        origAttrs,
        'Adjusted polygon boundary',
      );
    }

    setSelectedPolygonFeature(null);
    setPolygonEditCoords(null);
    setPolygonEditOriginal(null);
    setPolygonEditOrigGeom(null);
    setPolygonEditOrigAttrs(null);
  }, [selectedPolygonFeature, polygonEditCoords, polygonEditOriginal, polygonEditOrigGeom, polygonEditOrigAttrs, getSurveyFeatureForHld, findHldFeatureOriginal, updateSurveyFeature, upsertSurveyFeature, activeLayerNames, surveyFeatures, pushUndo]);

  // ── Polygon cancel handler — discard changes and exit editing ──────────
  const handlePolygonCancel = useCallback(() => {
    setPolygonMoveMode(false);
    polygonMoveBaseRef.current = null;
    setSelectedPolygonFeature(null);
    setPolygonEditCoords(null);
    setPolygonEditOriginal(null);
    setPolygonEditOrigGeom(null);
    setPolygonEditOrigAttrs(null);
  }, []);

  // ── Delete the polygon feature currently selected ─────────────────────
  // Routes through the shared handleDeleteFeature then clears all polygon
  // editing state so the toolbar disappears.
  const handlePolygonDelete = useCallback(() => {
    if (!selectedPolygonFeature) return;
    console.log(`[PolygonDelete] Deleting polygon ${selectedPolygonFeature.id.slice(-8)}`);
    handleDeleteFeature(selectedPolygonFeature.id, selectedPolygonFeature.layerId);
    handlePolygonCancel();
  }, [selectedPolygonFeature, handleDeleteFeature, handlePolygonCancel]);

  // ── Handle empty map area click (for add point / deselect) ───────────
  // When adding a point, we create a SurveyFeature (not an HLD feature).
  // original_hld_feature = null indicates this is an engineer-created point.
  const handleEmptyMapClick = useCallback(
    (lng: number, lat: number) => {
      // ── Draw trench: every map tap appends a vertex (A→B→C→D…). Checked
      // first so a tap can never deselect or start another tool mid-draw.
      if (drawTrenchActive) {
        handleTrenchTap([lng, lat]);
        return;
      }
      // ── Route around works: tapping empty ground still sets the zone ──
      if (lineToolMode === 'route-around') {
        handleRouteAroundTap([lng, lat]);
        return;
      }
      // ── Draw Segment mode: empty-area taps place the next path point ──
      // (A→B→C→D…). Must be checked BEFORE deselecting the line below.
      if (lineToolMode === 'continue-line' && selectedLineFeature && tempLineCoords) {
        handleContinueLineTap('', '', [lng, lat]);
        return;
      }
      // ── Cut tools: a tap that misses the line must NOT deselect it ──
      // This used to close the whole toolbar (the selection was cleared), so
      // one imprecise tap lost the tool and the engineer had to start over.
      if (lineToolMode === 'delete-section' || lineToolMode === 'split-here') {
        showToast(
          lineToolMode === 'delete-section'
            ? 'Tap the line itself — no cut point was added'
            : 'Tap the line to place the split',
          'warning',
        );
        return;
      }
      // Empty ground = no overlapping-feature stack to cycle through.
      setTapStack([]);
      setTapStackLngLat(null);
      // Clear line selection when tapping empty area
      setSelectedLineFeature(null);
      setSelectedPolygonFeature(null);
      setPolygonEditCoords(null);
      setPolygonEditOriginal(null);
      setPolygonEditOrigGeom(null);
      setPolygonEditOrigAttrs(null);
      if (geoMode === 'add_point') {
        if (!addPointTargetLayer) {
          console.warn('[AddPoint] No target layer selected — tap a layer chip first');
          return;
        }

        // ── Build the new survey geometry (Point at clicked location) ──
        const surveyGeometry = { type: 'Point', coordinates: [lng, lat] };
        const layerName = activeLayerNames[addPointTargetLayer] ?? addPointTargetLayer.toUpperCase();

        // ── GPS quality gate (A2): grade the current fix for this layer ──
        const gpsSchema = getLayerSchema(addPointTargetLayer);
        const gpsMeta = {
          accuracyM: useMapStore.getState().userLocationAccuracyM,
          quality: '' as string,
        };
        const gq = gradeGpsAccuracy(gpsMeta.accuracyM, gpsSchema?.gpsAccuracyM ?? null);
        gpsMeta.quality = gq.grade === 'reject' ? 'reject' : gq.grade;
        if (gq.grade === 'reject') {
          console.warn('[AddPoint] Reject-grade GPS fix (±' + (gpsMeta.accuracyM ?? '?') + 'm) — engineer override recorded');
        }

        // ── Create a SurveyFeature with original_hld_feature = null ──
        // (engineer-created points don't reference any HLD feature)
        upsertSurveyFeature(
          null,                        // hldFeatureId — null = new engineer-created feature
          addPointTargetLayer,         // layerId
          layerName,                   // layerName
          surveyGeometry,              // surveyGeometry
          {},                          // surveyAttributes (empty — engineer fills via SurveyForm)
          null,                        // originalGeometry (no HLD original)
          null,                        // originalAttributes (no HLD original)
          `Engineer-added new point at [${lng.toFixed(6)}, ${lat.toFixed(6)}]${
            gq.grade !== 'ok' ? ` [GPS ${gq.grade} ±${gpsMeta.accuracyM ?? '?'}m]` : ''
          }`,
          undefined,                   // typedData
          gpsMeta,                     // GPS capture quality (A2)
        ).then((sf) => {
          if (sf) {
            console.log(`[AddPoint] SurveyFeature created: ${sf.id} at [${lng.toFixed(6)}, ${lat.toFixed(6)}]`);
            // Show editable fields form for the new point
            setSurveyForm({
              layerId: addPointTargetLayer,
              featureId: sf.id,         // Use the SurveyFeature ID, not a synthetic HLD ID
              // New points have no HLD row — photos attach via the survey
              // feature photo endpoint (backend supports it).
              photoTargetId: sf.id,
              initialValues: sf.survey_attributes as Record<string, unknown>,
              isNewPoint: true,
            });
          }
        }).catch((err) => {
          console.error('[AddPoint] Failed to create SurveyFeature:', err);
        });

        // ── Auto-switch to overlay mode so the new orange point is visible ──
        autoOverlayOnEdit();
      }
    },
    [geoMode, addPointTargetLayer, activeLayerNames, upsertSurveyFeature, autoOverlayOnEdit, lineToolMode, selectedLineFeature, tempLineCoords, handleContinueLineTap, drawTrenchActive, handleTrenchTap, handleRouteAroundTap, showToast],
  );

  // Clear line selection when geoMode changes away from select (entering add_point)
  useEffect(() => {
    if (geoMode !== 'select') {
      setSelectedLineFeature(null);
    }
  }, [geoMode]);

  // ── Auto-cleanup Move Mode when the selected line is deselected ──
  // Ensures temp state is cleared regardless of how deselection happens
  // (empty tap, close button, geoMode change, editing mode, etc.)
  useEffect(() => {
    if (!selectedLineFeature) {
      setLineMoveMode(false);
      setTempLineCoords(null);
      setTempLineOriginal(null);
    }
  }, [selectedLineFeature]);

  // ── Save SurveyForm data — update (or create) the SurveyFeature via the store ──
  // The HLD GeoJSON is never touched. The SurveyFeature gets the engineer's edits.
  // featureId can be:
  //   A) A SurveyFeature ID (new-point flow OR an already-surveyed point)
  //   B) An HLD feature ID (existing point with no survey feature yet) → create one
  const handleSurveyFormSave = useCallback(
    async (featureId: string, layerId: string, properties: Record<string, unknown>) => {
      // ── Case A: featureId is already a SurveyFeature id → update directly ──
      const existingById = surveyFeatures[layerId]?.find((s) => s.id === featureId);
      if (existingById) {
        updateSurveyFeature(featureId, layerId, {
          survey_attributes: properties,
          survey_status: 'modified',
        });
        setSurveyForm(null);
        console.log(`[SurveyForm] Saved attributes to SurveyFeature ${featureId.slice(-8)}`);
        return;
      }

      // ── Case B: featureId is an HLD id → find linked SurveyFeature or create one ──
      const linked = getSurveyFeatureForHld(featureId);
      if (linked) {
        updateSurveyFeature(linked.id, layerId, {
          survey_attributes: properties,
          survey_status: 'modified',
        });
        setSurveyForm(null);
        console.log(`[SurveyForm] Saved attributes to SurveyFeature ${linked.id.slice(-8)}`);
        return;
      }

      // ── Case C: no SurveyFeature exists yet — create one from the HLD feature ──
      const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(featureId, layerId);
      if (!origGeom) {
        console.warn(`[SurveyForm] Original geometry not found for ${featureId.slice(-8)} — skipping create`);
        setSurveyForm(null);
        return;
      }
      const layerName = activeLayerNames[layerId] ?? layerId.toUpperCase();
      const sf = await upsertSurveyFeature(
        featureId,
        layerId,
        layerName,
        origGeom,
        properties,
        origGeom,
        origAttrs,
        'Survey details captured via survey form',
      );
      if (sf) {
        updateSurveyFeature(sf.id, layerId, {
          survey_attributes: properties,
          survey_status: 'modified',
        });
      } else {
        console.warn('[SurveyForm] Failed to create SurveyFeature — no backend (imported project?)');
      }
      setSurveyForm(null);
      console.log(`[SurveyForm] Created SurveyFeature for HLD ${featureId.slice(-8)}`);
    },
    [surveyFeatures, updateSurveyFeature, getSurveyFeatureForHld, findHldFeatureOriginal, upsertSurveyFeature, activeLayerNames],
  );

  // ── Dismiss survey form ────────────────────────────────────────────────
  // For NEW points (engineer-created, no HLD parent) dismissing deletes the
  // SurveyFeature (discard behavior). For EXISTING features we only close the
  // form — any pre-existing survey data must be preserved.
  // ── Delete the point feature currently open in the SurveyForm ───────────
  // Routes through the shared handleDeleteFeature (logical delete / HLD stays
  // intact, undo recorded) then closes the form.
  const handleSurveyFormDelete = useCallback(() => {
    if (!surveyForm) return;
    const { featureId, layerId } = surveyForm;
    console.log(`[SurveyForm] Deleting point ${featureId.slice(-8)} on ${layerId}`);
    handleDeleteFeature(featureId, layerId);
    setSurveyForm(null);
    setSelectedMapFeatureId(null);
    setPopupScreenCoords(null);
  }, [surveyForm, handleDeleteFeature]);

  const handleSurveyFormDismiss = useCallback(() => {
    if (!surveyForm) return;
    const { featureId, layerId, isNewPoint } = surveyForm;

    if (isNewPoint) {
      deleteSurveyFeature(featureId, layerId);
      console.log('[SurveyForm] Dismissed — SurveyFeature removed');
    } else {
      console.log('[SurveyForm] Closed — keeping existing SurveyFeature');
    }
    setSurveyForm(null);
  }, [surveyForm, deleteSurveyFeature]);

  // ── Save notes for current feature ───────────────────────────────────────
  const handleSaveNotes = useCallback(() => {
    if (!selectedFeaturePopup?.id) return;
    setFeatureNotes((prev) => ({
      ...prev,
      [selectedFeaturePopup.id]: notesDraft,
    }));
  }, [selectedFeaturePopup?.id, notesDraft]);

  // ── Popup Edit handler — creates an EditingFeature from the popup data
  // and routes to the appropriate editing mode based on geometry type.
  // Replaces the complex IIFE pattern that caused stale closure issues.
  const handlePopupEdit = useCallback(() => {
    if (!selectedFeaturePopup) return;
    const geomType = resolveGeometryType(selectedFeaturePopup.layerId ?? '') as 'Point' | 'LineString' | 'Polygon';
    const feature: EditingFeature = {
      id: selectedFeaturePopup.id,
      layerId: selectedFeaturePopup.layerId ?? '',
      geometryType: geomType,
      name: selectedFeaturePopup.name,
      layerName: selectedFeaturePopup.layerName,
    };
    if (geomType === 'LineString') {
      handleLineEditFromPopup(feature);
    } else if (geomType === 'Polygon') {
      handlePolygonEditStart(feature);
    } else {
      handlePointSurveyForm(feature);
    }
  }, [selectedFeaturePopup, handleLineEditFromPopup, handlePolygonEditStart, handlePointSurveyForm]);

  // ── View features for a specific layer — opens overlay on map ─────────────
  const handleViewLayerFeatures = useCallback((layerId: string) => {
    const layer = allPanelLayersRef.current.find((l: any) => l.id === layerId);
    if (layer) {
      setLayerFeaturePanel({
        visible: true,
        layerId: layer.id,
        layerName: layer.name,
        featureCount: layer.featureCount,
      });
    }
  }, []);

  // ── Close the layer feature panel ────────────────────────────────────────
  const closeLayerFeaturePanel = useCallback(() => {
    setLayerFeaturePanel({ visible: false, layerId: null, layerName: '', featureCount: 0 });
  }, []);

  // ── Features for the selected layer panel ────────────────────────────────
  const layerPanelFeatures = useMemo(() => {
    if (!layerFeaturePanel.layerId) return [];
    return mergedFeatureList.filter((f) => f.feature.layer_id === layerFeaturePanel.layerId);
  }, [mergedFeatureList, layerFeaturePanel.layerId]);

  // ── Handle feature card press ── opens feature attributes ───────────────
  const handleFeatureCardPress = (featureId: string) => {
    // Close the feature panel if open
    if (layerFeaturePanel.visible) {
      closeLayerFeaturePanel();
    }

    // Search in mapLayerData (which has augmented IDs) for the feature
    for (const layer of mapLayerData) {
      for (const feat of layer.features) {
        const fid = (feat.properties as any)?.id ?? (feat.properties as any)?._id ?? '';
        if (fid === featureId) {
          const props = feat.properties ?? {};
          selectFeature(featureId, {
            id: featureId,
            name: String(
              (props as any).name ??
              (props as any).address ??
              `${layer.name} #${featureId.slice(-6)}`
            ),
            layerName: layer.name,
            layerId: layer.id,
            status: 'assigned',
          });
          setSelectedMapFeatureId(featureId);
          setViewMode('map');
          return;
        }
      }
    }
  };

  // ── Commit path: one summary, one submit, where the work happens ───────
  // The project list is the live source of status: submitSurveyCopy() applies
  // the backend transition into `projects`, so a stale activeProject can never
  // make the bar claim the survey is still open.
  const liveProject = projects.find((p) => p.id === activeProject?.id) ?? activeProject;

  // Unsaved counts are intentionally absent here: while an editor toolbar is
  // open the bar steps aside and that toolbar owns Save, so there is never a
  // second, competing save button on screen.
  const commitSummary = useMemo(() => summarizeCommit(surveyFeatures), [surveyFeatures]);

  const handleSubmitSurvey = useCallback(async () => {
    if (!activeProject) {
      showToast('No project open — nothing to submit', 'warning');
      return;
    }
    if (activeProject.id.startsWith('imported-')) {
      showToast('This project only exists on this device — nothing to submit', 'warning');
      return;
    }

    setSubmittingSurvey(true);
    try {
      await submitSurveyCopy(activeProject.id);
      // applyProjectTransition() swallows its own errors, so the refreshed
      // project list — not the absence of a throw — is the honest success
      // signal. A failed submit must never be reported as sent.
      const after = useProjectStore.getState().projects.find((p) => p.id === activeProject.id);
      if (after?.status === 'submitted') {
        showToast('Survey submitted — the planner has it now', 'success');
      } else {
        showToast('Submit failed — check the connection and try again', 'error');
      }
    } finally {
      setSubmittingSurvey(false);
    }
  }, [activeProject, submitSurveyCopy, showToast]);

  const showCommitBar = !isolateFeatureId && !selectedLineFeature && !selectedPolygonFeature;

  // A contextual toolbar and the dock both own the bottom strip; only one may.
  const dockHidden = Boolean(
    selectedLineFeature ||
      selectedPolygonFeature ||
      drawTrenchActive ||
      editingFeature ||
      surveyForm ||
      geoMode !== 'select' ||
      activeSheet !== null ||
      surveyPanelVisible,
  );

  // Bottom edge included: the commit bar is the last thing on screen, and on
  // Android the system navigation bar was drawn straight over Submit.
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Header — slim, one line of project, one line of state */}
      <MapHeader
        title={mapProjectName}
        subtitle={headerSubtitle}
        online={isOnline}
        listMode={viewMode === 'list'}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
        onOpenList={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
        onOpenTools={() => setActiveSheet('tools')}
      />

      {/* Main Content */}
      {viewMode === 'map' ? (
        <View style={styles.mapContainer}>
          {/* Isolated Review Banner — single-feature mode from the approval queue */}
          {isolateFeatureId && (
            <View
              style={styles.isolateBanner}
              accessible
              accessibilityLabel="Reviewing one change, the original HLD is dimmed"
            >
              <Search size={14} stroke={colors.onPrimary} />
              <Text style={styles.isolateBannerText} numberOfLines={1}>
                Reviewing 1 change — original HLD dimmed
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setIsolateFeature(null);
                  setFocusFeature(null);
                  setSelectedMapFeatureId(null);
                }}
                style={styles.isolateExitBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Exit review"
              >
                <X size={14} stroke={colors.onPrimary} />
                <Text style={styles.isolateExitText}>Exit</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* Drag Mode Indicator */}
          {dragMode && (
            <View style={[styles.dragIndicator, { backgroundColor: colors.primary }]}>
              <Move size={12} stroke={colors.onPrimary} />
              <Text style={[styles.dragIndicatorText, { color: colors.onPrimary }]}>
                Drag Mode — Tap point features to move
              </Text>
            </View>
          )}

          {/* Loading overlay when a real project is active but data is being fetched */}
          {storeActiveProject && !storeActiveProject.id.startsWith('imported-') && !hasImportedData && (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.background + 'CC' }]}>
              <View style={[styles.loadingBox, { backgroundColor: colors.surface }]}>
                {layerFetchProgress ? (
                  <>
                    <View style={{ marginBottom: Spacing.sm }}>
                    <Satellite size={32} stroke={colors.textTertiary} />
                  </View>
                    <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                      Loading Project Data
                    </Text>
                    <Text style={[styles.loadingDesc, { color: colors.textSecondary }]}>
                      Fetched {layerFetchProgress.fetched}/{layerFetchProgress.total} layers
                      {layerFetchProgress.failed > 0
                        ? ` (${layerFetchProgress.failed} failed — retrying not needed, showing what loaded)`
                        : ''}{' '}
                      for {storeActiveProject?.name ?? 'project'}...
                    </Text>
                    {/* Progress bar — capped at 99% while the fetch is in
                        flight; only a fully completed load may reach 100. */}
                    <View style={[styles.progressBarBg, { backgroundColor: colors.outlineLight }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            backgroundColor: colors.primary,
                            width: `${Math.min(99, Math.round((layerFetchProgress.fetched / layerFetchProgress.total) * 100))}%` as any,
                          },
                        ]}
                      />
                    </View>
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
                  </>
                ) : !storeIsLoading ? (
                  // Fetch settled but nothing loaded — show a failure state
                  // instead of an endless spinner.
                  <>
                    <View style={{ marginBottom: Spacing.sm }}>
                    <AlertTriangle size={32} stroke={colors.warning} />
                  </View>
                    <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                      Couldn't Load Project Data
                    </Text>
                    <Text style={[styles.loadingDesc, { color: colors.textSecondary }]}>
                      {storeError ||
                        (layerLoadFailed > 0
                          ? `${layerLoadFailed} layer${layerLoadFailed === 1 ? '' : 's'} failed to load — check your connection and try again.`
                          : 'Check your connection and try again.')}
                    </Text>
                    <TouchableOpacity
                      style={{
                        marginTop: 14,
                        paddingVertical: 10,
                        paddingHorizontal: 24,
                        borderRadius: 8,
                        backgroundColor: colors.primary,
                      }}
                      activeOpacity={0.7}
                      onPress={() => {
                        fetchAttemptedRef.current = null;
                        if (storeActiveProject) {
                          fetchProjectGeojsons(storeActiveProject.id).catch(() => {});
                        }
                      }}
                    >
                      <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 14 }}>Retry</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={{ marginBottom: Spacing.sm }}>
                    <Satellite size={32} stroke={colors.textTertiary} />
                  </View>
                    <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                      Loading Project Data
                    </Text>
                    <Text style={[styles.loadingDesc, { color: colors.textSecondary }]}>
                      Awaiting layer list from server...
                    </Text>
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
                  </>
                )}
              </View>
            </View>
          )}

          {/* Interactive MapLibre Map */}
          <MapLibreMap
            layers={orderedMapLayers}
            emptyState={mapEmptyState}
            onFeatureClick={(featureId, layerId, lngLat, screenPt) => {
              // ── Draw trench: a tap on ANY feature (or empty ground) appends a
              // vertex, snapped to the feature that was hit.
              if (drawTrenchActive) {
                const snapped = findTrenchSnap(lngLat);
                setDrawTrenchSnapLabel(snapped.label);
                setDrawTrenchPoints((prev) => [...prev, [snapped.lng, snapped.lat] as [number, number]]);
                return;
              }
              if (geoMode === 'delete_feature') {
                handleDeleteFeature(featureId, layerId);
                return;
              }
              // ── Delete Section: dedicated vertex-snapping handler ──
              if (lineToolMode === 'delete-section') {
                handleDeleteSectionTap(featureId, layerId, lngLat);
                return;
              }

              // ── Split here: cut the line at the tapped point ──
              if (lineToolMode === 'split-here') {
                handleSplitTap(featureId, layerId, lngLat);
                return;
              }

              // ── Route around works: the tap sets the no-go zone centre ──
              if (lineToolMode === 'route-around') {
                handleRouteAroundTap(lngLat);
                return;
              }

              // ── Continue Line: dedicated vertex-anchor + connect handler ──
              if (lineToolMode === 'continue-line') {
                handleContinueLineTap(featureId, layerId, lngLat);
                return;
              }
              handleMapFeatureClick(featureId, layerId, lngLat, screenPt);
            }}
            onFeatureCandidates={(candidates, lngLat, screenPt) => {
              setTapStack(candidates);
              setTapStackLngLat(lngLat);
              setTapStackScreenPt(screenPt);
            }}
            onEmptyAreaClick={handleEmptyMapClick}
            onFeatureDragEnd={handleFeatureDragEnd}
            onVertexDragEnd={lineMoveMode && tempLineCoords && lineToolMode === null ? handleVertexDragEnd : undefined}
            onVertexLongPress={activeLineTool === 'move' ? handleVertexLongPress : undefined}
            onSegmentLongPress={activeLineTool === 'move' ? handleSegmentLongPress : undefined}
            // Split here needs vertex handles hidden (there is nothing to drag)
            // but the line still needs to be tappable, which it is by default.
            vertexDragTarget={memoizedVertexTarget}
            snapEnabled={lineMoveMode && lineToolMode === null}
            snapRadiusM={4}
            polygonEditTarget={selectedPolygonFeature && !polygonMoveMode ? { featureId: `temp-preview-${selectedPolygonFeature.id}`, layerId: `temp-preview-${selectedPolygonFeature.layerId}` } : null}
            onPolygonVertexDragEnd={handlePolygonVertexDragEnd}
            polygonMoveTarget={selectedPolygonFeature && polygonMoveMode ? { featureId: `temp-preview-${selectedPolygonFeature.id}`, layerId: `temp-preview-${selectedPolygonFeature.layerId}` } : null}
            onPolygonMove={handlePolygonMove}
            onPolygonMoveEnd={handlePolygonMoveEnd}
            draggableLayerIds={draggableLayerIds}
            dragMode={dragMode}
            selectedFeatureId={selectedMapFeatureId ?? undefined}
            height="100%"
            mapStyle={currentBasemapStyle}
            flyToCenter={flyToCenter}
            flyToUserTarget={flyToUserTarget}
            fitBounds={fitRequest}
            zoomRequest={zoomRequest}
            onViewportChange={setCameraView}
            userLocation={userLocation}
          />

          {/* HLD / Survey / Overlay — a reading of the same map, so it stays on
              the map. Hidden during review isolation (nothing to switch to). */}
          <View style={styles.mapTopRow} pointerEvents="box-none">
            <ViewModeSwitch
              value={displayMode as ViewMode}
              onChange={(mode) => {
                setActiveSheet(null);
                setDisplayMode(mode);
              }}
              hidden={Boolean(isolateFeatureId)}
            />
          </View>

          {/* Layers chip — the layer tree lives in a sheet now, so the map keeps
              its area. The count is the number of layers currently drawn. */}
          {!isolateFeatureId && !dragMode && (
            <Pressable
              onPress={() => setActiveSheet('layers')}
              style={({ pressed }) => [
                styles.layersChip,
                { backgroundColor: chrome.panel, borderColor: chrome.hairline },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Show layers"
            >
              <Layers size={16} stroke={colors.textSecondary} />
              <Text style={[styles.layersChipText, { color: colors.textPrimary }]}>Layers</Text>
              <View style={[styles.layersChipCount, { backgroundColor: colors.primary + '14' }]}>
                <Text style={[styles.layersChipCountText, { color: colors.primary }]}>
                  {legendPanelLayers.filter((l) => l.visible).length}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Right-edge controls: zoom, layers, frame the survey area */}
          <View style={styles.railWrap} pointerEvents="box-none">
            <MapRail
              onZoomIn={() => handleZoomRail(1)}
              onZoomOut={() => handleZoomRail(-1)}
              onOpenLayers={() => setActiveSheet('layers')}
              onFrameRegion={handleFrameRegion}
              layersOpen={activeSheet === 'layers'}
              locked={Boolean(isolateFeatureId)}
            />
          </View>

          {/* Geometry Editor - editing toolbar OR add_point toolbar */}
          {viewMode === 'map' && (editingFeature !== null || geoMode !== 'select') && (
            <GeometryEditor
              mode={geoMode}
              onModeChange={(mode) => {
                setGeoMode(mode);
                setAddPointTargetLayer('');
                if (mode !== 'select') {
                  selectFeature(null);
                  setSelectedMapFeatureId(null);
                  setPopupScreenCoords(null);
                }
              }}
              onGeometryChange={onGeometryChange}
              onEmptyMapClick={handleEmptyMapClick}
              addPointLayers={addPointLayers}
              addPointTargetLayer={addPointTargetLayer}
              onAddPointLayerChange={setAddPointTargetLayer}
              isBusy={geomBusy}
              // Editing mode props
              editingFeature={editingFeature}
              onDoneEditing={handleDoneEditing}
              onDeleteFeature={handleDeleteFeature}
              dragMode={dragMode}
              onDragModeChange={setDragMode}
            />
          )}

          {/* Layer Feature Panel — shows features when clicking a layer name */}
          {layerFeaturePanel.visible && layerFeaturePanel.layerId && (
            <View style={[styles.featurePanel, { backgroundColor: colors.surface }]}>
              <View style={styles.featurePanelHeader}>
                <View style={styles.featurePanelHeaderLeft}>
                  <List size={16} stroke={colors.primary} />
                  <Text style={[styles.featurePanelTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {layerFeaturePanel.layerName}
                  </Text>
                  <View style={[styles.countBadgeSmall, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.countBadgeTextSm, { color: colors.primary }]}>
                      {layerFeaturePanel.featureCount}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.fpCloseBtn, { backgroundColor: colors.background }]}
                  onPress={closeLayerFeaturePanel}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={16} stroke={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={layerPanelFeatures}
                keyExtractor={(item) => item.feature.id}
                showsVerticalScrollIndicator={false}
                style={styles.featurePanelList}
                contentContainerStyle={styles.featurePanelListContent}
                renderItem={({ item }) => {
                  const props = item.feature.properties ?? {};
                  const firstTwo = Object.entries(props).filter(([k]) => !k.startsWith('_')).slice(0, 2);
                  return (
                    <TouchableOpacity
                      style={[styles.fpFeatureItem, { borderBottomColor: colors.outlineLight }]}
                      onPress={() => handleFeatureCardPress(item.feature.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.fpFeatureTop}>
                        <Text style={[styles.fpFeatureName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {String(
                            props.name ??
                            props.address ??
                            props.id ??
                            item.feature.id.slice(-8)
                          )}
                        </Text>
                        {item.geojson?.geometry && (
                          <Badge
                            label={item.geojson.geometry.type}
                            size="sm"
                            bgColor={colors.primary + '10'}
                            color={colors.primary}
                          />
                        )}
                      </View>
                      {firstTwo.length > 0 && (
                        <Text style={[styles.fpFeatureProps, { color: colors.textTertiary }]} numberOfLines={1}>
                          {firstTwo.map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={[styles.fpEmpty, { color: colors.textTertiary }]}>No features in this layer.</Text>
                }
              />
            </View>
          )}

          {/* Polygon Toolbar — appears when a polygon feature is tapped */}
          {viewMode === 'map' && selectedPolygonFeature && !editingFeature && (
            <PolygonToolbar
              selectedFeature={selectedPolygonFeature}
              onDeselect={handlePolygonCancel}
              undoCount={polygonEditCoords !== null && polygonEditOriginal !== null && JSON.stringify(polygonEditCoords) !== JSON.stringify(polygonEditOriginal) ? 1 : 0}
              onUndo={handlePolygonUndo}
              onSave={handlePolygonSave}
              onCancel={handlePolygonCancel}
              onDelete={handlePolygonDelete}
              hasUnsavedChanges={polygonEditCoords !== null && polygonEditOriginal !== null && JSON.stringify(polygonEditCoords) !== JSON.stringify(polygonEditOriginal)}
              moveMode={polygonMoveMode}
              onToggleMove={handleTogglePolygonMove}
            />
          )}

          {/* Draw Trench panel — polyline create tool */}
          {viewMode === 'map' && drawTrenchActive && (
            <DrawTrenchPanel
              layers={drawLineLayers}
              targetLayer={drawTrenchLayer}
              onTargetLayerChange={setDrawTrenchLayer}
              pointCount={drawTrenchPoints.length}
              snapLabel={drawTrenchSnapLabel}
              busy={drawTrenchBusy}
              onUndoPoint={handleTrenchUndoPoint}
              onCancel={handleTrenchCancel}
              onSave={handleTrenchSave}
              lengthLabel={
                drawTrenchPoints.length >= 2
                  ? drawTrenchLengthM >= 1000
                    ? `${(drawTrenchLengthM / 1000).toFixed(3)} km`
                    : `${drawTrenchLengthM.toFixed(1)} m`
                  : null
              }
            />
          )}

          {/* Line Selection Toolbar — appears when a line feature is tapped */}
          {viewMode === 'map' && selectedLineFeature && !editingFeature && (
            <LineSelectionToolbar
              selectedFeature={selectedLineFeature}
              onDeselect={handleLineDeselect}
              undoCount={hasUnsavedLineChanges ? 1 : undoCount}
              onUndo={handleLineUndo}
              moveMode={activeLineTool === 'move'}
              onToggleMove={handleToggleMove}
              onSave={handleSaveLine}
              hasUnsavedChanges={hasUnsavedLineChanges}
              onDeleteSection={handleDeleteSectionToggle}
              deleteSectionMode={activeLineTool === 'delete-section'}
              deleteSectionStep={deleteSectionRange ? (deleteSectionRange[0] === deleteSectionRange[1] ? 1 : 2) : 0}
              onDeleteConfirm={handleDeleteSectionConfirm}
              onDeleteReset={handleDeleteSectionUndoPick}
              deleteSectionSummary={deleteSectionSummary}
              onDeleteFeature={handleLineDelete}
              onSplit={handleSplitToggle}
              splitMode={activeLineTool === 'split-here'}
              onRouteAround={handleRouteAroundToggle}
              routeAroundMode={activeLineTool === 'route-around'}
              obstacleRadiusM={obstacleRadiusM}
              onObstacleRadiusChange={handleObstacleRadiusChange}
              detourImpactLabel={detourImpactLabel}
              onAttributes={handleLineAttributes}
              bundleGroups={bundlePlan.map((g) => ({
                layerId: g.layerId,
                layerName: g.layerName,
                count: g.items.length,
                enabled: !bundleSkipLayers.includes(g.layerId),
              }))}
              onToggleBundleLayer={(layerId) =>
                setBundleSkipLayers((prev) =>
                  prev.includes(layerId) ? prev.filter((l) => l !== layerId) : [...prev, layerId],
                )
              }
              continueMode={activeLineTool === 'continue-line'}
              onContinue={handleContinueToggle}
              continueLineStep={continueLineAnchor === null ? 0 : continueLinePoints >= 1 ? 2 : 1}
              continueLineSegments={continueLinePoints}
              continueSnapLabel={continueSnapTarget ? `Snapped to ${continueSnapTarget.name} #${continueSnapTarget.id.slice(-6)}` : undefined}
            />
          )}

          {/* Pin-Anchored Feature Popup - hidden during editing mode or line selection */}
          {selectedFeaturePopup && !editingFeature && !selectedLineFeature && (
            <MapFeaturePopup
              variant="card"
              bottomOffset={88}
              screenX={popupScreenCoords?.x ?? 160}
              screenY={popupScreenCoords?.y ?? 300}
              featureName={selectedFeaturePopup.name}
              layerName={selectedFeaturePopup.layerName}
              layerId={selectedFeaturePopup.layerId}
              status={selectedFeaturePopup.status}
              properties={selectedFeatureProps}
              onClose={() => {
                selectFeature(null);
                setSelectedMapFeatureId(null);
                setPopupScreenCoords(null);
              }}
              onOpenDetails={() =>
                router.push(`/feature/${selectedFeaturePopup.id}?projectId=${activeProject?.id ?? ''}`)
              }
              onDismiss={() => {
                selectFeature(null);
                setSelectedMapFeatureId(null);
                setPopupScreenCoords(null);
              }}
              featureGeometryType={(resolveGeometryType(selectedFeaturePopup.layerId ?? '') as 'Point' | 'LineString' | 'Polygon')}
              // Edit (→ line/polygon/point toolbar) is available for EVERY feature
              // in all display modes — all line features get Reroute, Del Section,
              // Delete (logical), Draw Segment, and Undo via the LineSelectionToolbar.
              onStartEdit={handlePopupEdit}
              // Move (→ point drag mode): enables the map's point-drag mode and
              // closes the popup so the engineer can drag the tapped feature.
              onQuickMove={() => {
                selectFeature(null);
                setSelectedMapFeatureId(null);
                setPopupScreenCoords(null);
                setDragMode(true);
                setActiveSheet(null);
                console.log('[Popup] Move enabled — drag the feature to relocate it');
              }}
              notesDraft={notesDraft}
              onNotesChange={setNotesDraft}
              onSaveNotes={handleSaveNotes}
              hasUnsavedNotes={notesDraft !== (featureNotes[selectedFeaturePopup.id] ?? '')}
              // Overlapping-feature cycle chip: only shown when the tap really
              // hit several features AND the popup shows one of them.
              overlapCount={
                tapStack.length > 1 &&
                tapStack.some((c) => c.featureId === selectedFeaturePopup.id)
                  ? tapStack.length
                  : 0
              }
              overlapIndex={Math.max(
                0,
                tapStack.findIndex((c) => c.featureId === selectedFeaturePopup.id),
              )}
              onCycleOverlap={() => {
                if (tapStack.length < 2) return;
                const cur = tapStack.findIndex((c) => c.featureId === selectedFeaturePopup.id);
                const next = tapStack[(cur + 1) % tapStack.length];
                if (!next) return;
                handleMapFeatureClick(
                  next.featureId,
                  next.layerId,
                  tapStackLngLat ?? [0, 0],
                  tapStackScreenPt,
                );
              }}
            />
          )}

          {/* New Point Form — editable fields after adding a point */}
          {surveyForm && (
            <SurveyForm
              formData={surveyForm}
              onDismiss={handleSurveyFormDismiss}
              onSave={handleSurveyFormSave}
              onDelete={handleSurveyFormDelete}
            />
          )}
        </View>
      ) : (
        /* List View */
        <View style={styles.listContainer}>
          {/* Search bar */}
          <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
            <Search size={14} stroke={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search features by name, address, ID, or any attribute..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.searchClear}
                onPress={() => setSearchQuery('')}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={12} stroke={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Layer filter chips */}
          <FlatList
            horizontal
            data={[{ id: null, name: 'All' } as any, ...storeLayers]}
            keyExtractor={(item) => item.id ?? 'all'}
            showsHorizontalScrollIndicator={false}
            style={styles.filterList}
            contentContainerStyle={styles.filterContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { backgroundColor: selectedLayer === item.id ? colors.primary : colors.surface, borderColor: selectedLayer === item.id ? colors.primary : colors.outline },
                ]}
                onPress={() => setSelectedLayer(item.id)}
              >
                <Text style={[styles.filterChipText, { color: selectedLayer === item.id ? colors.onPrimary : colors.textSecondary }]}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />

          {/* Feature list */}
          <FlatList
            data={filteredFeatures}
            keyExtractor={(item) => item.feature.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.featureList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.featureCard, { backgroundColor: colors.surface }, selectedFeaturePopup?.id === item.feature.id && { borderColor: colors.primary, borderWidth: 2 }]}
                onPress={() => handleFeatureCardPress(item.feature.id)}
                activeOpacity={0.7}
              >
                <View style={styles.featureHeader}>
                  <View style={styles.featureLeft}>
                    <View style={[styles.featureDot, { backgroundColor: LAYER_COLORS[item.feature.layer_id] ?? '#6B7280' }]} />
                    <View style={styles.featureInfo}>
                      <Text style={[styles.featureName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {String(item.feature.properties?.name ?? item.feature.properties?.address ?? item.feature.layer_name + ' #' + item.feature.id.slice(-3))}
                      </Text>
                      <Text style={[styles.featureLayer, { color: colors.textTertiary }]}>{item.feature.layer_name}</Text>
                    </View>
                  </View>
                  <StatusBadge status={item.feature.status} />
                </View>
                <View style={styles.featureMeta}>
                  {item.geojson.geometry && <Badge label={item.geojson.geometry.type} size="sm" bgColor={colors.primary + '10'} color={colors.primary} />}
                </View>
                <TouchableOpacity
                  style={[styles.openBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push(`/feature/${item.feature.id}?projectId=${activeProject?.id ?? ''}`)}
                >
                  <Text style={[styles.openBtnText, { color: colors.onPrimary }]}>Open Feature</Text>
                  <ChevronRight size={14} stroke={colors.onPrimary} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Bottom action dock — the five field actions, always in the same place.
          Hidden while a contextual toolbar owns the bottom of the screen, so
          nothing ever stacks two rows of buttons under a thumb. */}
      {viewMode === 'map' && !dockHidden && (
        <View
          style={[styles.dockWrap, { bottom: showCommitBar ? commitBarHeight + 10 : 12 }]}
          pointerEvents="box-none"
        >
          <MapDock
            onLocate={() => {
              if (userLocation) {
                setFlyToUserTarget({
                  lng: userLocation.longitude,
                  lat: userLocation.latitude,
                  zoom: 18,
                  ts: Date.now(),
                });
                setFollowUser(true);
              } else {
                setFollowUser(!followUser);
                showToast('Waiting for a GPS fix — move into the open', 'info');
              }
            }}
            following={followUser}
            onDrawTrench={handleTrenchToggle}
            drawActive={drawTrenchActive}
            onAddPoint={() => {
              if (geoMode === 'add_point') {
                setGeoMode('select');
                setAddPointTargetLayer('');
              } else {
                setGeoMode('add_point');
                if (addPointLayers.length > 0 && !addPointTargetLayer) {
                  setAddPointTargetLayer(addPointLayers[0].id);
                }
              }
            }}
            addActive={geoMode === 'add_point'}
            onUndo={handleUndo}
            undoCount={undoCount}
            onOpenTools={() => setActiveSheet('tools')}
            toolsOpen={activeSheet === 'tools'}
            locked={Boolean(isolateFeatureId)}
          />
        </View>
      )}

      {/* Survey Changes Panel — shows all engineer edits with status badges */}
      {viewMode === 'map' && (
        <SurveyChangesPanel
          visible={surveyPanelVisible}
          surveyFeatures={surveyFeatures}
          layerNames={activeLayerNames}
          bottomOffset={commitBarHeight}
          onClose={() => setSurveyPanelVisible(false)}
          onFeaturePress={(featureId) => {
            // Highlight the feature on the map
            setSelectedMapFeatureId(featureId);
            setSurveyPanelVisible(false);
          }}
        />
      )}

      {/* ── Chrome sheets ─────────────────────────────────────────────────
          One overlay family for tools, layers and basemap. They sit above the
          dock and the commit bar, and close on scrim tap or the close button. */}
      <ToolsSheet
        visible={activeSheet === 'tools'}
        onClose={() => setActiveSheet(null)}
        changeCount={commitSummary.changes}
        layerCount={legendPanelLayers.length}
        visibleLayerCount={legendPanelLayers.filter((l) => l.visible).length}
        basemapName={BASEMAPS[activeBasemap]?.name ?? 'Streets'}
        moveActive={dragMode}
        online={isOnline}
        locked={Boolean(isolateFeatureId)}
        onOpenChanges={() => {
          setActiveSheet(null);
          setSurveyPanelVisible(true);
        }}
        onToggleMove={() => {
          setActiveSheet(null);
          setDragMode(!dragMode);
        }}
        onOpenLayers={() => setActiveSheet('layers')}
        onOpenBasemap={() => setActiveSheet('basemap')}
        onOpenList={() => {
          setActiveSheet(null);
          setViewMode('list');
        }}
        onFrameRegion={() => {
          setActiveSheet(null);
          handleFrameRegion();
        }}
      />

      <LayersSheet
        visible={activeSheet === 'layers'}
        onClose={() => setActiveSheet(null)}
        layers={legendPanelLayers}
        groups={legendGroups}
        onToggleLayer={toggleLayerVisibility}
        onLayerClick={(layerId) => {
          setActiveSheet(null);
          handleViewLayerFeatures(layerId);
        }}
      />

      <BasemapSheet
        visible={activeSheet === 'basemap'}
        onClose={() => setActiveSheet(null)}
        options={Object.values(BASEMAPS).map((bm) => ({
          id: bm.id,
          name: bm.name,
          swatch: BASEMAP_SWATCH[bm.id] ?? colors.outline,
          hint:
            bm.id === 'satellite'
              ? 'Aerial imagery — best for yards and surfaces'
              : bm.id === 'light'
                ? 'Minimal detail — the network stands out'
                : 'OSM streets — building and street names',
        }))}
        value={activeBasemap}
        onChange={(id) => {
          setActiveBasemap(id);
          setActiveSheet(null);
        }}
      />

      {/* Commit path — the survey's ONE submit, on the screen where the work
          happens instead of three taps away on the project list.

          Hidden while a geometry editor toolbar is open (that toolbar owns
          Save) and during the planner's read-only review isolation. It stays
          put while the changes panel is open: the panel floats above the bar's
          measured height, so reviewing changes never costs the engineer the
          Submit button. */}
      {showCommitBar && (
        <CommitBar
          summary={commitSummary}
          onSubmit={handleSubmitSurvey}
          onLayout={(e) => setCommitBarHeight(e.nativeEvent.layout.height)}
          onReviewChanges={commitSummary.changes > 0 ? () => setSurveyPanelVisible(true) : undefined}
          submittedLabel={
            liveProject?.status === 'submitted' || liveProject?.status === 'under_review'
              ? 'Submitted — with the planner'
              : undefined
          }
          busy={submittingSurvey}
          disabled={!activeProject}
          compact
        />
      )}

      <Toast
        visible={toastVisible}
        message={toastMsg}
        type={toastType}
        onDismiss={() => setToastVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.xs },
  headerRight: { flexDirection: 'row', gap: Spacing.xs },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '600' },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerSubtitle: { fontSize: Type.meta.fontSize, lineHeight: Type.meta.lineHeight, marginTop: 1 },

  // ── Map View ───────────────────────────────────────────────────────────
  mapContainer: { flex: 1, position: 'relative' },

  // ── Field-console chrome ───────────────────────────────────────────────
  mapTopRow: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 24,
  },
  layersChip: {
    position: 'absolute',
    top: 56,
    left: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 22,
  },
  layersChipText: { ...Type.label },
  layersChipCount: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layersChipCountText: { fontSize: 13, fontWeight: '700' },
  railWrap: {
    position: 'absolute',
    right: Spacing.md,
    top: 110,
    zIndex: 23,
  },
  dockWrap: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 40,
  },

  // ── Drag Mode Indicator ────────────────────────────────────────────────
  dragIndicator: {
    position: 'absolute',
    top: 54, // below the view switch; the layers chip steps aside for it
    left: Spacing.xl,
    right: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  dragIndicatorText: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
  },

  // ── List View ──────────────────────────────────────────────────────────
  listContainer: { flex: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    height: Touch.minTarget,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.fontSize,
    paddingVertical: 0,
    height: '100%',
  },
  searchClear: {
    width: Touch.minTarget,
    height: Touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Horizontal list in a column: without an explicit height and shrink:0 the
  // flex parent squeezed the chip row to 4 px (a blue sliver under search).
  filterList: { flexGrow: 0, flexShrink: 0, height: 44, marginBottom: Spacing.sm },
  filterContent: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  featureList: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  featureCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderColor: 'transparent',
    borderWidth: 2,
  },
  featureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  featureLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.md,
    gap: Spacing.sm,
  },
  featureDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  featureInfo: { flex: 1 },
  featureName: { fontSize: 15, fontWeight: '600' },
  featureLayer: { fontSize: Type.meta.fontSize, lineHeight: Type.meta.lineHeight, marginTop: 1 },
  featureMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  featureMetaText: { fontSize: Type.meta.fontSize, lineHeight: Type.meta.lineHeight, flex: 1 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Touch.minTarget,
    paddingVertical: 10,
    borderRadius: Radius.md,
    gap: 4,
  },
  openBtnText: { fontSize: 13, fontWeight: '600' },

  // ── Feature Panel (on-map layer features overlay) ──────────────────────
  featurePanel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.xxl,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    maxHeight: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  featurePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  featurePanelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  featurePanelTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  countBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeTextSm: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '700',
  },
  fpCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  featurePanelList: {
    maxHeight: 280,
  },
  featurePanelListContent: {
    paddingBottom: Spacing.sm,
  },
  fpFeatureItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fpFeatureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  fpFeatureName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  fpFeatureProps: {
    fontSize: Type.meta.fontSize,
    lineHeight: Type.meta.lineHeight,
    marginTop: 2,
  },
  fpEmpty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
    fontStyle: 'italic',
  },

  // ── View switcher (HLD / Survey / Overlay) ─────────────────────────────
  viewSwitcher: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 40,
  },
  viewSeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    // 48, not the 32 it used to be: adjacent segments must not share a
    // hit area, and this is the map's primary view control.
    minHeight: Touch.minTarget,
  },
  viewSegText: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
  },
  modeDot: { width: 10, height: 10, borderRadius: 5 },
  modeDotLarge: { width: 18, height: 18, borderRadius: 9 },

  // ── FABs ───────────────────────────────────────────────────────────────
  fabs: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.xxl * 3,
    gap: Spacing.md,
  },
  isolateBanner: {
    position: 'absolute',
    // Below the view switch row, which owns the top of the map now.
    top: 54,
    left: 12,
    right: 12,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  isolateBannerText: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  isolateExitBtn: {
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  isolateExitText: {
    color: '#FFFFFF',
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '700',
    marginLeft: 4,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  fabLabelPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fabLabelText: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
  },

  // ── Undo Badge ───────────────────────────────────────────────────────
  undoBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  undoBadgeText: {
    fontSize: Type.label.fontSize,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 16,
  },

  // ── Basemap Switcher Panel ────────────────────────────────────────────
  panel: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.xxl * 2,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  panelTitle: { fontSize: 16, fontWeight: '600' },
  basemapRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  basemapItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    gap: 6,
  },
  basemapLabel: { fontSize: Type.label.fontSize, lineHeight: Type.label.lineHeight, fontWeight: '600' },
  basemapSwatch: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
  },
  basemapSwatchLarge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
  },

  // ── Loading Overlay ───────────────────────────────────────────────────
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingBox: {
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  loadingDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
});
