import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Pressable,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { useProjectStore } from '../stores/project';
import { Spacing, Radius } from '../theme/colors';
import { Search, X, MapPin, Inbox } from 'lucide-react-native';

// ── Photo Feature Picker ─────────────────────────────────────────────────
// Lets the engineer attach a locally-stored photo (e.g. taken from Home) to
// an HLD feature of the active project. The backend photo endpoint only
// accepts HLD Feature ids, so this lists HLD features (projectGeojsons) —
// NOT survey features.

interface FeatureRow {
  key: string;
  featureId: string;
  layerId: string;
  layerName: string;
  label: string;
}

interface PhotoFeaturePickerProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen HLD feature id + a human-readable label */
  onSelect: (featureId: string, label: string) => void;
}

const LABEL_KEYS = [
  'name',
  'address',
  'premise_id',
  'pdp_id',
  'customer_id',
  'area_name',
  'polygon_id',
  'description',
  'pole_number',
  'chamber_id',
];

export function PhotoFeaturePicker({ visible, onClose, onSelect }: PhotoFeaturePickerProps) {
  const colors = useThemeStore((s) => s.colors);
  const { projectGeojsons, projectLayers } = useProjectStore();
  const [query, setQuery] = useState('');

  const layerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const layer of projectLayers) {
      map[layer.layer_id] = layer.layer_name;
    }
    return map;
  }, [projectLayers]);

  // ── Build the flat, searchable feature list ──
  // Only real backend features are listed: synthetic 'imp-feat-*' ids from
  // imported/local projects 404 on the photo-upload endpoint, so they are
  // excluded to avoid silent upload failures.
  const rows = useMemo<FeatureRow[]>(() => {
    const out: FeatureRow[] = [];
    for (const [layerId, features] of Object.entries(projectGeojsons)) {
      if (!features || features.length === 0) continue;
      const layerName = layerNameMap[layerId] ?? layerId.toUpperCase();
      for (const f of features) {
        const props = (f?.properties ?? {}) as Record<string, unknown>;
        const featureId = (props.id as string) ?? (props._feature_id as string) ?? (props._id as string);
        if (!featureId) continue;
        if (featureId.startsWith('imp-feat-')) continue; // synthetic local id — not uploadable
        let label = '';
        for (const key of LABEL_KEYS) {
          const val = props[key];
          if (typeof val === 'string' && val.trim()) {
            label = val.trim();
            break;
          }
        }
        if (!label) label = `${layerName} #${featureId.slice(-6)}`;
        out.push({ key: `${layerId}:${featureId}`, featureId, layerId, layerName, label });
      }
    }
    // Stable order: group by layer, then label
    out.sort((a, b) =>
      a.layerName === b.layerName ? a.label.localeCompare(b.label) : a.layerName.localeCompare(b.layerName)
    );
    return out;
  }, [projectGeojsons, layerNameMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.layerName.toLowerCase().includes(q) ||
        r.featureId.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const handleSelect = (row: FeatureRow) => {
    onSelect(row.featureId, row.label);
    setQuery('');
  };


  // Reset the search each time the sheet opens
  React.useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        {/* Stop backdrop presses from closing when tapping the sheet itself */}
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.outlineLight }]}>
            <View style={styles.sheetTitleRow}>
              <MapPin size={18} stroke={colors.primary} />
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Attach to Feature</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <X size={20} stroke={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
              Choose which feature this photo belongs to — {rows.length} features available
            </Text>
            <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.outline }]}>
              <Search size={16} stroke={colors.textTertiary} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search name, layer or ID…"
                placeholderTextColor={colors.textTertiary}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={16} stroke={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Inbox size={36} stroke={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {rows.length === 0
                  ? 'No features loaded. Open a project with layers first, then try again.'
                  : 'No features match your search.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.key}
              initialNumToRender={30}
              maxToRenderPerBatch={40}
              windowSize={7}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.outlineLight }]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.layerTag, { backgroundColor: colors.primary + '14' }]}>
                    <Text style={[styles.layerTagText, { color: colors.primary }]} numberOfLines={1}>
                      {item.layerName}
                    </Text>
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text style={[styles.rowId, { color: colors.textTertiary }]} numberOfLines={1}>
                      {item.featureId}
                    </Text>
                  </View>
                  <Text style={[styles.rowChevron, { color: colors.textTertiary }]}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sheetHeader: {
    borderBottomWidth: 1,
    paddingBottom: Spacing.md,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSubtitle: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  layerTag: {
    maxWidth: 110,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  layerTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rowTextWrap: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  rowId: {
    fontSize: 12,
  },
  rowChevron: {
    fontSize: 20,
  },
});
