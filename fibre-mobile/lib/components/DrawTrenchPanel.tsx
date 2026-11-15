// ── Draw Trench Panel ───────────────────────────────────────────────────────
// Bottom panel for the Draw trench tool — the polyline CREATE counterpart to
// the line toolbar's edit actions.
//
// Why it exists: the HLD design can be missing a trench entirely (or an
// engineer needs one the design never had). Before this, the only ways to get
// a line onto the map were editing an existing one (Reroute / Extend line),
// which always rewrites a designed corridor. Draw trench creates a brand new
// survey LineString instead: 2-tap minimum, each tap snapping to object points
// and duct/chamber endpoints, nothing written until Save.
//
// Shape: one row of toggles (To build/Existing, plus ⊥ once the start sits on a
// line), the target layer, then Undo · Save. Cancel is the header X, so it is
// not repeated. Save writes the trench and leaves the tool armed, so a run of
// trenches is drawn without re-opening it.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import Undo2 from 'lucide-react-native/icons/undo-2';
import X from 'lucide-react-native/icons/x';
import Save from 'lucide-react-native/icons/save';
import Spline from 'lucide-react-native/icons/spline';

export interface TrenchLayerOption {
  id: string;
  name: string;
}

interface DrawTrenchPanelProps {
  /** Line layers the new trench can be written to */
  layers: TrenchLayerOption[];
  /** Currently selected target layer id */
  targetLayer: string;
  onTargetLayerChange: (layerId: string) => void;
  /** Vertices placed so far */
  pointCount: number;
  /** Label of the object/duct the last vertex snapped to (null = free point) */
  snapLabel: string | null;
  /** True while the save request is in flight */
  busy?: boolean;
  onUndoPoint: () => void;
  onCancel: () => void;
  onSave: () => void;
  /** Formatted length of the drawn line (e.g. '84.2 m'), when known */
  lengthLabel?: string | null;
  /** Is this route new work, or a trench that already exists in the ground? */
  buildState?: 'to_build' | 'existing';
  onBuildStateChange?: (state: 'to_build' | 'existing') => void;
  /** The first vertex sits on an existing line, so a 90° branch is possible */
  anchored?: boolean;
  /** Lock the second vertex perpendicular to the line the start sits on */
  perpendicular?: boolean;
  onPerpendicularChange?: (perpendicular: boolean) => void;
}

export default function DrawTrenchPanel({
  layers,
  targetLayer,
  onTargetLayerChange,
  pointCount,
  snapLabel,
  busy = false,
  onUndoPoint,
  onCancel,
  onSave,
  lengthLabel,
  buildState = 'to_build',
  onBuildStateChange,
  anchored = false,
  perpendicular = false,
  onPerpendicularChange,
}: DrawTrenchPanelProps) {
  const colors = useThemeStore((s) => s.colors);
  const canSave = pointCount >= 2 && !!targetLayer && !busy;
  const layerName = layers.find((l) => l.id === targetLayer)?.name ?? null;

  // At zero vertices the subtitle is the one place to say WHERE the trench
  // lands; after that the count and length matter more than the layer name.
  const subtitle = pointCount === 0
    ? (layerName ? `Into ${layerName}` : 'No line layer to draw into')
    : `${pointCount} ${pointCount === 1 ? 'vertex' : 'vertices'}${lengthLabel ? ` · ${lengthLabel}` : ''}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface + 'F8', borderColor: '#FF8C00' }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.outlineLight }]}>
        <View style={[styles.geomDot, { backgroundColor: '#FF8C00' }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            Draw trench
          </Text>
          <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.background }]}
          onPress={onCancel}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel draw trench"
        >
          <X size={16} stroke={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* One toggle row: To build / Existing (the LLD's bill of quantities reads
          this), and ⊥ only once the start sits on a line and can lock it. */}
      <View style={styles.toggleRow}>
        {([
          { id: 'to_build' as const, label: 'To build', hint: 'New work' },
          { id: 'existing' as const, label: 'Existing', hint: 'Reuse in place' },
        ]).map((s) => {
          const active = s.id === buildState;
          return (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.toggle,
                {
                  backgroundColor: active ? '#0D5CFF' + '18' : colors.background,
                  borderColor: active ? '#0D5CFF' : colors.outlineLight,
                },
              ]}
              onPress={() => onBuildStateChange?.(s.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${s.label} trench. ${s.hint}`}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.toggleText, { color: active ? '#0D5CFF' : colors.textSecondary }]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {anchored && (
          <TouchableOpacity
            style={[
              styles.toggle,
              {
                backgroundColor: perpendicular ? '#FF8C00' + '18' : colors.background,
                borderColor: perpendicular ? '#FF8C00' : colors.outlineLight,
              },
            ]}
            onPress={() => onPerpendicularChange?.(!perpendicular)}
            disabled={!onPerpendicularChange}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Perpendicular branch. Locks the second vertex at 90 degrees to the line the start sits on"
            accessibilityState={{ selected: perpendicular }}
          >
            <Text
              style={[styles.toggleText, { color: perpendicular ? '#FF8C00' : colors.textSecondary }]}
              numberOfLines={1}
            >
              {perpendicular ? '⊥ 90° ✓' : '⊥ 90°'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Target layer — only worth a row when there is a choice to make */}
      {layers.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {layers.map((l) => {
            const active = l.id === targetLayer;
            return (
              <TouchableOpacity
                key={l.id}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? '#FF8C00' + '20' : colors.background,
                    borderColor: active ? '#FF8C00' : colors.outlineLight,
                  },
                ]}
                onPress={() => onTargetLayerChange(l.id)}
                activeOpacity={0.7}
              >
                <Spline size={12} stroke={active ? '#FF8C00' : colors.textSecondary} />
                <Text
                  style={[styles.chipText, { color: active ? '#FF8C00' : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {l.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Actions — Cancel lives in the header, so it is not repeated here */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.outlineLight, backgroundColor: colors.background, opacity: pointCount > 0 ? 1 : 0.4 }]}
          onPress={onUndoPoint}
          disabled={pointCount === 0}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Undo last vertex"
        >
          <Undo2 size={16} stroke={pointCount > 0 ? colors.textSecondary : colors.textTertiary} />
          <Text style={[styles.actionText, { color: pointCount > 0 ? colors.textSecondary : colors.textTertiary }]}>
            Undo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            {
              backgroundColor: canSave ? colors.primary : colors.background,
              borderColor: canSave ? colors.primary : colors.outlineLight,
              opacity: canSave ? 1 : 0.5,
            },
          ]}
          onPress={onSave}
          disabled={!canSave}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Save trench"
          accessibilityState={{ disabled: !canSave }}
          role="button"
          aria-label="Save trench"
          aria-disabled={!canSave}
        >
          <Save size={16} stroke={canSave ? colors.onPrimary : colors.textTertiary} />
          <Text style={[styles.actionText, { color: canSave ? colors.onPrimary : colors.textTertiary, fontWeight: '700' }]}>
            {busy ? 'Saving…' : 'Save trench'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* One line of what to do next — the place the junction rule lives */}
      <Text style={[styles.hint, { color: colors.textTertiary }]} numberOfLines={2}>
        {snapLabel
          ? `Snapped to ${snapLabel}`
          : pointCount === 0
            ? (layerName
              ? 'Tap the map to start — start on a line and the 90° branch comes with it'
              : 'Pick a line layer above, then tap the map to start')
            : pointCount === 1
              ? 'Tap at least one more vertex · Save keeps the tool open for the next trench'
              : 'Save keeps the tool open for the next trench'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xxl + 80,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
    zIndex: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  geomDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 12, fontWeight: '700' },
  subtitle: { fontSize: 9, fontWeight: '500' },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  toggle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  toggleText: { fontSize: 12, fontWeight: '700' },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 160,
  },
  chipText: { fontSize: 9, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  actionText: { fontSize: 13, fontWeight: '600' },
  hint: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    paddingBottom: 5,
    paddingHorizontal: 8,
  },
});
