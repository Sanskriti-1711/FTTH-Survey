import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { useMapStore } from '../../lib/stores/map';
import { useAuthStore } from '../../lib/stores/auth';
import { useProjectStore } from '../../lib/stores/project';
import { getDemoAllFeatures, DEMO_GEOJSON_FEATURES, DEMO_FEATURES, DEMO_LAYERS } from '../../lib/stores/demo-data';
import { recalculateDependentProperties } from '../../lib/utils/spatial';
import {
  splitLineAtPoint,
  mergeLines,
  createLineString,
  findNearestVertex,
  updateVertex,
  createGeoJSONFeature,
} from '../../lib/utils/geometry-operations';
import GeometryEditor from '../../lib/components/GeometryEditor';
import type { GeometryMode } from '../../lib/components/GeometryEditor';
import { Card, Badge } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import MapLibreMap, { BASEMAPS } from '../../lib/components/MapLibreMap';
import MapLegend, { buildLayerGroups, DEFAULT_LAYER_GROUPS } from '../../lib/components/MapLegend';
import MapFeaturePopup from '../../lib/components/MapFeaturePopup';
import type { MapLayerData, BasemapStyle } from '../../lib/components/MapLibreMap';
import type { GeoJSONFeature } from '../../lib/utils/types';
import { Spacing, Radius } from '../../lib/theme/colors';
import {
  X,
  ChevronRight,
  MapPin,
  List,
  Map as MapIcon,
  Crosshair,
  Search,
  Move,
  Undo2,
} from 'lucide-react-native';

// ── Layer config ──────────────────────────────────────────────────────────
const LAYER_COLORS: Record<string, string> = {
  objects: '#3B82F6',          // Blue
  polygons: '#8B5CF6',         // Violet
  pdps: '#10B981',             // Emerald
  trenches: '#F59E0B',         // Amber
  mfg: '#22D3EE',              // Sky
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
const IMPORT_COLORS: Record<string, string> = {
  objects: '#EF4444',                // Red
  polygons: '#D946EF',               // Fuchsia
  pdps: '#F97316',                   // Orange
  trenches: '#14B8A6',               // Teal
  mfg: '#0284C7',                    // Sky Blue
  ducts: '#0891B2',                  // Cyan
  cables: '#E11D48',                 // Rose
  feeder_cable: '#DB2777',           // Pink
  distribution_cable: '#EA580C',     // Dark Orange
  feeder_ducts: '#65A30D',           // Lime
  distribution_ducts: '#0D9488',     // Dark Teal
  feeder_trench: '#4F46E5',          // Indigo
  distribution_trench: '#C026D3',    // Purple
  garden_trench: '#D946EF',          // Fuchsia
  final_trenches: '#BE123C',         // Dark Rose
};

const IMPORT_ID_PREFIX = 'imp-';

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
      features: features.map((f, i) => ({
        ...f,
        properties: {
          ...f.properties,
          id: f.properties?.id ?? idList?.[i] ?? `${id}-${i}`,
          _layer_name: layerNames[id] ?? id.toUpperCase(),
        },
      })),
      visible: layerVisibility[id] !== false,
      color,
    };
  });
}

// ── Resolve geometry type from layer ID ────────────────────────────────────
function resolveGeometryType(layerId: string): string {
  if (layerId === 'trenches' || layerId === 'ducts' || layerId === 'cables'
    || layerId.includes('trench') || layerId.includes('duct') || layerId.includes('cable')) {
    return 'LineString';
  }
  if (layerId === 'polygons') return 'Polygon';
  return 'Point';
}

// ── Map Screen ────────────────────────────────────────────────────────────
export default function MapScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { demoMode } = useAuthStore();
  const {
    layers: storeLayers,
    selectedFeaturePopup,
    userLocation,
    followUser,
    selectFeature,
    setFollowUser,
    loadDemoLayers,
  } = useMapStore();
  const { projects } = useProjectStore();

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [layerFeaturePanel, setLayerFeaturePanel] = useState<{ visible: boolean; layerId: string | null; layerName: string; featureCount: number }>({ visible: false, layerId: null, layerName: '', featureCount: 0 });
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [selectedMapFeatureId, setSelectedMapFeatureId] = useState<string | null>(null);
  const [activeBasemap, setActiveBasemap] = useState<string>('streets');
  const [basemapPanelVisible, setBasemapPanelVisible] = useState(false);
  const [featureNotes, setFeatureNotes] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState('');
  const [popupScreenCoords, setPopupScreenCoords] = useState<{ x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragMode, setDragMode] = useState(false);

  // ── Phase 2: Geometry Editor State ───────────────────────────────────
  const [geoMode, setGeoMode] = useState<GeometryMode>('select');
  const [mergeSelection, setMergeSelection] = useState<[string | null, string | null]>([null, null]);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [vertexEdit, setVertexEdit] = useState<{ featureId: string; layerId: string; vertexIdx: number } | null>(null);
  const [geomBusy, setGeomBusy] = useState(false);

  // ── Undo Stack for drag operations ───────────────────────────────────
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
  };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  // Refs that track values declared later — avoids TDZ in hooks that reference them
  const localDemoGeojsonRef = useRef<Record<string, GeoJSONFeature[]>>(DEMO_GEOJSON_FEATURES);
  const activeGeojsonRef = useRef<Record<string, GeoJSONFeature[]>>(DEMO_GEOJSON_FEATURES);
  const allPanelLayersRef = useRef<any[]>([]);
  const panelLayerDataRef = useRef<any[]>([]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO - 1)), entry];
    setUndoCount(undoStackRef.current.length);
  }, []);

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;

    const entry = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    setUndoCount(undoStackRef.current.length);

    // Read current state from stores/refs to avoid stale closures and TDZ
    const currentHasImportedData = Object.keys(useProjectStore.getState().projectGeojsons).length > 0;
    const currentLocalGeojson = localDemoGeojsonRef.current;

    // Helper to map a feature array and restore old coordinates
    const restoreCoords = (layerFeatures: GeoJSONFeature[]) => {
      let found = false;
      const updated = layerFeatures.map((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        if (fid === entry.featureId) {
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

    if (currentHasImportedData && entry.layerId.startsWith(IMPORT_ID_PREFIX)) {
      const cleanKey = entry.layerId.slice(IMPORT_ID_PREFIX.length);
      const currentGeojsons = useProjectStore.getState().projectGeojsons;
      const layerFeatures = currentGeojsons[cleanKey];
      let updatedFeatures = layerFeatures ? restoreCoords(layerFeatures) : null;
      if (updatedFeatures) {
        // Recalculate dependent properties
        const fullGeojson: Record<string, GeoJSONFeature[]> = {};
        for (const [k, v] of Object.entries(currentLocalGeojson)) fullGeojson[k] = v;
        for (const [k, v] of Object.entries(currentGeojsons)) fullGeojson[`imp-${k}`] = v;
        fullGeojson[entry.layerId] = updatedFeatures;
        const recalc = recalculateDependentProperties(entry.layerId, fullGeojson, updatedFeatures);
        updatedFeatures = recalc.geojson[entry.layerId] ?? updatedFeatures;

        useProjectStore.getState().setProjectGeojsons({
          ...currentGeojsons,
          [cleanKey]: updatedFeatures,
        });

        // Apply paired demo layer updates
        for (const [key, features] of Object.entries(recalc.geojson)) {
          if (key !== entry.layerId && !key.startsWith(IMPORT_ID_PREFIX) && DEMO_GEOJSON_FEATURES[key]) {
            setLocalDemoGeojson((prev) => ({ ...prev, [key]: features }));
          }
        }
      }
    } else if (DEMO_GEOJSON_FEATURES[entry.layerId]) {
      setLocalDemoGeojson((prev) => {
        const layerFeatures = prev[entry.layerId];
        if (!layerFeatures) return prev;
        let updatedFeatures = restoreCoords(layerFeatures);
        if (!updatedFeatures) return prev;

        // Recalculate dependent properties
        const fullGeojson: Record<string, GeoJSONFeature[]> = { ...prev };
        fullGeojson[entry.layerId] = updatedFeatures;
        const recalc = recalculateDependentProperties(entry.layerId, fullGeojson, updatedFeatures);

        const next = { ...prev };
        for (const [key, features] of Object.entries(recalc.geojson)) {
          if (DEMO_GEOJSON_FEATURES[key] || key === entry.layerId) {
            next[key] = features;
          }
        }
        return next;
      });
    }
  }, []);

  // Refs are kept in sync INSIDE the respective useMemo/useState hooks below
  // to avoid TDZ errors from referencing later-declared const variables in dependency arrays.

  // ── Ctrl+Z keyboard shortcut (web only) ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo]);

  // ── Draggable layer IDs — only point layers that allow geometry editing ──
  const draggableLayerIds = useMemo(() => {
    const ids = new Set<string>();
    const geo = activeGeojsonRef.current;
    for (const [id, features] of Object.entries(geo)) {
      if (features.length > 0 && features[0]?.geometry?.type === 'Point') {
        ids.add(id);
      }
    }
    // Also add line layers for geometry editing modes
    for (const [id, features] of Object.entries(geo)) {
      if (features.length > 0 && (features[0]?.geometry?.type === 'LineString' || id.includes('trench') || id.includes('duct') || id.includes('cable'))) {
        ids.add(id);
      }
    }
    return ids;
  }, []);

  const legendGroups = useMemo(
    () => buildLayerGroups(panelLayerDataRef.current, DEFAULT_LAYER_GROUPS),
    []
  );

  const currentBasemapStyle = BASEMAPS[activeBasemap]?.style ?? BASEMAPS.streets.style;

  // Load demo layers on mount
  useEffect(() => {
    if (storeLayers.length === 0 && demoMode) {
      loadDemoLayers();
    }
  }, [demoMode]);

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

  // ── Determine GeoJSON source: merge demo + imported data ────────────
  const { projectGeojsons, projectLayers, activeProject: storeActiveProject } = useProjectStore();
  const hasImportedData = Object.keys(projectGeojsons).length > 0;

  // Merge: always show demo data + prefix imported data with 'imp-'
  // Uses local state copy for reactivity — drag updates trigger re-renders
  const [localDemoGeojson, setLocalDemoGeojson] = useState<Record<string, GeoJSONFeature[]>>(DEMO_GEOJSON_FEATURES);
  // Keep ref in sync — placed right after useState so localDemoGeojson is initialized
  useEffect(() => {
    localDemoGeojsonRef.current = localDemoGeojson;
  }, [localDemoGeojson]);

  const activeGeojson = useMemo(() => {
    if (!hasImportedData) {
      activeGeojsonRef.current = localDemoGeojson;
      return localDemoGeojson;
    }
    const merged: Record<string, GeoJSONFeature[]> = { ...localDemoGeojson };
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      merged[importedKey] = features;
    }
    activeGeojsonRef.current = merged;
    return merged;
  }, [hasImportedData, projectGeojsons, localDemoGeojson]);

  // Build layer names: demo defaults + imported layer names with '(Imported)' suffix
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

  // Merge colors: demo defaults + imported colors
  const activeLayerColors = useMemo(() => {
    const colors: Record<string, string> = { ...LAYER_COLORS };
    if (hasImportedData) {
      for (const [key] of Object.entries(projectGeojsons)) {
        colors[`${IMPORT_ID_PREFIX}${key}`] = IMPORT_COLORS[key] ?? '#FF6B6B';
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

  // Build a feature ID map for demo data so GeoJSON layers have correct IDs
  const demoFeatureIdMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [layerId, features] of Object.entries(DEMO_FEATURES)) {
      map[layerId] = features.map((f) => f.id);
    }
    return map;
  }, []);

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

  // Use imported project when available, otherwise demo project
  const activeProject = storeActiveProject ?? projects[0] ?? null;
  const mapProjectName = activeProject?.name ?? 'Survey Map';

  const demoFeatures = getDemoAllFeatures();

  // ── Merge demo + imported features for list view ────────────────────────
  const mergedFeatureList = useMemo(() => {
    const list = [...demoFeatures];
    if (hasImportedData) {
      for (const [key, features] of Object.entries(projectGeojsons)) {
        const importedKey = `${IMPORT_ID_PREFIX}${key}`;
        const layerName = activeLayerNames[importedKey] ?? key.toUpperCase();
        features.forEach((feat, i) => {
          const props = feat.properties ?? {};
          const entries = Object.entries(props).filter(([k]) => !k.startsWith('_'));
          const firstPropKey = entries[0]?.[0];
          const firstPropVal = entries[0]?.[1];
          list.push({
            feature: {
              id: `imp-feat-${key}-${i + 1}`,
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
    }
    return list;
  }, [demoFeatures, hasImportedData, projectGeojsons, activeLayerNames]);

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
  const mapLayerData = useMemo(
    () => buildMapLayerData(activeGeojson, layerVisibility, activeLayerNames,
      hasImportedData ? importFeatureIdMap : demoFeatureIdMap, activeLayerColors),
    [activeGeojson, layerVisibility, activeLayerNames, hasImportedData, demoFeatureIdMap, importFeatureIdMap, activeLayerColors]
  );

  // Build visible layers: always include demo base, add imported layers on top
  const visibleLayers = useMemo(() => {
    // Always start with demo layers
    const demoBase = DEMO_LAYERS.map((l) => ({
      id: l.layer_id,
      name: l.layer_name,
      visible: layerVisibility[l.layer_id] !== false,
      featureCount: l.feature_count,
      geometryType: resolveGeometryType(l.layer_id) as any,
    }));
    if (!hasImportedData) return demoBase.filter((l) => layerVisibility[l.id] !== false);

    const all = [...demoBase];
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      all.push({
        id: importedKey,
        name: activeLayerNames[importedKey] ?? key.toUpperCase(),
        visible: layerVisibility[importedKey] !== false,
        featureCount: features.length,
        geometryType: (features[0]?.geometry?.type as any) ?? resolveGeometryType(key),
      });
    }
    return all.filter((l) => layerVisibility[l.id] !== false);
  }, [hasImportedData, projectGeojsons, activeLayerNames, layerVisibility]);

  // All layers for the panel: always include demo base + imported
  const allPanelLayers = useMemo(() => {
    const demoBase = DEMO_LAYERS.map((l) => ({
      id: l.layer_id,
      name: l.layer_name,
      visible: layerVisibility[l.layer_id] !== false,
      featureCount: l.feature_count,
      geometryType: resolveGeometryType(l.layer_id) as any,
    }));
    if (!hasImportedData) {
      allPanelLayersRef.current = demoBase;
      return demoBase;
    }

    const all = [...demoBase];
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      all.push({
        id: importedKey,
        name: activeLayerNames[importedKey] ?? key.toUpperCase(),
        visible: layerVisibility[importedKey] !== false,
        featureCount: features.length,
        geometryType: (features[0]?.geometry?.type as any) ?? resolveGeometryType(key),
      });
    }
    allPanelLayersRef.current = all;
    return all;
  }, [hasImportedData, projectGeojsons, activeLayerNames, layerVisibility]);

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
      // Store screen position for the pin-anchored popup
      if (screenPoint) {
        setPopupScreenCoords(screenPoint);
      }

      // First try to find in demo features (rich metadata)
      const found = demoFeatures.find(
        (f) => f.feature.id === featureId
      );
      if (found) {
        selectFeature(found.feature.id, {
          id: found.feature.id,
          name: String(
            found.feature.properties?.name ??
              found.feature.properties?.address ??
              found.feature.layer_name + ' #' + found.feature.id.slice(-3)
          ),
          layerName: found.feature.layer_name,
          status: found.feature.status,
          layerId: found.feature.layer_id,
        });
        setSelectedMapFeatureId(found.feature.id);
        return;
      }

      // Fallback for imported/unknown features — build popup from GeoJSON
      const layerName = activeLayerNames[layerId] ?? layerId.toUpperCase();
      selectFeature(featureId, {
        id: featureId,
        name: featureId.startsWith('demo-') ? layerName + ' #' + featureId.slice(-3) : 'Feature #' + featureId.slice(0, 8),
        layerName,
        status: 'assigned',
        layerId,
      });
      setSelectedMapFeatureId(featureId);
    },
    [demoFeatures, selectFeature, activeLayerNames]
  );

  // ── Toggle layer visibility ─────────────────────────────────────────────
  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayerVisibility((prev) => {
      // If the key doesn't exist yet, treat it as visible (true) → toggle to hidden (false)
      // If it exists as false → toggle to true, if true → toggle to false
      const next = prev[layerId] === undefined ? false : !prev[layerId];
      // Keep store in sync
      useMapStore.getState().toggleLayer(layerId);
      return { ...prev, [layerId]: next };
    });
  }, []);

  // ── Point drag end handler — update GeoJSON coordinates ─────────────────
  const handleFeatureDragEnd = useCallback(
    (featureId: string, layerId: string, newLng: number, newLat: number) => {
      // Update the active GeoJSON by finding and modifying the feature
      const layerFeatures = activeGeojsonRef.current[layerId];
      if (!layerFeatures) return;

      let oldLng = 0, oldLat = 0;
      let found = false;
      const updatedFeatures = layerFeatures.map((f) => {
        // Match by properties.id or generated id pattern
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        if (fid === featureId && f.geometry?.type === 'Point') {
          found = true;
          const [olng, olat] = f.geometry.coordinates as [number, number];
          oldLng = olng;
          oldLat = olat;
          return {
            ...f,
            geometry: {
              ...f.geometry,
              coordinates: [newLng, newLat],
            },
          };
        }
        return f;
      });

      if (!found) return;

      // Push to undo stack BEFORE applying the change
      pushUndo({
        featureId,
        layerId,
        oldLng,
        oldLat,
        newLng,
        newLat,
        timestamp: Date.now(),
      });

      // ── Recalculate dependent properties (distance_to_pdp, length_m, etc.) ──
      // Build the full GeoJSON map (demo + imported) for the recalculation
      const fullGeojson: Record<string, GeoJSONFeature[]> = { ...activeGeojsonRef.current };
      fullGeojson[layerId] = updatedFeatures;

      const recalc = recalculateDependentProperties(layerId, fullGeojson, updatedFeatures);

      if (recalc.changes.length > 0) {
        console.log(`[Drag] Spatial recalc: ${recalc.changes.join('; ')}`);
      }

      // Apply ALL recalculated layers to the appropriate stores
      const currentHasImported = Object.keys(useProjectStore.getState().projectGeojsons).length > 0;
      const applyRecalc = () => {
        if (currentHasImported && layerId.startsWith(IMPORT_ID_PREFIX)) {
          // ── Imported layer was moved ────────────────────────────────
          const cleanKey = layerId.slice(IMPORT_ID_PREFIX.length);
          let currentGeojsons = useProjectStore.getState().projectGeojsons;
          if (currentGeojsons[cleanKey]) {
            // Accumulate ALL imported layer changes, then apply once
            let mutatedImport = false;
            for (const [key, features] of Object.entries(recalc.geojson)) {
              if (key.startsWith(IMPORT_ID_PREFIX)) {
                const impClean = key.slice(IMPORT_ID_PREFIX.length);
                if (currentGeojsons[impClean]) {
                  currentGeojsons = { ...currentGeojsons, [impClean]: features };
                  mutatedImport = true;
                }
              } else if (DEMO_GEOJSON_FEATURES[key]) {
                setLocalDemoGeojson((prev) => ({ ...prev, [key]: features }));
              }
            }
            if (mutatedImport) {
              useProjectStore.getState().setProjectGeojsons(currentGeojsons);
            }
          }
        } else if (DEMO_GEOJSON_FEATURES[layerId]) {
          // ── Demo layer was moved ────────────────────────────────────
          setLocalDemoGeojson((prev) => {
            const next = { ...prev };
            for (const [key, features] of Object.entries(recalc.geojson)) {
              if (DEMO_GEOJSON_FEATURES[key] || key === layerId) {
                next[key] = features;
              }
            }
            return next;
          });
          // Also propagate to imported paired layers if they exist
          if (currentHasImported) {
            let currentGeojsons = useProjectStore.getState().projectGeojsons;
            let mutated = false;
            for (const [key, features] of Object.entries(recalc.geojson)) {
              if (key.startsWith(IMPORT_ID_PREFIX)) {
                const impClean = key.slice(IMPORT_ID_PREFIX.length);
                if (currentGeojsons[impClean]) {
                  currentGeojsons = { ...currentGeojsons, [impClean]: features };
                  mutated = true;
                }
              }
            }
            if (mutated) {
              useProjectStore.getState().setProjectGeojsons(currentGeojsons);
            }
          }
        }
      };
      applyRecalc();

      // ── Fire-and-forget sync to backend (no-op in demo mode) ───────
      const syncProjectId = useProjectStore.getState().activeProject?.id;
      const movedFeature = updatedFeatures.find((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        return fid === featureId;
      });
      if (syncProjectId && movedFeature?.geometry) {
        useProjectStore.getState().syncFeatureEdit(syncProjectId, featureId, {
          geometry: movedFeature.geometry as Record<string, unknown>,
        });
      }

      console.log(
        `[Drag] Moved ${featureId} to [${newLng.toFixed(6)}, ${newLat.toFixed(6)}]`
      );
    },
    [pushUndo]
  );

  // ── Handle GeoJSON changes from GeometryEditor ──────────────────────────
  const onGeometryChange = useCallback(
    (layerId: string, action: 'split' | 'merge' | 'create' | 'vertex_update',
      updatedFeatures: any[], description: string) => {
      setGeomBusy(true);

      // Update the active GeoJSON
      const currentHasImported = Object.keys(useProjectStore.getState().projectGeojsons).length > 0;

      if (currentHasImported && layerId.startsWith(IMPORT_ID_PREFIX)) {
        const cleanKey = layerId.slice(IMPORT_ID_PREFIX.length);
        const current = useProjectStore.getState().projectGeojsons;
        useProjectStore.getState().setProjectGeojsons({
          ...current,
          [cleanKey]: updatedFeatures,
        });
      } else if (DEMO_GEOJSON_FEATURES[layerId] || !currentHasImported) {
        setLocalDemoGeojson((prev) => ({ ...prev, [layerId]: updatedFeatures }));
      }

      // ── Sync geometry changes to backend (no-op in demo mode) ──────
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
    [setGeomBusy, setLocalDemoGeojson],
  );

  // ── Phase 2: Geometry Mode Handler ────────────────────────────────────
  const handleGeometryAction = useCallback(
    (featureId: string, layerId: string, lng: number, lat: number, mode: GeometryMode) => {
      const geojson = activeGeojsonRef.current;
      const features = geojson[layerId];
      if (!features) return;

      if (mode === 'split') {
        // ── Split line at clicked point ────────────────────────────────
        const feature = features.find((f) =>
          (f.properties as any)?.id === featureId || (f.properties as any)?._id === featureId
        );
        if (!feature || (feature.geometry?.type !== 'LineString' && feature.geometry?.type !== 'MultiLineString')) {
          return;
        }

        const coords = feature.geometry.coordinates as [number, number][];
        const result = splitLineAtPoint(coords, lng, lat);
        if (!result) return;

        // Create two new features from the split
        const props = { ...(feature.properties ?? {}) };
        const baseName = (props.name as string) ?? 'Trench';
        const featA = createGeoJSONFeature(result.coordsA, layerId, {
          ...props,
          name: `${baseName} (A)`,
          split_from: featureId,
        });
        const featB = createGeoJSONFeature(result.coordsB, layerId, {
          ...props,
          name: `${baseName} (B)`,
          split_from: featureId,
        });

        // Remove original, add two new features
        const updated = features
          .filter((f) => (f.properties as any)?.id !== featureId && (f.properties as any)?._id !== featureId)
          .concat([featA, featB]);

        onGeometryChange(layerId, 'split', updated,
          `Split "${baseName}" into 2 segments (${result.coordsA.length} + ${result.coordsB.length} vertices)`);
      } else if (mode === 'merge') {
        // ── Merge two lines ────────────────────────────────────────────
        const [firstId, secondId] = mergeSelection;
        if (!firstId) {
          // Select first feature
          setMergeSelection([featureId, null]);
          return;
        }
        if (featureId === firstId) {
          // Tapped same feature — deselect
          setMergeSelection([null, null]);
          return;
        }

        // Find both features
        const featA = features.find((f) =>
          (f.properties as any)?.id === firstId || (f.properties as any)?._id === firstId
        );
        const featB = features.find((f) =>
          (f.properties as any)?.id === featureId || (f.properties as any)?._id === featureId
        );
        if (!featA || !featB) return;
        if (featA.geometry?.type !== 'LineString' || featB.geometry?.type !== 'LineString') return;

        const coordsA = featA.geometry.coordinates as [number, number][];
        const coordsB = featB.geometry.coordinates as [number, number][];
        const merged = mergeLines(coordsA, coordsB);
        if (!merged) return;

        // Create merged feature
        const propsA = { ...(featA.properties ?? {}) };
        const mergedFeature = createGeoJSONFeature(merged.merged, layerId, {
          ...propsA,
          name: `${propsA.name ?? 'Trench'} (Merged)`,
          merged_from: [firstId, featureId].join(','),
          merge_dist_m: Math.round(merged.distM),
        });

        const updated = features
          .filter((f) => {
            const id = (f.properties as any)?.id || (f.properties as any)?._id;
            return id !== firstId && id !== featureId;
          })
          .concat([mergedFeature]);

        setMergeSelection([null, null]);
        onGeometryChange(layerId, 'merge', updated,
          `Merged 2 segments into one (endpoint dist: ${Math.round(merged.distM)}m)`);
      } else if (mode === 'edit_vertices') {
        // ── Select feature for vertex editing ──────────────────────────
        const feature = features.find((f) =>
          (f.properties as any)?.id === featureId || (f.properties as any)?._id === featureId
        );
        if (!feature || feature.geometry?.type !== 'LineString') return;

        const coords = feature.geometry.coordinates as [number, number][];
        const nearest = findNearestVertex(coords, lng, lat, 0.0005); // ~50m threshold
        if (!nearest) {
          // Click was too far from any vertex — select the feature anyway
          setVertexEdit({ featureId, layerId, vertexIdx: 0 });
          return;
        }

        setVertexEdit({ featureId, layerId, vertexIdx: nearest.idx });
      }
    },
    [mergeSelection, onGeometryChange],
  );

  // ── Vertex drag end handler — updates the LineString coordinate and store ──
  const handleVertexDragEnd = useCallback(
    (featureId: string, layerId: string, vertexIdx: number, newLng: number, newLat: number) => {
      const geojson = activeGeojsonRef.current;
      const features = geojson[layerId];
      if (!features) return;

      let oldLng = 0, oldLat = 0;
      let found = false;
      const updatedFeatures = features.map((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        if (fid === featureId && f.geometry?.type === 'LineString') {
          found = true;
          const coords = [...(f.geometry.coordinates as [number, number][])];
          const vertex = coords[vertexIdx];
          if (vertex) {
            oldLng = vertex[0];
            oldLat = vertex[1];
            coords[vertexIdx] = [newLng, newLat];
          }
          return {
            ...f,
            geometry: {
              ...f.geometry,
              coordinates: coords,
            },
          };
        }
        return f;
      });

      if (!found) return;

      // Push to undo stack with vertex index so undo can restore the LineString vertex
      pushUndo({
        featureId,
        layerId,
        oldLng,
        oldLat,
        newLng,
        newLat,
        vertexIdx,
        timestamp: Date.now(),
      });

      // ── Recalculate dependent properties (length_m, etc.) ───────────────
      const fullGeojson: Record<string, GeoJSONFeature[]> = { ...activeGeojsonRef.current };
      fullGeojson[layerId] = updatedFeatures;
      const recalc = recalculateDependentProperties(layerId, fullGeojson, updatedFeatures);

      if (recalc.changes.length > 0) {
        console.log(`[Vertex] Spatial recalc: ${recalc.changes.join('; ')}`);
      }

      // Update the store with the recalculated features
      const currentHasImported = Object.keys(useProjectStore.getState().projectGeojsons).length > 0;

      if (currentHasImported && layerId.startsWith(IMPORT_ID_PREFIX)) {
        const cleanKey = layerId.slice(IMPORT_ID_PREFIX.length);
        const current = useProjectStore.getState().projectGeojsons;
        useProjectStore.getState().setProjectGeojsons({
          ...current,
          [cleanKey]: recalc.geojson[layerId] ?? updatedFeatures,
        });
      } else {
        setLocalDemoGeojson((prev) => {
          const next = { ...prev };
          for (const [key, features] of Object.entries(recalc.geojson)) {
            if (DEMO_GEOJSON_FEATURES[key] || key === layerId) {
              next[key] = features;
            }
          }
          return next;
        });
      }

      // ── Fire-and-forget sync to backend (no-op in demo mode) ───────
      const syncProjectId = useProjectStore.getState().activeProject?.id;
      const movedFeature = updatedFeatures.find((f) => {
        const fid = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
        return fid === featureId;
      });
      if (syncProjectId && movedFeature?.geometry) {
        useProjectStore.getState().syncFeatureEdit(syncProjectId, featureId, {
          geometry: movedFeature.geometry as Record<string, unknown>,
        });
      }

      // Update vertexEdit to the same vertex (keep selection active)
      setVertexEdit({ featureId, layerId, vertexIdx });

      console.log(`[Vertex] Moved vertex ${vertexIdx} of ${featureId} to [${newLng.toFixed(6)}, ${newLat.toFixed(6)}]`);
    },
    [pushUndo],
  );

  // ── Clear draw points callback ─────────────────────────────────────────
  const handleClearDrawPoints = useCallback(() => {
    setDrawPoints([]);
  }, []);

  // ── Handle empty map area click (for draw bypass) ───────────────────────
  const handleEmptyMapClick = useCallback(
    (lng: number, lat: number) => {
      if (geoMode === 'draw_bypass') {
        setDrawPoints((prev) => [...prev, [lng, lat]]);
      }
    },
    [geoMode],
  );

  // ── Handle feature click depending on geometry mode ─────────────────────
  const handleGeoFeatureAction = useCallback(
    (featureId: string, layerId: string, lng: number, lat: number, mode: GeometryMode) => {
      if (mode === 'select') {
        // Normal feature click — handled by existing handleMapFeatureClick
        return;
      }
      // In draw or vertex mode, treat feature clicks as empty-area clicks
      if (mode === 'draw_bypass' || mode === 'edit_vertices') {
        handleEmptyMapClick(lng, lat);
        return;
      }
      handleGeometryAction(featureId, layerId, lng, lat, mode);
    },
    [handleGeometryAction, handleEmptyMapClick],
  );

  // ── Save notes for current feature ───────────────────────────────────────
  const handleSaveNotes = useCallback(() => {
    if (!selectedFeaturePopup?.id) return;
    setFeatureNotes((prev) => ({
      ...prev,
      [selectedFeaturePopup.id]: notesDraft,
    }));
  }, [selectedFeaturePopup?.id, notesDraft]);

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

    // First try to find in demo features (rich metadata)
    const found = demoFeatures.find((f) => f.feature.id === featureId);
    if (found) {
      selectFeature(found.feature.id, {
        id: found.feature.id,
        name: String(
          found.feature.properties?.name ??
            found.feature.properties?.address ??
            found.feature.layer_name + ' #' + found.feature.id.slice(-3)
        ),
        layerName: found.feature.layer_name,
        layerId: found.feature.layer_id,  // Pass layerId for schema lookup
        status: found.feature.status,
      });
      setSelectedMapFeatureId(found.feature.id);
      setViewMode('map');
      return;
    }

    // Fallback for imported/unknown features — search in mapLayerData (which has augmented IDs)
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MapIcon size={20} stroke={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {mapProjectName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: viewMode === 'list' ? colors.primary + '15' : colors.surface }]}
            onPress={() => setViewMode('list')}
          >
            <List size={18} stroke={viewMode === 'list' ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: viewMode === 'map' ? colors.primary + '15' : colors.surface }]}
            onPress={() => setViewMode('map')}
          >
            <MapIcon size={18} stroke={viewMode === 'map' ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      {viewMode === 'map' ? (
        <View style={styles.mapContainer}>
          {/* Drag Mode Indicator */}
          {dragMode && (
            <View style={[styles.dragIndicator, { backgroundColor: colors.primary }]}>
              <Move size={12} stroke={colors.onPrimary} />
              <Text style={[styles.dragIndicatorText, { color: colors.onPrimary }]}>
                Drag Mode — Tap point features to move
              </Text>
            </View>
          )}

          {/* Interactive MapLibre Map */}
          <MapLibreMap
            layers={mapLayerData}
            onFeatureClick={(featureId, layerId, lngLat, screenPt) => {
              // Route clicks through geometry mode handler when in a non-select mode
              if (geoMode !== 'select') {
                handleGeoFeatureAction(featureId, layerId, lngLat[0], lngLat[1], geoMode);
                return;
              }
              handleMapFeatureClick(featureId, layerId, lngLat, screenPt);
            }}
            onEmptyAreaClick={handleEmptyMapClick}
            onFeatureDragEnd={handleFeatureDragEnd}
            onVertexDragEnd={handleVertexDragEnd}
            vertexDragTarget={vertexEdit}
            draggableLayerIds={draggableLayerIds}
            dragMode={dragMode}
            selectedFeatureId={selectedMapFeatureId ?? undefined}
            height="100%"
            mapStyle={currentBasemapStyle}
            flyToCenter={flyToCenter}
          />

          {/* Geometry Editor */}
          {viewMode === 'map' && (
            <GeometryEditor
              mode={geoMode}
              onModeChange={(mode) => {
                setGeoMode(mode);
                // Reset any pending state on mode change
                setMergeSelection([null, null]);
                setDrawPoints([]);
                setVertexEdit(null);
                // Also reset popup if any
                if (mode !== 'select') {
                  selectFeature(null);
                  setSelectedMapFeatureId(null);
                  setPopupScreenCoords(null);
                }
              }}
              onGeometryChange={onGeometryChange}
              onFeatureAction={handleGeoFeatureAction}
              onEmptyMapClick={handleEmptyMapClick}
              onClearDrawPoints={handleClearDrawPoints}
              allGeojson={activeGeojsonRef.current}
              mergeSelection={mergeSelection}
              drawPoints={drawPoints}
              vertexEdit={vertexEdit}
              isBusy={geomBusy}
            />
          )}

          {/* Layer Legend Overlay — with collapsible group headers */}
          <MapLegend
            layers={panelLayerData}
            groups={legendGroups}
            maxVisible={0}
            onToggleLayer={toggleLayerVisibility}
            onLayerClick={handleViewLayerFeatures}
          />

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

          {/* Pin-Anchored Feature Popup */}
          {selectedFeaturePopup && (
            <MapFeaturePopup
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
                router.push(`/feature/${selectedFeaturePopup.id}?projectId=${activeProject?.id ?? 'demo-proj-1'}`)
              }
              onDismiss={() => {
                selectFeature(null);
                setSelectedMapFeatureId(null);
                setPopupScreenCoords(null);
              }}
              notesDraft={notesDraft}
              onNotesChange={setNotesDraft}
              onSaveNotes={handleSaveNotes}
              hasUnsavedNotes={notesDraft !== (featureNotes[selectedFeaturePopup.id] ?? '')}
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
                  onPress={() => router.push(`/feature/${item.feature.id}?projectId=${activeProject?.id ?? 'demo-proj-1'}`)}
                >
                  <Text style={[styles.openBtnText, { color: colors.onPrimary }]}>Open Feature</Text>
                  <ChevronRight size={14} stroke={colors.onPrimary} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* FABs - only on map view */}
      {viewMode === 'map' && (
        <View style={styles.fabs}>
          {/* Undo button — visible when there are draggable operations to undo */}
          {undoCount > 0 && (
            <TouchableOpacity
              style={[styles.fab, { backgroundColor: colors.surface }]}
              onPress={handleUndo}
              activeOpacity={0.7}
            >
              <Undo2 size={20} stroke={colors.textSecondary} />
              <View style={[styles.undoBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.undoBadgeText}>
                  {undoCount > 99 ? '99+' : undoCount}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: colors.surface }]}
            onPress={() => setBasemapPanelVisible(!basemapPanelVisible)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 18 }}>{BASEMAPS[activeBasemap]?.icon ?? '🗺️'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: dragMode ? colors.primary : colors.surface }]}
            onPress={() => setDragMode(!dragMode)}
            activeOpacity={0.8}
          >
            <Move size={20} stroke={dragMode ? colors.onPrimary : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: colors.surface }]}
            onPress={() => setFollowUser(!followUser)}
            activeOpacity={0.8}
          >
            <Crosshair size={20} stroke={followUser ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Basemap Switcher Panel */}
      {basemapPanelVisible && viewMode === 'map' && (
        <View style={[styles.panel, { backgroundColor: colors.surface, bottom: Spacing.xxl }]}>
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Basemap</Text>
            <TouchableOpacity onPress={() => setBasemapPanelVisible(false)}>
              <X size={20} stroke={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.basemapRow}>
            {Object.values(BASEMAPS).map((bm) => {
              const isActive = activeBasemap === bm.id;
              return (
                <TouchableOpacity
                  key={bm.id}
                  style={[styles.basemapItem, { backgroundColor: isActive ? colors.primary + '15' : colors.background, borderColor: isActive ? colors.primary : colors.outline }]}
                  onPress={() => { setActiveBasemap(bm.id); setBasemapPanelVisible(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 24 }}>{bm.icon}</Text>
                  <Text style={[styles.basemapLabel, { color: isActive ? colors.primary : colors.textPrimary }]}>{bm.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
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
  headerRight: { flexDirection: 'row', gap: Spacing.xs },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '600' },

  // ── Map View ───────────────────────────────────────────────────────────
  mapContainer: { flex: 1, position: 'relative' },

  // ── Drag Mode Indicator ────────────────────────────────────────────────
  dragIndicator: {
    position: 'absolute',
    top: Spacing.sm,
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
    fontSize: 12,
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
    height: 38,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    height: '100%',
  },
  searchClear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterList: { flexGrow: 0, marginBottom: Spacing.sm },
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
  featureLayer: { fontSize: 12, marginTop: 1 },
  featureMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  featureMetaText: { fontSize: 12, flex: 1 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 11,
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
    fontSize: 11,
    marginTop: 2,
  },
  fpEmpty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
    fontStyle: 'italic',
  },

  // ── FABs ───────────────────────────────────────────────────────────────
  fabs: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.xxl * 3,
    gap: Spacing.md,
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

  // ── Undo Badge ───────────────────────────────────────────────────────
  undoBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  undoBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 12,
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
  basemapLabel: { fontSize: 12, fontWeight: '600' },
});
