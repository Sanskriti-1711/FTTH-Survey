// ── Map Legend / Layer Panel Component ────────────────────────────────────
// Supports grouping layers under collapsible group headers.
// Each group can be collapsed/expanded independently.
// The panel itself can also be collapsed via the header.

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Radius, Spacing } from '../theme/colors';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Check from 'lucide-react-native/icons/check';
import List from 'lucide-react-native/icons/list';
import FolderOpen from 'lucide-react-native/icons/folder-open';
import FolderClosed from 'lucide-react-native/icons/folder-closed';

// ── Types ─────────────────────────────────────────────────────────────────

export interface LegendLayer {
  id: string;
  name: string;
  color: string;
  featureCount: number;
  visible: boolean;
  geometryType?: string;
  imported?: boolean;
}

export interface LayerGroup {
  /** Group identifier (used for collapsed state key) */
  key: string;
  /** Display name shown in the group header */
  label: string;
  /** Layers belonging to this group */
  layers: LegendLayer[];
}

interface MapLegendProps {
  layers: LegendLayer[];
  /** Optional group definitions. If provided, layers are displayed under group headers.
   *  Layers not assigned to any group go into the 'ungroupedLabel' group. */
  groups?: LayerGroup[];
  /** Label for layers not in any group (only used when groups are provided) */
  ungroupedLabel?: string;
  /** Maximum layers shown before truncation (0 = no truncation, only used when no groups) */
  maxVisible?: number;
  /** Whether to start collapsed */
  defaultCollapsed?: boolean;
  /** Called when user clicks the checkbox to toggle layer visibility */
  onToggleLayer?: (id: string) => void;
  /** Called when user clicks the layer name / row to view its features */
  onLayerClick?: (id: string) => void;
}

// ── Geometry Type Icons ───────────────────────────────────────────────────

function GeoTypeIcon({ type, color }: { type?: string; color: string }) {
  if (!type) {
    return <View style={[styles.geoIconNull, { borderColor: color }]} />;
  }
  if (type === 'Point' || type === 'MultiPoint') {
    return <View style={[styles.geoIconPoint, { backgroundColor: color }]} />;
  }
  if (type === 'LineString' || type === 'MultiLineString') {
    return (
      <View style={styles.geoIconLineContainer}>
        <View style={[styles.geoIconLine, { backgroundColor: color }]} />
        <View style={[styles.geoIconLine, { backgroundColor: color, width: 8, marginTop: 1 }]} />
      </View>
    );
  }
  if (type === 'Polygon' || type === 'MultiPolygon') {
    return (
      <View style={[styles.geoIconPolygon, { borderColor: color, backgroundColor: color + '20' }]} />
    );
  }
  return <View style={[styles.geoIconNull, { borderColor: color }]} />;
}

// ── Layer Row ─────────────────────────────────────────────────────────────

const LayerRow = React.memo(function LayerRow({
  layer,
  onToggle,
  onClick,
}: {
  layer: LegendLayer;
  onToggle?: (id: string) => void;
  onClick?: (id: string) => void;
}) {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.layerRow, { borderBottomColor: colors.outlineLight + '60' }]}>
      {/* Checkbox — toggles visibility */}
      <TouchableOpacity
        style={styles.checkboxArea}
        onPress={() => onToggle?.(layer.id)}
        activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: layer.visible ? layer.color : colors.textTertiary,
              backgroundColor: layer.visible ? layer.color + '20' : 'transparent',
            },
          ]}
        >
          {layer.visible && (
            <Check size={9} stroke={layer.color} strokeWidth={3} />
          )}
        </View>
      </TouchableOpacity>

      {/* Geometry type icon */}
      <GeoTypeIcon type={layer.geometryType} color={layer.color} />

      {/* Layer name + count — clickable to view features */}
      <TouchableOpacity
        style={styles.layerNameArea}
        onPress={() => onClick?.(layer.id)}
        activeOpacity={0.6}
      >
        <Text
          style={[
            styles.layerName,
            { color: layer.visible ? colors.textPrimary : colors.textTertiary },
          ]}
          numberOfLines={1}
        >
          {layer.name}
        </Text>

        <View style={styles.layerMetaRow}>
          <View style={[styles.countBadge, { backgroundColor: layer.color + '15' }]}>
            <Text style={[styles.countText, { color: layer.color }]}>
              {layer.featureCount}
            </Text>
          </View>
          {layer.geometryType && (
            <Text style={[styles.geoTypeLabel, { color: colors.textTertiary }]}>
              {layer.geometryType}
            </Text>
          )}
          {layer.imported && (
            <View style={[styles.importedBadge, { backgroundColor: colors.warning + '15' }]}>
              <Text style={[styles.importedText, { color: colors.warning }]}>IMPORT</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Arrow icon */}
      <List size={12} stroke={colors.textTertiary} style={{ marginLeft: 2 }} />
    </View>
  );
});

// ── Group Header ──────────────────────────────────────────────────────────

function GroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: LayerGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const totalFeatures = group.layers.reduce((sum, l) => sum + l.featureCount, 0);
  const visibleCount = group.layers.filter((l) => l.visible).length;

  return (
    <TouchableOpacity
      style={[styles.groupHeader, { borderBottomColor: colors.outlineLight + '60' }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      {collapsed ? (
        <FolderClosed size={12} stroke={colors.textSecondary} />
      ) : (
        <FolderOpen size={12} stroke={colors.primary} />
      )}
      <Text style={[styles.groupLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {group.label}
      </Text>
      <View style={[styles.groupCountPill, { backgroundColor: colors.primary + '15' }]}>
        <Text style={[styles.groupCountText, { color: colors.primary }]}>
          {totalFeatures}
        </Text>
      </View>
      {visibleCount < group.layers.length && (
        <View style={[styles.groupPartialDot, { backgroundColor: colors.warning }]} />
      )}
      <View style={{ flex: 1 }} />
      <ChevronRight
        size={10}
        stroke={colors.textTertiary}
        style={{ transform: [{ rotate: collapsed ? '0deg' : '90deg' }] }}
      />
    </TouchableOpacity>
  );
}

// ── Group Content ─────────────────────────────────────────────────────────

function GroupContent({
  group,
  collapsed,
  staggerAnims,
  startIndex,
  onToggleLayer,
  onLayerClick,
}: {
  group: LayerGroup;
  collapsed: boolean;
  staggerAnims: Animated.Value[];
  startIndex: number;
  onToggleLayer?: (id: string) => void;
  onLayerClick?: (id: string) => void;
}) {
  if (collapsed) return null;

  return (
    <View>
      {group.layers.map((layer, i) => {
        const animIndex = startIndex + i;
        const anim = staggerAnims[animIndex];
        if (!anim) return null;

        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        });

        return (
          <Animated.View
            key={layer.id}
            style={{ opacity, transform: [{ translateY }] }}
          >
            <LayerRow
              layer={layer}
              onToggle={onToggleLayer}
              onClick={onLayerClick}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── Flat Layer List (no groups) ───────────────────────────────────────────

function FlatLayerList({
  layers,
  staggerAnims,
  onToggleLayer,
  onLayerClick,
}: {
  layers: LegendLayer[];
  staggerAnims: Animated.Value[];
  onToggleLayer?: (id: string) => void;
  onLayerClick?: (id: string) => void;
}) {
  return (
    <>
      {layers.map((layer, index) => {
        const anim = staggerAnims[index];
        if (!anim) return null;

        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        });

        return (
          <Animated.View
            key={layer.id}
            style={{ opacity, transform: [{ translateY }] }}
          >
            <LayerRow
              layer={layer}
              onToggle={onToggleLayer}
              onClick={onLayerClick}
            />
          </Animated.View>
        );
      })}
    </>
  );
}

// ── Main Legend Component ─────────────────────────────────────────────────

export default function MapLegend({
  layers,
  groups,
  ungroupedLabel = 'Other',
  maxVisible = 5,
  defaultCollapsed = false,
  onToggleLayer,
  onLayerClick,
}: MapLegendProps) {
  const colors = useThemeStore((s) => s.colors);
  const { height: screenH } = useWindowDimensions();
  const [panelCollapsed, setPanelCollapsed] = useState(defaultCollapsed);
  const [expanded, setExpanded] = useState(false);
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>({});
  const expandAnim = useRef(new Animated.Value(defaultCollapsed ? 0 : 1)).current;
  const staggerAnims = useRef<Animated.Value[]>([]);
  const [visible, setVisible] = useState(!defaultCollapsed);

  // ── Responsive max-height ───────────────────────────────────────────────
  const maxLegendHeight = useMemo(() => Math.round(screenH * 0.55), [screenH]);
  const scrollMaxHeight = useMemo(() => Math.round(screenH * 0.42), [screenH]);

  // Filter out layers with no features
  const nonEmpty = useMemo(() => layers.filter((l) => l.featureCount > 0), [layers]);

  // ── Determine display items ─────────────────────────────────────────────
  const { displayGroups, displayLayers, hasGroups } = useMemo(() => {
    if (groups && groups.length > 0) {
      // Use provided groups — filter out empty groups
      const activeGroups = groups
        .map((g) => ({ ...g, layers: g.layers.filter((l) => l.featureCount > 0) }))
        .filter((g) => g.layers.length > 0);
      return { displayGroups: activeGroups, displayLayers: [], hasGroups: true };
    }
    // No groups — use flat list with truncation
    const effectiveMaxVisible = expanded ? 0 : maxVisible;
    const shouldTruncate = effectiveMaxVisible > 0 && nonEmpty.length > effectiveMaxVisible;
    const sliced = shouldTruncate ? nonEmpty.slice(0, effectiveMaxVisible) : nonEmpty;
    return { displayGroups: [], displayLayers: sliced, hasGroups: false };
  }, [groups, nonEmpty, expanded, maxVisible]);

  const hiddenCount = hasGroups
    ? 0
    : Math.max(0, nonEmpty.length - (expanded ? nonEmpty.length : maxVisible));

  // ── Compute total rows for staggering ───────────────────────────────────
  const totalRows = useMemo(() => {
    if (hasGroups) {
      return displayGroups.reduce((sum, g) => sum + g.layers.length, 0);
    }
    return displayLayers.length;
  }, [hasGroups, displayGroups, displayLayers]);

  // Reset stagger anims when rows change
  useEffect(() => {
    staggerAnims.current = Array.from({ length: totalRows }, () => new Animated.Value(0));
  }, [totalRows]);

  // Animate panel expand/collapse
  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: panelCollapsed ? 0 : 1,
      duration: 250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();

    if (!panelCollapsed) {
      setVisible(true);
      staggerAnims.current.forEach((anim, i) => {
        Animated.timing(anim, {
          toValue: 1,
          duration: 250,
          delay: 20 * i,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    } else {
      setTimeout(() => setVisible(false), 200);
    }
  }, [panelCollapsed]);

  // ── Toggle group collapse ───────────────────────────────────────────────
  const toggleGroup = useCallback((groupKey: string) => {
    setGroupCollapsed((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  // ── Compute dynamic height ──────────────────────────────────────────────
  const animMaxHeight = useMemo(() => {
    if (panelCollapsed) return 36;
    // Estimate: header(30) + groupHeaders + rows + padding
    if (hasGroups) {
      const groupRows = displayGroups.length; // header rows
      const layerRows = totalRows;
      return (groupRows + layerRows) * 34 + 50;
    }
    const rowH = Math.min(displayLayers.length + 1, (expanded ? nonEmpty.length : maxVisible) + 1) * 36 + 40;
    return rowH;
  }, [panelCollapsed, hasGroups, displayGroups, totalRows, displayLayers, expanded, nonEmpty, maxVisible]);

  const maxHeightAnim = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [36, Math.min(animMaxHeight, scrollMaxHeight + 30)],
  });

  if (nonEmpty.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface + 'E6', maxHeight: maxLegendHeight }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textSecondary }]}>Layers</Text>
          <View style={[styles.emptyDot, { backgroundColor: colors.textTertiary }]} />
        </View>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>None visible</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface + 'E6',
          maxWidth: 260,
          maxHeight: maxLegendHeight,
        },
      ]}
    >
      {/* Panel header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => {
          setPanelCollapsed(!panelCollapsed);
          if (expanded) setExpanded(false);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: colors.textSecondary }]}>Layers</Text>
          <View style={[styles.countPill, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.countPillText, { color: colors.primary }]}>
              {nonEmpty.length}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {hiddenCount > 0 && !panelCollapsed && !expanded && !hasGroups && (
            <Text style={[styles.hiddenHint, { color: colors.textTertiary }]}>
              +{hiddenCount} more
            </Text>
          )}
          {panelCollapsed ? (
            <ChevronDown size={14} stroke={colors.textTertiary} />
          ) : (
            <ChevronUp size={14} stroke={colors.textTertiary} />
          )}
        </View>
      </TouchableOpacity>

      {/* Panel content */}
      {visible && (
        <Animated.View style={[styles.layersContainer, { maxHeight: maxHeightAnim }]}>
          <ScrollView
            style={[styles.layerScroll, { maxHeight: scrollMaxHeight }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {hasGroups ? (
              // ── Grouped view ────────────────────────────────────────────
              <>
                {displayGroups.map((group, gi) => {
                  const isCollapsed = groupCollapsed[group.key] === true;
                  const prevGroupRows = displayGroups
                    .slice(0, gi)
                    .reduce((sum, g) => sum + g.layers.length, 0);

                  return (
                    <View key={group.key}>
                      <GroupHeader
                        group={group}
                        collapsed={isCollapsed}
                        onToggle={() => toggleGroup(group.key)}
                      />
                      <GroupContent
                        group={group}
                        collapsed={isCollapsed}
                        staggerAnims={staggerAnims.current}
                        startIndex={prevGroupRows}
                        onToggleLayer={onToggleLayer}
                        onLayerClick={onLayerClick}
                      />
                    </View>
                  );
                })}
              </>
            ) : (
              // ── Flat list view (no groups) ──────────────────────────────
              <>
                <FlatLayerList
                  layers={displayLayers}
                  staggerAnims={staggerAnims.current}
                  onToggleLayer={onToggleLayer}
                  onLayerClick={onLayerClick}
                />

                {/* Expand / Show more button */}
                {!expanded && maxVisible > 0 && nonEmpty.length > maxVisible && (
                  <TouchableOpacity
                    style={[styles.showMoreBtn, { borderTopColor: colors.outlineLight }]}
                    onPress={() => setExpanded(true)}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.showMoreText, { color: colors.primary }]}>
                      +{hiddenCount} hidden layer{hiddenCount !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Show less button when expanded */}
                {expanded && maxVisible > 0 && nonEmpty.length > maxVisible && (
                  <TouchableOpacity
                    style={[styles.showMoreBtn, { borderTopColor: colors.outlineLight }]}
                    onPress={() => setExpanded(false)}
                    activeOpacity={0.6}
                  >
                    <ChevronUp size={12} stroke={colors.primary} />
                    <Text style={[styles.showMoreText, { color: colors.primary }]}>
                      Show less
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

// ── Default Layer Groupings ───────────────────────────────────────────────
// These map HLD layer IDs to group names for convenience.
export const DEFAULT_LAYER_GROUPS: Record<string, string> = {
  // Trenches
  trenches: 'Trenches',
  feeder_trench: 'Trenches',
  distribution_trench: 'Trenches',
  garden_trench: 'Trenches',
  final_trenches: 'Trenches',
  // Cables
  cables: 'Cables',
  feeder_cable: 'Cables',
  distribution_cable: 'Cables',
  // Ducts
  ducts: 'Ducts',
  feeder_ducts: 'Ducts',
  distribution_ducts: 'Ducts',
  // Premises & Areas
  objects: 'Premises',
  polygons: 'Service Areas',
  // Infrastructure
  pdps: 'Infrastructure',
  mfg: 'Infrastructure',
};

/** Order in which groups should appear in the panel */
export const DEFAULT_GROUP_ORDER = [
  'Premises',
  'Service Areas',
  'Infrastructure',
  'Trenches',
  'Cables',
  'Ducts',
  'Other',
];

/**
 * Build grouped layer list from flat LegendLayer array using a group mapping.
 * @param layers - Flat list of layers
 * @param groupMap - layerId → group label mapping
 * @param groupOrder - Preferred order of group labels
 * @returns Array of LayerGroup objects
 */
export function buildLayerGroups(
  layers: LegendLayer[],
  groupMap: Record<string, string> = DEFAULT_LAYER_GROUPS,
  groupOrder: string[] = DEFAULT_GROUP_ORDER,
): LayerGroup[] {
  const groupsMap = new Map<string, LegendLayer[]>();
  const seenOrders = new Map<string, number>();

  for (const layer of layers) {
    // For imported layers, strip prefix before looking up group
    const cleanId = layer.id.startsWith('imp-') ? layer.id.slice(4) : layer.id;
    let groupKey = groupMap[cleanId] ?? groupMap[layer.id] ?? 'Other';

    // Determine sort order
    if (!seenOrders.has(groupKey)) {
      const orderIndex = groupOrder.indexOf(groupKey);
      seenOrders.set(groupKey, orderIndex >= 0 ? orderIndex : groupOrder.length);
    }

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey)!.push(layer);
  }

  // Convert to array sorted by groupOrder
  return Array.from(groupsMap.entries())
    .sort((a, b) => (seenOrders.get(a[0]) ?? 99) - (seenOrders.get(b[0]) ?? 99))
    .map(([label, groupLayers]) => ({
      key: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      layers: groupLayers,
    }));
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    minWidth: 180,
    maxWidth: 260,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  countPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    minWidth: 18,
    alignItems: 'center',
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  hiddenHint: {
    fontSize: 10,
    fontWeight: '500',
  },
  emptyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyText: {
    fontSize: 11,
    fontStyle: 'italic',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  layersContainer: {
    overflow: 'hidden',
    marginTop: 4,
  },
  layerScroll: {
    maxHeight: 350,
  },
  // ── Layer Row ─────────────────────────────────────────────────────────
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginLeft: 8,
  },
  checkboxArea: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerNameArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  layerName: {
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  layerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  countBadge: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    minWidth: 14,
    alignItems: 'center',
  },
  countText: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  geoTypeLabel: {
    fontSize: 7,
    fontWeight: '500',
  },
  importedBadge: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    borderRadius: 2,
  },
  importedText: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  // ── Group Header ──────────────────────────────────────────────────────
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
    gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  groupCountPill: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    minWidth: 16,
    alignItems: 'center',
  },
  groupCountText: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  groupPartialDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  // ── Show More Button ──────────────────────────────────────────────────
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  showMoreText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // ── Geo Icons ─────────────────────────────────────────────────────────
  geoIconNull: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: 1.5,
  },
  geoIconPoint: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  geoIconLineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  geoIconLine: {
    width: 8,
    height: 1.5,
    borderRadius: 1,
  },
  geoIconPolygon: {
    width: 8,
    height: 8,
    borderRadius: 1.5,
    borderWidth: 1.5,
  },
});
