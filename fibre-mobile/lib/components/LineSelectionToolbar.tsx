// ── Line Selection Toolbar ──────────────────────────────────────────────────
// Bottom toolbar that appears when a LINE feature is tapped on the map.
// Shows 9 disabled placeholder action buttons — no editing yet.
//
// Placeholder actions (all disabled — wiring comes in a future phase):
//   Move · Split · Draw Alternative · Delete Section · Change Type
//   Delete Feature · Continue · Undo · Save
//
// The toolbar disappears when the user taps empty map area or closes the selection.

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
  /** Called when the Undo button is tapped (placeholder for future) */
  onUndo?: () => void;
}

// ── Placeholder action definitions ──────────────────────────────────────────

interface PlaceholderAction {
  id: string;
  label: string;
  icon: string; // emoji for cross-platform simplicity
  /** If true, this button uses a tinted "danger" style to indicate destructive intent */
  danger?: boolean;
  /** If true, this button is a primary accent (Continue / Save) */
  accent?: boolean;
}

const PLACEHOLDER_ACTIONS: PlaceholderAction[] = [
  { id: 'move', label: 'Move', icon: '↔️' },
  { id: 'split', label: 'Split', icon: '✂️' },
  { id: 'draw_alt', label: 'Draw Alt', icon: '📐' },
  { id: 'del_section', label: 'Del Section', icon: '🪓', danger: true },
  { id: 'change_type', label: 'Change Type', icon: '🔄' },
  { id: 'del_feature', label: 'Delete', icon: '🗑️', danger: true },
  { id: 'continue', label: 'Continue', icon: '▶️', accent: true },
  { id: 'undo', label: 'Undo', icon: '↩️' },
  { id: 'save', label: 'Save', icon: '💾', accent: true },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function LineSelectionToolbar({
  selectedFeature,
  onDeselect,
  undoCount = 0,
  onUndo,
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
          borderColor: colors.outline,
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
          <View style={[styles.geomDot, { backgroundColor: '#F59E0B' }]} />
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedFeature?.name ?? 'Selected Line'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
              {selectedFeature?.layerName ?? 'Line Layer'} · LineString
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

      {/* ── Placeholder action buttons (all disabled) ─────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionsContainer}
      >
        {PLACEHOLDER_ACTIONS.map((action) => {
          const isUndo = action.id === 'undo';
          // Undo is "enabled" if there's something to undo — but still a placeholder,
          // so we keep it disabled per requirements. Just show the badge.
          const showBadge = isUndo && undoCount > 0;

          return (
            <View key={action.id} style={styles.actionWrapper}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.background,
                    borderColor: action.danger
                      ? colors.outlineLight
                      : action.accent
                        ? colors.outlineLight
                        : colors.outlineLight,
                    opacity: 0.45, // Disabled look — all placeholders
                  },
                ]}
                disabled
                activeOpacity={0.7}
                onPress={() => { /* No-op — all buttons are disabled placeholders */ }}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text
                  style={[
                    styles.actionLabel,
                    {
                      color: action.danger ? colors.textTertiary : colors.textTertiary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {action.label}
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

              {/* "Soon" label */}
              <Text style={[styles.soonLabel, { color: colors.textTertiary }]}>
                Soon
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* ── Hint text ──────────────────────────────────────────────────── */}
      <Text style={[styles.hintText, { color: colors.textTertiary }]}>
        Tap empty area or ✕ to deselect
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

  // ── "Soon" label under each button ─────────────────────────────────────
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
