// ── Line Selection Toolbar ──────────────────────────────────────────────────
// Bottom toolbar that appears when a LINE feature is tapped on the map.
//
// Actions (labels say what they do to the line, not what the code calls it):
//   Edit shape — toggles vertex editing (draggable handles + long-press bend)
//   Split here — cuts the line into two spans at the tapped point (new chamber)
//   Remove span — removes the section between two selected vertices
//   Extend line — continues the line from a vertex to a new point
//   Attributes — opens the survey attribute form for this line
//   Delete — logical delete of the feature (survey layer stays intact)
//   Undo — reverts the most recent edit
//   Save — pinned at the right edge (outside the scroll row); persists the working copy

import React, { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
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
import Route from 'lucide-react-native/icons/route';
import Scissors from 'lucide-react-native/icons/scissors';
import Construction from 'lucide-react-native/icons/construction';
import Axe from 'lucide-react-native/icons/axe';
import Trash2 from 'lucide-react-native/icons/trash-2';
import CornerUpLeft from 'lucide-react-native/icons/corner-up-left';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import Undo2 from 'lucide-react-native/icons/undo-2';
import Save from 'lucide-react-native/icons/save';
import X from 'lucide-react-native/icons/x';

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
  /** Whether Reroute Mode is currently active */
  moveMode?: boolean;
  /** Called when user taps the Reroute button */
  onToggleMove?: () => void;
  /** Called when user taps the Save button */
  onSave?: () => void;
  /** Called when user taps the Remove span (delete-section) button */
  onDeleteSection?: () => void;
  /** Called when user taps the Split here button */
  onSplit?: () => void;
  /** Called when user taps the Route around works button */
  onRouteAround?: () => void;
  /** Whether the route-around tool is armed (waiting for the works location) */
  routeAroundMode?: boolean;
  /** Radius of the no-go area around the tapped works location */
  obstacleRadiusM?: number;
  /** Change the obstacle radius — the detour is recomputed from the baseline */
  onObstacleRadiusChange?: (radiusM: number) => void;
  /** Impact of the last detour: length delta, chambers, other lines affected */
  detourImpactLabel?: string | null;
  /** Whether Split here mode is armed (waiting for the tap on the line) */
  splitMode?: boolean;
  /** Called when user taps the Attributes button (opens the survey form) */
  onAttributes?: () => void;
  /**
   * Corridor layers Save will also re-lay because they ride the moved region.
   * Shown before Save so bundle propagation is never a surprise; each layer
   * can be toggled off.
   */
  bundleGroups?: { layerId: string; layerName: string; count: number; enabled: boolean }[];
  /** Toggle one bundle layer on/off (skipped layers stay untouched) */
  onToggleBundleLayer?: (layerId: string) => void;
  /** Whether delete-section mode is active */
  deleteSectionMode?: boolean;
  /** Current step: 0=none, 1=first cut placed, 2=both cuts placed */
  deleteSectionStep?: number;
  /** Called by the panel's primary "Remove span" button once both cuts are set */
  onDeleteConfirm?: () => void;
  /** Called by the panel's "Last tap" button to step back one cut point */
  onDeleteReset?: () => void;
  /**
   * What the pending removal adds up to: metres in the gap, vertices that go
   * with it, and how many lines survive. Rendered before the commit so the
   * engineer never confirms an unseen cut.
   */
  deleteSectionSummary?: {
    lengthLabel: string;
    vertices: number;
    leaves: number;
    canRemove: boolean;
  } | null;
  /** Called when user taps the Delete (logical delete) button */
  onDeleteFeature?: () => void;
  /** Whether there are unsaved geometry changes in Move Mode */
  hasUnsavedChanges?: boolean;
  /** Whether Draw Segment mode is active */
  continueMode?: boolean;
  /** Called when user taps the Draw Segment button */
  onContinue?: () => void;
  /** Current step in continue-line: 0=idle, 1=anchor set, 2=connected */
  continueLineStep?: number;
  /** Draw Segment is a single independent segment; retained for API compatibility. */
  continueLineSegments?: number;
  /** Label of the object point the draw-segment path snapped to (e.g. 'Snapped to PREMISES #123') */
  continueSnapLabel?: string;
}

// ── Action definitions ─────────────────────────────────────────────────────

interface ActionDef {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; stroke?: string }>;
  danger?: boolean;
  accent?: boolean;
}

const ACTIONS: ActionDef[] = [
  { id: 'move', label: 'Edit shape', icon: Route },
  { id: 'split', label: 'Split here', icon: Scissors },
  { id: 'route_around', label: 'Route around', icon: Construction },
  { id: 'del_section', label: 'Remove span', icon: Axe, danger: true },
  { id: 'continue', label: 'Extend line', icon: CornerUpLeft, accent: true },
  { id: 'attributes', label: 'Attributes', icon: ClipboardList },
  { id: 'del_feature', label: 'Delete', icon: Trash2, danger: true },
  { id: 'undo', label: 'Undo', icon: Undo2 },
  // Save is pinned outside the scroll row, always the rightmost button.
  { id: 'save', label: 'Save', icon: Save, accent: true },
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
  onSplit,
  splitMode = false,
  onRouteAround,
  routeAroundMode = false,
  obstacleRadiusM = 10,
  onObstacleRadiusChange,
  detourImpactLabel,
  onAttributes,
  bundleGroups,
  onToggleBundleLayer,
  deleteSectionMode = false,
  deleteSectionStep = 0,
  onDeleteConfirm,
  onDeleteReset,
  deleteSectionSummary = null,
  onDeleteFeature,
  hasUnsavedChanges = false,
  continueMode = false,
  onContinue,
  continueLineStep = 0,
  continueLineSegments = 0,
  continueSnapLabel,
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

  const renderAction = (action: ActionDef) => {
    const isUndo = action.id === 'undo';
    const isMove = action.id === 'move';
    const isSave = action.id === 'save';
    const isDeleteSection = action.id === 'del_section';
    const isDeleteFeature = action.id === 'del_feature';
    const isContinue = action.id === 'continue';
    const isSplit = action.id === 'split';
    const isRouteAround = action.id === 'route_around';
    const isAttributes = action.id === 'attributes';
    const showBadge = isUndo && undoCount > 0;

    // ── Determine button state ──
    const isEnabled = true;
    const isMoveActive = isMove && moveMode;
    const isSaveActive = isSave && hasUnsavedChanges;
    const isDeleteActive = isDeleteSection && deleteSectionMode;
    const isContinueActive = isContinue && continueMode;
    const isSplitActive = isSplit && splitMode;
    const isRouteAroundActive = isRouteAround && routeAroundMode;

    // Style overrides for active states
    let bgColor = colors.background;
    let borderColor = colors.outlineLight;
    let textColor = colors.textTertiary;
    let opacity = 1;
    let iconColor = undefined;

    textColor = colors.textSecondary;
    if (isMoveActive || isDeleteActive || isContinueActive || isSplitActive || isRouteAroundActive) {
      bgColor = '#FF8C00' + '20';
      borderColor = '#FF8C00';
      textColor = '#FF8C00';
    } else if (isSaveActive) {
      // Primary action once the working copy differs from the baseline.
      bgColor = colors.primary;
      borderColor = colors.primary;
      textColor = colors.onPrimary;
    } else if (isSave && !hasUnsavedChanges) {
      // Nothing has actually changed yet — dim Save so an empty
      // save can never look armed (matches handleSaveLine's 0.5 m
      // no-op guard).
      opacity = 0.5;
    }

    return (
      <View key={action.id} style={[styles.actionWrapper, isSave && styles.saveWrapper]}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            isSave && styles.saveBtn,
            {
              backgroundColor: bgColor,
              borderColor,
              opacity,
            },
          ]}
          disabled={!isEnabled || (isSave && !hasUnsavedChanges)}
          activeOpacity={0.7}
          onPress={() => {
            // The action button only ARMS/DISARMS the cut tool. Confirming lives
            // in the panel below, where it can name the metres it removes —
            // a button that changed meaning depending on step count was the
            // main reason this tool felt unclear.
            if (isMove && onToggleMove) onToggleMove();
            else if (isSave && onSave) onSave();
            else if (isDeleteSection && onDeleteSection) onDeleteSection();
            else if (isSplit && onSplit) onSplit();
            else if (isRouteAround && onRouteAround) onRouteAround();
            else if (isAttributes && onAttributes) onAttributes();
            else if (isDeleteFeature && onDeleteFeature) onDeleteFeature();
            else if (isUndo && onUndo) onUndo();
            else if (isContinue && onContinue) onContinue();
          }}
        >
          <action.icon size={18} stroke={textColor} />
          <Text
            style={[styles.actionLabel, { color: textColor }]}
            numberOfLines={1}
          >
            {isMove && moveMode
              ? 'Editing: ON'
              : isSplit && splitMode
                ? 'Tap line'
                : isRouteAround && routeAroundMode
                  ? 'Tap works'
                : isDeleteSection && deleteSectionMode
                  ? (deleteSectionStep === 2 ? 'Pick: 2/2' : deleteSectionStep === 1 ? 'Pick: 1/2' : 'Cut: ON')
                  : isContinue && continueMode
                    ? 'Drawing: ON'
                    : action.label}
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

        {isSplit && (
          <Text style={[styles.soonLabel, { color: splitMode ? '#FF8C00' : colors.textTertiary }]} numberOfLines={1}>
            {splitMode ? 'Where?' : 'New chamber'}
          </Text>
        )}
        {isRouteAround && (
          <Text style={[styles.soonLabel, { color: routeAroundMode ? '#FF8C00' : colors.textTertiary }]} numberOfLines={1}>
            {routeAroundMode ? `${obstacleRadiusM} m zone` : 'Works / closure'}
          </Text>
        )}
        {isAttributes && (
          <Text style={[styles.soonLabel, { color: colors.textTertiary }]} numberOfLines={1}>
            Field data
          </Text>
        )}
        {isDeleteSection && (
          <Text style={[styles.soonLabel, { color: deleteSectionMode ? '#FF8C00' : colors.textTertiary }]} numberOfLines={1}>
            {deleteSectionMode
              ? (deleteSectionStep === 0 ? 'Tap start' : deleteSectionStep === 1 ? 'Tap end' : 'Ready')
              : 'Cut + gap'}
          </Text>
        )}
        {isContinue && (
          <Text style={[styles.soonLabel, { color: continueMode ? (continueSnapLabel ? colors.success : '#FF8C00') : colors.textTertiary }]} numberOfLines={1}>
            {continueMode ? (continueLineStep === 0 ? 'Tap start' : continueLineStep === 1 ? 'Tap destination' : continueSnapLabel ? 'Snapped' : 'Tap to extend') : 'Tap to start'}
          </Text>
        )}
        {isDeleteFeature && (
          <Text style={[styles.soonLabel, { color: colors.textTertiary }]}>
            Logical delete
          </Text>
        )}
        {isMove && (
          <Text style={[styles.soonLabel, { color: moveMode ? '#FF8C00' : colors.textTertiary }]}>
            {moveMode ? 'Active' : 'Vertices + bends'}
          </Text>
        )}
        {isSave && (
          <Text style={[styles.soonLabel, { color: hasUnsavedChanges ? colors.primary : colors.textTertiary }]}>
            {hasUnsavedChanges ? 'Unsaved' : 'No changes'}
          </Text>
        )}
        {isUndo && (
          <Text style={[styles.soonLabel, { color: undoCount > 0 ? colors.primary : colors.textTertiary }]}>
            {undoCount > 0 ? `${undoCount} to undo` : 'Nothing to undo'}
          </Text>
        )}
      </View>
    );
  };

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
              {moveMode && ' · Editing shape'}
              {splitMode && ' · Split here (tap the line)'}
              {routeAroundMode && ` · Route around works (${obstacleRadiusM} m)`}
              {deleteSectionMode && ` · Remove span · ${deleteSectionStep === 0 ? 'tap start' : deleteSectionStep === 1 ? 'tap end' : 'ready'}`}
              {continueMode && ` · Extend line ${continueLineStep === 1 ? '(select point)' : continueLineStep === 2 ? '(ready to save)' : ''}`}
              {continueMode && continueSnapLabel && ` · ${continueSnapLabel}`}
              {moveMode && hasUnsavedChanges && ' · Unsaved'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.background }]}
          onPress={onDeselect}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={16} stroke={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Action buttons: scrollable row + pinned Save ─────────────── */}
      <View style={styles.actionsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.actionsScroll}
          contentContainerStyle={styles.actionsContainer}
        >
          {ACTIONS.filter((a) => a.id !== 'save').map(renderAction)}
        </ScrollView>
        <View style={styles.pinnedSave}>
          {ACTIONS.filter((a) => a.id === 'save').map(renderAction)}
        </View>
      </View>

      {/* ── Remove span: step tracker + commit ──────────────────────────── */}
      {deleteSectionMode && (
        <View style={[styles.spanPanel, { borderTopColor: colors.outlineLight }]}>
          <View style={styles.stepRow}>
            {['Cut start', 'Cut end', 'Remove'].map((label, i) => {
              const n = i + 1;
              const done = deleteSectionStep >= n;
              const active = deleteSectionStep === n - 1;
              return (
                <React.Fragment key={label}>
                  {i > 0 && (
                    <View style={[styles.stepRule, { backgroundColor: done ? '#FF8C00' : colors.outlineLight }]} />
                  )}
                  <View
                    style={[
                      styles.stepChip,
                      {
                        backgroundColor: active ? '#FF8C00' + '20' : colors.background,
                        borderColor: active || done ? '#FF8C00' : colors.outlineLight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stepChipText,
                        { color: active || done ? '#FF8C00' : colors.textTertiary },
                      ]}
                      numberOfLines={1}
                    >
                      {done ? '✓ ' : `${n} `}
                      {label}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>

          <Text style={[styles.spanSummary, { color: colors.textSecondary }]} numberOfLines={2}>
            {deleteSectionStep === 0
              ? 'Tap the line where the gap starts — a vertex is cut in exactly where you tap.'
              : deleteSectionStep === 1
                ? 'Now tap where the gap ends. Everything red is removed.'
                : deleteSectionSummary
                  ? deleteSectionSummary.canRemove
                    ? `Removes ${deleteSectionSummary.lengthLabel}${deleteSectionSummary.vertices > 0 ? ` · ${deleteSectionSummary.vertices} vertices` : ''} · leaves ${deleteSectionSummary.leaves === 2 ? 'two lines' : 'one line'}`
                    : 'That covers the whole line — use Delete instead'
                  : ''}
          </Text>

          <View style={styles.spanBtnRow}>
            <TouchableOpacity
              style={[
                styles.spanBtn,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.outlineLight,
                  opacity: deleteSectionStep === 0 ? 0.45 : 1,
                },
              ]}
              disabled={deleteSectionStep === 0}
              onPress={onDeleteReset}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Remove the last cut point"
            >
              <Undo2 size={12} stroke={deleteSectionStep === 0 ? colors.textTertiary : colors.textSecondary} />
              <Text
                style={[
                  styles.spanBtnText,
                  { color: deleteSectionStep === 0 ? colors.textTertiary : colors.textSecondary },
                ]}
              >
                Last tap
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.spanBtn,
                styles.spanBtnPrimary,
                {
                  backgroundColor: deleteSectionSummary?.canRemove ? '#DC2626' : colors.outlineLight,
                  borderColor: deleteSectionSummary?.canRemove ? '#DC2626' : colors.outlineLight,
                  opacity: deleteSectionSummary?.canRemove ? 1 : 0.6,
                },
              ]}
              disabled={!deleteSectionSummary?.canRemove}
              onPress={onDeleteConfirm}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                deleteSectionSummary?.canRemove
                  ? `Remove ${deleteSectionSummary.lengthLabel} of line`
                  : 'Remove span — pick both cut points first'
              }
            >
              <Axe size={12} stroke="#FFFFFF" />
              <Text style={[styles.spanBtnText, { color: '#FFFFFF', fontWeight: '700' }]}>
                Remove span
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Route-around works: radius + measured impact ────────────────── */}
      {routeAroundMode && (
        <View style={[styles.bundleRow, { borderTopColor: colors.outlineLight }]}>
          <Text style={[styles.bundleTitle, { color: colors.textTertiary }]} numberOfLines={1}>
            No-go zone:
          </Text>
          {[5, 10, 20, 30].map((r) => {
            const active = r === obstacleRadiusM;
            return (
              <TouchableOpacity
                key={r}
                style={[
                  styles.bundleChip,
                  {
                    backgroundColor: active ? '#FF8C00' + '20' : colors.background,
                    borderColor: active ? '#FF8C00' : colors.outlineLight,
                  },
                ]}
                onPress={() => onObstacleRadiusChange?.(r)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Set the works no-go radius to ${r} metres`}
              >
                <Text style={[styles.bundleChipText, { color: active ? '#FF8C00' : colors.textTertiary }]}>
                  {r} m
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {routeAroundMode && detourImpactLabel && (
        <Text style={[styles.impactText, { color: colors.textSecondary }]} numberOfLines={2}>
          {detourImpactLabel}
        </Text>
      )}

      {/* ── Bundle propagation preview (Reroute only) ──────────────────── */}
      {bundleGroups && bundleGroups.length > 0 && (
        <View style={[styles.bundleRow, { borderTopColor: colors.outlineLight }]}>
          <Text style={[styles.bundleTitle, { color: colors.textTertiary }]} numberOfLines={1}>
            Saving also re-lays:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bundleChips}
          >
            {bundleGroups.map((g) => {
              return (
                <TouchableOpacity
                  key={g.layerId}
                  style={[
                    styles.bundleChip,
                    {
                      backgroundColor: g.enabled ? colors.primary + '18' : colors.background,
                      borderColor: g.enabled ? colors.primary : colors.outlineLight,
                    },
                  ]}
                  onPress={() => onToggleBundleLayer?.(g.layerId)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.count} ${g.layerName} ${g.enabled ? 'will move — tap to keep in place' : 'will stay in place — tap to move'}`}
                >
                  <Text
                    style={[styles.bundleChipText, { color: g.enabled ? colors.primary : colors.textTertiary }]}
                    numberOfLines={1}
                  >
                    {g.enabled ? '↦' : '✕'} {g.count} {g.layerName}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {bundleGroups.some((g) => g.enabled) ? null : (
              <Text style={[styles.bundleChipText, { color: colors.textTertiary }]}>
                all opted out
              </Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Hint text ──────────────────────────────────────────────────── */}
      <Text style={[styles.hintText, { color: colors.textTertiary }]}>
        {moveMode
          ? 'Drag a handle to move a vertex · Long-press the line to add a bend · Long-press a handle to remove it · Save to persist'
          : routeAroundMode
            ? 'Tap the map at the works — the line is re-routed clear of the zone; adjust the radius, then Save'
          : splitMode
            ? 'Tap the line where the new chamber goes — the span is cut into two features'
          : deleteSectionMode
            ? 'Remove span applies straight away when you confirm — Undo sits in the toolbar'
          : continueMode
            ? continueLineStep === 0 ? 'Tap the map to place the segment start (snaps to nearest point)'
            : continueLineStep === 1 ? 'Tap the destination point; it will snap to the nearest point'
            : continueSnapLabel
              ? `${continueSnapLabel} · Save to finish the segment`
              : 'One segment ready · Save to finish'
          : 'Tap an empty area or Close to deselect'}
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

  // ── Actions row: scrollable buttons + pinned Save ──────────────────────
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  actionsScroll: {
    flex: 1,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 8,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  pinnedSave: {
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 6,
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
  // Save is the primary action: wider, taller, laid out left-to-right, and
  // always the last button in the row.
  saveBtn: {
    width: 96,
    height: 46,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
  },
  saveWrapper: {
    width: 102,
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

  // ── Remove span panel: step tracker + commit ──────────────────────────
  spanPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 5,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  stepChipText: {
    fontSize: 8,
    fontWeight: '700',
  },
  stepRule: {
    width: 6,
    height: 1,
  },
  spanSummary: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  spanBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  spanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  spanBtnPrimary: {
    flex: 1,
  },
  spanBtnText: {
    fontSize: 9,
    fontWeight: '600',
  },

  // ── Bundle propagation preview ─────────────────────────────────────────
  bundleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bundleTitle: {
    fontSize: 8,
    fontWeight: '700',
  },
  bundleChips: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  bundleChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  bundleChipText: {
    fontSize: 8,
    fontWeight: '600',
  },
  impactText: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingBottom: 2,
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
