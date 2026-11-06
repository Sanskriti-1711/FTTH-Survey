import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, ArrowLeft, CheckCircle, Ruler, Send } from 'lucide-react-native';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Toast } from '../../../components/ui/Toast';
import MeasurementEntrySheet, {
  entryFields,
  type SavedMeasurements,
} from '../../../lib/components/MeasurementEntrySheet';
import {
  getFeaturePhotos,
  submitFeatures,
  type FeaturePhotoData,
} from '../../../lib/api/features';
import { displayValue, getSupervisionFeature, measurementValue } from '../../../lib/api/supervision';
import type { Feature } from '../../../lib/utils/types';
import { useAuthStore } from '../../../lib/stores/auth';
import { useThemeStore } from '../../../lib/stores/theme';
import { Radius, Spacing, Type } from '../../../lib/theme/colors';

interface PlannedRow {
  key: string;
  label: string;
  planned: string | null;
  asBuilt: string | null;
}

function buildRows(feature: Feature): PlannedRow[] {
  const measurements = (feature.field_measurements ?? {}) as Record<string, unknown>;
  const keys = new Set<string>([
    ...Object.keys(feature.properties ?? {}),
    ...Object.keys(measurements),
  ]);
  const rows: PlannedRow[] = [];
  for (const key of keys) {
    if (key === 'id' || key.startsWith('_')) continue;
    const field = feature.field_schema?.find((f) => f.key === key);
    const planned = displayValue((feature.properties ?? {})[key]);
    const asBuilt = measurementValue(measurements[key]);
    if (!planned && !asBuilt) continue;
    rows.push({
      key,
      label: field?.label ?? key.replace(/_/g, ' '),
      planned,
      asBuilt,
    });
  }
  return rows;
}

/** Trim float noise from the deviation payload (0.15000000000000013 → 0.15). */
function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export default function SupervisionFeatureScreen() {
  const params = useLocalSearchParams<{ featureId?: string; projectId?: string }>();
  const featureId = String(params.featureId ?? '');
  const projectId = String(params.projectId ?? '');
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();

  const [feature, setFeature] = useState<Feature | null>(null);
  const [layerName, setLayerName] = useState('');
  const [photos, setPhotos] = useState<FeaturePhotoData[]>([]);
  const [photoLimit, setPhotoLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ visible: false, message: '', type: 'success' });
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !featureId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSupervisionFeature(projectId, featureId);
      setFeature(data.feature);
      setLayerName(data.layer_name || data.feature.layer_name || data.feature.layer_id);
      try {
        const gallery = await getFeaturePhotos(featureId);
        setPhotos(gallery.results ?? []);
        setPhotoLimit(gallery.max_photos ?? 0);
      } catch {
        setPhotos([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this feature');
    } finally {
      setLoading(false);
    }
  }, [featureId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = feature ? buildRows(feature) : [];
  const measuredCount = rows.filter((row) => row.asBuilt).length;
  const canRecord = entryFields(feature).length > 0;

  // The backend compares readings against the plan and the layer's tolerance;
  // the app only renders its verdict, so the rule cannot drift between clients.
  const deviation = feature?.deviation ?? null;
  const deviationFields = deviation?.fields ?? [];
  const deviationByKey = new Map(deviationFields.map((field) => [field.key, field]));
  const outsideCount = deviationFields.filter((field) => !field.within_tolerance).length;
  const hasDeviation = deviationFields.length > 0;

  // Submit accepts assigned/redo work; supervision features arrive pending and
  // only become submittable once there is something to review.
  const canSubmit =
    feature?.status === 'pending' ||
    feature?.status === 'assigned' ||
    feature?.status === 'redo';

  // Patch the loaded feature instead of re-fetching: a save is a local edit,
  // and bouncing the whole screen through its spinner loses scroll position.
  const handleSaved = async (saved: SavedMeasurements) => {
    setFeature((prev) =>
      prev
        ? {
            ...prev,
            field_measurements: saved.field_measurements,
            comparison_notes: saved.comparison_notes,
          }
        : prev,
    );
    setEntryOpen(false);
    setToast({ visible: true, message: 'Measurements saved', type: 'success' });

    // Deviation is computed server-side from the new readings, so re-read it
    // quietly. A failure keeps the patched feature; badges stay one save behind
    // rather than the screen falling back to an error state.
    try {
      const data = await getSupervisionFeature(projectId, featureId);
      setFeature(data.feature);
    } catch {
      // ignore — the readings themselves did save
    }
  };

  const handleSubmit = async () => {
    if (!feature || !user || submitting) return;
    setSubmitting(true);
    try {
      await submitFeatures([feature.id], user.id);
      setFeature((prev) => (prev ? { ...prev, status: 'under_review' } : prev));
      setConfirmingSubmit(false);
      setToast({ visible: true, message: 'Feature submitted for review', type: 'success' });
    } catch (err) {
      setToast({
        visible: true,
        message: err instanceof Error ? err.message : 'Submit failed — try again',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to the supervision map"
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {layerName || 'Feature inspection'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            #{featureId.slice(-8)}
          </Text>
        </View>
        {feature && <StatusBadge status={feature.status} />}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
            Couldn&apos;t load this feature
          </Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
          <Button title="Try Again" variant="secondary" size="sm" onPress={load} />
        </View>
      ) : !feature ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            This feature is no longer available.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Planned vs as-built
              </Text>
              {hasDeviation && (
                <View
                  style={[
                    styles.summaryPill,
                    {
                      backgroundColor:
                        (outsideCount > 0 ? colors.warning : colors.success) + '16',
                    },
                  ]}
                  accessible
                  accessibilityLabel={
                    outsideCount > 0
                      ? `${outsideCount} reading${outsideCount === 1 ? '' : 's'} outside tolerance`
                      : 'All readings within tolerance'
                  }
                >
                  <Text
                    style={[
                      styles.summaryPillText,
                      { color: outsideCount > 0 ? colors.warning : colors.success },
                    ]}
                  >
                    {outsideCount > 0
                      ? `${outsideCount} outside tolerance`
                      : 'All within tolerance'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
              {measuredCount} of {rows.length} readings recorded
              {deviation ? ` · tolerance ±${formatNumber(deviation.tolerance)}` : ''}
            </Text>
            {rows.length === 0 ? (
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                This feature has no recorded attributes yet.
              </Text>
            ) : (
              rows.map((row) => {
                const dev = deviationByKey.get(row.key);
                const changed = row.planned && row.asBuilt && row.planned !== row.asBuilt;
                const badgeColor = dev
                  ? dev.within_tolerance
                    ? colors.success
                    : colors.warning
                  : null;
                return (
                  <View key={row.key} style={styles.row}>
                    <Text style={[styles.key, { color: colors.textSecondary }]} numberOfLines={2}>
                      {row.label}
                    </Text>
                    <View style={styles.rowRight}>
                      <View style={styles.values}>
                        <Text
                          style={[styles.planned, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {row.planned ?? '—'}
                        </Text>
                        <Text
                          style={[
                            styles.asBuilt,
                            { color: !dev && changed ? colors.warning : colors.textPrimary },
                          ]}
                          numberOfLines={1}
                        >
                          {row.asBuilt ?? '—'}
                        </Text>
                      </View>
                      {dev && badgeColor ? (
                        <View
                          style={[styles.deviationBadge, { backgroundColor: badgeColor + '16' }]}
                          accessible
                          accessibilityLabel={`${row.label}: ${
                            dev.within_tolerance ? 'within' : 'outside'
                          } tolerance, planned ${formatNumber(dev.planned)}${
                            dev.unit ? ` ${dev.unit}` : ''
                          }, as built ${formatNumber(dev.as_built)}${
                            dev.unit ? ` ${dev.unit}` : ''
                          }, difference ${formatNumber(dev.delta)}`}
                        >
                          {dev.within_tolerance ? (
                            <CheckCircle size={11} stroke={badgeColor} />
                          ) : (
                            <AlertTriangle size={11} stroke={badgeColor} />
                          )}
                          <Text style={[styles.deviationText, { color: badgeColor }]}>
                            {dev.within_tolerance ? 'within tolerance' : 'outside tolerance'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
            {rows.length > 0 && (
              <View style={styles.legendRow}>
                <Text style={[styles.legend, { color: colors.textTertiary }]}>planned</Text>
                <Text style={[styles.legend, { color: colors.textTertiary }]}>as-built</Text>
              </View>
            )}
            {canRecord && (
              <Button
                title="Record measurements"
                variant="primary"
                size="sm"
                icon={<Ruler size={16} stroke={colors.onPrimary} />}
                onPress={() => setEntryOpen(true)}
                style={{ marginTop: Spacing.md }}
              />
            )}

            {feature.status === 'under_review' ? (
              <Text style={[styles.submitNote, { color: colors.textSecondary }]}>
                Submitted — waiting for the planner&apos;s review.
              </Text>
            ) : canSubmit ? (
              confirmingSubmit ? (
                <View
                  style={[
                    styles.confirmBox,
                    { backgroundColor: colors.background, borderColor: colors.outline },
                  ]}
                >
                  <Text style={[styles.confirmText, { color: colors.textPrimary }]}>
                    Submit this feature for review? It leaves your queue and goes to the
                    planner.
                  </Text>
                  <View style={styles.confirmRow}>
                    <Button
                      title="Keep editing"
                      variant="tertiary"
                      fullWidth={false}
                      style={styles.confirmBtn}
                      onPress={() => setConfirmingSubmit(false)}
                      disabled={submitting}
                    />
                    <Button
                      title="Yes, submit"
                      fullWidth={false}
                      style={styles.confirmBtn}
                      loading={submitting}
                      onPress={handleSubmit}
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Button
                    title="Submit for review"
                    variant="secondary"
                    size="sm"
                    icon={<Send size={16} stroke={colors.primary} />}
                    disabled={measuredCount === 0}
                    onPress={() => setConfirmingSubmit(true)}
                    style={{ marginTop: Spacing.sm }}
                  />
                  {measuredCount === 0 && (
                    <Text style={[styles.submitHint, { color: colors.textTertiary }]}>
                      Record at least one reading before submitting.
                    </Text>
                  )}
                </>
              )
            ) : null}
          </View>

          {feature.comparison_notes ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Notes</Text>
              <Text style={[styles.notes, { color: colors.textSecondary }]}>
                {feature.comparison_notes}
              </Text>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Site photos ({photos.length})
            </Text>
            {photos.length === 0 ? (
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                No photos captured for this feature yet.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photoRow}>
                  {photos.map((photo) => (
                    <Image
                      key={photo.id}
                      source={{ uri: photo.url }}
                      style={styles.photo}
                      accessibilityLabel={photo.description || 'Site photo'}
                    />
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <Text style={[styles.footnote, { color: colors.textTertiary }]}>
            The planned values are the approved LLD baseline. As-built readings are the
            supervisor&apos;s field measurements; the design itself is never edited here.
          </Text>
        </ScrollView>
      )}

      {feature ? (
        <MeasurementEntrySheet
          visible={entryOpen}
          feature={feature}
          photos={photos}
          photoLimit={photoLimit}
          onPhotosChanged={setPhotos}
          onClose={() => setEntryOpen(false)}
          onSaved={handleSaved}
        />
      ) : null}

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { ...Type.meta, marginTop: 2 },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },
  card: { borderRadius: Radius.lg, padding: Spacing.lg },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  summaryPill: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  summaryPillText: { fontSize: 11, fontWeight: '700' },
  cardHint: { ...Type.meta, marginTop: 2, marginBottom: Spacing.sm },
  muted: { ...Type.body, marginTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000012',
  },
  key: { ...Type.meta, flex: 1.2 },
  rowRight: { flex: 1, alignItems: 'flex-end', gap: 4 },
  values: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'flex-end' },
  planned: { fontSize: 13, fontWeight: '600', textAlign: 'right' },
  asBuilt: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  deviationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  deviationText: { fontSize: 10, fontWeight: '700' },
  submitNote: { ...Type.meta, marginTop: Spacing.md },
  submitHint: { ...Type.meta, marginTop: 6, textAlign: 'center' },
  confirmBox: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  confirmText: { ...Type.body },
  confirmRow: { flexDirection: 'row', gap: Spacing.sm },
  confirmBtn: { flex: 1 },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.xl,
    marginTop: Spacing.sm,
  },
  legend: { ...Type.meta, textTransform: 'uppercase', letterSpacing: 0.4 },
  notes: { ...Type.body, marginTop: Spacing.sm },
  photoRow: { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm },
  photo: { width: 132, height: 96, borderRadius: Radius.md, backgroundColor: '#00000010' },
  footnote: { ...Type.meta, lineHeight: 17, textAlign: 'center', marginTop: Spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  errorTitle: { fontSize: 16, fontWeight: '600' },
  errorText: { ...Type.body, textAlign: 'center' },
});
