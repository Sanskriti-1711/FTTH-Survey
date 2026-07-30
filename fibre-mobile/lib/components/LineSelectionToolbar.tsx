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
  /** Called when user taps the Save button */
  onSave?: () => void;
  /** Called when user taps the Delete Section button */
  onDeleteSection?: () => void;
  /** Whether delete-section mode is active */
  deleteSectionMode?: boolean;
  /** Current step: 0=none, 1=start selected, 2=both selected */
  deleteSectionStep?: number;
  /** Called when user confirms (both vertices selected + re-taps button) */
  onDeleteConfirm?: () => void;
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
  { id: 'split', label: 'Split', icon: '✂️' },
  { id: 'draw_alt', label: 'Draw Alt', icon: '📐' },
  { id: 'del_section', label: 'Del Section', icon: '🪓', danger: true, enabled: true },
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
  onSave,
  onDeleteSection,
  deleteSectionMode = false,
  deleteSectionStep = 0,
  onDeleteConfirm,
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
              {moveMode && ' · Move Mode'}
              {deleteSectionMode && ` · Del Section ${deleteSectionStep === 0 ? '' : deleteSectionStep === 1 ? '(select end)' : '(confirm)'}`}
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
          const isSave = action.id === 'save';
          const isDeleteSection = action.id === 'del_section';
          const showBadge = isUndo && undoCount > 0;

          // ── Determine button state ──
          const isEnabled = action.enabled === true;
          const isMoveActive = isMove && moveMode;
          const isSaveActive = isSave && hasUnsavedChanges;
          const isDeleteActive = isDeleteSection && deleteSectionMode;

          // Style overrides for active states
          let bgColor = colors.background;
          let borderColor = colors.outlineLight;
          let textColor = colors.textTertiary;
          let opacity = 0.45; // disabled placeholder look
          let iconColor = undefined;

          if (isEnabled) {
            opacity = 1;
            textColor = colors.textSecondary;
            if (isMoveActive || isDeleteActive) {
              bgColor = '#FF8C00' + '20';
              borderColor = '#FF8C00';
              textColor = '#FF8C00';
            } else if (isSaveActive) {
              bgColor = colors.primary + '20';
              borderColor = colors.primary;
              textColor = colors.primary;
            } else if (isSave && !hasUnsavedChanges) {
              // Save is enabled but nothing to save — dim it
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
                disabled={!isEnabled || (isSave && !hasUnsavedChanges)}
                activeOpacity={0.7}
                onPress={() => {
                  if (isDeleteSection && deleteSectionStep === 2 && onDeleteConfirm) onDeleteConfirm();
                  else if (isMove && onToggleMove) onToggleMove();
                  else if (isSave && onSave) onSave();
                  else if (isDeleteSection && onDeleteSection) onDeleteSection();
                  else if (isUndo && onUndo) onUndo();
                }}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text
                  style={[styles.actionLabel, { color: textColor }]}
                  numberOfLines={1}
                >
                  {isMove && moveMode ? 'Move: ON' : isDeleteSection && deleteSectionMode ? (deleteSectionStep === 2 ? 'Confirm' : 'Del: ON') : action.label}
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

              {isEnabled && isDeleteSection && (
                <Text style={[styles.soonLabel, { color: deleteSectionMode ? '#FF8C00' : colors.textTertiary }]}>
                  {deleteSectionMode ? (deleteSectionStep === 1 ? 'Tap end' : deleteSectionStep === 2 ? 'Confirm' : 'Ready') : 'Tap to start'}
                </Text>
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
          : deleteSectionMode
            ? deleteSectionStep === 0 ? 'Tap the line near a vertex to select start point'
            : deleteSectionStep === 1 ? 'Tap the line near another vertex to select end point'
            : 'Tap Confirm to remove the section, or ✕ to cancel'
          : 'Tap empty area or ✕ to deselect'}
      </Text>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xxl + 80, // Above the FABs, slightly lower
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  geomDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerInfo: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: '500',
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Actions scroll row ─────────────────────────────────────────────────
  actionsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  actionWrapper: {
    alignItems: 'center',
    width: 50,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    width: 44,
    height: 44,
    gap: 1,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionLabel: {
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Badge ──────────────────────────────────────────────────────────────
  badge: {
    position: 'absolute',
    top: -3,
    right: 3,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Status/Soon label under each button ────────────────────────────────
  soonLabel: {
    fontSize: 6,
    fontWeight: '500',
    marginTop: 2,
    fontStyle: 'italic',
  },

  // ── Hint text at bottom ────────────────────────────────────────────────
  hintText: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    paddingBottom: 4,
    paddingTop: 2,
  },
});
