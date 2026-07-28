// ── Geometry Editor Component ─────────────────────────────────────────────
// Floating toolbar + interaction state machine for Phase 2 geometry editing:
//   • Split Trench   — Click a line to split it at that point
//   • Merge Trenches — Select two lines to merge into one
//   • Draw Bypass    — Click points on the map to draw a new line
//   • Edit Vertices  — Click a line to drag individual vertices
//
// This component sits as an overlay on the map and communicates geometry
// changes back via the `onGeometryChange` callback.

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Platform,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import type { GeoJSONFeature } from '../utils/types';
import {
  splitLineAtPoint,
  mergeLines,
  createLineString,
  findNearestVertex,
  updateVertex,
  createGeoJSONFeature,
  findNearestEndpoint,
  extendLineString,
  approximateLength,
  EndpointGridIndex,
} from '../utils/geometry-operations';

// ── Types ────────────────────────────────────────────────────────────────

export type GeometryMode = 'select' | 'split' | 'merge' | 'draw_bypass' | 'edit_vertices' | 'add_point' | 'delete_feature';

interface GeometryEditorProps {
  /** Currently active mode */
  mode: GeometryMode;
  /** Called when the user changes mode */
  onModeChange: (mode: GeometryMode) => void;
  /** Called when a geometry operation modifies features */
  onGeometryChange: (
    layerId: string,
    action: 'split' | 'merge' | 'create' | 'vertex_update',
    updatedFeatures: GeoJSONFeature[],
    description: string,
  ) => void;
  /** Called when a feature is clicked in a geometry mode (returns feature + click coords) */
  onFeatureAction: (
    featureId: string,
    layerId: string,
    lng: number,
    lat: number,
    mode: GeometryMode,
  ) => void;
  /** Called when the user clicks on empty map area in draw mode */
  onEmptyMapClick: (lng: number, lat: number) => void;
  /** Called when the user clears draw points */
  onClearDrawPoints?: () => void;
  /** Called when the user deletes the currently selected vertex */
  onDeleteVertex?: () => void;
  /** Point layers available for adding new features */
  addPointLayers?: { id: string; name: string }[];
  /** Currently selected add-point target layer ID */
  addPointTargetLayer?: string;
  /** Called when user selects a target layer for add_point mode */
  onAddPointLayerChange?: (layerId: string) => void;
  /** Line layers available for drawing new segments */
  drawLineLayers?: { id: string; name: string }[];
  /** Currently selected draw target layer ID */
  drawTargetLayer?: string;
  /** Called when user selects a target layer for draw_bypass mode */
  onDrawLayerChange?: (layerId: string) => void;
  /** Current GeoJSON features keyed by layer ID */
  allGeojson: Record<string, GeoJSONFeature[]>;
  /** Currently selected feature IDs for merge (first, second) */
  mergeSelection?: [string | null, string | null];
  /** Collected draw points for bypass creation */
  drawPoints?: [number, number][];
  /** Currently edited vertex info */
  vertexEdit?: { featureId: string; layerId: string; vertexIdx: number } | null;
  /** Whether any operation is pending/in-progress */
  isBusy?: boolean;
}

// ── Mode Definitions ─────────────────────────────────────────────────────

interface ModeDef {
  id: GeometryMode;
  label: string;
  icon: string;
  description: string;
  color: string;
  cursor: string;
}

const MODES: ModeDef[] = [
  { id: 'select', label: 'Select', icon: '👆', description: 'Default — tap features to inspect', color: '#6B7280', cursor: 'default' },
  { id: 'split', label: 'Split', icon: '✂️', description: 'Tap a line to split it at that point', color: '#F59E0B', cursor: 'crosshair' },
  { id: 'merge', label: 'Merge', icon: '🔗', description: 'Tap two lines to merge them into one', color: '#8B5CF6', cursor: 'pointer' },
  { id: 'draw_bypass', label: 'Draw', icon: '✏️', description: 'Click points to draw a new bypass line', color: '#10B981', cursor: 'crosshair' },
  { id: 'edit_vertices', label: 'Vertices', icon: '🔷', description: 'Tap line then drag its vertices', color: '#3B82F6', cursor: 'grab' },
  { id: 'add_point', label: 'Add Point', icon: '📍', description: 'Tap map to add a new point feature (premise, PDP, etc.)', color: '#EC4899', cursor: 'crosshair' },
  { id: 'delete_feature', label: 'Delete', icon: '🗑️', description: 'Tap any feature to remove it from the survey', color: '#EF4444', cursor: 'pointer' },
];

// ── Component ────────────────────────────────────────────────────────────

export default function GeometryEditor({
  mode,
  onModeChange,
  onFeatureAction,
  onEmptyMapClick,
  onClearDrawPoints,
  onDeleteVertex,
  addPointLayers = [],
  addPointTargetLayer,
  onAddPointLayerChange,
  drawLineLayers = [],
  drawTargetLayer,
  onDrawLayerChange,
  onGeometryChange,
  allGeojson,
  mergeSelection = [null, null],
  drawPoints = [],
  vertexEdit = null,
  isBusy = false,
}: GeometryEditorProps) {
  const colors = useThemeStore((s) => s.colors);
  const [expanded, setExpanded] = useState(false);
  const [drawActive, setDrawActive] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const currentMode = useMemo(
    () => MODES.find((m) => m.id === mode) ?? MODES[0],
    [mode],
  );

  // Animate slide
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: expanded ? 1 : 0,
      duration: 250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [expanded]);

  // Auto-expand when entering a geometry mode
  useEffect(() => {
    if (mode !== 'select') setExpanded(true);
  }, [mode]);

  // Track draw state for UI hints
  useEffect(() => {
    setDrawActive(mode === 'draw_bypass');
  }, [mode]);

  const handleModeTap = useCallback((newMode: GeometryMode) => {
    if (isBusy) return;
    // Toggle select → same mode = return to select
    if (newMode === mode && newMode !== 'select') {
      onModeChange('select');
      return;
    }
    onModeChange(newMode);
  }, [mode, isBusy, onModeChange]);

  const toolbarHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 280],
  });

  // ── Render mode button ─────────────────────────────────────────────────
  const renderModeBtn = (m: ModeDef) => {
    const isActive = mode === m.id;
    return (
      <TouchableOpacity
        key={m.id}
        style={[
          styles.modeBtn,
          {
            backgroundColor: isActive ? m.color + '20' : colors.surface,
            borderColor: isActive ? m.color : colors.outline,
          },
        ]}
        onPress={() => handleModeTap(m.id)}
        activeOpacity={0.7}
        disabled={isBusy}
      >
        <Text style={styles.modeIcon}>{m.icon}</Text>
        <Text
          style={[
            styles.modeLabel,
            { color: isActive ? m.color : colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {m.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface + 'F0',
          borderColor: colors.outline,
          maxHeight: expanded ? 320 : 52,
        },
      ]}
    >
      {/* Header / Minimized view */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.modeIcon}>{currentMode.icon}</Text>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {mode === 'select' ? 'Geometry Tools' : `${currentMode.label} Mode`}
            </Text>
            {mode !== 'select' && (
              <Text style={[styles.headerDesc, { color: colors.textTertiary }]} numberOfLines={1}>
                {currentMode.description}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.miniBtn, { backgroundColor: colors.background }]}
          onPress={() => mode !== 'select' && onModeChange('select')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>
            {expanded ? (mode !== 'select' ? '✕' : '−') : '+'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Expanded toolbar */}
      {expanded && (
        <View style={styles.body}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modesRow}
          >
            {MODES.map(renderModeBtn)}
          </ScrollView>

          {/* Mode-specific instructions */}
          <View
            style={[
              styles.instructionBox,
              { backgroundColor: currentMode.color + '10' },
            ]}
          >
            <Text style={[styles.instructionIcon]}>
              {mode === 'split' && '✂️'}
              {mode === 'merge' && '🔗'}
              {mode === 'draw_bypass' && '✏️'}
              {mode === 'edit_vertices' && '🔷'}
              {mode === 'add_point' && '📍'}
              {mode === 'delete_feature' && '🗑️'}
              {mode === 'select' && '👆'}
            </Text>
            <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
              {mode === 'split' && 'Tap any trench/duct/cable line to split it at that point.'}
              {mode === 'merge' && (
                mergeSelection[0]
                  ? `First line selected. Now tap the second line to merge.`
                  : 'Tap the first line to start merging.'
              )}
              {mode === 'draw_bypass' && (
                drawPoints.length === 0
                  ? (drawTargetLayer
                      ? 'Tap on the map to place the first vertex. Endpoints snap to existing features.'
                      : 'Select a draw layer below, then tap the map to start drawing.')
                  : `Tap to add point #${drawPoints.length + 1}. Snap markers guide each end to existing lines.`
              )}
              {mode === 'edit_vertices' && (
                vertexEdit
                  ? `Vertex #${(vertexEdit.vertexIdx ?? 0) + 1} selected — drag to move it, or tap a segment to add a vertex.`
                  : 'Tap a line to see its vertices, then drag to adjust.'
              )}
              {mode === 'add_point' && (
                addPointTargetLayer
                  ? `Tap on the map to place a new ${addPointLayers.find(l => l.id === addPointTargetLayer)?.name ?? 'point'}.`
                  : 'Select a target layer below, then tap the map to add a point.'
              )}
              {mode === 'delete_feature' && 'Tap any feature to permanently remove it from this project. This action cannot be undone — use with caution.'}
              {mode === 'select' && 'Choose a geometry tool above to start editing.'}
            </Text>
          </View>

          {/* Draw bypass action buttons */}
          {mode === 'draw_bypass' && drawPoints.length >= 2 && (
            <View style={styles.drawActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                onPress={() => {
                  if (!drawTargetLayer) {
                    console.warn('[Draw] No target layer selected');
                    return;
                  }
                  const rawCoords = createLineString(drawPoints);
                  if (!rawCoords) return;

                  // ── Snap first and last points to nearest existing endpoints ──
                  // Build a spatial index ONCE and reuse for both queries (O(1) each)
                  const targetFeatures = allGeojson[drawTargetLayer] ?? [];
                  const snapIndex =
                    targetFeatures.length > 20
                      ? new EndpointGridIndex(targetFeatures)
                      : undefined;
                  const firstSnap = findNearestEndpoint(rawCoords[0], targetFeatures, 10, snapIndex);
                  const lastSnap = findNearestEndpoint(rawCoords[rawCoords.length - 1], targetFeatures, 10, snapIndex);

                  const snappedCoords: [number, number][] = rawCoords.map((c) => [...c] as [number, number]);
                  if (firstSnap) {
                    snappedCoords[0] = [firstSnap.coord[0], firstSnap.coord[1]];
                  }
                  if (lastSnap) {
                    snappedCoords[snappedCoords.length - 1] = [lastSnap.coord[0], lastSnap.coord[1]];
                  }

                  // ── Helper: find a feature by its ID in the target layer ──
                  const findFeature = (fid: string) =>
                    targetFeatures.find((f) => {
                      const id = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
                      return id === fid;
                    });

                  // ── 4-Case Merge-on-Snap decision ────────────────────────
                  const caseBothDifferent = firstSnap && lastSnap && firstSnap.featureId !== lastSnap.featureId;
                  const caseBothSame = firstSnap && lastSnap && firstSnap.featureId === lastSnap.featureId;
                  const caseOneSnap = (firstSnap && !lastSnap) || (!firstSnap && lastSnap);
                  const caseNoSnap = !firstSnap && !lastSnap;

                  if (caseBothDifferent) {
                    // ── Case A: Connect two different existing features ──
                    const featA = findFeature(firstSnap!.featureId);
                    const featB = findFeature(lastSnap!.featureId);
                    if (featA && featB && featA.geometry?.type === 'LineString' && featB.geometry?.type === 'LineString') {
                      let coordsA = featA.geometry.coordinates as [number, number][];
                      let coordsB = featB.geometry.coordinates as [number, number][];
                      // Reverse existingA if new segment snapped to its START (so snapped end comes last)
                      if (firstSnap!.whichEnd === 'start') {
                        coordsA = [...coordsA].reverse() as [number, number][];
                      }
                      // Reverse existingB if new segment snapped to its END (so snapped end comes first)
                      if (lastSnap!.whichEnd === 'end') {
                        coordsB = [...coordsB].reverse() as [number, number][];
                      }
                      const merged = extendLineString(coordsA, snappedCoords, 'connect', coordsB);
                      if (merged) {
                        const mergedFeat = createGeoJSONFeature(merged, drawTargetLayer, {
                          ...(featA.properties ?? {}),
                          name: `${(featA.properties as any)?.name ?? 'Feat'} + Draw`,
                          merged_from: [firstSnap!.featureId, lastSnap!.featureId].join(','),
                          drawn_segment_length_m: Math.round(approximateLength(snappedCoords)),
                          total_length_m: Math.round(approximateLength(merged)),
                          survey_notes: `Connected ${(featA.properties as any)?.name ?? 'A'} + drawn segment + ${(featB.properties as any)?.name ?? 'B'}`,
                        });
                        const updated = targetFeatures
                          .filter((f) => {
                            const id = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
                            return id !== firstSnap!.featureId && id !== lastSnap!.featureId;
                          })
                          .concat([mergedFeat]);
                        onGeometryChange(drawTargetLayer, 'merge', updated,
                          `Connected "${(featA.properties as any)?.name ?? 'A'}" → drawn segment → "${(featB.properties as any)?.name ?? 'B'}" (merged into 1 line)`);
                        return;
                      }
                      console.warn('[Draw] extendLineString connect returned null — falling back to standalone');
                    }
                    // Fall through to standalone if merge fails
                  }

                  if (caseBothSame) {
                    // ── Case B: Both ends snap to the same feature — extend it ──
                    // Guard: if both ends snap to the IDENTICAL endpoint, fall through to standalone
                    if (firstSnap!.coord[0] === lastSnap!.coord[0] && firstSnap!.coord[1] === lastSnap!.coord[1]) {
                      console.warn('[Draw] bothSame but same endpoint — falling back to standalone');
                    } else {
                      const feat = findFeature(firstSnap!.featureId);
                      if (feat && feat.geometry?.type === 'LineString') {
                        const existingCoords = feat.geometry.coordinates as [number, number][];
                        const distToExistingStart = approximateLength([snappedCoords[0], existingCoords[0]]);
                        const distToExistingEnd = approximateLength([snappedCoords[0], existingCoords[existingCoords.length - 1]]);
                        const mode = distToExistingStart < distToExistingEnd ? 'prepend' : 'append';
                        const merged = extendLineString(existingCoords, snappedCoords, mode);
                        if (merged) {
                          const updatedFeat = {
                            ...feat,
                            geometry: { ...feat.geometry, coordinates: merged },
                            properties: {
                              ...(feat.properties ?? {}),
                              extended_by_draw: true,
                              survey_notes: `Extended via drawn segment (now ${merged.length} vertices)`,
                              length_m: Math.round(approximateLength(merged)),
                            },
                          };
                          const updated = targetFeatures.map((f) => {
                            const id = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
                            return id === firstSnap!.featureId ? updatedFeat : f;
                          });
                          onGeometryChange(drawTargetLayer, 'merge', updated,
                            `Extended "${(feat.properties as any)?.name ?? 'feature'}" with drawn segment (${snappedCoords.length} pts, now ${merged.length} vertices)`);
                          return;
                        }
                        console.warn('[Draw] extendLineString append/prepend returned null (bothSame case) — falling back to standalone');
                      }
                    }
                    // Fall through to standalone
                  }

                  if (caseOneSnap) {
                    // ── Case C: One end snaps to an existing feature — extend it ──
                    const snap = firstSnap ?? lastSnap!;
                    const snapEnd = firstSnap?.whichEnd ?? lastSnap?.whichEnd ?? 'end';
                    const feat = findFeature(snap.featureId);
                    if (feat && feat.geometry?.type === 'LineString') {
                      const existingCoords = feat.geometry.coordinates as [number, number][];
                      // Determine mode: if snapping to start of existing, prepend; if to end, append
                      const mode: 'append' | 'prepend' = snapEnd === 'end' ? 'append' : 'prepend';
                      const merged = extendLineString(existingCoords, snappedCoords, mode);
                      if (merged) {
                        const updatedFeat = {
                          ...feat,
                          geometry: { ...feat.geometry, coordinates: merged },
                          properties: {
                            ...(feat.properties ?? {}),
                            extended_by_draw: true,
                            survey_notes: `Extended via drawn segment (now ${merged.length} vertices)`,
                            length_m: Math.round(approximateLength(merged)),
                          },
                        };
                        const updated = targetFeatures.map((f) => {
                          const id = (f.properties as any)?.id ?? (f.properties as any)?._id ?? '';
                          return id === snap.featureId ? updatedFeat : f;
                        });
                        onGeometryChange(drawTargetLayer, 'merge', updated,
                          `Extended "${(feat.properties as any)?.name ?? 'feature'}" with drawn segment (${mode === 'append' ? 'append' : 'prepend'}, ${snappedCoords.length} pts)`);
                        return;
                      }
                      console.warn('[Draw] extendLineString returned null (oneSnap case) — falling back to standalone');
                    }
                    // Fall through to standalone
                  }

                  // ── Case D: No snaps — create standalone feature ──────────
                  const standalone = createGeoJSONFeature(snappedCoords, drawTargetLayer, {
                    name: `Draw #${Date.now() % 10000}`,
                    survey_notes: `Drawn segment (${snappedCoords.length} vertices) — standalone`,
                    drawn_into_layer: drawTargetLayer,
                    standalone: true,
                  });
                  onGeometryChange(drawTargetLayer, 'create', [...targetFeatures, standalone],
                    `Created standalone segment in "${drawLineLayers.find(l => l.id === drawTargetLayer)?.name ?? drawTargetLayer}" (${snappedCoords.length} vertices)`);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnText}>✓ Finish ({drawPoints.length} pts)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                onPress={() => onClearDrawPoints?.()}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnText}>✕ Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Vertex edit action buttons */}
          {mode === 'edit_vertices' && vertexEdit && (
            <View style={styles.drawActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                onPress={() => onDeleteVertex?.()}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnText}>✕ Delete Vertex #{vertexEdit.vertexIdx + 1}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add point: layer picker */}
          {mode === 'add_point' && (
            <View style={styles.addPointLayerPicker}>
              <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Target layer:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {addPointLayers.map((layer) => (
                  <TouchableOpacity
                    key={layer.id}
                    style={[
                      styles.layerChip,
                      {
                        backgroundColor: addPointTargetLayer === layer.id ? '#EC4899' + '25' : colors.surface,
                        borderColor: addPointTargetLayer === layer.id ? '#EC4899' : colors.outline,
                      },
                    ]}
                    onPress={() => onAddPointLayerChange?.(layer.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.layerChipText,
                        { color: addPointTargetLayer === layer.id ? '#EC4899' : colors.textPrimary },
                      ]}
                    >
                      {layer.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Draw: layer picker */}
          {mode === 'draw_bypass' && (
            <View style={styles.addPointLayerPicker}>
              <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Draw into layer:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {drawLineLayers.map((layer) => (
                  <TouchableOpacity
                    key={layer.id}
                    style={[
                      styles.layerChip,
                      {
                        backgroundColor: drawTargetLayer === layer.id ? '#10B981' + '25' : colors.surface,
                        borderColor: drawTargetLayer === layer.id ? '#10B981' : colors.outline,
                      },
                    ]}
                    onPress={() => onDrawLayerChange?.(layer.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.layerChipText,
                        { color: drawTargetLayer === layer.id ? '#10B981' : colors.textPrimary },
                      ]}
                    >
                      {layer.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Merge info */}
          {mode === 'merge' && mergeSelection[0] && mergeSelection[1] && (
            <Text style={[styles.infoText, { color: colors.success }]}>
              ✓ Merge ready — check the result on the map
            </Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xxl + 100,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  headerInfo: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerDesc: {
    fontSize: 11,
  },
  miniBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.xs,
  },
  body: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  modesRow: {
    gap: Spacing.sm,
    paddingBottom: 2,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  modeIcon: {
    fontSize: 16,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  instructionIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  instructionText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  drawActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  addPointLayerPicker: {
    gap: 6,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  layerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  layerChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
