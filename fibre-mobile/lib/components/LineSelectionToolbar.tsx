// ── Line Selection Toolbar ──────────────────────────────────────────────────
// Bottom toolbar that appears when a LINE feature is tapped on the map.
// Move + Save buttons are wired. Remaining 7 buttons are disabled placeholders.
//
// Active actions:
//   Move — toggles Move Mode (displays draggable vertex handles)
//   Save — persists the temporary geometry to the survey-features store
//
// Placeholder actions (disabled — wiring comes in a future phase):
//   Split · Draw Alternative · Delete Section · Change Type
//   Delete Feature · Continue · Undo

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import type { EditingFeature } from './GeometryEditor';

// ── Types ──────────────────────────────────────────────────────────────────

interface LineSelectionToolbarProps {
  /** The currently selected line feature (null = toolbar hidden) */
  selectedFeature: EditingFeature | null;
  /** Called when user taps the X / Close button to deselect */
  onDeselect: () => void;
  /** Number of undo entries available (for badge display) */
  undoCount?: number;
  /** Called when the Undo button is tapped */
  onUndo?: () => void;
  /** Whether Move Mode is currently active */
  moveMode?: boolean;
  /** Called when user taps the Move button */
  onToggleMove?: () => void;
  /** Called when user taps the Add Vertex button */
  onToggleAddVertex?: () => void;
  /** Whether Add Vertex Mode is currently active */
  addVertexMode?: boolean;
  /** Called when user taps the Save button */
  onSave?: () => void;
  /** Whether there are unsaved geometry changes in Move Mode */
  hasUnsavedChanges?: boolean;
}

// ── Action definitions ─────────────────────────────────────────────────────

interface ActionDef {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
  accent?: boolean;
  /** Whether this button is enabled (not a placeholder) */
  enabled?: boolean;
}

const ACTIONS: ActionDef[] = [
  { id: 'move', label: 'Move', icon: '↔️', enabled: true },
  { id: 'add_vertex', label: 'Add Vertex', icon: '➕', enabled: true },
  { id: 'split', label: 'Split', icon: '✂️' },
  { id: 'draw_alt', label: 'Draw Alt', icon: '📐' },
  { id: 'del_section', label: 'Del Section', icon: '🪓', danger: true },
  { id: 'change_type', label: 'Change Type', icon: '🔄' },
  { id: 'del_feature', label: 'Delete', icon: '🗑️', danger: true },
  { id: 'continue', label: 'Continue', icon: '▶️', accent: true },
  { id: 'undo', label: 'Undo', icon: '↩️' },
  { id: 'save', label: 'Save', icon: '💾', accent: true, enabled: true },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function LineSelectionToolbar({
  selectedFeature,
  onDeselect,
  undoCount = 0,
  onUndo,
  moveMode = false,
  onToggleMove,
  onToggleAddVertex,
  addVertexMode = false,
  onSave,
  hasUnsavedChanges = false,
}: LineSelectionToolbarProps) {
  const colors = useThemeStore((s) => s.colors);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const isVisible = selectedFeature !== null && selectedFeature.geometryType === 'LineString';

  // Slide-up animation when the toolbar appears
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isVisible ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.back(1.1)),
      useNativeDriver: true,
    }).start();
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface + 'F8',
          borderColor: moveMode ? '#FF8C00' : colors.outline,
          opacity: slideAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [80, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* ── Header: selected feature info + close button ─────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.outlineLight }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.geomDot, { backgroundColor: moveMode ? '#FF8C00' : '#F59E0B' }]} />
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedFeature?.name ?? 'Selected Line'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
              {selectedFeature?.layerName ?? 'Line Layer'} · LineString
              {addVertexMode && ' · Tap segment to add vertex'}
              {moveMode && ' · Move Mode'}
              {moveMode && hasUnsavedChanges && ' · Unsaved'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.background }]}
          onPress={onDeselect}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Action buttons ────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionsContainer}
      >
        {ACTIONS.map((action) => {
          const isUndo = action.id === 'undo';
          const isMove = action.id === 'move';
          const isAddVertex = action.id === 'add_vertex';
          const isSave = action.id === 'save';
          const showBadge = isUndo && undoCount > 0;

          // ── Determine button state ──
          const isEnabled = action.enabled === true;
          const isMoveActive = isMove && moveMode;
          const isVertexActive = isAddVertex && addVertexMode;
          const isSaveActive = isSave && hasUnsavedChanges;

          // Style overrides for active states
          let bgColor = colors.background;
          let borderColor = colors.outlineLight;
          let textColor = colors.textTertiary;
          let opacity = 0.45; // disabled placeholder look

          if (isEnabled) {
            opacity = 1;
            textColor = colors.textSecondary;
            if (isMoveActive) {
              bgColor = '#FF8C00' + '20';
              borderColor = '#FF8C00';
              textColor = '#FF8C00';
            } else if (isVertexActive) {
              bgColor = '#22C55E' + '20';
              borderColor = '#22C55E';
              textColor = '#22C55E';
            } else if (isSaveActive) {
              bgColor = colors.primary + '20';
              borderColor = colors.primary;
              textColor = colors.primary;
            } else if (isSave && !hasUnsavedChanges) {
              opacity = 0.5;
            }
          }

          return (
            <View key={action.id} style={styles.actionWrapper}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: bgColor,
                    borderColor,
                    opacity,
                  },
                ]}
                disabled={!isEnabled || (isSave && !hasUnsavedChanges) || (moveMode && !isSave && !isMove && !isUndo)}
                activeOpacity={0.7}
                onPress={() => {
                  if (isMove && onToggleMove) onToggleMove();
                  else if (isAddVertex && onToggleAddVertex) onToggleAddVertex();
                  else if (isSave && onSave) onSave();
                  else if (isUndo && onUndo) onUndo();
                }}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text
                  style={[styles.actionLabel, { color: textColor }]}
                  numberOfLines={1}
                >
                  {isMove && moveMode ? 'Move: ON' : isAddVertex && addVertexMode ? 'Vertex: ON' : action.label}
                </Text>
              </TouchableOpacity>

              {/* Badge for Undo count */}
              {showBadge && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>
                    {undoCount > 99 ? '99+' : undoCount}
                  </Text>
                </View>
              )}

              {/* "Soon" label for placeholder buttons only */}
              {!isEnabled && (
                <Text style={[styles.soonLabel, { color: colors.textTertiary }]}>
                  Soon
                </Text>
              )}
              {/* Status label for enabled buttons */}
              {isEnabled && isMove && (
                <Text style={[styles.soonLabel, { color: moveMode ? '#FF8C00' : colors.textTertiary }]}>
                  {moveMode ? 'Active' : 'Tap to start'}
                </Text>
              )}
              {isEnabled && isSave && (
                <Text style={[styles.soonLabel, { color: hasUnsavedChanges ? colors.primary : colors.textTertiary }]}>
                  {hasUnsavedChanges ? 'Unsaved' : 'No changes'}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Hint text ──────────────────────────────────────────────────── */}
      <Text style={[styles.hintText, { color: colors.textTertiary }]}>
        {moveMode
          ? 'Drag vertex handles to adjust the line · Tap Save to persist · Tap Move again to cancel'
          : 'Tap empty area or ✕ to deselect'}
      </Text>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xxl + 100, // Above the FABs
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },

  // ── Header ─────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  geomDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerInfo: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '500',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Actions scroll row ─────────────────────────────────────────────────
  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'flex-start',
  },
  actionWrapper: {
    alignItems: 'center',
    width: 60,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    width: 52,
    height: 52,
    gap: 2,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionLabel: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Badge ──────────────────────────────────────────────────────────────
  badge: {
    position: 'absolute',
    top: -4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Status/Soon label under each button ────────────────────────────────
  soonLabel: {
    fontSize: 7,
    fontWeight: '500',
    marginTop: 3,
    fontStyle: 'italic',
  },

  // ── Hint text at bottom ────────────────────────────────────────────────
  hintText: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.xs,
  },
});
