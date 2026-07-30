import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { useMapStore } from '../../lib/stores/map';
import { useAuthStore } from '../../lib/stores/auth';
import { useProjectStore } from '../../lib/stores/project';
import { useSurveyStore } from '../../lib/stores/survey';
import { useSurveyFeaturesStore, SURVEY_COLOR } from '../../lib/stores/survey-features';
import { getDemoAllFeatures, DEMO_GEOJSON_FEATURES, DEMO_FEATURES, DEMO_LAYERS } from '../../lib/stores/demo-data';
import { recalculateDependentProperties } from '../../lib/utils/spatial';
// Geometry operation utilities removed — all edits now route through survey-features store
import GeometryEditor from '../../lib/components/GeometryEditor';
import type { GeometryMode, EditingFeature } from '../../lib/components/GeometryEditor';
import LineSelectionToolbar from '../../lib/components/LineSelectionToolbar';
import SurveyChangesPanel from '../../lib/components/SurveyChangesPanel';
import SurveyForm from '../../lib/components/SurveyForm';
import type { SurveyFormData } from '../../lib/components/SurveyForm';
import { Card, Badge } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import MapLibreMap, { BASEMAPS } from '../../lib/components/MapLibreMap';
import MapLegend, { buildLayerGroups, DEFAULT_LAYER_GROUPS } from '../../lib/components/MapLegend';
import MapFeaturePopup from '../../lib/components/MapFeaturePopup';
import type { MapLayerData, BasemapStyle } from '../../lib/components/MapLibreMap';
import type { GeoJSONFeature, LayerDisplayMode, SurveyFeatureData } from '../../lib/utils/types';
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
            id: f.properties?.id ?? idList?.[i] ?? `${id}-${i}`,
            _id: f.properties?.id ?? idList?.[i] ?? `${id}-${i}`,  // Alias for MapLibreMap click handlers
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
  const { recordPointMove } = useSurveyStore();
  const {
    surveyFeatures,
    displayMode,
    setDisplayMode,
    fetchSurveyFeatures,
    clearSurveyFeatures,
    upsertSurveyFeature,
    updateSurveyFeature,
    deleteSurveyFeature,
    getSurveyFeatureForHld,
  } = useSurveyFeaturesStore();

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

  // ── HLD/Survey Display Mode ──────────────────────────────────────────────
  // 'hld' = blue only (original HLD), 'survey' = orange only (engineer edits),
  // 'overlay' = both HLD + Survey visible simultaneously
  // displayMode is managed by useSurveyFeaturesStore (declared above)

  // ── Geometry Editor State (simplified: select, add_point, delete_feature only) ──
  // ── Geometry Editor State (simplified: select, add_point only) ──
  const [geoMode, setGeoMode] = useState<GeometryMode>('select');
  const [geomBusy, setGeomBusy] = useState(false);

  // ── Editing mode state (viewing → editing flow) ──────────────────────
  const [editingFeature, setEditingFeature] = useState<EditingFeature | null>(null);

  // ── Line Feature Selection state — shows the bottom toolbar when a line is tapped ──
  // Only one feature can be selected at a time. Toolbar disappears when deselected.
  const [selectedLineFeature, setSelectedLineFeature] = useState<EditingFeature | null>(null);

  // ── Line Move Mode state ──
  // When active, vertex handles are displayed for the selected line.
  // tempLineCoords holds the working copy of coordinates — HLD is never touched.
  // The user must press Save to persist changes to the survey-features store.
  const [lineMoveMode, setLineMoveMode] = useState(false);
  const [tempLineCoords, setTempLineCoords] = useState<[number, number][] | null>(null);
  const [tempLineOriginal, setTempLineOriginal] = useState<[number, number][] | null>(null);

  // ── Delete Section state ──────────────────────────────────────────────
  const [lineToolMode, setLineToolMode] = useState<'delete-section' | null>(null);
  const [deleteSectionRange, setDeleteSectionRange] = useState<[number, number] | null>(null);

  // ── Add Point state ────────────────────────────────────────────────
  const [addPointTargetLayer, setAddPointTargetLayer] = useState<string>('');
  // addPointLayers is computed below from allPanelLayers
  // Auto-select first point layer when entering add_point mode (see useEffect below)

  // ── New Point Form state — shows editable fields after adding a point ─
  const [surveyForm, setSurveyForm] = useState<SurveyFormData | null>(null);

  // ── Survey Changes Panel state — toggle to review all engineer edits ──
  const [surveyPanelVisible, setSurveyPanelVisible] = useState(false);

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
      previousStatus: string;
      description: string;
    };
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

    // ── SURVEY UNDO: restore a survey feature's previous geometry/attributes ──
    if (entry.surveyUndo) {
      const { surveyFeatureId, layerId, previousGeometry, previousAttributes, previousStatus, description } = entry.surveyUndo;
      console.log(`[Undo] Restoring survey feature ${surveyFeatureId.slice(-8)}: ${description}`);

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

      // Use updateSurveyFeature to restore previous state (API-backed features)
      updateSurveyFeature(surveyFeatureId, layerId, {
        survey_geometry: previousGeometry,
        survey_attributes: previousAttributes,
        survey_status: previousStatus as any,
      });
      return;
    }

    // ── SNAPSHOT RESTORE: multi-feature operations (split, merge, create, delete) ──
    if (entry.layerSnapshot) {
      const { layerId, previousFeatures, description } = entry.layerSnapshot;
      console.log(`[Undo] Restoring layer "${layerId}" snapshot: ${description}`);

      const currentHasImportedData = Object.keys(useProjectStore.getState().projectGeojsons).length > 0;

      if (currentHasImportedData && layerId.startsWith(IMPORT_ID_PREFIX)) {
        const cleanKey = layerId.slice(IMPORT_ID_PREFIX.length);
        const current = useProjectStore.getState().projectGeojsons;
        useProjectStore.getState().setProjectGeojsons({
          ...current,
          [cleanKey]: previousFeatures,
        });
      } else if (DEMO_GEOJSON_FEATURES[layerId] || !currentHasImportedData) {
        setLocalDemoGeojson((prev) => ({ ...prev, [layerId]: previousFeatures }));
      }
      return;
    }

    // ── SINGLE-FEATURE RESTORE: coordinate-based (point drag, vertex move, vertex delete) ──
    const currentHasImportedData = Object.keys(useProjectStore.getState().projectGeojsons).length > 0;
    const currentLocalGeojson = localDemoGeojsonRef.current;

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
  }, [updateSurveyFeature]);

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

  // Key for surveyPointGeometries: `${layerId}:${featureId}` to prevent cross-layer collisions
  const surveyPointKey = useCallback((layerId: string, featureId: string) => `${layerId}:${featureId}`, []);

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
  const {
    projectGeojsons,
    projectLayers,
    activeProject: storeActiveProject,
    fetchProjectGeojsons,
    layerFetchProgress,
  } = useProjectStore();
  const hasImportedData = Object.keys(projectGeojsons).length > 0;

  // ── SECURITY FALLBACK: Auto-fetch GeoJSON from backend when a real project is active but empty ──
  // With a 15-second timeout that falls back to demo data if the fetch fails or hangs.
  const fetchAttemptedRef = useRef(false);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      storeActiveProject &&
      !storeActiveProject.id.startsWith('demo-') &&
      !storeActiveProject.id.startsWith('imported-') &&
      !hasImportedData &&
      !fetchAttemptedRef.current
    ) {
      fetchAttemptedRef.current = true;
      console.log('[Map] Active project found but GeoJSON empty — fetching from backend');
      
      // Set a safety timeout: if data doesn't load in 15s, show demo data
      fetchTimeoutRef.current = setTimeout(() => {
        console.log('[Map] ⚠️ Project data fetch timed out — falling back to demo data');
        // Reset the state so activeGeojson uses demo data instead of empty
        useProjectStore.getState().setActiveProject(null);
        fetchAttemptedRef.current = false;
      }, 15000);
      
      fetchProjectGeojsons(storeActiveProject.id).catch((err) => {
        console.log('[Map] ⚠️ Project data fetch failed — falling back to demo data:', err);
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        useProjectStore.getState().setActiveProject(null);
        fetchAttemptedRef.current = false;
      });
    }
    
    // Clear timeout if data loads successfully
    if (hasImportedData && fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }
    
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, [storeActiveProject?.id, hasImportedData]);

  // Merge: always show demo data + prefix imported data with 'imp-'
  // Uses local state copy for reactivity — drag updates trigger re-renders
  const [localDemoGeojson, setLocalDemoGeojson] = useState<Record<string, GeoJSONFeature[]>>(DEMO_GEOJSON_FEATURES);
  // Keep ref in sync — placed right after useState so localDemoGeojson is initialized
  useEffect(() => {
    localDemoGeojsonRef.current = localDemoGeojson;
  }, [localDemoGeojson]);

  const activeGeojson = useMemo(() => {
    if (!hasImportedData) {
      // CRITICAL: When a real backend project is active but data hasn't loaded yet,
      // return an EMPTY object — NOT demo data. This prevents showing 'wrong' layers.
      if (
        storeActiveProject &&
        !storeActiveProject.id.startsWith('demo-') &&
        !storeActiveProject.id.startsWith('imported-')
      ) {
        const empty: Record<string, GeoJSONFeature[]> = {};
        activeGeojsonRef.current = empty;
        return empty;
      }
      // Only show demo data when no real project is active
      activeGeojsonRef.current = localDemoGeojson;
      return localDemoGeojson;
    }
    // When a real project is active, show ONLY imported layers — no demo data
    const onlyImported: Record<string, GeoJSONFeature[]> = {};
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      onlyImported[importedKey] = features;
    }
    activeGeojsonRef.current = onlyImported;
    return onlyImported;
  }, [hasImportedData, projectGeojsons, localDemoGeojson, storeActiveProject]);

  // ── Fetch Survey Features when the active project changes ────────────────
  // This loads all engineer survey edits from the backend so they can be
  // rendered as orange survey layers alongside the blue HLD layers.
  useEffect(() => {
    if (storeActiveProject && !storeActiveProject.id.startsWith('demo-') && !storeActiveProject.id.startsWith('imported-')) {
      fetchSurveyFeatures(storeActiveProject.id);
    } else {
      clearSurveyFeatures();
    }
  }, [storeActiveProject?.id, fetchSurveyFeatures, clearSurveyFeatures]);

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

  // ── Build feature list for list view: when a real project is active, show ONLY imported ──
  const mergedFeatureList = useMemo(() => {
    if (!hasImportedData) {
      return [...demoFeatures];
    }

    // Only imported features — no demo data
    const list: any[] = [];
    for (const [key, features] of Object.entries(projectGeojsons)) {
      const importedKey = `${IMPORT_ID_PREFIX}${key}`;
      const layerName = activeLayerNames[importedKey] ?? key.toUpperCase();
      features.forEach((feat, i) => {
        const props = feat.properties ?? {};
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
    // ── HLD layers (blue in overlay, normal otherwise) ──
    const hldLayers = displayMode === 'survey'
      ? [] // In survey-only mode, hide HLD layers
      : buildMapLayerData(activeGeojson, layerVisibility, activeLayerNames,
          hasImportedData ? importFeatureIdMap : demoFeatureIdMap, effectiveLayerColors);

    // ── Survey layers (orange) — only when survey features exist ──
    if (displayMode === 'hld') return hldLayers;

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

    // ── Temp Move Preview layer (orange) — shown during line move mode ──
    // Provides an orange preview of the line being edited, independent of
    // the blue HLD layer. Vertex markers render on this preview layer's
    // source so they follow tempLineCoords instead of original HLD coords.
    const previewLayers: any[] = [];
    if (lineMoveMode && tempLineCoords && selectedLineFeature) {
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

    return [...hldLayers, ...previewLayers, ...surveyLayers];
  }, [activeGeojson, layerVisibility, activeLayerNames, hasImportedData, demoFeatureIdMap, importFeatureIdMap, effectiveLayerColors, displayMode, surveyFeatures, lineMoveMode, tempLineCoords, selectedLineFeature]);

  // Build visible layers: when a real project is active, show ONLY imported layers
  const visibleLayers = useMemo(() => {
    if (!hasImportedData) {
      const demoBase = DEMO_LAYERS.map((l) => ({
        id: l.layer_id,
        name: l.layer_name,
        visible: layerVisibility[l.layer_id] !== false,
        featureCount: l.feature_count,
        geometryType: resolveGeometryType(l.layer_id) as any,
      }));
      return demoBase.filter((l) => layerVisibility[l.id] !== false);
    }

    // Only imported layers — no demo data
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
  }, [hasImportedData, projectGeojsons, activeLayerNames, layerVisibility]);

  // All layers for the panel: when a real project is active, show ONLY imported layers
  const allPanelLayers = useMemo(() => {
    if (!hasImportedData) {
      const demoBase = DEMO_LAYERS.map((l) => ({
        id: l.layer_id,
        name: l.layer_name,
        visible: layerVisibility[l.layer_id] !== false,
        featureCount: l.feature_count,
        geometryType: resolveGeometryType(l.layer_id) as any,
      }));
      allPanelLayersRef.current = demoBase;
      return demoBase;
    }

    // Only imported layers — no demo data
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
      const geomType = resolveGeometryType(layerId);

      // ── Detect survey features (orange markers) via 'survey-' prefix ─
      const isSurveyFeature = layerId.startsWith('survey-');

      // First try to find in demo features (rich metadata)
      const found = isSurveyFeature ? undefined : demoFeatures.find(
        (f) => f.feature.id === featureId
      );

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
        featureName = found
          ? String(
              found.feature.properties?.name ??
                found.feature.properties?.address ??
                found.feature.layer_name + ' #' + found.feature.id.slice(-3)
            )
          : (featureId.startsWith('demo-')
              ? (activeLayerNames[layerId] ?? layerId.toUpperCase()) + ' #' + featureId.slice(-3)
              : 'Feature #' + featureId.slice(0, 8));
        layerName = found?.feature.layer_name ?? (activeLayerNames[layerId] ?? layerId.toUpperCase());
      }
      const status = isSurveyFeature ? 'modified' : (found?.feature.status ?? 'assigned');

      // ── LINE features: show View popup first, then Edit toolbar on demand ──
      if (geomType === 'LineString') {
        // Highlight line on map
        setSelectedMapFeatureId(featureId);
        // Show popup with feature info + Edit button
        if (found) {
          selectFeature(found.feature.id, {
            id: found.feature.id,
            name: featureName,
            layerName,
            status,
            layerId: found.feature.layer_id,
          });
        } else {
          selectFeature(featureId, {
            id: featureId,
            name: featureName,
            layerName,
            status,
            layerId: popupLayerId,
          });
        }
        // Close popup screen coords are set above
        return;
      }

      // ── Non-line features: show the popup as before ──────────────────
      // Clear any previous line selection
      setSelectedLineFeature(null);

      if (found) {
        selectFeature(found.feature.id, {
          id: found.feature.id,
          name: featureName,
          layerName,
          status,
          layerId: found.feature.layer_id,
        });
        setSelectedMapFeatureId(found.feature.id);
        return;
      }

      // Fallback for imported/unknown features — build popup from GeoJSON
      selectFeature(featureId, {
        id: featureId,
        name: featureName,
        layerName,
        status,
        layerId: popupLayerId,
      });
      setSelectedMapFeatureId(featureId);
    },
    [demoFeatures, selectFeature, activeLayerNames]
  );

  // ── Layer isolation state ─────────────────────────────────────────────
  // null = show all visible layers, string = only this layer is visible
  const [isolatedLayerId, setIsolatedLayerId] = useState<string | null>(null);
  // Stores previous visibility state so we can restore on un-isolate
  const preIsolationVisibilityRef = useRef<Record<string, boolean> | null>(null);

  // ── Toggle layer visibility / isolate layer ────────────────────────────
  // Single tap on a layer chip in the legend isolates that layer (all others hidden).
  // Tapping the same layer again restores all layers to their previous visibility.
  const toggleLayerVisibility = useCallback((layerId: string) => {
    if (isolatedLayerId === layerId) {
      // ── Un-isolate: restore previous visibility state ──
      setIsolatedLayerId(null);
      if (preIsolationVisibilityRef.current) {
        setLayerVisibility(preIsolationVisibilityRef.current);
        preIsolationVisibilityRef.current = null;
      }
    } else if (isolatedLayerId === null) {
      // ── First tap: isolate this layer ──
      // Save current visibility state for later restore
      setLayerVisibility((prev) => {
        preIsolationVisibilityRef.current = { ...prev };
        const next: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) {
          next[key] = false;
        }
        next[layerId] = true;
        return next;
      });
      setIsolatedLayerId(layerId);
    } else {
      // ── Switch isolation to a different layer ──
      setLayerVisibility((prev) => {
        const next: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) {
          next[key] = false;
        }
        next[layerId] = true;
        return next;
      });
      setIsolatedLayerId(layerId);
    }
  }, [isolatedLayerId]);

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
    [setGeomBusy, setLocalDemoGeojson, pushUndo],
  );

  // ── Start editing a feature (viewing → GeometryEditor editing mode) ─
  // For Points and Polygons (non-LineString features).
  const handleStartEdit = useCallback((feature: EditingFeature) => {
    setEditingFeature(feature);
    // Close popup when entering editing mode
    selectFeature(null);
    setSelectedMapFeatureId(null);
    setPopupScreenCoords(null);
    // Exit add_point mode if active
    if (geoMode !== 'select') {
      setGeoMode('select');
    }
    setAddPointTargetLayer('');
    console.log(`[Edit] Editing feature "${feature.name}" (${feature.geometryType}) on layer "${feature.layerName}"`);
  }, [selectFeature, geoMode]);

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
      // Check if a SurveyFeature exists for this feature
      const existingSurvey = getSurveyFeatureForHld(featureId);

      if (existingSurvey) {
        // ── Has an HLD original → mark as 'removed' (HLD stays on map in blue) ──
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
            layerId,
            previousGeometry: existingSurvey.survey_geometry,
            previousAttributes: existingSurvey.survey_attributes,
            previousStatus: existingSurvey.survey_status,
            description: `Undo: restore survey feature ${featureId.slice(-8)}`,
          },
        });
        updateSurveyFeature(existingSurvey.id, layerId, {
          survey_status: 'removed',
        });
        console.log(`[Delete] Marked SurveyFeature ${existingSurvey.id.slice(-8)} as 'removed' — HLD untouched`);
      } else {
        // ── No HLD original (engineer-created point) → delete the SurveyFeature ──
        // Try to find it by ID directly (featureId might be the SurveyFeature ID itself)
        const allSurveyForLayer = surveyFeatures[layerId] ?? [];
        const sf = allSurveyForLayer.find((s) => s.id === featureId);
        if (sf) {
          deleteSurveyFeature(sf.id, layerId);
          console.log(`[Delete] Deleted engineer-created SurveyFeature ${sf.id.slice(-8)}`);
        } else {
          // Fallback: no survey feature found — this might be an HLD-only feature
          // (shouldn't happen in the new architecture, but handle gracefully)
          console.warn(`[Delete] No SurveyFeature found for ${featureId} in ${layerId} — HLD is read-only, nothing to delete`);
        }
      }
    },
    [getSurveyFeatureForHld, surveyFeatures, updateSurveyFeature, deleteSurveyFeature, pushUndo],
  );

  // ── Deselect the currently selected line feature ──────────────────────
  const handleLineDeselect = useCallback(() => {
    setSelectedLineFeature(null);
    setSelectedMapFeatureId(null);
    // Exit move mode + clear temp state
    setLineMoveMode(false);
    setTempLineCoords(null);
    setTempLineOriginal(null);
  }, []);

  // ── Toggle Move Mode for the selected line ────────────────────────────
  // On activate: extract the HLD line's coordinates into tempLineCoords (working copy)
  // On deactivate: discard temp changes (user must press Save to persist)
  const handleToggleMove = useCallback(() => {
    if (!selectedLineFeature) {
      console.warn('[MoveMode] GUARD 1: no selectedLineFeature');
      return;
    }

    if (lineMoveMode) {
      // ── Exit Move Mode — discard temp changes ──
      setLineMoveMode(false);
      setTempLineCoords(null);
      setTempLineOriginal(null);
      setLineToolMode(null);
      setDeleteSectionRange(null);
      console.log('[MoveMode] Exited — temp changes discarded');
    } else {
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
        const idMap = (hasImportedData ? importFeatureIdMap : demoFeatureIdMap)?.[layerId];
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

      if (!hldFeature?.geometry || hldFeature.geometry.type !== 'LineString') {
        console.warn(`[MoveMode] GUARD 3: hldFeature not found. fallback=${!!hldFeature}, geom=${hldFeature?.geometry?.type}, featureId=${featureId.slice(-12)}`);
        return;
      }

      const coords = hldFeature.geometry.coordinates as [number, number][];
      const coordsCopy = coords.map(([lng, lat]) => [lng, lat] as [number, number]);
      const originalCopy = coords.map(([lng, lat]) => [lng, lat] as [number, number]);

      setTempLineCoords(coordsCopy);
      setTempLineOriginal(originalCopy);
      setLineMoveMode(true);
      autoOverlayOnEdit();
      console.log(`[MoveMode] Activated for ${featureId.slice(-8)} — ${coordsCopy.length} vertices`);
    }
  }, [selectedLineFeature, lineMoveMode, autoOverlayOnEdit, hasImportedData, importFeatureIdMap, demoFeatureIdMap]);

  // ── Save the temporary line geometry to the survey-features store ──────
  // Creates or updates a SurveyFeature with the modified geometry.
  // HLD geometry is never touched.
  const handleSaveLine = useCallback(() => {
    if (!selectedLineFeature || !tempLineCoords || !tempLineOriginal) return;

    const { id: featureId, layerId, layerName } = selectedLineFeature;
    const surveyGeometry = { type: 'LineString', coordinates: tempLineCoords };

    // Check if a SurveyFeature already exists for this HLD feature
    const existingSurvey = getSurveyFeatureForHld(featureId);
    const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(featureId, layerId);

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
      updateSurveyFeature(existingSurvey.id, layerId, {
        survey_geometry: surveyGeometry,
        survey_status: 'modified',
      });
    } else {
      // Create new survey feature
      upsertSurveyFeature(
        featureId, layerId, layerName,
        surveyGeometry,
        origAttrs ?? {},
        origGeom, origAttrs,
        `Moved line vertices (original: ${tempLineOriginal.length} vertices, new: ${tempLineCoords.length} vertices)`,
      ).then((sf) => {
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
        }
      });
    }

    // Clear temp state + exit move mode
    setTempLineCoords(null);
    setTempLineOriginal(null);
    setLineMoveMode(false);
    console.log(`[MoveMode] Saved line geometry for ${featureId.slice(-8)} — SurveyFeature ${existingSurvey ? 'updated' : 'created'}`);
  }, [selectedLineFeature, tempLineCoords, tempLineOriginal, getSurveyFeatureForHld, findHldFeatureOriginal, pushUndo, updateSurveyFeature, upsertSurveyFeature]);

  // ── Delete Section handlers ────────────────────────────────────────────

  const handleDeleteSectionToggle = useCallback(() => {
    if (!selectedLineFeature) return;
    if (lineToolMode === 'delete-section') {
      setLineMoveMode(false);
      setLineToolMode(null);
      setDeleteSectionRange(null);
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
      const idMap = (hasImportedData ? importFeatureIdMap : demoFeatureIdMap)?.[layerId];
      if (idMap) { const idx = idMap.indexOf(featureId); if (idx >= 0 && idx < features.length) hldFeature = features[idx]; }
    }
    if (!hldFeature?.geometry || hldFeature.geometry.type !== 'LineString') return;
    const coords = (hldFeature.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lng, lat] as [number, number]);
    setTempLineCoords(coords);
    setTempLineOriginal(coords.map(([lng, lat]) => [lng, lat] as [number, number]));
    setLineMoveMode(true);
    setLineToolMode('delete-section');
    setDeleteSectionRange(null);
    autoOverlayOnEdit();
  }, [selectedLineFeature, lineToolMode, hasImportedData, importFeatureIdMap, demoFeatureIdMap, autoOverlayOnEdit]);

  const handleDeleteSectionConfirm = useCallback(() => {
    if (!deleteSectionRange || !tempLineCoords || !tempLineOriginal || !selectedLineFeature) return;
    const [a, b] = deleteSectionRange; if (a === b) return;
    const start = Math.min(a, b), end = Math.max(a, b);
    // ── Split into disconnected segments at the deletion boundary ──
    // Keep B and D as endpoints of the remaining segments — only delete vertices BETWEEN them
    const before = tempLineCoords.slice(0, start + 1);
    const after = tempLineCoords.slice(end);
    const segments: [number, number][][] = [];
    if (before.length >= 2) segments.push(before);
    else if (before.length === 1) console.warn('[DeleteSection] Dropped 1-vertex before-segment — not enough points for LineString');
    if (after.length >= 2) segments.push(after);
    else if (after.length === 1) console.warn('[DeleteSection] Dropped 1-vertex after-segment — not enough points for LineString');
    if (segments.length === 0) {
      console.warn('[DeleteSection] No valid segments remain after deletion — aborting');
      setLineMoveMode(false); setLineToolMode(null); setDeleteSectionRange(null); setTempLineCoords(null); setTempLineOriginal(null); return;
    }

    const { id: featureId, layerId, layerName } = selectedLineFeature;
    const { geometry: origGeom, attributes: origAttrs } = findHldFeatureOriginal(featureId, layerId);
    const reason = end > start + 1
      ? `Removed section (vertices ${start + 2}–${end})`
      : `Split at vertices ${start + 1}–${end + 1}`;

    // ── First segment: update existing Survey Feature (or create new, tied to HLD) ──
    const existingSurvey = getSurveyFeatureForHld(featureId);
    const firstGeom = { type: 'LineString', coordinates: segments[0] } as Record<string, unknown>;
    if (existingSurvey) {
      pushUndo({ featureId, layerId, oldLng: 0, oldLat: 0, newLng: 0, newLat: 0, timestamp: Date.now(), surveyUndo: { surveyFeatureId: existingSurvey.id, layerId, previousGeometry: existingSurvey.survey_geometry, previousAttributes: existingSurvey.survey_attributes, previousStatus: existingSurvey.survey_status, description: `Undo section deletion for ${featureId.slice(-8)}` } });
      updateSurveyFeature(existingSurvey.id, layerId, { survey_geometry: firstGeom, survey_status: 'modified', change_reason: reason });
    } else {
      upsertSurveyFeature(featureId, layerId, layerName, firstGeom, origAttrs ?? {}, origGeom, origAttrs, reason).then((sf) => { if (sf) { pushUndo({ featureId, layerId, oldLng: 0, oldLat: 0, newLng: 0, newLat: 0, timestamp: Date.now(), surveyUndo: { surveyFeatureId: sf.id, layerId, previousGeometry: { type: 'LineString', coordinates: tempLineOriginal } as Record<string, unknown>, previousAttributes: origAttrs as Record<string, unknown> ?? {}, previousStatus: 'new', description: `Undo: remove survey feature for ${featureId.slice(-8)}` } }); } });
    }

    // ── Additional segments: create independent Survey Features locally ──
    // Bypass the backend API — synthetic hldFeatureId causes 500 errors.
    for (let i = 1; i < segments.length; i++) {
      const segGeom = { type: 'LineString', coordinates: segments[i] } as Record<string, unknown>;
      const segHldId = `${featureId}-seg-${i + 1}-${Date.now()}`;
      const mockSf: SurveyFeatureData = {
        id: `local-sf-${Date.now()}-${i}`,
        original_hld_feature: segHldId,
        hld_feature_id: segHldId,
        project: activeProject?.id ?? 'demo',
        project_name: activeProject?.name ?? 'Demo',
        engineer: 'demo-user',
        engineer_name: 'Demo Engineer',
        layer_id: layerId,
        layer_name: layerName,
        original_geometry: origGeom,
        original_attributes: origAttrs ?? null,
        survey_geometry: segGeom,
        survey_attributes: origAttrs ?? {},
        survey_status: 'new' as const,
        version_number: 1,
        sync_status: 'pending' as const,
        change_reason: `${reason} (segment ${i + 1})`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const store = useSurveyFeaturesStore.getState();
      useSurveyFeaturesStore.setState({
        surveyFeatures: {
          ...store.surveyFeatures,
          [layerId]: [...(store.surveyFeatures[layerId] ?? []), mockSf],
        },
      });
      console.log(`[DeleteSection] Created local segment ${i + 1} (${segHldId.slice(-12)}) for ${featureId.slice(-8)}`);

      // ── Push undo entry so this locally-created segment can be undone ──
      pushUndo({
        featureId,
        layerId,
        oldLng: 0, oldLat: 0, newLng: 0, newLat: 0,
        timestamp: Date.now(),
        surveyUndo: {
          surveyFeatureId: mockSf.id,
          layerId,
          previousGeometry: segGeom,
          previousAttributes: origAttrs as Record<string, unknown> ?? {},
          previousStatus: 'removed',
          description: `Undo: remove segment ${i + 1} for ${featureId.slice(-8)}`,
        },
      });
    }
    setLineMoveMode(false); setLineToolMode(null); setDeleteSectionRange(null); setTempLineCoords(null); setTempLineOriginal(null);
  }, [deleteSectionRange, tempLineCoords, tempLineOriginal, selectedLineFeature, getSurveyFeatureForHld, findHldFeatureOriginal, pushUndo, updateSurveyFeature, upsertSurveyFeature, activeProject]);

  // ── Check if temp line has unsaved changes ──
  const hasUnsavedLineChanges = useMemo(() => {
    if (!tempLineCoords || !tempLineOriginal) return false;
    if (tempLineCoords.length !== tempLineOriginal.length) return true;
    for (let i = 0; i < tempLineCoords.length; i++) {
      if (tempLineCoords[i][0] !== tempLineOriginal[i][0] || tempLineCoords[i][1] !== tempLineOriginal[i][1]) {
        return true;
      }
    }
    return false;
  }, [tempLineCoords, tempLineOriginal]);

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

  // ── Handle empty map area click (for add point / deselect) ───────────
  // When adding a point, we create a SurveyFeature (not an HLD feature).
  // original_hld_feature = null indicates this is an engineer-created point.
  const handleEmptyMapClick = useCallback(
    (lng: number, lat: number) => {
      // Clear line selection when tapping empty area
      setSelectedLineFeature(null);
      if (geoMode === 'add_point') {
        if (!addPointTargetLayer) {
          console.warn('[AddPoint] No target layer selected — tap a layer chip first');
          return;
        }

        // ── Build the new survey geometry (Point at clicked location) ──
        const surveyGeometry = { type: 'Point', coordinates: [lng, lat] };
        const layerName = activeLayerNames[addPointTargetLayer] ?? addPointTargetLayer.toUpperCase();

        // ── Create a SurveyFeature with original_hld_feature = null ──
        // (engineer-created points don't reference any HLD feature)
        upsertSurveyFeature(
          `new-point-${Date.now()}`,   // hldFeatureId — synthetic ID for new points
          addPointTargetLayer,         // layerId
          layerName,                   // layerName
          surveyGeometry,              // surveyGeometry
          {},                          // surveyAttributes (empty — engineer fills via SurveyForm)
          null,                        // originalGeometry (no HLD original)
          null,                        // originalAttributes (no HLD original)
          `Engineer-added new point at [${lng.toFixed(6)}, ${lat.toFixed(6)}]`,
        ).then((sf) => {
          if (sf) {
            console.log(`[AddPoint] SurveyFeature created: ${sf.id} at [${lng.toFixed(6)}, ${lat.toFixed(6)}]`);
            // Show editable fields form for the new point
            setSurveyForm({
              layerId: addPointTargetLayer,
              featureId: sf.id,         // Use the SurveyFeature ID, not a synthetic HLD ID
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
    [geoMode, addPointTargetLayer, activeLayerNames, upsertSurveyFeature, autoOverlayOnEdit],
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

  // ── Save SurveyForm data — update the SurveyFeature's attributes via the store ──
  // The HLD GeoJSON is never touched. The SurveyFeature gets the engineer's edits.
  const handleSurveyFormSave = useCallback(
    (featureId: string, layerId: string, properties: Record<string, unknown>) => {
      // featureId here is the SurveyFeature ID (set in handleEmptyMapClick)
      // Update the SurveyFeature's survey_attributes via the store
      updateSurveyFeature(featureId, layerId, {
        survey_attributes: properties,
        survey_status: 'modified',
      });

      // Close the form
      setSurveyForm(null);
      console.log(`[SurveyForm] Saved attributes to SurveyFeature ${featureId.slice(-8)}`);
    },
    [updateSurveyFeature],
  );

  // ── Dismiss new point form — delete the SurveyFeature (engineer-created, no HLD) ──
  const handleSurveyFormDismiss = useCallback(() => {
    if (!surveyForm) return;
    const { featureId, layerId } = surveyForm;

    // Delete the SurveyFeature (featureId is the SurveyFeature ID for new points)
    deleteSurveyFeature(featureId, layerId);
    setSurveyForm(null);
    console.log('[SurveyForm] Dismissed — SurveyFeature removed');
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
    } else {
      handleStartEdit(feature);
    }
  }, [selectedFeaturePopup, handleLineEditFromPopup, handleStartEdit]);

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

          {/* Loading overlay when a real project is active but data is being fetched */}
          {storeActiveProject && !storeActiveProject.id.startsWith('demo-') && !storeActiveProject.id.startsWith('imported-') && !hasImportedData && (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.background + 'CC' }]}>
              <View style={[styles.loadingBox, { backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>📡</Text>
                <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                  Loading Project Data
                </Text>
                {layerFetchProgress ? (
                  <>
                    <Text style={[styles.loadingDesc, { color: colors.textSecondary }]}>
                      Fetched {layerFetchProgress.fetched}/{layerFetchProgress.total} layers for {storeActiveProject?.name ?? 'project'}...
                    </Text>
                    {/* Progress bar */}
                    <View style={[styles.progressBarBg, { backgroundColor: colors.outlineLight }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            backgroundColor: colors.primary,
                            width: `${Math.round((layerFetchProgress.fetched / layerFetchProgress.total) * 100)}%` as any,
                          },
                        ]}
                      />
                    </View>
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
                  </>
                ) : (
                  <>
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
            layers={mapLayerData}
            onFeatureClick={(featureId, layerId, lngLat, screenPt) => {
              if (geoMode === 'delete_feature') {
                handleDeleteFeature(featureId, layerId);
                return;
              }
              // ── Delete Section: intercept clicks for vertex selection ──
              if (lineToolMode === 'delete-section' && selectedLineFeature && tempLineCoords) {
                const expectedPreview = `temp-preview-${selectedLineFeature.layerId}`;
                if (layerId === expectedPreview ||
                    (featureId === selectedLineFeature.id && layerId === selectedLineFeature.layerId)) {
                  let bestIdx = 0; let bestDist = Infinity;
                  tempLineCoords.forEach(([vlng, vlat], i) => {
                    const d = (lngLat[0] - vlng) ** 2 + (lngLat[1] - vlat) ** 2;
                    if (d < bestDist) { bestDist = d; bestIdx = i; }
                  });
                  if (bestDist <= 0.00045 ** 2) {
                    setDeleteSectionRange((prev) => {
                      if (!prev) return [bestIdx, bestIdx];
                      return [prev[0], bestIdx];
                    });
                  }
                  return;
                }
              }
              handleMapFeatureClick(featureId, layerId, lngLat, screenPt);
            }}
            onEmptyAreaClick={handleEmptyMapClick}
            onFeatureDragEnd={handleFeatureDragEnd}
            onVertexDragEnd={lineMoveMode && tempLineCoords ? handleVertexDragEnd : undefined}
            vertexDragTarget={memoizedVertexTarget}
            draggableLayerIds={draggableLayerIds}
            dragMode={dragMode}
            selectedFeatureId={selectedMapFeatureId ?? undefined}
            height="100%"
            mapStyle={currentBasemapStyle}
            flyToCenter={flyToCenter}
          />

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

          {/* Line Selection Toolbar — appears when a line feature is tapped */}
          {viewMode === 'map' && selectedLineFeature && !editingFeature && (
            <LineSelectionToolbar
              selectedFeature={selectedLineFeature}
              onDeselect={handleLineDeselect}
              undoCount={undoCount}
              onUndo={handleUndo}
              moveMode={lineMoveMode}
              onToggleMove={handleToggleMove}
              onSave={handleSaveLine}
              hasUnsavedChanges={hasUnsavedLineChanges}
              onDeleteSection={handleDeleteSectionToggle}
              deleteSectionMode={lineToolMode === 'delete-section'}
              deleteSectionStep={deleteSectionRange ? (deleteSectionRange[0] === deleteSectionRange[1] ? 1 : 2) : 0}
              onDeleteConfirm={deleteSectionRange && deleteSectionRange[0] !== deleteSectionRange[1] ? handleDeleteSectionConfirm : undefined}
            />
          )}

          {/* Pin-Anchored Feature Popup - hidden during editing mode or line selection */}
          {selectedFeaturePopup && !editingFeature && !selectedLineFeature && (
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
              featureGeometryType={(resolveGeometryType(selectedFeaturePopup.layerId ?? '') as 'Point' | 'LineString' | 'Polygon')}
              onStartEdit={
                (displayMode === 'hld' || displayMode === 'overlay' || selectedFeaturePopup?.layerId?.startsWith('survey-')) ? handlePopupEdit : undefined
              }
              notesDraft={notesDraft}
              onNotesChange={setNotesDraft}
              onSaveNotes={handleSaveNotes}
              hasUnsavedNotes={notesDraft !== (featureNotes[selectedFeaturePopup.id] ?? '')}
            />
          )}

          {/* New Point Form — editable fields after adding a point */}
          {surveyForm && (
            <SurveyForm
              formData={surveyForm}
              onDismiss={handleSurveyFormDismiss}
              onSave={handleSurveyFormSave}
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
          {/* Undo button — always visible, shows badge count when > 0 */}
          <TouchableOpacity
            style={[
              styles.fab,
              {
                backgroundColor: colors.surface,
                opacity: undoCount > 0 ? 1 : 0.4,
              },
            ]}
            onPress={handleUndo}
            disabled={undoCount === 0}
            activeOpacity={0.7}
          >
            <Undo2 size={20} stroke={undoCount > 0 ? colors.textSecondary : colors.textTertiary} />
            {undoCount > 0 && (
              <View style={[styles.undoBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.undoBadgeText}>
                  {undoCount > 99 ? '99+' : undoCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Add Point FAB — prominent, toggles add_point mode */}
          <TouchableOpacity
            style={[styles.fab, {
              backgroundColor: geoMode === 'add_point' ? '#EC4899' : colors.surface,
              transform: [{ scale: geoMode === 'add_point' ? 1.1 : 1 }],
            }]}
            onPress={() => {
              if (geoMode === 'add_point') {
                setGeoMode('select');
                setAddPointTargetLayer('');
              } else {
                setGeoMode('add_point');
                // Auto-select first point layer
                if (addPointLayers.length > 0 && !addPointTargetLayer) {
                  setAddPointTargetLayer(addPointLayers[0].id);
                }
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 20, color: geoMode === 'add_point' ? '#FFFFFF' : undefined }}>📍</Text>
          </TouchableOpacity>
          {/* Survey Changes Panel Toggle — hidden when panel is open to avoid overlapping the close button */}
          {!surveyPanelVisible && (
          <TouchableOpacity
            style={[
              styles.fab,
              {
                backgroundColor: surveyPanelVisible ? '#FF8C00' : colors.surface,
                opacity: Object.keys(surveyFeatures).length > 0 ? 1 : 0.4,
              },
            ]}
            onPress={() => setSurveyPanelVisible(!surveyPanelVisible)}
            disabled={Object.keys(surveyFeatures).length === 0}
            activeOpacity={0.8}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '700' as any,
              color: surveyPanelVisible ? '#FFFFFF' : colors.textSecondary,
            }}>
              🟠
            </Text>
            {Object.keys(surveyFeatures).length > 0 && (
              <View style={[styles.undoBadge, { backgroundColor: '#FF8C00' }]}>
                <Text style={styles.undoBadgeText}>
                  {(() => {
                    let total = 0;
                    for (const list of Object.values(surveyFeatures)) total += list.length;
                    return total > 99 ? '99+' : total;
                  })()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          )}
          {/* HLD/Survey Display Mode Toggle — cycles hld → survey → overlay */}
          <TouchableOpacity
            style={[styles.fab, {
              backgroundColor: displayMode === 'survey' ? SURVEY_COLOR : displayMode === 'overlay' ? '#2563EB' : colors.surface,
            }]}
            onPress={() => {
              const next: LayerDisplayMode = displayMode === 'hld' ? 'survey' : displayMode === 'survey' ? 'overlay' : 'hld';
              setDisplayMode(next);
            }}
            activeOpacity={0.8}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '700' as any,
              color: displayMode === 'hld' ? colors.textSecondary : '#FFFFFF',
            }}>
              {displayMode === 'hld' ? '🔵' : displayMode === 'survey' ? '🟠' : '🔀'}
            </Text>
          </TouchableOpacity>
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

      {/* Survey Changes Panel — shows all engineer edits with status badges */}
      {viewMode === 'map' && (
        <SurveyChangesPanel
          visible={surveyPanelVisible}
          surveyFeatures={surveyFeatures}
          layerNames={activeLayerNames}
          onClose={() => setSurveyPanelVisible(false)}
          onFeaturePress={(featureId) => {
            // Highlight the feature on the map
            setSelectedMapFeatureId(featureId);
            setSurveyPanelVisible(false);
          }}
        />
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
