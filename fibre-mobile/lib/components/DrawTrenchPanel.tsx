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
// Actions: target-layer chips · Undo last vertex · Cancel · Save (primary,
// rightmost, disabled until there are 2+ vertices).

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
}: DrawTrenchPanelProps) {
  const colors = useThemeStore((s) => s.colors);
  const canSave = pointCount >= 2 && !!targetLayer && !busy;

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
            {pointCount === 0
              ? 'Tap the map to place the first vertex'
              : `${pointCount} vertex${pointCount === 1 ? '' : 'es'}${lengthLabel ? ` · ${lengthLabel}` : ''}${pointCount === 1 ? ' · tap at least one more' : ''}`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.background }]}
          onPress={onCancel}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel draw trench"
        >
          <X size={16} stroke={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Target layer chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {layers.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            No line layer loaded in this project — nothing to draw into.
          </Text>
        )}
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

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.outlineLight, backgroundColor: colors.background, opacity: pointCount > 0 ? 1 : 0.4 }]}
          onPress={onUndoPoint}
          disabled={pointCount === 0}
          activeOpacity={0.7}
        >
          <Undo2 size={16} stroke={pointCount > 0 ? colors.textSecondary : colors.textTertiary} />
          <Text style={[styles.actionText, { color: pointCount > 0 ? colors.textSecondary : colors.textTertiary }]}>
            Last vertex
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.outlineLight, backgroundColor: colors.background }]}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <X size={16} stroke={colors.textSecondary} />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
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

      {/* Hint */}
      <Text style={[styles.hint, { color: colors.textTertiary }]} numberOfLines={2}>
        {snapLabel
          ? `Last vertex snapped to ${snapLabel} — vertices snap to nearby points and duct ends`
          : 'Vertices snap to nearby object points and duct/chamber ends · nothing is saved until Save'}
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
  emptyText: { fontSize: 9, fontWeight: '500', paddingVertical: 4 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
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
  actionText: { fontSize: 10, fontWeight: '600' },
  hint: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    paddingBottom: 5,
    paddingHorizontal: 8,
  },
});
