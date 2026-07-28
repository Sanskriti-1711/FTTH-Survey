// ── Survey Changes Panel ───────────────────────────────────────────────────
// Bottom overlay panel that shows all engineer survey edits (SurveyFeature records)
// grouped by layer. Each feature shows:
//   • Feature name / ID
//   • Status badge (new / modified / removed / pending_review / rejected / approved / completed)
//   • Sync status badge (pending / synced / failed)
//   • Version number
//   • Geometry type icon
//   • Timestamp
//
// This lets the engineer review their changes before syncing to the backend.

import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import type { SurveyFeatureData } from '../utils/types';

// ── Types ──────────────────────────────────────────────────────────────────

interface SurveyChangesPanelProps {
  /** Whether the panel is visible */
  visible: boolean;
  /** Survey features keyed by layer_id */
  surveyFeatures: Record<string, SurveyFeatureData[]>;
  /** Layer names lookup */
  layerNames: Record<string, string>;
  /** Called when user taps the close button */
  onClose: () => void;
  /** Called when user taps a feature (e.g. to fly to it on the map) */
  onFeaturePress?: (featureId: string, layerId: string) => void;
}

// ── Status colors ──────────────────────────────────────────────────────────

const SURVEY_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  new:           { bg: '#DBEAFE', text: '#1D4ED8', dot: '#3B82F6' },
  modified:      { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  removed:       { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
  pending_review:{ bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  rejected:      { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
  approved:      { bg: '#D1FAE5', text: '#047857', dot: '#10B981' },
  completed:     { bg: '#D1FAE5', text: '#047857', dot: '#10B981' },
};

const SYNC_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  synced:  { bg: '#D1FAE5', text: '#047857', dot: '#10B981' },
  failed:  { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
};

// ── Geometry type icons ────────────────────────────────────────────────────

function geomIcon(type: string | undefined): string {
  if (!type) return '❓';
  if (type === 'Point') return '📍';
  if (type === 'LineString' || type === 'MultiLineString') return '📏';
  if (type === 'Polygon' || type === 'MultiPolygon') return '⬛';
  return '❓';
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusChip({ status, type }: { status: string; type: 'survey' | 'sync' }) {
  const colors = type === 'survey' ? SURVEY_STATUS_COLORS : SYNC_STATUS_COLORS;
  const c = colors[status] ?? { bg: '#E5E7EB', text: '#6B7280', dot: '#9CA3AF' };
  return (
    <View style={[chipStyles.badge, { backgroundColor: c.bg }]}>
      <View style={[chipStyles.dot, { backgroundColor: c.dot }]} />
      <Text style={[chipStyles.text, { color: c.text }]}>
        {formatStatusLabel(status)}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    fontSize: 9,
    fontWeight: '700',
  },
});

// ── Layer group component ──────────────────────────────────────────────────

interface LayerGroupData {
  layerId: string;
  layerName: string;
  features: SurveyFeatureData[];
}

function LayerGroup({
  group,
  onFeaturePress,
}: {
  group: LayerGroupData;
  onFeaturePress?: (featureId: string, layerId: string) => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const [expanded, setExpanded] = useState(true);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const sf of group.features) {
      c[sf.survey_status] = (c[sf.survey_status] ?? 0) + 1;
    }
    return c;
  }, [group.features]);

  return (
    <View style={[layerStyles.container, { backgroundColor: colors.background }]}>
      {/* Layer header */}
      <TouchableOpacity
        style={layerStyles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={layerStyles.headerLeft}>
          <Text style={{ fontSize: 14, color: colors.textTertiary }}>
            {expanded ? '▾' : '▸'}
          </Text>
          <Text style={[layerStyles.layerName, { color: colors.textPrimary }]} numberOfLines={1}>
            {group.layerName}
          </Text>
          <View style={[layerStyles.countBadge, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[layerStyles.countText, { color: colors.primary }]}>
              {group.features.length}
            </Text>
          </View>
        </View>
        <View style={layerStyles.statusSummary}>
          {Object.entries(counts).map(([status, count]) => (
            <View key={status} style={layerStyles.statusPill}>
              <StatusChip status={status} type="survey" />
              <Text style={[layerStyles.statusCount, { color: colors.textTertiary }]}>
                {count}
              </Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>

      {/* Feature list */}
      {expanded && (
        <View style={layerStyles.featureList}>
          {group.features.map((sf) => (
            <TouchableOpacity
              key={sf.id}
              style={[layerStyles.featureItem, { borderBottomColor: colors.outlineLight }]}
              onPress={() => onFeaturePress?.(sf.id, group.layerId)}
              activeOpacity={0.7}
            >
              <View style={layerStyles.featureTop}>
                <View style={layerStyles.featureLeft}>
                  <Text style={layerStyles.geomIcon}>
                    {geomIcon((sf.survey_geometry as any)?.type)}
                  </Text>
                  <View style={layerStyles.featureInfo}>
                    <Text style={[layerStyles.featureName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {(sf.survey_attributes as any)?.name ?? `Survey #${sf.id.slice(-8)}`}
                    </Text>
                    <Text style={[layerStyles.featureId, { color: colors.textTertiary }]} numberOfLines={1}>
                      {sf.id.slice(0, 8)}... · v{sf.version_number} · {formatTime(sf.updated_at)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={layerStyles.badgeRow}>
                <StatusChip status={sf.survey_status} type="survey" />
                <StatusChip status={sf.sync_status} type="sync" />
                {sf.original_hld_feature && (
                  <View style={[layerStyles.hldRef, { backgroundColor: colors.outlineLight }]}>
                    <Text style={[layerStyles.hldRefText, { color: colors.textTertiary }]}>
                      HLD: {sf.original_hld_feature.slice(-6)}
                    </Text>
                  </View>
                )}
                {!sf.original_hld_feature && (
                  <View style={[layerStyles.newBadge, { backgroundColor: '#3B82F6' + '15' }]}>
                    <Text style={[layerStyles.newBadgeText, { color: '#3B82F6' }]}>
                      ✨ Engineer-created
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const layerStyles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  layerName: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusSummary: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statusCount: {
    fontSize: 9,
    fontWeight: '600',
  },
  featureList: {
    paddingBottom: Spacing.xs,
  },
  featureItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  featureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  geomIcon: {
    fontSize: 16,
  },
  featureInfo: {
    flex: 1,
    gap: 1,
  },
  featureName: {
    fontSize: 12,
    fontWeight: '600',
  },
  featureId: {
    fontSize: 9,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingLeft: Spacing.lg + Spacing.sm, // Align with feature name
  },
  hldRef: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hldRefText: {
    fontSize: 8,
    fontWeight: '600',
  },
  newBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 8,
    fontWeight: '700',
  },
});

// ── Main Component ─────────────────────────────────────────────────────────

export default function SurveyChangesPanel({
  visible,
  surveyFeatures,
  layerNames,
  onClose,
  onFeaturePress,
}: SurveyChangesPanelProps) {
  const colors = useThemeStore((s) => s.colors);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Animate slide-up
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.back(1.1)),
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // Build grouped data
  const groups = useMemo((): LayerGroupData[] => {
    const result: LayerGroupData[] = [];
    for (const [layerId, sfList] of Object.entries(surveyFeatures)) {
      if (sfList.length === 0) continue;
      result.push({
        layerId,
        layerName: layerNames[layerId] ?? layerId.toUpperCase(),
        features: sfList,
      });
    }
    // Sort: layers with more features first
    result.sort((a, b) => b.features.length - a.features.length);
    return result;
  }, [surveyFeatures, layerNames]);

  // Total counts
  const totals = useMemo(() => {
    let total = 0;
    let pending = 0;
    let synced = 0;
    let failed = 0;
    const statusCounts: Record<string, number> = {};
    for (const group of groups) {
      for (const sf of group.features) {
        total++;
        statusCounts[sf.survey_status] = (statusCounts[sf.survey_status] ?? 0) + 1;
        if (sf.sync_status === 'pending') pending++;
        if (sf.sync_status === 'synced') synced++;
        if (sf.sync_status === 'failed') failed++;
      }
    }
    return { total, pending, synced, failed, statusCounts };
  }, [groups]);

  if (!visible) return null;

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
                outputRange: [400, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.outlineLight }]}>
        <View style={styles.headerLeft}>
          <Text style={{ fontSize: 18 }}>🟠</Text>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Survey Changes
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]}>
              {totals.total} edit{totals.total !== 1 ? 's' : ''} across {groups.length} layer{groups.length !== 1 ? 's' : ''}
              {totals.pending > 0 && ` · ${totals.pending} pending sync`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.background }]}
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Summary bar ────────────────────────────────────────────────── */}
      <View style={[styles.summaryBar, { backgroundColor: colors.background }]}>
        {Object.entries(totals.statusCounts).map(([status, count]) => (
          <View key={status} style={styles.summaryItem}>
            <StatusChip status={status} type="survey" />
            <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
              {count}
            </Text>
          </View>
        ))}
        <View style={styles.summarySpacer} />
        <View style={styles.summaryItem}>
          <StatusChip status="synced" type="sync" />
          <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
            {totals.synced}
          </Text>
        </View>
        {totals.failed > 0 && (
          <View style={styles.summaryItem}>
            <StatusChip status="failed" type="sync" />
            <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
              {totals.failed}
            </Text>
          </View>
        )}
      </View>

      {/* ── Layer groups ───────────────────────────────────────────────── */}
      {groups.length > 0 ? (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.layerId}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <LayerGroup group={item} onFeaturePress={onFeaturePress} />
          )}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            No Survey Changes Yet
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            Drag a point or add a new point to create your first survey edit.
            Changes will appear here for review before syncing.
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.xxl,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    maxHeight: 420,
    overflow: 'hidden',
    zIndex: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },

  // Header
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
  headerInfo: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: 15,
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

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    flexWrap: 'wrap',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  summaryCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  summarySpacer: {
    width: 1,
    height: 14,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 2,
  },

  // List
  list: {
    maxHeight: 300,
  },
  listContent: {
    padding: Spacing.sm,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
