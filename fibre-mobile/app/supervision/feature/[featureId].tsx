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
import { ArrowLeft } from 'lucide-react-native';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { getFeaturePhotos, type FeaturePhotoData } from '../../../lib/api/features';
import { displayValue, getSupervisionFeature, measurementValue } from '../../../lib/api/supervision';
import type { Feature } from '../../../lib/utils/types';
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

export default function SupervisionFeatureScreen() {
  const params = useLocalSearchParams<{ featureId?: string; projectId?: string }>();
  const featureId = String(params.featureId ?? '');
  const projectId = String(params.projectId ?? '');
  const colors = useThemeStore((s) => s.colors);

  const [feature, setFeature] = useState<Feature | null>(null);
  const [layerName, setLayerName] = useState('');
  const [photos, setPhotos] = useState<FeaturePhotoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Planned vs as-built
            </Text>
            <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
              {measuredCount} of {rows.length} readings recorded
            </Text>
            {rows.length === 0 ? (
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                This feature has no recorded attributes yet.
              </Text>
            ) : (
              rows.map((row) => {
                const changed = row.planned && row.asBuilt && row.planned !== row.asBuilt;
                return (
                  <View key={row.key} style={styles.row}>
                    <Text style={[styles.key, { color: colors.textSecondary }]} numberOfLines={2}>
                      {row.label}
                    </Text>
                    <View style={styles.values}>
                      <Text style={[styles.planned, { color: colors.textPrimary }]} numberOfLines={1}>
                        {row.planned ?? '—'}
                      </Text>
                      <Text
                        style={[
                          styles.asBuilt,
                          { color: changed ? colors.warning : colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {row.asBuilt ?? '—'}
                      </Text>
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
  values: { flex: 1, flexDirection: 'row', gap: Spacing.md, justifyContent: 'flex-end' },
  planned: { fontSize: 13, fontWeight: '600', textAlign: 'right' },
  asBuilt: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
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
