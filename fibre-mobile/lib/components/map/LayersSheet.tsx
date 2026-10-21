// ── Layers sheet ─────────────────────────────────────────────────────────
//
// The layer tree, moved off the map and into a sheet.
//
// The floating legend was the single biggest reason the map was unusable on
// a phone: it sat on ~40% of the map at 260 px wide, with 10–11 px text and
// 13 rows that could not be read through a glove. Same information, same
// ordering, same grouping — now at 15 px on 52 px rows, and only while the
// engineer is actually choosing layers.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, List } from 'lucide-react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius, Spacing, Type } from '../../theme/colors';
import { chromeColors } from '../../theme/chrome';
import MapSheet from './MapSheet';
import type { LayerGroup, LegendLayer } from '../MapLegend';

interface LayersSheetProps {
  visible: boolean;
  onClose: () => void;
  layers: LegendLayer[];
  groups?: LayerGroup[];
  onToggleLayer: (id: string) => void;
  onLayerClick: (id: string) => void;
}

export default function LayersSheet({
  visible,
  onClose,
  layers,
  groups,
  onToggleLayer,
  onLayerClick,
}: LayersSheetProps) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const populated = layers.filter((l) => l.featureCount > 0);
  const visibleCount = populated.filter((l) => l.visible).length;

  const renderLayer = (layer: LegendLayer) => (
    <LayerRow
      key={layer.id}
      layer={layer}
      hairline={chrome.hairline}
      tile={chrome.tile}
      onToggle={() => onToggleLayer(layer.id)}
      onOpen={() => onLayerClick(layer.id)}
    />
  );

  return (
    <MapSheet
      visible={visible}
      onClose={onClose}
      title="Layers"
      subtitle={`${visibleCount} of ${populated.length} layers shown`}
      closeLabel="Close layers"
      maxHeightRatio={0.86}
    >
      {populated.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textTertiary }]}>
          No layers in this view yet.
        </Text>
      ) : groups && groups.length > 0 ? (
        groups
          .map((group) => ({ ...group, layers: group.layers.filter((l) => l.featureCount > 0) }))
          .filter((group) => group.layers.length > 0)
          .map((group) => {
            const isCollapsed = collapsed[group.key] ?? false;
            const shown = group.layers.filter((l) => l.visible).length;
            return (
              <View key={group.key}>
                <Pressable
                  onPress={() => setCollapsed((prev) => ({ ...prev, [group.key]: !isCollapsed }))}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.label}, ${group.layers.length} layers`}
                  accessibilityState={{ expanded: !isCollapsed }}
                  style={({ pressed }) => [
                    styles.groupHeader,
                    { borderBottomColor: chrome.hairline },
                    pressed && { backgroundColor: chrome.tile },
                  ]}
                >
                  {isCollapsed ? (
                    <ChevronRight size={18} stroke={colors.textTertiary} />
                  ) : (
                    <ChevronDown size={18} stroke={colors.textTertiary} />
                  )}
                  <Text style={[styles.groupLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                    {group.label}
                  </Text>
                  <Text style={[styles.groupCount, { color: colors.textTertiary }]}>
                    {shown}/{group.layers.length}
                  </Text>
                </Pressable>
                {isCollapsed ? null : group.layers.map(renderLayer)}
              </View>
            );
          })
      ) : (
        populated.map(renderLayer)
      )}
    </MapSheet>
  );
}

function LayerRow({
  layer,
  hairline,
  tile,
  onToggle,
  onOpen,
}: {
  layer: LegendLayer;
  hairline: string;
  tile: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.row, { borderBottomColor: hairline }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={`${layer.name}, ${layer.visible ? 'shown' : 'hidden'}`}
        accessibilityState={{ checked: layer.visible }}
        style={({ pressed }) => [styles.checkArea, pressed && { backgroundColor: tile }]}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: layer.visible ? layer.color : colors.outline,
              backgroundColor: layer.visible ? layer.color : 'transparent',
            },
          ]}
        >
          {layer.visible ? <Check size={15} stroke="#FFFFFF" strokeWidth={3.2} /> : null}
        </View>
      </Pressable>

      <View style={[styles.swatch, { backgroundColor: layer.color }]} />

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`List features in ${layer.name}`}
        style={({ pressed }) => [styles.nameArea, pressed && { backgroundColor: tile }]}
      >
        <Text
          style={[
            styles.name,
            { color: layer.visible ? colors.textPrimary : colors.textTertiary },
          ]}
          numberOfLines={1}
        >
          {layer.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.textTertiary }]}>
            {layer.featureCount.toLocaleString()} {layer.geometryType ?? 'features'}
          </Text>
          {layer.imported ? (
            <View style={[styles.pill, { backgroundColor: tile }]}>
              <Text style={[styles.pillText, { color: colors.textSecondary }]}>IMPORTED</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <List size={16} stroke={colors.iconMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: 2,
    marginTop: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupLabel: { ...Type.bodyStrong, flex: 1 },
  groupCount: { ...Type.meta },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkArea: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameArea: { flex: 1, paddingVertical: Spacing.sm, paddingRight: Spacing.xs, borderRadius: Radius.sm },
  swatch: { width: 4, height: 18, borderRadius: 2 },
  name: { ...Type.bodyStrong, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 1 },
  meta: { ...Type.meta, textTransform: 'capitalize' },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  pillText: { ...Type.meta, letterSpacing: 0.4, textTransform: 'uppercase' },
  empty: { ...Type.body, paddingVertical: Spacing.xl, textAlign: 'center' },
});
