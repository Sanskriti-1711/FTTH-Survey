// ── Cross-Platform MapLibre Map Component ───────────────────────────────
// Uses @maplibre/maplibre-react-native on mobile (iOS/Android)
// Falls back to CDN-loaded maplibre-gl on web
//
// Features:
//   ✓ Animated loading overlay with progress dots
//   ✓ 30-second timeout detection
//   ✓ Error states: network failure, style load fail, timeout
//   ✓ Retry button on error
//   ✓ Empty state when all layers are hidden
//   ✓ Feature click handling with bottom sheet
//   ✓ Fly-to selected feature animation

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Platform,
  StyleSheet,
  Text,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  Easing,
  PanResponder,
} from 'react-native';
import type { GeoJSONFeature } from '../utils/types';
import Constants from 'expo-constants';

// ── Types ────────────────────────────────────────────────────────────────

export interface MapLayerData {
  id: string;
  name: string;
  features: (GeoJSONFeature & { properties: Record<string, unknown> & { id?: string } })[];
  visible: boolean;
  color: string;
  geometryType?: 'Point' | 'LineString' | 'Polygon';
}

export interface BasemapStyle {
  id: string;
  name: string;
  style: string | Record<string, unknown>;
  icon: string;
}

type MapStatus = 'loading' | 'ready' | 'error' | 'timeout' | 'empty';

interface MapErrorInfo {
  type: 'network' | 'style' | 'module' | 'unknown' | 'timeout';
  message: string;
}

interface MapLibreMapProps {
  layers: MapLayerData[];
  onFeatureClick?: (featureId: string, layerId: string, lngLat: [number, number], screenPoint?: { x: number; y: number }) => void;
  /** Called when clicking on empty map area (no feature found). Used for draw bypass mode. */
  onEmptyAreaClick?: (lng: number, lat: number, screenPoint?: { x: number; y: number }) => void;
  /** Called when a point feature is dragged to a new location. Only fires when dragMode is true. */
  onFeatureDragEnd?: (featureId: string, layerId: string, newLng: number, newLat: number) => void;
  /** Called when a vertex of a LineString or polygon corner is dragged to a new location. */
  onVertexDragEnd?: (featureId: string, layerId: string, vertexIdx: number, newLng: number, newLat: number) => void;
  /** When set, renders draggable vertex markers for the target feature's LineString vertices. */
  vertexDragTarget?: { featureId: string; layerId: string; vertexIdx: number } | null;
  /** When set, renders a highlighted polygon and draggable corner markers for the target polygon feature. */
  polygonEditTarget?: { featureId: string; layerId: string } | null;
  /** Called when a polygon corner handle is dragged to a new location. */
  onPolygonVertexDragEnd?: (featureId: string, layerId: string, vertexIdx: number, newLng: number, newLat: number) => void;
  /** Set of layer IDs whose point features can be dragged */
  draggableLayerIds?: Set<string>;
  /** Whether point dragging is enabled */
  dragMode?: boolean;
  selectedFeatureId?: string | null;
  height?: number | string;
  mapStyle?: string | Record<string, unknown>;
  /** Timeout in ms before showing timeout error (default 30s) */
  loadingTimeoutMs?: number;
  /** When this value changes, the map flies to the given center at given zoom */
  flyToCenter?: { lng: number; lat: number; zoom: number } | null;
}

// ── Basemap Presets ──────────────────────────────────────────────────────

export const BASEMAPS: Record<string, BasemapStyle> = {
  streets: {
    id: 'streets',
    name: 'Streets',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    icon: '🗺️',
  },
  satellite: {
    id: 'satellite',
    name: 'Satellite',
    style: {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '© Esri',
        },
      },
      layers: [
        { id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 20 },
      ],
    },
    icon: '🛰️',
  },
  light: {
    id: 'light',
    name: 'Light',
    style: 'https://demotiles.maplibre.org/style.json',
    icon: '☀️',
  },
};

const OAKWOOD_CENTER: [number, number] = [-0.1100, 51.5900];
const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const LOADING_TIMEOUT_MS = 30000;

// ── Platform Detection ───────────────────────────────────────────────────
// IMPORTANT: The guard below prevents Metro/Webpack from bundling the
// native @maplibre/maplibre-react-native module for web, which would
// cause 'Cannot access X before initialization' TDZ errors in the
// combined bundle. On native (iOS/Android) we require it normally.

let NativeMapLibre: any = null;
const IS_NATIVE_PLATFORM = Platform.OS === 'ios' || Platform.OS === 'android';
if (IS_NATIVE_PLATFORM) {
  try {
    NativeMapLibre = require('@maplibre/maplibre-react-native');
  } catch {
    NativeMapLibre = null;
  }
}

const IS_NATIVE = IS_NATIVE_PLATFORM && NativeMapLibre !== null;

// ── Expo Go detection ────────────────────────────────────────────────────
// @maplibre/maplibre-react-native ships a native TurboModule
// (MLRNMapViewModule) that is NOT bundled inside Expo Go. When the module
// fails to load on a native platform, show the user actionable guidance
// instead of a generic error.
const IS_EXPO_GO = IS_NATIVE_PLATFORM
  ? (Constants as any).executionEnvironment === 'storeClient'
  : false;

// ── Shared UI Components ─────────────────────────────────────────────────

function LoadingOverlay({ message = 'Loading map...', progress }: { message?: string; progress?: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  // Dot animation for the 3-dot indicator
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      );
    const a1 = createDotAnim(dot1, 0);
    const a2 = createDotAnim(dot2, 200);
    const a3 = createDotAnim(dot3, 400);
    Animated.parallel([a1, a2, a3]).start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotOpacity = (dot: Animated.Value) =>
    dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <View style={styles.overlay}>
      <View style={styles.loadingCard}>
        <Animated.View style={{ opacity: pulseAnim }}>
          <View style={styles.mapIconContainer}>
            <Text style={styles.mapIconLarge}>🗺️</Text>
          </View>
        </Animated.View>

        <View style={styles.loadingDots}>
          <Animated.View style={[styles.dot, { opacity: dotOpacity(dot1), backgroundColor: '#0D5CFF' }]} />
          <Animated.View style={[styles.dot, { opacity: dotOpacity(dot2), backgroundColor: '#0D5CFF' }]} />
          <Animated.View style={[styles.dot, { opacity: dotOpacity(dot3), backgroundColor: '#0D5CFF' }]} />
        </View>

        <Text style={styles.loadingTitle}>{message}</Text>

        {progress !== undefined && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 95)}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
          </View>
        )}

        <Text style={styles.loadingHint}>Initializing basemap & features</Text>
      </View>
    </View>
  );
}

function ErrorOverlay({
  error,
  onRetry,
}: {
  error: MapErrorInfo;
  onRetry?: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  const errorConfig = useMemo(() => {
    switch (error.type) {
      case 'network':
        return {
          icon: '📡',
          title: 'Network Error',
          description: 'Could not connect to the map tile server. Check your internet connection and try again.',
        };
      case 'style':
        return {
          icon: '🎨',
          title: 'Style Load Failed',
          description: 'The map style could not be loaded. The style server may be temporarily unavailable.',
        };
      case 'module':
        return {
          icon: '📦',
          title: 'Map Library Error',
          description: error.message || 'The map rendering library could not be initialized.',
        };
      case 'timeout':
        return {
          icon: '⏱️',
          title: 'Loading Timeout',
          description: 'The map took too long to load. This may be due to a slow connection or server issue.',
        };
      default:
        return {
          icon: '⚠️',
          title: 'Map Error',
          description: error.message || 'An unexpected error occurred while loading the map.',
        };
    }
  }, [error]);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.errorCard}>
        <View style={styles.errorIconCircle}>
          <Text style={styles.errorIconLarge}>{errorConfig.icon}</Text>
        </View>

        <Text style={styles.errorTitle}>{errorConfig.title}</Text>
        <Text style={styles.errorDescription}>{errorConfig.description}</Text>

        {error.type === 'timeout' && (
          <View style={styles.tipContainer}>
            <Text style={styles.tipText}>💡 Tip: Try switching to a different basemap style</Text>
          </View>
        )}

        {onRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
            <Text style={styles.retryButtonText}>↻  Retry Loading</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

function EmptyOverlay() {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIconContainer}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <View style={styles.emptyIconBadge}>
            <Text style={styles.emptyBadgeText}>0</Text>
          </View>
        </View>
        <Text style={styles.emptyTitle}>No Layers Visible</Text>
        <Text style={styles.emptyDescription}>
          All layers are currently hidden or contain no features.{'\n'}
          Toggle layers on using the layers panel.
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Geometry Auto-Detect ─────────────────────────────────────────────────

function detectGeometryType(
  features: MapLayerData['features']
): 'Point' | 'LineString' | 'Polygon' {
  for (const f of features) {
    if (f.geometry?.type === 'LineString') return 'LineString';
    if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') return 'Polygon';
  }
  return 'Point';
}

function hasVisibleFeatures(layers: MapLayerData[]): boolean {
  return layers.some((l) => l.visible && l.features.length > 0);
}

// ── Mobile (Native) Implementation ────────────────────────────────────────

function NativeMapView({
  layers,
  onFeatureClick,
  onFeatureDragEnd,
  draggableLayerIds,
  dragMode,
  selectedFeatureId,
  height,
  mapStyle: mapStyleProp,
  loadingTimeoutMs = LOADING_TIMEOUT_MS,
  flyToCenter,
}: MapLibreMapProps) {
  const cameraRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [errorInfo, setErrorInfo] = useState<MapErrorInfo>({ type: 'unknown', message: '' });
  const [loadProgress, setLoadProgress] = useState<number | undefined>(undefined);
  const [mapKey, setMapKey] = useState(0);
  const retryCountRef = useRef(0);

  // ── Point Drag State ─────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [dragCoords, setDragCoords] = useState<[number, number] | null>(null);
  const [dragDistance, setDragDistance] = useState<number | null>(null);
  const [layerShapes, setLayerShapes] = useState<Record<string, any>>({});
  const dragRef = useRef<{
    featureId: string;
    layerId: string;
    featureIndex: number;
    startLng: number;
    startLat: number;
    startScreenX: number;
    startScreenY: number;
    currentZoom: number;
    baselineCaptured: boolean;
  } | null>(null);
  const zoomRef = useRef(15);
  const onDragEndRef = useRef(onFeatureDragEnd);
  onDragEndRef.current = onFeatureDragEnd;

  // ── Haversine distance (metres) ────────────────────────────────────────
  const haversineDistance = useCallback((lng1: number, lat1: number, lng2: number, lat2: number): number => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLng = toRad(lng2 - lng1);
    const dLat = toRad(lat2 - lat1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  const MapLibreGL = NativeMapLibre;

  // ── Loading timeout ─────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'ready' || status === 'error') return;
    const timer = setTimeout(() => {
      if (status === 'loading') {
        setErrorInfo({ type: 'timeout', message: 'Map did not load within the expected time.' });
        setStatus('timeout');
      }
    }, loadingTimeoutMs);
    return () => clearTimeout(timer);
  }, [status, loadingTimeoutMs]);

  // ── Module init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!MapLibreGL) {
      setErrorInfo({ type: 'module', message: '@maplibre/maplibre-react-native is not available.' });
      setStatus('error');
    }
  }, []);

  // ── Sync layers → layerShapes (skip during active drag to avoid flicker) ─
  useEffect(() => {
    if (isDragging) return;
    const shapes: Record<string, any> = {};
    for (const layerData of layers) {
      if (!layerData.visible || layerData.features.length === 0) continue;
      const features = layerData.features.map((f, i) => ({
        ...f,
        properties: {
          ...(f.properties ?? {}),
          _id: f.properties?.id ?? `${layerData.id}-${i}`,
          _layer_id: layerData.id,
        },
      }));
      shapes[layerData.id] = { type: 'FeatureCollection' as const, features };
    }
    setLayerShapes(shapes);
  }, [layers, isDragging]);

  // ── Screen-to-LngLat conversion (linear approximation — synchronous) ────
  const screenToLngLat = useCallback((screenX: number, screenY: number): [number, number] => {
    const ds = dragRef.current;
    if (!ds || !ds.baselineCaptured) {
      return [ds?.startLng ?? 0, ds?.startLat ?? 0];
    }
    const dx = screenX - ds.startScreenX;
    const dy = screenY - ds.startScreenY;
    const scale = 256 * Math.pow(2, ds.currentZoom);
    const cosLat = Math.cos((ds.startLat * Math.PI) / 180);
    const lngPerPixel = 360 / (scale * cosLat);
    const latPerPixel = 180 / scale;
    return [ds.startLng + dx * lngPerPixel, ds.startLat - dy * latPerPixel];
  }, []);

  // ── PanResponder for drag overlay (active only during drag) ─────────────
  const dragCoordsRef = useRef<[number, number] | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const ds = dragRef.current;
        if (!ds) return;

        // On very first move, capture the initial screen position as baseline
        if (!ds.baselineCaptured) {
          ds.startScreenX = evt.nativeEvent.pageX;
          ds.startScreenY = evt.nativeEvent.pageY;
          ds.baselineCaptured = true;
          return; // skip first frame — establish baseline only
        }

        const coords = screenToLngLat(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        dragCoordsRef.current = coords;
        setDragCoords(coords);

        // Update the point in the GeoJSONSource data so it moves on the map
        setLayerShapes((prev) => {
          const current = prev[ds.layerId];
          if (!current?.features) return prev;
          const features = [...current.features];
          if (features[ds.featureIndex]?.geometry?.type === 'Point') {
            features[ds.featureIndex] = {
              ...features[ds.featureIndex],
              geometry: { ...features[ds.featureIndex].geometry, coordinates: coords },
            };
          }
          return { ...prev, [ds.layerId]: { ...current, features } };
        });

        // Update drag distance during move (ds already declared above)
        if (ds) {
          const dist = haversineDistance(ds.startLng, ds.startLat, coords[0], coords[1]);
          setDragDistance(Math.round(dist));
        }
      },
      onPanResponderRelease: () => {
        const ds = dragRef.current;
        const coords = dragCoordsRef.current;
        if (ds && onDragEndRef.current && coords) {
          const pixelDx = Math.abs(coords[0] - ds.startLng);
          const pixelDy = Math.abs(coords[1] - ds.startLat);
          // Only fire if moved more than a tiny threshold (~5m at equator ≈ 0.000045°)
          if (pixelDx > 0.00005 || pixelDy > 0.00005) {
            onDragEndRef.current(ds.featureId, ds.layerId, coords[0], coords[1]);
          }
        }
        setIsDragging(false);
        setDragCoords(null);
        setDragDistance(null);
        dragCoordsRef.current = null;
        dragRef.current = null;
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        setDragCoords(null);
        setDragDistance(null);
        dragCoordsRef.current = null;
        dragRef.current = null;
      },
    })
  ).current;

  const styleUrl = useMemo(() => {
    if (!mapStyleProp) return DEFAULT_MAP_STYLE;
    // v11's Map.mapStyle accepts both a style URL string and an inline
    // StyleSpecification object (e.g. the satellite raster style). Passing
    // the object through lets satellite imagery work on Android instead of
    // silently falling back to the default streets style.
    return mapStyleProp as string | Record<string, unknown>;
  }, [mapStyleProp]);

  // ── Feature click handler ──────────────────────────────────────────────
  const handlePress = useCallback(
    (e: any) => {
      // In drag mode, don't fire click events — drag overlay handles interaction
      if (dragMode) return;
      // v11 wraps press payloads in NativeSyntheticEvent — support both shapes
      const features = e?.nativeEvent?.features ?? e?.features;
      if (!onFeatureClick || !features) return;
      const feature = features[0];
      if (!feature) return;
      const props = feature.properties || {};
      const fid = props.id || props._id;
      const lid = props._layer_id;
      const geometry = feature.geometry;
      if (fid && lid && geometry) {
        const coords = geometry.coordinates;
        const lngLat: [number, number] =
          geometry.type === 'Point'
            ? [coords[0], coords[1]]
            : [coords[0]?.[0] ?? 0, coords[0]?.[1] ?? 0];
        onFeatureClick(fid, lid, lngLat, undefined);
      }
    },
    [onFeatureClick, dragMode]
  );

  // ── Long-press handler — initiates point drag ───────────────────────────
  const handleLongPress = useCallback(
    (e: any) => {
      if (!dragMode || !onDragEndRef.current || !draggableLayerIds) return;

      // v11 long-press exposes lngLat on nativeEvent (v10 used geometry.coordinates)
      const lngLat = e?.nativeEvent?.lngLat ?? e?.geometry?.coordinates;
      if (!lngLat) return;
      const pressLng = lngLat[0] as number;
      const pressLat = lngLat[1] as number;

      // Find nearest draggable point feature within 500m
      let bestDist = Infinity;
      let bestMatch: { featureId: string; layerId: string; featureIndex: number } | null = null;

      for (const layerData of layers) {
        if (!layerData.visible || layerData.features.length === 0) continue;
        if (!draggableLayerIds.has(layerData.id)) continue;
        const geomType = layerData.geometryType ?? detectGeometryType(layerData.features);
        if (geomType !== 'Point') continue;

        layerData.features.forEach((f, i) => {
          const geom = f.geometry;
          if (geom?.type !== 'Point') return;
          const [flng, flat] = geom.coordinates as [number, number];
          // Approximate distance in metres
          const dlng = (flng - pressLng) * 111320 * Math.cos((pressLat * Math.PI) / 180);
          const dlat = (flat - pressLat) * 110540;
          const dist = Math.sqrt(dlng * dlng + dlat * dlat);
          if (dist < bestDist && dist < 100) {
            bestDist = dist;
            bestMatch = {
              featureId: (f.properties as any)?._id ?? `${layerData.id}-${i}`,
              layerId: layerData.id,
              featureIndex: i,
            };
          }
        });
      }

      if (bestMatch) {
        const match = bestMatch as { featureId: string; layerId: string; featureIndex: number };
        dragRef.current = {
          featureId: match.featureId,
          layerId: match.layerId,
          featureIndex: match.featureIndex,
          startLng: pressLng,
          startLat: pressLat,
          startScreenX: 0,
          startScreenY: 0,
          currentZoom: zoomRef.current,
          baselineCaptured: false,
        };
        dragCoordsRef.current = [pressLng, pressLat];
        setDragCoords([pressLng, pressLat]);
        setIsDragging(true);
      }
    },
    [dragMode, draggableLayerIds, layers]
  );

  // ── Fly-to imported center ────────────────────────────────────────────
  useEffect(() => {
    if (!cameraRef.current || !flyToCenter || status !== 'ready') return;
    try {
      cameraRef.current?.flyTo({ center: [flyToCenter.lng, flyToCenter.lat], duration: 1200 });
      cameraRef.current?.zoomTo(flyToCenter.zoom, { duration: 1200 });
    } catch {}
  }, [flyToCenter?.lng, flyToCenter?.lat, flyToCenter?.zoom, status]);

  // ── Fly-to selected feature ────────────────────────────────────────────
  useEffect(() => {
    if (!cameraRef.current || !selectedFeatureId || status !== 'ready') return;

    for (const layerData of layers) {
      for (const feature of layerData.features) {
        const fid = (feature.properties?.id as string) ?? (feature.properties?._id as string);
        if (fid === selectedFeatureId) {
          const coords = feature.geometry.coordinates;
          if (feature.geometry.type === 'Point') {
            try {
              cameraRef.current?.flyTo({ center: [coords[0] as number, coords[1] as number], duration: 800 });
              cameraRef.current?.zoomTo(17, { duration: 800 });
            } catch {}
          } else {
            const first = (coords as unknown[][])[0] as number[];
            try {
              cameraRef.current?.flyTo({ center: [first[0], first[1]], duration: 800 });
              cameraRef.current?.zoomTo(17, { duration: 800 });
            } catch {}
          }
          return;
        }
      }
    }
  }, [selectedFeatureId, layers, status]);

  // ── Retry handler ──────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    retryCountRef.current += 1;
    setStatus('loading');
    setLoadProgress(undefined);
    setErrorInfo({ type: 'unknown', message: '' });
    // Bump mapKey to force React to unmount/remount the MapLibreGL.Map
    setMapKey((k) => k + 1);
  }, []);

  // ── Check if all layers are empty ───────────────────────────────────────
  const isEmpty = useMemo(() => !hasVisibleFeatures(layers), [layers]);

  const containerStyle: any = { flex: 1, minHeight: 300 };
  if (height !== undefined && typeof height === 'number') {
    containerStyle.height = height;
  }

  if (!MapLibreGL) {
    return (
      <View style={[containerStyle, styles.errorContainer]}>
        <ErrorOverlay
          error={{ type: 'module', message: '@maplibre/maplibre-react-native is not available.' }}
          onRetry={handleRetry}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <MapLibreGL.Map
        key={`map-${mapKey}`}
        ref={mapRef}
        style={{ flex: 1 }}
        mapStyle={styleUrl}
        // Android v11 stability fix: 'surface' (GLSurfaceView) is prone to
        // native lifecycle crashes when navigating away / unmounting layers.
        // 'texture' (TextureView) renders through the normal Android view
        // hierarchy, avoiding the documented SurfaceView thread-lifecycle bugs.
        androidView="texture"
        onPress={handlePress}
        onLongPress={handleLongPress}
        dragPan={!isDragging}
        touchZoom={!isDragging}
        touchPitch={!isDragging}
        touchRotate={!isDragging}
        onRegionIsChanging={(e: any) => {
          const zoom = e?.nativeEvent?.zoom ?? e?.properties?.zoom;
          if (zoom !== undefined) {
            zoomRef.current = zoom;
          }
        }}
        onDidFinishLoadingMap={() => {
          setStatus('ready');
          setLoadProgress(1);
        }}
        onDidFailLoadingMap={() => {
          // v11 passes NativeSyntheticEvent<null> here — no error payload is
          // available, so report a generic style-load failure.
          setErrorInfo({
            type: 'style',
            message: 'Map style failed to load.',
          });
          setStatus('error');
        }}
        logo={false}
        attribution={true}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          centerCoordinate={OAKWOOD_CENTER}
          zoomLevel={15}
        />

        {layers.map((layerData) => {
          if (!layerData.visible || layerData.features.length === 0) return null;

          const sourceId = `src-${layerData.id}`;
          const geomType = layerData.geometryType ?? detectGeometryType(layerData.features);
          const shape = layerShapes[layerData.id];
          if (!shape) return null;

          return (
            <React.Fragment key={sourceId}>
              <MapLibreGL.GeoJSONSource id={sourceId} data={shape} onPress={handlePress}>
                {geomType === 'Point' && (
                  <>
                    {/* Drag highlight ring — visible only when this layer has the dragged feature */}
                    {isDragging && dragRef.current?.layerId === layerData.id && (
                      <MapLibreGL.Layer
                        type="circle"
                        id={`drag-hl-${layerData.id}`}
                        source={sourceId}
                        filter={['==', ['get', '_id'], dragRef.current?.featureId ?? '']}
                        style={{
                          circleRadius: 16,
                          circleColor: 'transparent',
                          circleStrokeWidth: 3,
                          circleStrokeColor: '#0D5CFF',
                          circleStrokeOpacity: 0.8,
                        }}
                      />
                    )}
                    <MapLibreGL.Layer
                      type="circle"
                      id={`lyr-${layerData.id}`}
                      source={sourceId}
                      style={{
                        circleRadius: isDragging && dragRef.current?.layerId === layerData.id ? 10 : 7,
                        circleColor: layerData.color,
                        circleStrokeWidth: isDragging && dragRef.current?.layerId === layerData.id ? 3 : 2,
                        circleStrokeColor: isDragging && dragRef.current?.layerId === layerData.id ? '#0D5CFF' : '#ffffff',
                      }}
                    />
                  </>
                )}
                {geomType === 'LineString' && (
                  <MapLibreGL.Layer
                    type="line"
                    id={`lyr-${layerData.id}`}
                    source={sourceId}
                    style={{
                      lineColor: layerData.color,
                      lineWidth: 3,
                      lineOpacity: 0.85,
                    }}
                  />
                )}
                {geomType === 'Polygon' && (
                  <>
                    <MapLibreGL.Layer
                      type="fill"
                      id={`fill-${layerData.id}`}
                      source={sourceId}
                      style={{ fillColor: layerData.color, fillOpacity: 0.25 }}
                    />
                    <MapLibreGL.Layer
                      type="line"
                      id={`out-${layerData.id}`}
                      source={sourceId}
                      style={{ lineColor: layerData.color, lineWidth: 2 }}
                    />
                  </>
                )}
              </MapLibreGL.GeoJSONSource>
            </React.Fragment>
          );
        })}
      </MapLibreGL.Map>

      {/* ── Drag overlay — transparent PanResponder view that captures
            gestures during active drag. Only renders when dragging. ──────── */}
      {isDragging && (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="auto"
          {...panResponder.panHandlers}
        />
      )}

      {/* Drag Distance Display — shown during drag on native */}
      {isDragging && dragDistance !== null && (
        <View style={styles.dragDistanceOverlay}>
          <View style={styles.dragDistanceCard}>
            <Text style={styles.dragDistanceIcon}>↕️</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.dragDistanceValue}>{dragDistance}</Text>
              <Text style={styles.dragDistanceUnit}>m</Text>
            </View>
          </View>
        </View>
      )}

      {/* Loading Overlay — only on loading, not during timeout to avoid visual stacking */}
      {status === 'loading' && (
        <LoadingOverlay
          message={
            retryCountRef.current > 0
              ? `Retrying... (attempt ${retryCountRef.current})`
              : 'Loading map...'
          }
          progress={loadProgress}
        />
      )}

      {/* Timeout Error */}
      {status === 'timeout' && (
        <ErrorOverlay
          error={{ type: 'timeout', message: 'Map did not load within the expected time.' }}
          onRetry={handleRetry}
        />
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <ErrorOverlay error={errorInfo} onRetry={handleRetry} />
      )}

      {/* Empty State Overlay */}
      {status === 'ready' && isEmpty && <EmptyOverlay />}
    </View>
  );
}

// ── Web Implementation (CDN-loaded) ───────────────────────────────────────

const MAPLIBRE_VERSION = '4.7.1';
const CSS_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const JS_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;

let scriptLoadPromise: Promise<void> | null = null;

function loadMapLibreCSS(): Promise<void> {
  return new Promise((resolve) => {
    // Defensive guard — this code path must only run in a browser.
    if (typeof document === 'undefined') { resolve(); return; }
    if (document.getElementById('ml-css')) { resolve(); return; }
    const link = document.createElement('link');
    link.id = 'ml-css';
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function loadMapLibreJS(): Promise<void> {
  // Defensive guard — this code path must only run in a browser.
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve();
  }
  if ((window as any).maplibregl) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = JS_URL;
    script.onload = () => setTimeout(resolve, 100);
    script.onerror = () => {
      console.warn('Failed to load maplibre-gl from CDN');
      resolve();
    };
    document.body.appendChild(script);
  });

  return scriptLoadPromise;
}

/** Remove all vertex marker layers and sources from the map */
function removeVertexMarkers(map: any): void {
  const vertexPrefixes = ['ml-vert-src-', 'ml-vert-lyr-', 'ml-vert-hl-', 'ml-vert-drag-', 'ml-poly-hl-src-', 'ml-poly-hl-fill-', 'ml-poly-hl-line-'];
  const style = map.getStyle();
  if (style?.layers) {
    for (const layer of [...style.layers]) {
      if (vertexPrefixes.some((p) => layer.id.startsWith(p))) {
        try { map.removeLayer(layer.id); } catch {}
      }
    }
  }
  if (style?.sources) {
    for (const sourceId of Object.keys(style.sources)) {
      if (vertexPrefixes.some((p) => sourceId.startsWith(p))) {
        try { map.removeSource(sourceId); } catch {}
      }
    }
  }
}

/** Approximate distance in metres between two coordinates */
function coordDistMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const avgLat = (lat1 + lat2) / 2;
  const dx = (lng2 - lng1) * 111320 * Math.cos((avgLat * Math.PI) / 180);
  const dy = (lat2 - lat1) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Add vertex marker points for a LineString feature being edited */
function addPolygonHighlight(map: any, featureId: string, layerId: string, feature: any, color: string): void {
  const sourceId = `ml-poly-hl-src-${layerId}-${featureId}`;
  const fillLayerId = `ml-poly-hl-fill-${layerId}-${featureId}`;
  const lineLayerId = `ml-poly-hl-line-${layerId}-${featureId}`;

  try {
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: feature?.geometry ?? { type: 'Polygon', coordinates: [] },
          properties: { _id: featureId, _layer_id: layerId },
        }],
      },
    });

    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': color,
        'fill-opacity': 0.16,
      },
    });

    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': color,
        'line-width': 3,
        'line-opacity': 0.95,
      },
    });
  } catch (e) {
    console.warn('[Polygon] Failed to add highlight layers:', e);
  }
}

function addVertexMarkers(
  map: any,
  featureId: string,
  layerId: string,
  coords: [number, number][],
  activeVertexIdx: number,
  color: string,
  minSpacingM = 10,
): void {
  const sourceId = `ml-vert-src-${layerId}-${featureId}`;

  // ── Thin coordinates: only show markers for vertices ≥5m apart ──
  // Start and end are always included. The original vertex index is
  // preserved in _vertex_idx so dragging a marker updates the correct
  // coordinate in tempLineCoords.
  const thinIndices: number[] = []; // original indices that get a marker
  for (let i = 0; i < coords.length; i++) {
    if (thinIndices.length === 0 || i === coords.length - 1) {
      thinIndices.push(i);
      continue;
    }
    const last = coords[thinIndices[thinIndices.length - 1]];
    const dist = coordDistMeters(last[0], last[1], coords[i][0], coords[i][1]);
    if (minSpacingM <= 0 || dist >= minSpacingM) {
      thinIndices.push(i);
    }
  }

  // Build point features for thinned vertices — preserves original indices
  const pointFeatures = thinIndices.map((origIdx) => {
    const [lng, lat] = coords[origIdx];
    return {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      properties: {
        _id: `vert-${layerId}-${featureId}-${origIdx}`,
        _layer_id: layerId,
        _parent_feature_id: featureId,
        _vertex_idx: origIdx,  // Use ORIGINAL index so dragging updates correct coordinate
        _is_vertex: true,
        _is_active: origIdx === activeVertexIdx,
      },
    };
  });

  try {
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: pointFeatures },
    });

    // All vertex circles
    map.addLayer({
      id: `ml-vert-lyr-${layerId}-${featureId}`,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 6,
        'circle-color': '#FFFFFF',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': color,
        'circle-opacity': 0.9,
      },
    });

    // Active vertex highlight (larger ring)
    map.addLayer({
      id: `ml-vert-hl-${layerId}-${featureId}`,
      type: 'circle',
      source: sourceId,
      filter: ['==', ['get', '_is_active'], true],
      paint: {
        'circle-radius': 12,
        'circle-color': 'transparent',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#0D5CFF',
        'circle-stroke-opacity': 0.8,
      },
    });

    // Larger invisible drag handles for all vertices (easier to grab)
    map.addLayer({
      id: `ml-vert-drag-${layerId}-${featureId}`,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 18,
        'circle-color': 'transparent',
        'circle-stroke-width': 0,
      },
    });
  } catch (e) {
    console.warn('[Vertex] Failed to add vertex markers:', e);
  }
}

function addGeoJSONLayers(map: any, layers: MapLayerData[]): void {
  const customPrefixes = ['ml-src-', 'ml-lyr-', 'ml-out-', 'ml-drag-'];

  const style = map.getStyle();
  if (style?.layers) {
    for (const layer of [...style.layers]) {
      if (customPrefixes.some((p) => layer.id.startsWith(p))) {
        try { map.removeLayer(layer.id); } catch {}
      }
    }
  }
  if (style?.sources) {
    for (const sourceId of Object.keys(style.sources)) {
      if (customPrefixes.some((p) => sourceId.startsWith(p))) {
        try { map.removeSource(sourceId); } catch {}
      }
    }
  }

  for (const layerData of layers) {
    if (!layerData.visible || layerData.features.length === 0) continue;

    const sourceId = `ml-src-${layerData.id}`;
    const layerId = `ml-lyr-${layerData.id}`;
    const outlineId = `ml-out-${layerData.id}`;
    const dragLayerId = `ml-drag-${layerData.id}`;
    const geomType = layerData.geometryType ?? detectGeometryType(layerData.features);

    const features = layerData.features.map((f, i) => ({
      ...f,
      properties: {
        ...(f.properties ?? {}),
        _id: f.properties?.id ?? `${layerData.id}-${i}`,
        _layer_id: layerData.id,
      },
    }));

    try {
      map.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      if (geomType === 'Point') {
        map.addLayer({
          id: layerId, type: 'circle', source: sourceId,
          paint: { 'circle-radius': 7, 'circle-color': layerData.color, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
        });
        // Add a larger invisible drag handle layer for easier grabbing
        map.addLayer({
          id: dragLayerId, type: 'circle', source: sourceId,
          paint: { 'circle-radius': 22, 'circle-color': 'transparent', 'circle-stroke-width': 0 },
        });
      } else if (geomType === 'LineString') {
        map.addLayer({
          id: layerId, type: 'line', source: sourceId,
          paint: { 'line-color': layerData.color, 'line-width': 3, 'line-opacity': 0.85 },
        });
      } else if (geomType === 'Polygon') {
        map.addLayer({
          id: layerId, type: 'fill', source: sourceId,
          paint: { 'fill-color': layerData.color, 'fill-opacity': 0.25 },
        });
        map.addLayer({
          id: outlineId, type: 'line', source: sourceId,
          paint: { 'line-color': layerData.color, 'line-width': 2 },
        });
      }
    } catch {}
  }
}

function WebMapView({
  layers,
  onFeatureClick,
  onEmptyAreaClick,
  onFeatureDragEnd,
  onVertexDragEnd,
  vertexDragTarget,
  polygonEditTarget,
  onPolygonVertexDragEnd,
  draggableLayerIds,
  dragMode = false,
  selectedFeatureId,
  height,
  mapStyle,
  loadingTimeoutMs = LOADING_TIMEOUT_MS,
  flyToCenter,
}: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [errorInfo, setErrorInfo] = useState<MapErrorInfo>({ type: 'unknown', message: '' });
  const [loadProgress, setLoadProgress] = useState<number | undefined>(undefined);
  const [mapKey, setMapKey] = useState(0);
  const retryCountRef = useRef(0);
  const layersRef = useRef<MapLayerData[]>(layers);
  layersRef.current = layers;

  const isEmpty = useMemo(() => !hasVisibleFeatures(layers), [layers]);

  // ── Loading timeout ─────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'ready' || status === 'error') return;
    const timer = setTimeout(() => {
      if (status === 'loading') {
        setErrorInfo({ type: 'timeout', message: 'Map did not load within the expected time.' });
        setStatus('timeout');
      }
    }, loadingTimeoutMs);
    return () => clearTimeout(timer);
  }, [status, loadingTimeoutMs]);

  // ── Initialise map from CDN — re-runs when mapKey changes (retry) ────────
  useEffect(() => {
    let cancelled = false;
    let map: any = null;

    (async () => {
      try {
        setLoadProgress(0.1);
        await loadMapLibreCSS();
        setLoadProgress(0.3);
        await loadMapLibreJS();

        if (cancelled) return;

        const ml = (window as any).maplibregl;
        if (!ml) {
          setErrorInfo({ type: 'module', message: 'maplibre-gl failed to load from CDN.' });
          setStatus('error');
          return;
        }
        if (!containerRef.current) {
          setErrorInfo({ type: 'module', message: 'Map container not found.' });
          setStatus('error');
          return;
        }

        setLoadProgress(0.5);

        const initialStyle = mapStyle ?? DEFAULT_MAP_STYLE;

        map = new ml.Map({
          container: containerRef.current,
          style: initialStyle,
          center: OAKWOOD_CENTER,
          zoom: 15,
          attributionControl: true,
        });

        map.addControl(new ml.NavigationControl(), 'top-right');
        mapRef.current = map;
        setLoadProgress(0.7);

        // Listen for style load errors
        map.on('error', (e: any) => {
          const errMsg = e?.error?.message || e?.message || '';
          if (errMsg.toLowerCase().includes('tile') || errMsg.toLowerCase().includes('fetch') || errMsg.toLowerCase().includes('network')) {
            console.warn('[MapLibre] Tile/network error:', errMsg.slice(0, 100));
          }
        });

        if (map.isStyleLoaded()) {
          addGeoJSONLayers(map, layersRef.current);
          setLoadProgress(1);
          setStatus('ready');
        }

        map.on('load', () => {
          addGeoJSONLayers(map, layersRef.current);
          setLoadProgress(1);
          setStatus('ready');
        });

        // Fallback timeout inside the effect
        setTimeout(() => {
          try {
            if (map && !map.isStyleLoaded()) {
              addGeoJSONLayers(map, layersRef.current);
              setStatus('ready');
              setLoadProgress(1);
            }
          } catch {}
        }, 15000);
      } catch (err: any) {
        if (!cancelled) {
          const errMsg = err?.message ?? '';
          setErrorInfo({
            type: errMsg.toLowerCase().includes('network') || errMsg.toLowerCase().includes('fetch')
              ? 'network' : 'unknown',
            message: errMsg,
          });
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (map) {
        try { map.remove(); } catch {}
        mapRef.current = null;
      }
    };
  }, [mapKey]);

  // ── Basemap style changes ──────────────────────────────────────────────
  const prevStyleRef = useRef<string | Record<string, unknown> | undefined>(undefined);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    if (mapStyle === undefined) return;
    if (prevStyleRef.current === undefined) { prevStyleRef.current = mapStyle; return; }
    if (mapStyle === prevStyleRef.current) return;

    prevStyleRef.current = mapStyle;
    setStatus('loading');
    setLoadProgress(undefined);

    try {
      map.setStyle(mapStyle);
      const onStyleLoad = () => {
        addGeoJSONLayers(map, layersRef.current);
        setLoadProgress(1);
        setStatus('ready');
      };
      if (map.isStyleLoaded()) {
        onStyleLoad();
      } else {
        map.once('style.load', onStyleLoad);
      }
    } catch (err: any) {
      setErrorInfo({ type: 'style', message: err?.message ?? 'Failed to switch basemap style.' });
      setStatus('error');
    }
  }, [mapStyle, status]);

  // ── Layer updates ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    if (!map.isStyleLoaded()) return;
    addGeoJSONLayers(map, layers);
  }, [layers, status]);

  // ── Click handler — fires onFeatureClick if a feature is hit,
  //     otherwise fires onEmptyAreaClick (if provided) ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onFeatureClick) return;

    const handleClick = (e: any) => {
      const features = map.queryRenderedFeatures(e.point);
      const screenPt = e.point ? { x: e.point.x, y: e.point.y } : undefined;

      // Check if ANY of the returned features belong to our custom layers
      // (basemap features like street labels won't have _id/_layer_id)
      const hasOurFeature = features?.some(
        (f: any) => f.properties?._id || f.properties?._layer_id
      );

      if (!hasOurFeature) {
        // No custom feature at click point — fire empty-area click for draw/geometry modes
        if (onEmptyAreaClick) {
          onEmptyAreaClick(e.lngLat.lng, e.lngLat.lat, screenPt);
        }
        return;
      }

      for (const feature of features) {
        const props = feature.properties as Record<string, unknown> | null;
        if (!props) continue;
        const fid = props._id as string | undefined;
        const lid = props._layer_id as string | undefined;
        if (fid && lid) {
          onFeatureClick(fid, lid, [e.lngLat.lng, e.lngLat.lat], screenPt);
          break;
        }
      }
    };

    map.on('click', handleClick);
    return () => { try { map.off('click', handleClick); } catch {} };
  }, [status, onFeatureClick, onEmptyAreaClick]);

  // ── Hover cursor ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers: { layer: string; enter: () => void; leave: () => void }[] = [];

    for (const layerData of layers) {
      const layerId = `ml-lyr-${layerData.id}`;
      const isDraggable = dragMode && draggableLayerIds?.has(layerData.id) && layerData.geometryType === 'Point';
      try { if (!map.getLayer(layerId)) continue; } catch { continue; }
      const enter = () => {
        try {
          map.getCanvas().style.cursor = isDraggable ? 'grab' : 'pointer';
        } catch {}
      };
      const leave = () => { try { map.getCanvas().style.cursor = ''; } catch {} };
      try {
        map.on('mouseenter', layerId, enter);
        map.on('mouseleave', layerId, leave);
        handlers.push({ layer: layerId, enter, leave });
      } catch {}
    }

    return () => {
      for (const h of handlers) {
        try { map.off('mouseenter', h.layer, h.enter); map.off('mouseleave', h.layer, h.leave); } catch {}
      }
    };
  }, [layers, status, dragMode, draggableLayerIds]);

  // ── Vertex Drag State ──────────────────────────────────────────────────
  // When set, renders vertex markers for a LineString and handles vertex drag.
  // The ref is used inside the drag handler to know if we're dragging a vertex.
  const isVertexDragRef = useRef(false);
  const onVertexDragEndRef = useRef(onVertexDragEnd);
  onVertexDragEndRef.current = onVertexDragEnd;
  const onPolygonVertexDragEndRef = useRef(onPolygonVertexDragEnd);
  onPolygonVertexDragEndRef.current = onPolygonVertexDragEnd;
  const vertexDragTargetRef = useRef(vertexDragTarget);
  vertexDragTargetRef.current = vertexDragTarget;
  const polygonEditTargetRef = useRef(polygonEditTarget);
  polygonEditTargetRef.current = polygonEditTarget;

  // Effect: render/update edit handles when the active vertex target changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;

    // Remove existing edit handles first
    removeVertexMarkers(map);

    const target = vertexDragTarget ?? polygonEditTarget;
    if (!target) return;

    for (const layerData of layersRef.current) {
      if (layerData.id !== target.layerId) continue;
      for (const feat of layerData.features) {
        const fid = (feat.properties as any)?.id ?? (feat.properties as any)?._id ?? '';
        if (fid !== target.featureId) continue;

        const geom = feat.geometry;
        if (geom?.type === 'LineString') {
          const coords = geom.coordinates as [number, number][];
          addVertexMarkers(
            map,
            target.featureId,
            target.layerId,
            coords,
            vertexDragTarget?.vertexIdx ?? -1,
            layerData.color ?? '#0D5CFF',
          );
        } else if (geom?.type === 'Polygon') {
          const outerRing = (geom.coordinates as [number, number][][])[0] ?? [];
          addPolygonHighlight(map, target.featureId, target.layerId, feat, layerData.color ?? '#0D5CFF');
          addVertexMarkers(
            map,
            target.featureId,
            target.layerId,
            outerRing as [number, number][],
            -1,
            layerData.color ?? '#0D5CFF',
            0,
          );
        } else if (geom?.type === 'MultiPolygon') {
          const firstRing = ((geom.coordinates as [number, number][][][])[0]?.[0] ?? []) as [number, number][];
          addPolygonHighlight(map, target.featureId, target.layerId, feat, layerData.color ?? '#0D5CFF');
          addVertexMarkers(
            map,
            target.featureId,
            target.layerId,
            firstRing,
            -1,
            layerData.color ?? '#0D5CFF',
            0,
          );
        }

        console.log(`[Vertex] Edit handles rendered for ${target.featureId.slice(-8)} on ${target.layerId}`);
        return;
      }
    }

    console.warn(
      `[Vertex] Feature ${target.featureId.slice(-8)} not found in any rendered layer ` +
      `(layerId: ${target.layerId}). Available layers: ` +
      layersRef.current.map(l => `${l.id}(${l.features.length}feat)`).join(', ')
    );
  }, [vertexDragTarget, polygonEditTarget, status]);

  // Clean up vertex markers on unmount
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) removeVertexMarkers(map);
    };
  }, []);

  // ── Point Drag (Geometry Editing) ────────────────────────────────────
  const [dragDistance, setDragDistance] = useState<number | null>(null);
  const dragOriginRef = useRef<{ lng: number; lat: number } | null>(null);

  const dragStateRef = useRef<{
    active: boolean;
    featureId: string;
    layerId: string;
    sourceId: string;
    featureIndex: number;
    originalLng: number;
    originalLat: number;
    startPoint: { x: number; y: number };
    /** If dragging a vertex, the index of the vertex being dragged */
    vertexIdx?: number;
    /** If dragging a vertex, the parent feature's source ID */
    parentSourceId?: string;
    /** Snapshot of full coordinate array at drag start (for rubber-band offset) */
    initialCoords?: [number, number][];
  } | null>(null);

  // ── Haversine distance (metres) ────────────────────────────────────────
  const haversineDistance = useCallback(
    (lng1: number, lat1: number, lng2: number, lat2: number): number => {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLng = toRad(lng2 - lng1);
      const dLat = toRad(lat2 - lat1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },
    []
  );

  // Separate effect: enable/disable drag-pan based on dragMode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    try {
      if (dragMode) {
        map.dragPan.disable();
      } else {
        map.dragPan.enable();
      }
    } catch {}
  }, [dragMode, status]);

  // ── Point drag effect (guarded by dragMode) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onFeatureDragEnd || !dragMode || status !== 'ready') return;

    const canvas = map.getCanvas();
    const cleanupFns: (() => void)[] = [];

    const containerToLngLat = (e: any) => {
      if (e.lngLat) return e.lngLat;
      try {
        const rect = map.getContainer().getBoundingClientRect();
        return map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      } catch { return null; }
    };

    const onDragMove = (e: any) => {
      const ds = dragStateRef.current;
      if (!ds?.active) return;
      const lngLat = containerToLngLat(e);
      if (!lngLat) return;

      if (dragOriginRef.current) {
        const dist = haversineDistance(
          dragOriginRef.current.lng,
          dragOriginRef.current.lat,
          lngLat.lng,
          lngLat.lat
        );
        setDragDistance(Math.round(dist));
      }

      const src = map.getSource(ds.sourceId) as any;
      if (!src?._data?.features) return;
      try {
        const features = [...src._data.features];
        if (features[ds.featureIndex]?.geometry?.type === 'Point') {
          features[ds.featureIndex] = {
            ...features[ds.featureIndex],
            geometry: { ...features[ds.featureIndex].geometry, coordinates: [lngLat.lng, lngLat.lat] },
          };
          src.setData({ type: 'FeatureCollection', features });
        }
      } catch {}
    };

    const cancelDrag = () => {
      const ds = dragStateRef.current;
      if (!ds?.active) return;
      if (ds.originalLng !== undefined) {
        try {
          const src = map.getSource(ds.sourceId) as any;
          if (src?._data?.features) {
            const features = [...src._data.features];
            if (features[ds.featureIndex]?.geometry?.type === 'Point') {
              features[ds.featureIndex] = {
                ...features[ds.featureIndex],
                geometry: { ...features[ds.featureIndex].geometry, coordinates: [ds.originalLng, ds.originalLat] },
              };
              src.setData({ type: 'FeatureCollection', features });
            }
          }
        } catch {}
      }
      try { map.getCanvas().style.cursor = 'grab'; } catch {}
      try { if (map.getLayer(`ml-lyr-${ds.layerId}-dragging`)) map.removeLayer(`ml-lyr-${ds.layerId}-dragging`); } catch {}
      // Remove origin marker
      try {
        const origLayerId = `ml-orig-${ds.sourceId}`;
        const origSourceId = `${ds.sourceId}-origin`;
        if (map.getLayer(origLayerId)) map.removeLayer(origLayerId);
        if (map.getSource(origSourceId)) map.removeSource(origSourceId);
      } catch {}
      setDragDistance(null);
      dragOriginRef.current = null;
      dragStateRef.current = null;
    };

    const onDragEnd = (e: any) => {
      const ds = dragStateRef.current;
      if (!ds?.active) return;
      const lngLat = containerToLngLat(e);
      setDragDistance(null);
      dragOriginRef.current = null;
      cancelDrag();
      if (lngLat && ds) {
        const px = (e as any).point ?? map.project([lngLat.lng, lngLat.lat]);
        const pixelDx = Math.abs((px?.x ?? 0) - ds.startPoint.x);
        const pixelDy = Math.abs((px?.y ?? 0) - ds.startPoint.y);
        if (pixelDx > 8 || pixelDy > 8) {
          onFeatureDragEnd(ds.featureId, ds.layerId, lngLat.lng, lngLat.lat);
        }
      }
    };

    canvas.addEventListener('mousemove', onDragMove);
    canvas.addEventListener('mouseup', onDragEnd);
    canvas.addEventListener('mouseleave', cancelDrag);
    cleanupFns.push(() => {
      canvas.removeEventListener('mousemove', onDragMove);
      canvas.removeEventListener('mouseup', onDragEnd);
      canvas.removeEventListener('mouseleave', cancelDrag);
    });

    for (const layerData of layers) {
      if (!layerData.visible || layerData.features.length === 0) continue;
      if (layerData.geometryType !== 'Point') continue;
      if (!draggableLayerIds?.has(layerData.id)) continue;

      const dragLayerId = `ml-drag-${layerData.id}`;
      const layerId = `ml-lyr-${layerData.id}`;
      const sourceId = `ml-src-${layerData.id}`;
      const handleLayer = map.getLayer(dragLayerId) ? dragLayerId : layerId;

      const onDragStart = (e: any) => {
        if (!dragMode) return;
        e.preventDefault();
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties;
        const fid = props?._id as string | undefined;
        const lid = props?._layer_id as string | undefined;
        if (!fid || !lid) return;

        let featureIndex = -1;
        try {
          const src = map.getSource(sourceId) as any;
          if (src?._data?.features) {
            featureIndex = src._data.features.findIndex(
              (f: any) => f.properties?._id === fid
            );
          }
        } catch {}
        if (featureIndex < 0) return;

        map.getCanvas().style.cursor = 'grabbing';
        dragOriginRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        setDragDistance(null);

        dragStateRef.current = {
          active: true,
          featureId: fid,
          layerId: lid,
          sourceId,
          featureIndex,
          originalLng: e.lngLat.lng,
          originalLat: e.lngLat.lat,
          startPoint: e.point ? { x: e.point.x, y: e.point.y } : { x: 0, y: 0 },
        };

        if (!map.getLayer(`${layerId}-dragging`)) {
          try {
            map.addLayer({
              id: `${layerId}-dragging`,
              type: 'circle', source: sourceId,
              paint: { 'circle-radius': 14, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': '#0D5CFF', 'circle-stroke-opacity': 0.7 },
            });
          } catch {}
        }

        const origLayerId = `ml-orig-${sourceId}`;
        const origSourceId = `${sourceId}-origin`;
        try {
          if (!map.getSource(origSourceId)) {
            map.addSource(origSourceId, {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] }, properties: {} }] },
            });
          }
          if (!map.getLayer(origLayerId)) {
            map.addLayer({ id: origLayerId, type: 'circle', source: origSourceId,
              paint: { 'circle-radius': 10, 'circle-color': 'rgba(255, 255, 255, 0.5)', 'circle-stroke-width': 2, 'circle-stroke-color': '#ff6b6b', 'circle-stroke-opacity': 0.8, 'circle-opacity': 0.3 },
            });
          }
        } catch {}
      };

      try {
        map.on('mousedown', handleLayer, onDragStart);
        cleanupFns.push(() => { try { map.off('mousedown', handleLayer, onDragStart); } catch {} });
      } catch {}
    }

    return () => { for (const fn of cleanupFns) try { fn(); } catch {} };
  }, [layers, status, dragMode, draggableLayerIds, onFeatureDragEnd]);

  const applyVertexGeometryUpdate = useCallback((featureGeom: any, vertexIdx: number, lng: number, lat: number) => {
    if (!featureGeom) return null;

    if (featureGeom.type === 'LineString') {
      const coords = Array.isArray(featureGeom.coordinates) ? [...featureGeom.coordinates] : [];
      if (vertexIdx >= 0 && vertexIdx < coords.length) {
        coords[vertexIdx] = [lng, lat];
        return { ...featureGeom, coordinates: coords };
      }
    }

    if (featureGeom.type === 'Polygon') {
      const rings = Array.isArray(featureGeom.coordinates) ? [...featureGeom.coordinates] : [];
      if (rings.length > 0 && Array.isArray(rings[0])) {
        const outerRing = [...rings[0]] as [number, number][];
        if (vertexIdx >= 0 && vertexIdx < outerRing.length) {
          outerRing[vertexIdx] = [lng, lat];
          // GeoJSON linear rings must remain closed when an endpoint is moved.
          if (vertexIdx === 0 && outerRing.length > 1) {
            outerRing[outerRing.length - 1] = [lng, lat];
          } else if (vertexIdx === outerRing.length - 1 && outerRing.length > 1) {
            outerRing[0] = [lng, lat];
          }
          return { ...featureGeom, coordinates: [outerRing, ...rings.slice(1)] };
        }
      }
    }

    if (featureGeom.type === 'MultiPolygon') {
      const polygons = Array.isArray(featureGeom.coordinates) ? [...featureGeom.coordinates] : [];
      if (polygons.length > 0 && Array.isArray(polygons[0])) {
        const firstPolygon = [...polygons[0]] as [number, number][][];
        if (firstPolygon.length > 0 && Array.isArray(firstPolygon[0])) {
          const outerRing = [...firstPolygon[0]] as [number, number][];
          if (vertexIdx >= 0 && vertexIdx < outerRing.length) {
            outerRing[vertexIdx] = [lng, lat];
            // GeoJSON linear rings must remain closed when an endpoint is moved.
            if (vertexIdx === 0 && outerRing.length > 1) {
              outerRing[outerRing.length - 1] = [lng, lat];
            } else if (vertexIdx === outerRing.length - 1 && outerRing.length > 1) {
              outerRing[0] = [lng, lat];
            }
            const updatedFirstPolygon = [outerRing, ...firstPolygon.slice(1)] as [number, number][][];
            return { ...featureGeom, coordinates: [updatedFirstPolygon, ...polygons.slice(1)] };
          }
        }
      }
    }

    return null;
  }, []);

  const snapshotGeometryCoords = useCallback((featureGeom: any) => {
    if (!featureGeom) return undefined;
    if (featureGeom.type === 'LineString') {
      return Array.isArray(featureGeom.coordinates) ? featureGeom.coordinates.map((c: [number, number]) => [c[0], c[1]] as [number, number]) : undefined;
    }
    if (featureGeom.type === 'Polygon') {
      const firstRing = Array.isArray(featureGeom.coordinates?.[0]) ? featureGeom.coordinates[0] : [];
      return firstRing.map((c: [number, number]) => [c[0], c[1]] as [number, number]);
    }
    if (featureGeom.type === 'MultiPolygon') {
      const firstRing = Array.isArray(featureGeom.coordinates?.[0]?.[0]) ? featureGeom.coordinates[0][0] : [];
      return firstRing.map((c: [number, number]) => [c[0], c[1]] as [number, number]);
    }
    return undefined;
  }, []);

  // ── Vertex drag effect (runs independently of dragMode) ────────────────
  useEffect(() => {
    const map = mapRef.current;
    const activeTarget = vertexDragTargetRef.current ?? polygonEditTargetRef.current;
    if (
      !map ||
      (!onVertexDragEndRef.current && !onPolygonVertexDragEndRef.current) ||
      !activeTarget ||
      status !== 'ready'
    ) return;

    const vt = activeTarget;
    const vertDragLayerId = `ml-vert-drag-${vt.layerId}-${vt.featureId}`;
    const vertSourceId = `ml-vert-src-${vt.layerId}-${vt.featureId}`;
    const parentSourceId = `ml-src-${vt.layerId}`;
    const canvas = map.getCanvas();
    const cleanupFns: (() => void)[] = [];

    const containerToLngLat = (e: any) => {
      if (e.lngLat) return e.lngLat;
      try {
        const rect = map.getContainer().getBoundingClientRect();
        return map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      } catch { return null; }
    };

    const onDragMove = (e: any) => {
      const ds = dragStateRef.current;
      if (!ds?.active || ds.vertexIdx === undefined) return;
      const lngLat = containerToLngLat(e);
      if (!lngLat) return;

      if (dragOriginRef.current) {
        const dist = haversineDistance(
          dragOriginRef.current.lng, dragOriginRef.current.lat,
          lngLat.lng, lngLat.lat
        );
        setDragDistance(Math.round(dist));
      }

      const src = map.getSource(ds.sourceId) as any;
      if (!src?._data?.features) return;
      try {
        const features = [...src._data.features];
        if (features[ds.featureIndex]?.geometry?.type === 'Point') {
          features[ds.featureIndex] = {
            ...features[ds.featureIndex],
            geometry: { ...features[ds.featureIndex].geometry, coordinates: [lngLat.lng, lngLat.lat] },
          };
        }
        src.setData({ type: 'FeatureCollection', features });

        // Update the parent feature geometry at the dragged vertex index
        try {
          const parentSrc = map.getSource(ds.parentSourceId!) as any;
          if (parentSrc?._data?.features) {
            const parentFeatures = [...parentSrc._data.features];
            const parentFeat = parentFeatures.find(
              (f: any) => (f.properties?._id === ds.featureId || f.properties?.id === ds.featureId)
            );
            if (parentFeat) {
              const updatedGeom = applyVertexGeometryUpdate(parentFeat.geometry, ds.vertexIdx, lngLat.lng, lngLat.lat);
              if (updatedGeom) {
                parentFeat.geometry = updatedGeom;
                parentSrc.setData({ type: 'FeatureCollection', features: parentFeatures });
              }
            }
          }
        } catch {}
      } catch {}
    };

    const cancelDrag = () => {
      const ds = dragStateRef.current;
      if (!ds?.active || ds.vertexIdx === undefined) return;
      try {
        const src = map.getSource(ds.sourceId) as any;
        if (src?._data?.features) {
          const features = [...src._data.features];
          if (features[ds.featureIndex]?.geometry?.type === 'Point') {
            features[ds.featureIndex] = {
              ...features[ds.featureIndex],
              geometry: { ...features[ds.featureIndex].geometry, coordinates: [ds.originalLng, ds.originalLat] },
            };
            src.setData({ type: 'FeatureCollection', features });
          }
        }
        // Restore parent line
        const parentSrc = map.getSource(ds.parentSourceId!) as any;
        if (parentSrc?._data?.features) {
          const parentFeatures = [...parentSrc._data.features];
          const parentFeat = parentFeatures.find(
            (f: any) => (f.properties?._id === ds.featureId || f.properties?.id === ds.featureId)
          );
          if (parentFeat?.geometry?.type === 'LineString') {
            const coords = [...parentFeat.geometry.coordinates];
            if (ds.initialCoords) {
              // Restore all coordinates from snapshot (rubber-band cancel)
              for (let i = 0; i < coords.length && i < ds.initialCoords.length; i++) {
                coords[i] = [ds.initialCoords[i][0], ds.initialCoords[i][1]];
              }
            } else {
              // Legacy: restore only the dragged vertex
              coords[ds.vertexIdx] = [ds.originalLng, ds.originalLat];
            }
            parentFeat.geometry = { ...parentFeat.geometry, coordinates: coords };
            parentSrc.setData({ type: 'FeatureCollection', features: parentFeatures });
          }
        }
      } catch {}
      try { map.getCanvas().style.cursor = ''; } catch {}
      try {
        const hlId = `ml-vert-hl-${ds.layerId}-${ds.featureId}`;
        if (map.getLayer(hlId)) map.removeLayer(hlId);
      } catch {}
      setDragDistance(null);
      dragOriginRef.current = null;
      dragStateRef.current = null;
    };

    const onDragEnd = (e: any) => {
      const ds = dragStateRef.current;
      if (!ds?.active || ds.vertexIdx === undefined) return;
      const lngLat = containerToLngLat(e);
      const vertexIdx = ds.vertexIdx;
      setDragDistance(null);
      dragOriginRef.current = null;

      // ── Keep the last drag position in the map sources ────────────
      // Do NOT call cancelDrag() here — that would restore the original
      // coordinates, snapping the line back AFTER the user released the
      // mouse. Instead, just clean up the drag state and cursor. The
      // parent LineString source already has the final position from
      // the last onDragMove event.
      try { map.getCanvas().style.cursor = ''; } catch {}
      try {
        const hlId = `ml-vert-hl-${ds.layerId}-${ds.featureId}`;
        if (map.getLayer(hlId)) map.removeLayer(hlId);
      } catch {}
      dragStateRef.current = null;

      if (lngLat && ds) {
        const px = (e as any).point ?? map.project([lngLat.lng, lngLat.lat]);
        const pixelDx = Math.abs((px?.x ?? 0) - ds.startPoint.x);
        const pixelDy = Math.abs((px?.y ?? 0) - ds.startPoint.y);
        if ((pixelDx > 8 || pixelDy > 8) && onVertexDragEndRef.current) {
          const isPolygonTarget = polygonEditTargetRef.current != null && vertexDragTargetRef.current == null;
          if (isPolygonTarget && onPolygonVertexDragEndRef.current) {
            onPolygonVertexDragEndRef.current(ds.featureId, ds.layerId, vertexIdx, lngLat.lng, lngLat.lat);
          } else if (onVertexDragEndRef.current) {
            onVertexDragEndRef.current(ds.featureId, ds.layerId, vertexIdx, lngLat.lng, lngLat.lat);
          }
        }
      }
    };

    canvas.addEventListener('mousemove', onDragMove);
    canvas.addEventListener('mouseup', onDragEnd);
    canvas.addEventListener('mouseleave', cancelDrag);
    cleanupFns.push(() => {
      canvas.removeEventListener('mousemove', onDragMove);
      canvas.removeEventListener('mouseup', onDragEnd);
      canvas.removeEventListener('mouseleave', cancelDrag);
    });

    const onVertexDragStart = (e: any) => {
      e.preventDefault();
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties;
      const fid = props?._id as string | undefined;
      const vIdx = props?._vertex_idx as number | undefined;
      const isVertex = props?._is_vertex === true;
      if (!fid || vIdx === undefined || !isVertex) return;

        // Find feature index in vertex marker source
        let featureIndex = -1;
        try {
          const src = map.getSource(vertSourceId) as any;
          if (src?._data?.features) {
            featureIndex = src._data.features.findIndex(
              (f: any) => f.properties?._id === fid
            );
          }
        } catch {}
        if (featureIndex < 0) return;

        // ── Snapshot initial coordinate array for rubber-band decay ──
        let initialCoords: [number, number][] | undefined;
        try {
          const parentSrc = map.getSource(parentSourceId) as any;
          if (parentSrc?._data?.features) {
            const parentFeat = parentSrc._data.features.find(
              (f: any) => (f.properties?._id === vt.featureId || f.properties?.id === vt.featureId)
            );
            initialCoords = snapshotGeometryCoords(parentFeat.geometry);
          }
        } catch {}

        isVertexDragRef.current = true;
        map.getCanvas().style.cursor = 'grabbing';

        dragStateRef.current = {
          active: true,
          featureId: vt.featureId,
          layerId: vt.layerId,
          sourceId: vertSourceId,
          featureIndex,
          originalLng: e.lngLat.lng,
          originalLat: e.lngLat.lat,
          startPoint: e.point ? { x: e.point.x, y: e.point.y } : { x: 0, y: 0 },
          vertexIdx: vIdx,
          parentSourceId,
          initialCoords,
        };
      };

      try {
        if (map.getLayer(vertDragLayerId)) {
          map.on('mousedown', vertDragLayerId, onVertexDragStart);
          cleanupFns.push(() => {
            try { map.off('mousedown', vertDragLayerId, onVertexDragStart); } catch {}
          });
        }
      } catch {}

    return () => {
      for (const fn of cleanupFns) try { fn(); } catch {}
    };
}, [status, vertexDragTarget, polygonEditTarget, onVertexDragEnd, onPolygonVertexDragEnd, applyVertexGeometryUpdate, snapshotGeometryCoords]);

  // ── Fly-to imported center ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCenter || status !== 'ready') return;
    try {
      map.flyTo({ center: [flyToCenter.lng, flyToCenter.lat], zoom: flyToCenter.zoom, duration: 1200 });
    } catch {}
  }, [flyToCenter?.lng, flyToCenter?.lat, flyToCenter?.zoom, status]);

  // ── Fly-to selected feature ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedFeatureId) return;

    for (const layerData of layers) {
      for (const feature of layerData.features) {
        const fid = (feature.properties?.id as string) ?? (feature.properties?._id as string);
        if (fid === selectedFeatureId) {
          const coords = feature.geometry.coordinates;
          const center: [number, number] =
            feature.geometry.type === 'Point'
              ? [(coords as number[])[0], (coords as number[])[1]]
              : [((coords as unknown[][])[0] as number[])?.[0] ?? 0, ((coords as unknown[][])[0] as number[])?.[1] ?? 0];
          try { map.flyTo({ center, zoom: 17, duration: 800 }); } catch {}
          return;
        }
      }
    }
  }, [selectedFeatureId, layers, status]);

  const containerStyle: any = { width: '100%', minHeight: 300 };
  if (height !== undefined) containerStyle.height = height;

  return (
    <View style={containerStyle}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />

      {status === 'loading' && (
        <LoadingOverlay
          message={
            retryCountRef.current > 0
              ? `Retrying... (attempt ${retryCountRef.current})`
              : 'Loading map...'
          }
          progress={loadProgress}
        />
      )}

      {status === 'timeout' && (
        <ErrorOverlay
          error={{ type: 'timeout', message: 'Map did not load within the expected time.' }}
          onRetry={() => {
            retryCountRef.current += 1;
            setStatus('loading');
            setLoadProgress(undefined);
            setMapKey((k) => k + 1);
          }}
        />
      )}

      {status === 'error' && (
        <ErrorOverlay
          error={errorInfo}
          onRetry={() => {
            retryCountRef.current += 1;
            setStatus('loading');
            setLoadProgress(undefined);
            setMapKey((k) => k + 1);
          }}
        />
      )}

      {/* Drag Distance Display — shown during point drag */}
      {dragDistance !== null && (
        <View style={styles.dragDistanceOverlay}>
          <View style={styles.dragDistanceCard}>
            <Text style={styles.dragDistanceIcon}>↕️</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.dragDistanceValue}>{dragDistance}</Text>
              <Text style={styles.dragDistanceUnit}>m</Text>
            </View>
          </View>
        </View>
      )}

      {status === 'ready' && isEmpty && <EmptyOverlay />}
    </View>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────

function NativeMapUnavailableView({ isExpoGo }: { isExpoGo: boolean }) {
  return (
    <View style={[styles.errorContainer, { minHeight: 300 }]}>
      <View style={styles.errorIconCircle}>
        <Text style={styles.errorIconLarge}>📦</Text>
      </View>
      <Text style={styles.errorTitle}>Map Library Not Available</Text>
      <Text style={styles.errorDescription}>
        {isExpoGo
          ? 'The map engine (MapLibre) is not included in Expo Go. Install the development build of this app instead: connect your phone and run `npx expo run:android`, or install an APK built with EAS (`eas build -p android --profile preview`).'
          : 'The MapLibre native module could not be loaded. Rebuild the app with `npx expo run:android` or `eas build -p android --profile preview` and install the new APK.'}
      </Text>
    </View>
  );
}

export default function MapLibreMap(props: MapLibreMapProps) {
  if (IS_NATIVE) {
    return <NativeMapView {...props} />;
  }
  if (Platform.OS === 'web') {
    return <WebMapView {...props} />;
  }
  // Native platform without the native module (e.g. Expo Go or a stale
  // build) — never attempt the DOM-based WebMapView here.
  return <NativeMapUnavailableView isExpoGo={IS_EXPO_GO} />;
}

// ── Shared Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Overlay Base ────────────────────────────────────────────────────────
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(247, 249, 252, 0.92)',
    zIndex: 10,
  },

  // ── Loading Card ────────────────────────────────────────────────────────
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 32,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 220,
  },
  mapIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mapIconLarge: { fontSize: 28 },
  loadingDots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  loadingHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    fontWeight: '400',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    width: '100%',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0D5CFF',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 32,
    textAlign: 'right',
  },

  // ── Error Card ──────────────────────────────────────────────────────────
  errorCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: 300,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(247, 249, 252, 0.9)',
    gap: 12,
  },
  errorIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorIconLarge: { fontSize: 24 },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  tipContainer: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  tipText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D5CFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
    minWidth: 160,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // ── Empty State Card ────────────────────────────────────────────────────
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 6,
    maxWidth: 280,
  },
  emptyIconContainer: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyIcon: { fontSize: 24 },
  emptyIconBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  // ── Drag Distance Overlay ────────────────────────────────────────────
  dragDistanceOverlay: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'none',
  },
  dragDistanceCard: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  dragDistanceIcon: {
    fontSize: 14,
  },
  dragDistanceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dragDistanceUnit: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
    marginLeft: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorText: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 },
});
