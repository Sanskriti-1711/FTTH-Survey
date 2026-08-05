// ── Geometry Editor Component ─────────────────────────────────────────────
// Two-mode editing toolbar:
//   VIEWING mode: minimal/small footprint, shows Add Point when active
//   EDITING mode: contextual toolbar based on feature geometry type
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
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import type { GeoJSONFeature } from '../utils/types';
// Line editing utilities (split, merge, draw, vertices) removed by user request.
// Custom rules for lines & polygons will be added later.

// ── Types ────────────────────────────────────────────────────────────────

export type GeometryMode = 'select' | 'add_point' | 'delete_feature';

/** Feature currently being edited — controls the contextual toolbar */
export interface EditingFeature {
  id: string;
  layerId: string;
  geometryType: 'Point' | 'LineString' | 'Polygon';
  name: string;
  layerName: string;
}

interface GeometryEditorProps {
  /** Currently active mode (for add_point / select) */
  mode: GeometryMode;
  /** Called when the user changes mode */
  onModeChange: (mode: GeometryMode) => void;
  /** Called when a geometry operation modifies features */
  onGeometryChange: (
    layerId: string,
    action: 'create',
    updatedFeatures: GeoJSONFeature[],
    description: string,
  ) => void;
  /** Called when the user clicks on empty map area in add_point mode */
  onEmptyMapClick: (lng: number, lat: number) => void;
  /** Point layers available for adding new features */
  addPointLayers?: { id: string; name: string }[];
  /** Currently selected add-point target layer ID */
  addPointTargetLayer?: string;
  /** Called when user selects a target layer for add_point mode */
  onAddPointLayerChange?: (layerId: string) => void;
  /** Whether any operation is pending/in-progress */
  isBusy?: boolean;

  // ── Editing mode props ───────────────────────────────────────────────
  /** Feature being edited (null = not in editing mode) */
  editingFeature: EditingFeature | null;
  /** Called when user taps Done to exit editing mode */
  onDoneEditing: () => void;
  /** Called when user deletes the current feature */
  onDeleteFeature: (featureId: string, layerId: string) => void;
  /** Whether drag mode is enabled (for Point features) */
  dragMode?: boolean;
  /** Called when drag mode is toggled */
  onDragModeChange?: (enabled: boolean) => void;
}

// ── Mode Definitions ─────────────────────────────────────────────────────

interface ModeDef {
  id: GeometryMode;
  label: string;
  icon: string;
  description: string;
  color: string;
}

const MODES: ModeDef[] = [
  { id: 'add_point', label: 'Add Point', icon: '📍', description: 'Tap map to add a new point feature', color: '#EC4899' },
];

// ── Component ────────────────────────────────────────────────────────────

export default function GeometryEditor({
  mode,
  onModeChange,
  onEmptyMapClick,
  addPointLayers = [],
  addPointTargetLayer,
  onAddPointLayerChange,
  onGeometryChange,
  isBusy = false,

  // Editing mode
  editingFeature,
  onDoneEditing,
  onDeleteFeature,
  dragMode = false,
  onDragModeChange,
}: GeometryEditorProps) {
  const colors = useThemeStore((s) => s.colors);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);

  const isEditing = editingFeature !== null;

  // Animate entrance
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.back(1.1)),
      useNativeDriver: true,
    }).start();
  }, []);

  // Auto-expand when entering add_point mode
  useEffect(() => {
    if (mode !== 'select' && !isEditing) {
      setExpanded(true);
    }
  }, [mode, isEditing]);

  const handleModeTap = useCallback((newMode: GeometryMode) => {
    if (isBusy) return;
    if (newMode === mode) {
      onModeChange('select');
      return;
    }
    onModeChange(newMode);
  }, [mode, isBusy, onModeChange]);

  // ── Render editing toolbar ─────────────────────────────────────────────
  if (isEditing && editingFeature) {
    const geomType = editingFeature.geometryType;
    const isPoint = geomType === 'Point';

    return (
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: colors.surface + 'F0',
            borderColor: colors.primary + '40',
            opacity: slideAnim,
            transform: [{ translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [40, 0],
            }) }],
          },
        ]}
      >
        {/* Editing header */}
        <View style={styles.editHeader}>
          <View style={styles.editHeaderLeft}>
            <View style={[styles.geomTypeDot, {
              backgroundColor: isPoint ? '#EC4899' : geomType === 'LineString' ? '#F59E0B' : '#8B5CF6',
            }]} />
            <View style={styles.editHeaderInfo}>
              <Text style={[styles.editTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {editingFeature.name}
              </Text>
              <Text style={[styles.editSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                {editingFeature.layerName} · {geomType}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={onDoneEditing}
            activeOpacity={0.7}
          >
            <Text style={[styles.doneBtnText, { color: colors.onPrimary }]}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Contextual tools */}
        <View style={styles.editTools}>
          {isPoint && (
            <TouchableOpacity
              style={[styles.editToolBtn, {
                backgroundColor: dragMode ? '#EC4899' + '20' : colors.background,
                borderColor: dragMode ? '#EC4899' : colors.outline,
              }]}
              onPress={() => onDragModeChange?.(!dragMode)}
              activeOpacity={0.7}
            >
              <Text style={styles.editToolIcon}>↕️</Text>
              <Text style={[styles.editToolLabel, {
                color: dragMode ? '#EC4899' : colors.textSecondary,
              }]}>
                {dragMode ? 'Drag: ON' : 'Drag'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.editToolBtn, {
              backgroundColor: '#EF4444' + '15',
              borderColor: '#EF4444',
            }]}
            onPress={() => {
              onDeleteFeature(editingFeature.id, editingFeature.layerId);
              onDoneEditing();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.editToolIcon}>🗑️</Text>
            <Text style={[styles.editToolLabel, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>

        </View>
      </Animated.View>
    );
  }

  // ── Render viewing toolbar (add_point mode) ─────────────────────────────
  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface + 'F0',
          borderColor: colors.outline,
          maxHeight: expanded ? 180 : 48,
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
          <Text style={{ fontSize: 16 }}>📍</Text>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {mode === 'add_point' ? 'Add Point Mode' : 'Tools'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.miniBtn, { backgroundColor: colors.background }]}
          onPress={() => mode !== 'select' && onModeChange('select')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>
            {mode !== 'select' ? '✕' : expanded ? '−' : '+'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Expanded body */}
      {expanded && (
        <View style={styles.body}>
          <View style={styles.modesRow}>
            {MODES.map((m) => {
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
                  <Text style={[styles.modeLabel, { color: isActive ? m.color : colors.textSecondary }]} numberOfLines={1}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Add point: layer picker */}
          {mode === 'add_point' && (
            <View style={styles.addPointLayerPicker}>
              <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Target layer:</Text>
              {addPointLayers.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
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
                      <Text style={[styles.layerChipText, { color: addPointTargetLayer === layer.id ? '#EC4899' : colors.textPrimary }]}>
                        {layer.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={[styles.pickerEmpty, { color: colors.textTertiary }]}>
                  No point layers available
                </Text>
              )}
            </View>
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
    flexDirection: 'row',
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
  pickerEmpty: {
    fontSize: 11,
    fontStyle: 'italic',
  },

  // ── Editing toolbar styles ───────────────────────────────────────────
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000010',
  },
  editHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  editHeaderInfo: {
    flex: 1,
    gap: 1,
  },
  editTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  editSubtitle: {
    fontSize: 10,
    fontWeight: '500',
  },
  geomTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  editTools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  editToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  editToolIcon: {
    fontSize: 14,
  },
  editToolLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
