// ── Polygon Selection Toolbar ────────────────────────────────────────────────
// Bottom toolbar that appears when a POLYGON feature is tapped on the map.
// Vertex handles appear automatically — this toolbar provides Save/Cancel/Undo.
//
// Active actions:
//   Save — persists the temporary polygon geometry to the survey-features store
//   Cancel — discards changes and exits polygon editing
//   Undo — reverts the last vertex drag

import React, { useEffect, useRef, useState } from 'react';
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

interface PolygonToolbarProps {
  /** The currently selected polygon feature (null = toolbar hidden) */
  selectedFeature: EditingFeature | null;
  /** Called when user taps the X / Close button to deselect */
  onDeselect: () => void;
  /** Number of undo entries available (for badge display) */
  undoCount?: number;
  /** Called when the Undo button is tapped */
  onUndo?: () => void;
  /** Called when user taps the Save button */
  onSave?: () => void;
  /** Called when user taps the Cancel button */
  onCancel?: () => void;
  /** Whether there are unsaved geometry changes */
  hasUnsavedChanges?: boolean;
  /** Called when user confirms deleting the polygon */
  onDelete?: () => void;
}

// ── Action definitions ─────────────────────────────────────────────────────

interface ActionDef {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
  accent?: boolean;
  enabled?: boolean;
}

const ACTIONS: ActionDef[] = [
  { id: 'undo', label: 'Undo', icon: '↩️', enabled: true },
  { id: 'cancel', label: 'Cancel', icon: '✕', danger: true, enabled: true },
  { id: 'delete', label: 'Delete', icon: '🗑️', danger: true, enabled: true },
  { id: 'save', label: 'Save', icon: '💾', accent: true, enabled: true },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function PolygonToolbar({
  selectedFeature,
  onDeselect,
  undoCount = 0,
  onUndo,
  onSave,
  onCancel,
  hasUnsavedChanges = false,
  onDelete,
}: PolygonToolbarProps) {
  const colors = useThemeStore((s) => s.colors);
  const slideAnim = useRef(new Animated.Value(0)).current;
  // Delete confirm state — first tap arms, second tap deletes
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isVisible = selectedFeature !== null && selectedFeature.geometryType === 'Polygon';

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
          borderColor: hasUnsavedChanges ? '#8B5CF6' : colors.outline,
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
          <View style={[styles.geomDot, { backgroundColor: '#8B5CF6' }]} />
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedFeature?.name ?? 'Selected Polygon'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
              {selectedFeature?.layerName ?? 'Polygon Layer'} · Polygon
              {hasUnsavedChanges && ' · Unsaved'}
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
        {ACTIONS.filter((a) => !(a.id === 'delete' && !onDelete)).map((action) => {
          const isUndo = action.id === 'undo';
          const isSave = action.id === 'save';
          const isCancel = action.id === 'cancel';
          const isDelete = action.id === 'delete';
          const showBadge = isUndo && undoCount > 0;

          const isEnabled = action.enabled === true;
          const isSaveActive = isSave && hasUnsavedChanges;
          const isDeleteArmed = isDelete && confirmDelete;

          let bgColor = colors.background;
          let borderColor = colors.outlineLight;
          let textColor = colors.textTertiary;
          let opacity = 0.45;

          if (isEnabled) {
            opacity = 1;
            textColor = colors.textSecondary;
            if (isSaveActive) {
              bgColor = colors.primary + '20';
              borderColor = colors.primary;
              textColor = colors.primary;
            } else if (isSave && !hasUnsavedChanges) {
              opacity = 0.5;
            } else if (isDelete) {
              bgColor = isDeleteArmed ? '#EF4444' + '25' : '#EF4444' + '10';
              borderColor = isDeleteArmed ? '#EF4444' : '#EF4444' + '55';
              textColor = isDeleteArmed ? '#EF4444' : '#EF4444' + 'CC';
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
                  if (isSave && onSave) onSave();
                  else if (isCancel && onCancel) onCancel();
                  else if (isUndo && onUndo) onUndo();
                  else if (isDelete) {
                    if (!onDelete) return;
                    if (confirmDelete) {
                      setConfirmDelete(false);
                      onDelete();
                    } else {
                      setConfirmDelete(true);
                      setTimeout(() => setConfirmDelete(false), 4000);
                    }
                  }
                }}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text
                  style={[styles.actionLabel, { color: textColor }]}
                  numberOfLines={1}
                >
                  {isDeleteArmed ? 'Confirm?' : action.label}
                </Text>
              </TouchableOpacity>

              {showBadge && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>
                    {undoCount > 99 ? '99+' : undoCount}
                  </Text>
                </View>
              )}

              {isEnabled && isSave && (
                <Text style={[styles.statusLabel, { color: hasUnsavedChanges ? colors.primary : colors.textTertiary }]}>
                  {hasUnsavedChanges ? 'Unsaved' : 'No changes'}
                </Text>
              )}
              {isEnabled && isCancel && (
                <Text style={[styles.statusLabel, { color: colors.textTertiary }]}>
                  Discard
                </Text>
              )}
              {isEnabled && isUndo && (
                <Text style={[styles.statusLabel, { color: colors.textTertiary }]}>
                  {undoCount > 0 ? `${undoCount} steps` : 'Empty'}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Hint text ──────────────────────────────────────────────────── */}
      <Text style={[styles.hintText, { color: colors.textTertiary }]}>
        {hasUnsavedChanges
          ? 'Drag corners to adjust · Tap Save to persist · Tap Cancel to discard'
          : 'Drag corners to adjust the polygon · Tap ✕ to deselect'}
      </Text>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xxl + 80,
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
  statusLabel: {
    fontSize: 6,
    fontWeight: '500',
    marginTop: 2,
    fontStyle: 'italic',
  },
  hintText: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    paddingBottom: 4,
    paddingTop: 2,
  },
});