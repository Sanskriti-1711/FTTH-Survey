// ── Survey Change Diff ────────────────────────────────────────────────────
// Renders the HLD → Survey diff for a single feature: geometry change,
// attribute changes, status, reason and author. Sources data from the
// survey-features store (the working branch), so the engineer sees exactly
// what changed vs. the frozen HLD baseline in the same screen as the typed
// survey facts (trench / risk / hazard / evidence / status).

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../stores/theme';
import { useSurveyFeaturesStore } from '../stores/survey-features';
import { Card } from '../../components/ui/Card';
import { Spacing, Radius } from '../theme/colors';
import type { SurveyFeatureData } from '../utils/types';

// ── Status meta ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: 'New Feature', color: '#F59E0B' },
  modified: { label: 'Modified', color: '#FF8C00' },
  removed: { label: 'Removed', color: '#DC2626' },
  pending_review: { label: 'Pending Review', color: '#8B5CF6' },
  rejected: { label: 'Rejected', color: '#DC2626' },
  approved: { label: 'Approved', color: '#16A34A' },
  completed: { label: 'Completed', color: '#16A34A' },
};

// Internal / injected keys that are noise in an attribute diff
const SKIP_KEYS = new Set([
  'id', '_id', '_feature_id', '_layer_id', '_layer_name', '_is_survey',
  '_survey_feature_id', '_hld_feature_id', '_survey_status', '_version',
  'latitude', 'longitude', 'vertex_count',
  'start_lat', 'start_lng', 'end_lat', 'end_lng',
]);

// ── Helpers ──────────────────────────────────────────────────────────────

function summarizeGeometry(geom: Record<string, unknown> | null): string {
  if (!geom) return '—';
  const type = geom.type as string;
  const coords = geom.coordinates as unknown;
  if (coords == null) return String(type);
  if (type === 'Point') {
    const [lng, lat] = coords as [number, number];
    return `Point (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  }
  if (type === 'LineString') return `Line · ${(coords as unknown[]).length} vertices`;
  if (type === 'MultiLineString') return `MultiLine · ${(coords as unknown[][]).flat().length} vertices`;
  if (type === 'Polygon') return `Polygon · ${(coords as unknown[][])[0]?.length ?? 0} vertices`;
  if (type === 'MultiPolygon') return `MultiPolygon · ${(coords as unknown[][][]).flat(2).length} vertices`;
  return String(type);
}

/** Straight-line meters between two Point geometries (equirectangular approx). */
function pointDistanceM(orig: Record<string, unknown> | null, survey: Record<string, unknown> | null): number | null {
  if (orig?.type !== 'Point' || survey?.type !== 'Point') return null;
  const [lng1, lat1] = orig.coordinates as [number, number];
  const [lng2, lat2] = survey.coordinates as [number, number];
  const avgLat = (lat1 + lat2) / 2;
  const dx = (lng2 - lng1) * 111320 * Math.cos((avgLat * Math.PI) / 180);
  const dy = (lat2 - lat1) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function countVertices(geom: Record<string, unknown> | null): number | null {
  if (!geom) return null;
  const type = geom.type as string;
  const coords = geom.coordinates as unknown;
  if (type === 'Point') return 1;
  if (type === 'LineString') return (coords as unknown[]).length;
  if (type === 'MultiLineString') return (coords as unknown[][]).flat().length;
  if (type === 'Polygon') return (coords as unknown[][])[0]?.length ?? 0;
  if (type === 'MultiPolygon') return (coords as unknown[][][]).flat(2).length;
  return null;
}

function diffAttributes(
  orig: Record<string, unknown> | null,
  survey: Record<string, unknown> | null,
): { key: string; orig: string; survey: string }[] {
  const keys = new Set<string>([...(orig ? Object.keys(orig) : []), ...(survey ? Object.keys(survey) : [])]);
  const rows: { key: string; orig: string; survey: string }[] = [];
  for (const key of keys) {
    if (SKIP_KEYS.has(key) || key.startsWith('_')) continue;
    const o = orig?.[key];
    const s = survey?.[key];
    const oStr = o == null ? '' : String(o);
    const sStr = s == null ? '' : String(s);
    if (oStr === sStr) continue;
    rows.push({ key, orig: oStr, survey: sStr });
  }
  return rows;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  /** Real HLD feature id (UUID) — used to match the survey-feature record. */
  featureId: string;
  /** Project id — used to lazy-fetch survey features if the store is empty. */
  projectId?: string;
}

export default function SurveyChangeDiff({ featureId, projectId }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const surveyFeatures = useSurveyFeaturesStore((s) => s.surveyFeatures);
  const isLoaded = useSurveyFeaturesStore((s) => s.isLoaded);
  const fetchSurveyFeatures = useSurveyFeaturesStore((s) => s.fetchSurveyFeatures);

  // If the store is empty (e.g. opened via deep link before the map), fetch it.
  useEffect(() => {
    if (!isLoaded && projectId && !projectId.startsWith('imported-')) {
      fetchSurveyFeatures(projectId);
    }
  }, [isLoaded, projectId, fetchSurveyFeatures]);

  const surveyFeature = useMemo<SurveyFeatureData | null>(() => {
    for (const list of Object.values(surveyFeatures)) {
      const sf = list.find(
        (s) =>
          s.original_hld_feature === featureId ||
          s.hld_feature_id === featureId ||
          s.id === featureId,
      );
      if (sf) return sf;
    }
    return null;
  }, [surveyFeatures, featureId]);

  if (!surveyFeature) {
    return (
      <Card title="Survey Change" variant="outlined">
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          No survey edits yet. Make changes on the map to create a survey change for this feature.
        </Text>
      </Card>
    );
  }

  const meta = STATUS_META[surveyFeature.survey_status] ?? { label: surveyFeature.survey_status, color: colors.textSecondary };
  const attrDiffs = diffAttributes(surveyFeature.original_attributes, surveyFeature.survey_attributes ?? null);
  const movedM = pointDistanceM(surveyFeature.original_geometry, surveyFeature.survey_geometry);
  const geomChanged = JSON.stringify(surveyFeature.original_geometry ?? null) !== JSON.stringify(surveyFeature.survey_geometry ?? null);
  const origVertices = countVertices(surveyFeature.original_geometry);
  const surveyVertices = countVertices(surveyFeature.survey_geometry);

  return (
    <Card
      title="Survey Change"
      variant="default"
      headerRight={
        <View style={[styles.statusPill, { backgroundColor: meta.color + '1A', borderColor: meta.color + '55' }]}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      }
    >
      {/* Meta: who / when / reason */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {surveyFeature.engineer_name || surveyFeature.engineer || 'Engineer'}
        </Text>
        <Text style={[styles.metaText, { color: colors.textTertiary }]}>
          {formatWhen(surveyFeature.updated_at || surveyFeature.created_at)}
        </Text>
      </View>
      {surveyFeature.change_reason ? (
        <View style={[styles.reasonBox, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '33' }]}>
          <Text style={[styles.reasonLabel, { color: colors.warning }]}>Reason</Text>
          <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{surveyFeature.change_reason}</Text>
        </View>
      ) : null}

      {/* Geometry diff */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Geometry</Text>
        {surveyFeature.survey_status === 'removed' ? (
          <Text style={[styles.removedText, { color: colors.error }]}>
            Removed from the survey — not part of the approved design.
          </Text>
        ) : geomChanged ? (
          <View style={styles.geomRow}>
            <View style={[styles.geomBox, { backgroundColor: colors.background, borderColor: colors.outlineLight }]}>
              <Text style={[styles.geomTag, { color: colors.textTertiary }]}>HLD</Text>
              <Text style={[styles.geomValue, { color: colors.textSecondary }]}>{summarizeGeometry(surveyFeature.original_geometry)}</Text>
            </View>
            <Text style={[styles.geomArrow, { color: colors.textTertiary }]}>→</Text>
            <View style={[styles.geomBox, { backgroundColor: '#FF8C00' + '12', borderColor: '#FF8C00' + '55' }]}>
              <Text style={[styles.geomTag, { color: '#FF8C00' }]}>Survey</Text>
              <Text style={[styles.geomValue, { color: '#B45309' }]}>{summarizeGeometry(surveyFeature.survey_geometry)}</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.unchangedText, { color: colors.textTertiary }]}>No geometry change</Text>
        )}
        {movedM != null && movedM > 0 && (
          <Text style={[styles.movedText, { color: colors.warning }]}>
            Moved {movedM < 1 ? `${(movedM * 100).toFixed(0)} cm` : `${movedM.toFixed(1)} m`}
          </Text>
        )}
        {movedM == null && geomChanged && origVertices != null && surveyVertices != null && origVertices !== surveyVertices && (
          <Text style={[styles.movedText, { color: colors.warning }]}>
            {origVertices} → {surveyVertices} vertices
          </Text>
        )}
      </View>

      {/* Attribute diff */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Attribute Changes</Text>
        {attrDiffs.length === 0 ? (
          <Text style={[styles.unchangedText, { color: colors.textTertiary }]}>No attribute changes</Text>
        ) : (
          attrDiffs.map((row) => (
            <View key={row.key} style={[styles.attrRow, { borderBottomColor: colors.outlineLight }]}>
              <Text style={[styles.attrKey, { color: colors.textSecondary }]}>{row.key}</Text>
              <View style={styles.attrValues}>
                {row.orig !== '' && (
                  <Text style={[styles.attrOrig, { color: colors.textTertiary }]} numberOfLines={1}>
                    {row.orig}
                  </Text>
                )}
                <Text style={[styles.attrArrow, { color: colors.textTertiary }]}>→</Text>
                <Text style={[styles.attrSurvey, { color: '#B45309' }]} numberOfLines={1}>
                  {row.survey !== '' ? row.survey : '—'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Card>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    fontStyle: 'italic',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  metaText: { fontSize: 12 },
  reasonBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reasonLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  reasonText: { fontSize: 13, lineHeight: 18 },
  section: { marginTop: Spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '700', marginBottom: Spacing.xs },
  removedText: { fontSize: 13, fontWeight: '600' },
  geomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  geomBox: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  geomTag: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  geomValue: { fontSize: 12, fontWeight: '500' },
  geomArrow: { fontSize: 16, fontWeight: '700' },
  movedText: { fontSize: 12, fontWeight: '600', marginTop: Spacing.xs },
  unchangedText: { fontSize: 13, fontStyle: 'italic' },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  attrKey: { fontSize: 13, fontWeight: '500', flex: 1 },
  attrValues: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1.4, justifyContent: 'flex-end' },
  attrOrig: { fontSize: 12, textDecorationLine: 'line-through', flexShrink: 1 },
  attrArrow: { fontSize: 12, fontWeight: '700' },
  attrSurvey: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
