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
} from '../utils/geometry-operations';

// ── Types ────────────────────────────────────────────────────────────────

export type GeometryMode = 'select' | 'split' | 'merge' | 'draw_bypass' | 'edit_vertices';

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
];

// ── Component ────────────────────────────────────────────────────────────

export default function GeometryEditor({
  mode,
  onModeChange,
  onFeatureAction,
  onEmptyMapClick,
  onClearDrawPoints,
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
                  ? 'Tap on the map to place the first vertex of your bypass line.'
                  : `Tap to add point #${drawPoints.length + 1}. Double-tap or tap "Finish" to create the line.`
              )}
              {mode === 'edit_vertices' && (
                vertexEdit
                  ? `Dragging vertex #${(vertexEdit.vertexIdx ?? 0) + 1} — move your cursor to adjust the line`
                  : 'Tap a line to see its vertices, then drag to adjust.'
              )}
              {mode === 'select' && 'Choose a geometry tool above to start editing.'}
            </Text>
          </View>

          {/* Draw bypass action buttons */}
          {mode === 'draw_bypass' && drawPoints.length >= 2 && (
            <View style={styles.drawActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                onPress={() => {
                  const coords = createLineString(drawPoints);
                  if (coords) {
                    const feature = createGeoJSONFeature(coords, 'trenches', {
                      name: `Bypass #${Date.now() % 10000}`,
                      construction_type: 'new_trench',
                      survey_notes: 'New bypass drawn on map',
                    });
                    onGeometryChange('trenches', 'create', [feature], `Created bypass trench with ${coords.length} vertices`);
                  }
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
});
