import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronRight, Layers as LayersIcon, X } from 'lucide-react-native';
import MapLibreMap, { type MapLayerData } from '../../lib/components/MapLibreMap';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { getProject } from '../../lib/api/projects';
import {
  displayValue,
  getSupervisionLayerFeatures,
  getSupervisionLayers,
  lldVersionLabel,
  measurementValue,
} from '../../lib/api/supervision';
import type { Feature, Layer, Project } from '../../lib/utils/types';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius, Spacing, Type } from '../../lib/theme/colors';

const LAYER_COLORS = [
  '#2563EB',
  '#F97316',
  '#10B981',
  '#8B5CF6',
  '#EF4444',
  '#0891B2',
  '#CA8A04',
  '#DB2777',
  '#4D7C0F',
  '#7C3AED',
];

type GeoFeature = MapLayerData['features'][number];

function toGeoFeature(feature: Feature): GeoFeature {
  return {
    type: 'Feature',
    geometry: feature.geometry as GeoFeature['geometry'],
    properties: { ...feature.properties, id: feature.id, _feature_id: feature.id },
  };
}

function flattenCoords(geometry: unknown, out: [number, number][]): void {
  if (!geometry || typeof geometry !== 'object') return;
  const g = geometry as { type?: string; coordinates?: unknown };
  if (!Array.isArray(g.coordinates)) return;
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(g.coordinates);
}

export default function SupervisionMapScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = String(params.projectId ?? '');
  const colors = useThemeStore((s) => s.colors);

  const [project, setProject] = useState<Project | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [featuresByLayer, setFeaturesByLayer] = useState<Record<string, Feature[]>>({});
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ feature: Feature; layer: Layer } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fitBounds, setFitBounds] = useState<{
    bounds: [number, number, number, number];
    padding: { top: number; right: number; bottom: number; left: number };
    ts: number;
  } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [proj, layerList] = await Promise.all([
        getProject(projectId),
        getSupervisionLayers(projectId),
      ]);
      setProject(proj);
      setLayers(layerList);

      const detail = await Promise.all(
        layerList.map((layer) =>
          getSupervisionLayerFeatures(projectId, layer.layer_id)
            .then((data) => ({ layerId: layer.layer_id, features: data.features ?? [] }))
            .catch(() => ({ layerId: layer.layer_id, features: [] as Feature[] })),
        ),
      );
      const byLayer: Record<string, Feature[]> = {};
      const allCoords: [number, number][] = [];
      for (const { layerId, features } of detail) {
        byLayer[layerId] = features;
        for (const feature of features) flattenCoords(feature.geometry, allCoords);
      }
      setFeaturesByLayer(byLayer);

      if (allCoords.length > 0) {
        const lngs = allCoords.map((c) => c[0]);
        const lats = allCoords.map((c) => c[1]);
        setFitBounds({
          bounds: [
            Math.min(...lngs),
            Math.min(...lats),
            Math.max(...lngs),
            Math.max(...lats),
          ],
          padding: { top: 70, right: 40, bottom: 140, left: 40 },
          ts: Date.now(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load supervision data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mapLayers: MapLayerData[] = useMemo(
    () =>
      layers
        .filter((layer) => !hiddenLayers.has(layer.layer_id))
        .map((layer, index) => ({
          id: layer.layer_id,
          name: layer.layer_name || layer.layer_id,
          color: LAYER_COLORS[index % LAYER_COLORS.length],
          visible: true,
          features: (featuresByLayer[layer.layer_id] ?? [])
            .filter((feature) => feature.geometry)
            .map(toGeoFeature),
        }))
        .filter((layer) => layer.features.length > 0),
    [layers, featuresByLayer, hiddenLayers],
  );

  const featureCount = useMemo(
    () => Object.values(featuresByLayer).reduce((sum, list) => sum + list.length, 0),
    [featuresByLayer],
  );

  const handleFeatureClick = useCallback(
    (featureId: string, layerId: string) => {
      const layer = layers.find((l) => l.layer_id === layerId);
      const feature = featuresByLayer[layerId]?.find((f) => String(f.id) === String(featureId));
      if (!feature || !layer) return;
      setSelected({ feature, layer });
    },
    [layers, featuresByLayer],
  );

  const toggleLayer = (layerId: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  };

  if (!projectId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textPrimary, padding: Spacing.lg }}>
          No supervision project selected.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to supervision tasks"
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {project?.name ?? 'Supervision'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {project ? `${lldVersionLabel(project)} · ${layers.length} layers · ${featureCount} features` : 'Loading…'}
          </Text>
        </View>
        {project && <StatusBadge status={project.status} />}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            Loading field data…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
            Couldn&apos;t load supervision data
          </Text>
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>{error}</Text>
          <Button title="Try Again" variant="secondary" size="sm" onPress={load} />
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapLibreMap
            layers={mapLayers}
            height="100%"
            fitBounds={fitBounds}
            selectedFeatureId={selected ? String(selected.feature.id) : undefined}
            onFeatureClick={handleFeatureClick}
            emptyState={{
              title: 'No mapped features',
              description: 'This supervision project has no geometry importable to the map yet.',
            }}
          />

          {/* Layer control */}
          <View style={styles.layerBar} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.layerChip, { backgroundColor: colors.surface }]}
              onPress={() => setLayersOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Show supervision layers"
            >
              <LayersIcon size={16} color={colors.primary} />
              <Text style={[styles.layerChipText, { color: colors.textPrimary }]}>
                Layers {layers.length}
              </Text>
            </TouchableOpacity>
          </View>

          {layersOpen && (
            <View style={[styles.layerPanel, { backgroundColor: colors.surface }]}>
              <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Layers</Text>
              <ScrollView style={{ maxHeight: 260 }}>
                {layers.map((layer, index) => {
                  const visible = !hiddenLayers.has(layer.layer_id);
                  const count = featuresByLayer[layer.layer_id]?.length ?? layer.feature_count;
                  return (
                    <TouchableOpacity
                      key={layer.layer_id}
                      onPress={() => toggleLayer(layer.layer_id)}
                      style={styles.layerRow}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: visible }}
                      accessibilityLabel={`${layer.layer_name || layer.layer_id}, ${visible ? 'shown' : 'hidden'}, ${count} features`}
                    >
                      <View
                        style={[
                          styles.layerDot,
                          { backgroundColor: LAYER_COLORS[index % LAYER_COLORS.length], opacity: visible ? 1 : 0.3 },
                        ]}
                      />
                      <Text style={[styles.layerName, { color: visible ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
                        {layer.layer_name || layer.layer_id}
                      </Text>
                      <Text style={[styles.layerCount, { color: colors.textSecondary }]}>{count}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Selected feature summary */}
          {selected && (
            <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetLayer, { color: colors.textSecondary }]}>
                    {selected.layer.layer_name || selected.layer.layer_id}
                  </Text>
                  <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                    Feature #{String(selected.feature.id).slice(-8)}
                  </Text>
                </View>
                <StatusBadge status={selected.feature.status} />
                <TouchableOpacity
                  onPress={() => setSelected(null)}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close feature summary"
                >
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 210 }}>
                {Object.entries(selected.feature.properties ?? {})
                  .filter(([key]) => !key.startsWith('_') && key !== 'id')
                  .slice(0, 12)
                  .map(([key, value]) => {
                    const shown = displayValue(value);
                    if (!shown) return null;
                    const measured = measurementValue(
                      (selected.feature.field_measurements as Record<string, unknown> | null)?.[key],
                    );
                    return (
                      <View key={key} style={styles.detailRow}>
                        <Text style={[styles.detailKey, { color: colors.textSecondary }]} numberOfLines={1}>
                          {labelFor(selected.feature, key)}
                        </Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]} numberOfLines={1}>
                          {shown}
                          {measured ? ` → ${measured}` : ''}
                        </Text>
                      </View>
                    );
                  })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.openBtn, { backgroundColor: colors.primary }]}
                onPress={() =>
                  router.push({
                    pathname: '/supervision/feature/[featureId]',
                    params: { featureId: String(selected.feature.id), projectId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Open full feature inspection"
              >
                <Text style={[styles.openBtnText, { color: colors.onPrimary }]}>
                  Open full inspection
                </Text>
                <ChevronRight size={18} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function labelFor(feature: Feature, key: string): string {
  const field = feature.field_schema?.find((f) => f.key === key);
  return field?.label ?? key.replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { ...Type.meta, marginTop: 2 },
  mapWrap: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  centerText: { ...Type.body, textAlign: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '600' },
  layerBar: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.md,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  layerChipText: { ...Type.label, fontWeight: '600' },
  layerPanel: {
    position: 'absolute',
    top: 88,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  panelTitle: { ...Type.title, marginBottom: Spacing.sm },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 40,
  },
  layerDot: { width: 10, height: 10, borderRadius: 5 },
  layerName: { flex: 1, fontSize: 14 },
  layerCount: { ...Type.meta },
  sheet: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sheetLayer: { ...Type.meta, textTransform: 'uppercase', letterSpacing: 0.4 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 5,
  },
  detailKey: { ...Type.meta, flex: 1 },
  detailValue: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  openBtnText: { ...Type.label, fontWeight: '700' },
});
