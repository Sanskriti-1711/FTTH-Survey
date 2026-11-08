import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle,
  Image as ImageIcon,
  Plus,
  Ruler,
  Send,
  Trash2,
} from 'lucide-react-native';
import MapLibreMap, { type MapLayerData } from '../../../lib/components/MapLibreMap';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Toast } from '../../../components/ui/Toast';
import { entryFields } from '../../../lib/components/MeasurementEntrySheet';
import SpanInspectionForm from '../../../lib/components/SpanInspectionForm';
import {
  getFeaturePhotos,
  submitFeatures,
  updateFieldMeasurements,
  uploadFeaturePhotoToGallery,
  type FeaturePhotoData,
} from '../../../lib/api/features';
import { displayValue, getSupervisionFeature, lldVersionLabel } from '../../../lib/api/supervision';
import {
  applySpanInspection,
  inspectionProgress,
  NUMERIC_INSPECTION_KEYS,
  seedSpanInspection,
  type CheckValue,
} from '../../../lib/utils/spanInspection';
import { getProject } from '../../../lib/api/projects';
import type { Feature, FieldSchemaField, Project } from '../../../lib/utils/types';
import { useAuthStore } from '../../../lib/stores/auth';
import { useThemeStore } from '../../../lib/stores/theme';
import { Radius, Spacing, Type } from '../../../lib/theme/colors';

// ── One assigned span ─────────────────────────────────────────────────────
//
// A supervision task is a single feature: the span this engineer was assigned.
// The screen therefore frames only that geometry, keeps the photos directly
// under the map, and puts the inspection form under the photos. Nothing from
// the rest of the project is shown, and nothing here edits the LLD baseline.

type GeoFeature = MapLayerData['features'][number];

function toGeoFeature(feature: Feature): GeoFeature {
  return {
    type: 'Feature',
    geometry: feature.geometry as GeoFeature['geometry'],
    properties: { ...feature.properties, id: feature.id, _feature_id: feature.id },
  };
}

function collectCoords(geometry: unknown, out: [number, number][]): void {
  if (!geometry || typeof geometry !== 'object') return;
  const g = geometry as { coordinates?: unknown };
  if (!Array.isArray(g.coordinates)) return;
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(g.coordinates);
}

function readingText(entry: unknown): string {
  if (entry && typeof entry === 'object' && 'value' in entry) {
    const value = (entry as { value: unknown }).value;
    return value === null || value === undefined ? '' : String(value);
  }
  return entry === null || entry === undefined ? '' : String(entry);
}

function readingFlag(entry: unknown): boolean {
  if (entry && typeof entry === 'object' && 'value' in entry) {
    return Boolean((entry as { value: unknown }).value);
  }
  return entry === true || entry === 'true' || entry === 1 || entry === '1';
}

function fieldUnit(field: FieldSchemaField): string {
  return typeof field.unit === 'string' ? field.unit : '';
}

function seedValues(feature: Feature): Record<string, string | boolean> {
  const saved = (feature.field_measurements ?? {}) as Record<string, unknown>;
  const values: Record<string, string | boolean> = {};
  for (const field of entryFields(feature)) {
    const entry = saved[field.key];
    values[field.key] = field.type === 'boolean' ? readingFlag(entry) : readingText(entry);
  }
  return values;
}

interface CustomField {
  key: string;
  label: string;
  value: string;
  unit: string;
}

/** Engineer-added fields live beside readings in field_measurements, tagged. */
function readCustomFields(measurements: Record<string, unknown> | null | undefined): CustomField[] {
  return Object.entries(measurements ?? {}).flatMap(([key, raw]) => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as { value?: unknown; unit?: string; label?: string; custom?: boolean };
    if (!entry.custom && !key.startsWith('custom_')) return [];
    return [
      {
        key,
        label: entry.label ?? key.replace(/^custom_/, '').replace(/_/g, ' '),
        value: entry.value === null || entry.value === undefined ? '' : String(entry.value),
        unit: entry.unit ?? '',
      },
    ];
  });
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export default function SupervisionFeatureScreen() {
  const params = useLocalSearchParams<{
    featureId?: string;
    projectId?: string;
    spanId?: string;
    spanFeatureCount?: string;
  }>();
  const featureId = String(params.featureId ?? '');
  const projectId = String(params.projectId ?? '');
  const spanId = String(params.spanId ?? '');
  const spanFeatureCount = Number(params.spanFeatureCount ?? 0) || 0;
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();

  const [project, setProject] = useState<Project | null>(null);
  const [feature, setFeature] = useState<Feature | null>(null);
  const [layerName, setLayerName] = useState('');
  const [photos, setPhotos] = useState<FeaturePhotoData[]>([]);
  const [photoLimit, setPhotoLimit] = useState(0);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [inspectionValues, setInspectionValues] = useState<Record<string, string>>({});
  const [inspectionChecks, setInspectionChecks] = useState<Record<string, CheckValue>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ visible: false, message: '', type: 'success' });

  const load = useCallback(async () => {
    if (!projectId || !featureId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, proj] = await Promise.all([
        getSupervisionFeature(projectId, featureId),
        getProject(projectId).catch(() => null),
      ]);
      setFeature(data.feature);
      setProject(proj);
      setLayerName(data.layer_name || data.feature.layer_name || data.feature.layer_id);
      setValues(seedValues(data.feature));
      const inspection = seedSpanInspection({
        feature: data.feature,
        projectId,
        inspectorName: user?.full_name ?? '',
        spanId,
      });
      setInspectionValues(inspection.values);
      setInspectionChecks(inspection.checks);
      setNotes(data.feature.comparison_notes ?? '');
      setCustomFields(
        readCustomFields(data.feature.field_measurements as Record<string, unknown> | null),
      );
      try {
        const gallery = await getFeaturePhotos(featureId);
        setPhotos(gallery.results ?? []);
        setPhotoLimit(gallery.max_photos ?? 0);
      } catch {
        setPhotos([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this span');
    } finally {
      setLoading(false);
    }
  }, [featureId, projectId, spanId, user?.full_name]);

  useEffect(() => {
    void load();
  }, [load]);

  const fields = useMemo(
    () =>
      entryFields(feature).filter(
        (field) =>
          !/(depth|width|length|trench|surface|utilit|gps|joint|span|inspection|sub.?span)/i.test(
            `${field.key} ${field.label}`,
          ),
      ),
    [feature],
  );
  const planned = useMemo(
    () => (feature?.properties ?? {}) as Record<string, unknown>,
    [feature?.properties],
  );

  const mapLayers: MapLayerData[] = useMemo(
    () =>
      feature?.geometry
        ? [
            {
              id: 'assigned-span',
              name: layerName || 'Assigned span',
              color: colors.primary,
              visible: true,
              features: [toGeoFeature(feature)],
            },
          ]
        : [],
    [feature, layerName, colors.primary],
  );

  const fitBounds = useMemo(() => {
    const coords: [number, number][] = [];
    collectCoords(feature?.geometry ?? null, coords);
    if (coords.length === 0) return null;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return {
      bounds: [
        Math.min(...lngs),
        Math.min(...lats),
        Math.max(...lngs),
        Math.max(...lats),
      ] as [number, number, number, number],
      padding: { top: 40, right: 30, bottom: 40, left: 30 },
      ts: 1,
    };
  }, [feature?.geometry]);

  const measuredCount =
    fields.filter((field) => {
      const value = values[field.key];
      return typeof value === 'boolean' ? true : String(value ?? '').trim() !== '';
    }).length + inspectionProgress(inspectionValues, inspectionChecks);

  const deviation = feature?.deviation ?? null;
  const outsideCount = deviation?.fields.filter((field) => !field.within_tolerance).length ?? 0;

  const canSubmit =
    feature?.status === 'pending' ||
    feature?.status === 'assigned' ||
    feature?.status === 'redo';

  const setValue = (key: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const setInspectionValue = (key: string, value: string) =>
    setInspectionValues((prev) => ({ ...prev, [key]: value }));

  const setInspectionCheck = (key: string, value: CheckValue) =>
    setInspectionChecks((prev) => ({ ...prev, [key]: value }));

  const updateCustom = (key: string, patch: Partial<CustomField>) =>
    setCustomFields((prev) => prev.map((field) => (field.key === key ? { ...field, ...patch } : field)));

  const addCustomField = () =>
    setCustomFields((prev) => [
      ...prev,
      { key: `custom_${Date.now().toString(36)}`, label: '', value: '', unit: '' },
    ]);

  const removeCustomField = (key: string) =>
    setCustomFields((prev) => prev.filter((field) => field.key !== key));

  const addPhoto = async (source: 'camera' | 'library') => {
    if (!feature || uploadingPhoto) return;
    try {
      let asset: ImagePicker.ImagePickerAsset | undefined;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          setToast({ visible: true, message: 'Camera permission is needed.', type: 'error' });
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
        asset = result.canceled ? undefined : result.assets?.[0];
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsEditing: false,
          mediaTypes: ['images'],
        });
        asset = result.canceled ? undefined : result.assets?.[0];
      }
      if (!asset) return;

      setUploadingPhoto(true);
      const uploaded = await uploadFeaturePhotoToGallery(feature.id, {
        uri: asset.uri,
        name: asset.fileName ?? `span-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
      setPhotos((prev) => [...prev, ...(uploaded.uploaded ?? [])]);
      setToast({ visible: true, message: 'Photo attached to this span', type: 'success' });
    } catch (err) {
      setToast({
        visible: true,
        message: err instanceof Error ? err.message : 'Could not upload this photo.',
        type: 'error',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!feature || saving) return;

    const missing = fields.filter((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      return typeof value === 'boolean' ? false : String(value ?? '').trim() === '';
    });
    if (missing.length > 0) {
      setToast({
        visible: true,
        message: `Add a reading for ${missing.map((field) => field.label).join(', ')}.`,
        type: 'error',
      });
      return;
    }

    const invalid = fields.filter((field) => {
      if (field.type !== 'number') return false;
      const value = String(values[field.key] ?? '').trim();
      return value !== '' && Number.isNaN(Number(value));
    });
    if (invalid.length > 0) {
      setToast({
        visible: true,
        message: `${invalid.map((field) => field.label).join(', ')} must be a number.`,
        type: 'error',
      });
      return;
    }

    const invalidInspection = NUMERIC_INSPECTION_KEYS.filter((key) => {
      const value = String(inspectionValues[key] ?? '').trim();
      return value !== '' && Number.isNaN(Number(value));
    });
    if (invalidInspection.length > 0) {
      setToast({
        visible: true,
        message: 'Measured length, depth and width must be numbers.',
        type: 'error',
      });
      return;
    }

    const incompleteCustom = customFields.find(
      (field) => field.label.trim() !== '' && field.value.trim() === '',
    );
    if (incompleteCustom) {
      setToast({
        visible: true,
        message: `Add a value for “${incompleteCustom.label.trim()}”.`,
        type: 'error',
      });
      return;
    }

    // Start from what the server holds so readings from fields this screen
    // does not render are kept, then overwrite the ones being edited.
    const saved: Record<string, unknown> = {
      ...((feature.field_measurements ?? {}) as Record<string, unknown>),
    };
    for (const field of fields) delete saved[field.key];
    for (const custom of customFields) delete saved[custom.key];

    for (const field of fields) {
      const value = values[field.key];
      if (field.type === 'boolean') {
        saved[field.key] = { value: Boolean(value), unit: fieldUnit(field) };
        continue;
      }
      const text = String(value ?? '').trim();
      if (!text) continue;
      saved[field.key] = {
        value: field.type === 'number' ? Number(text) : text,
        unit: fieldUnit(field),
      };
    }

    for (const custom of customFields) {
      if (!custom.label.trim()) continue;
      saved[custom.key] = {
        value: custom.value.trim(),
        unit: custom.unit.trim(),
        label: custom.label.trim(),
        custom: true,
      };
    }

    const savedWithInspection = applySpanInspection(
      saved,
      inspectionValues,
      inspectionChecks,
    );

    setSaving(true);
    try {
      const result = await updateFieldMeasurements(
        feature.id,
        savedWithInspection,
        notes.trim(),
      );
      setFeature((prev) =>
        prev
          ? {
              ...prev,
              field_measurements: result.field_measurements,
              comparison_notes: result.comparison_notes,
            }
          : prev,
      );
      setToast({ visible: true, message: 'Span inspection saved', type: 'success' });
    } catch (err) {
      setToast({
        visible: true,
        message: err instanceof Error ? err.message : 'Could not save this inspection.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!feature || !user || submitting) return;
    setSubmitting(true);
    try {
      await submitFeatures([feature.id], user.id);
      setFeature((prev) => (prev ? { ...prev, status: 'under_review' } : prev));
      setConfirmingSubmit(false);
      setToast({ visible: true, message: 'Span submitted for review', type: 'success' });
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

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            Loading assigned span…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !feature) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
            Couldn&apos;t load this span
          </Text>
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            {error ?? 'This span is no longer available.'}
          </Text>
          <Button title="Try Again" variant="secondary" size="sm" onPress={load} />
        </View>
      </SafeAreaView>
    );
  }

  const atPhotoLimit = photoLimit > 0 && photos.length >= photoLimit;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to supervision tasks"
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {layerName || 'Assigned span'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {project
              ? `${project.name} · ${lldVersionLabel(project)}${spanId ? ` · Span ${spanId}` : ''}`
              : 'Supervision span'}
          </Text>
        </View>
        <StatusBadge status={feature.status} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* The assigned span, and nothing else */}
        <View style={[styles.mapCard, { backgroundColor: colors.surface }]}>
          <MapLibreMap
            layers={mapLayers}
            height={220}
            fitBounds={fitBounds}
            emptyState={{
              title: 'No geometry on this span',
              description: 'The LLD handoff did not carry a geometry for this feature.',
            }}
          />
          <View style={styles.mapCaption}>
            <Ruler size={13} stroke={colors.textTertiary} />
            <Text style={[styles.mapCaptionText, { color: colors.textTertiary }]}>
              {feature.geometry
                ? 'Assigned span only · planned LLD geometry'
                : 'Span geometry unavailable'}
            </Text>
          </View>
        </View>

        {/* Field evidence */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Site photos</Text>
            <Text style={[styles.countLabel, { color: colors.textTertiary }]}>
              {photos.length}
              {photoLimit > 0 ? ` / ${photoLimit}` : ''}
            </Text>
          </View>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            Capture the installed span, or upload a photo from the gallery.
          </Text>

          {photos.length > 0 ? (
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
          ) : (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>
              No photos attached to this span yet.
            </Text>
          )}

          {atPhotoLimit ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>
              This span already has the maximum of {photoLimit} photos.
            </Text>
          ) : (
            <View style={styles.photoActions}>
              {Platform.OS !== 'web' && (
                <Button
                  title="Take photo"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  style={styles.photoBtn}
                  icon={<Camera size={16} stroke={colors.primary} />}
                  loading={uploadingPhoto}
                  onPress={() => addPhoto('camera')}
                />
              )}
              <Button
                title={Platform.OS === 'web' ? 'Choose photo' : 'Gallery'}
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={styles.photoBtn}
                icon={<ImageIcon size={16} stroke={colors.primary} />}
                loading={uploadingPhoto}
                onPress={() => addPhoto('library')}
              />
            </View>
          )}
        </View>

        {/* The inspection form */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Trench inspection</Text>
            {deviation && deviation.fields.length > 0 ? (
              <View
                style={[
                  styles.summaryPill,
                  {
                    backgroundColor:
                      (outsideCount > 0 ? colors.warning : colors.success) + '16',
                  },
                ]}
              >
                {outsideCount > 0 ? (
                  <AlertTriangle size={11} stroke={colors.warning} />
                ) : (
                  <CheckCircle size={11} stroke={colors.success} />
                )}
                <Text
                  style={[
                    styles.summaryPillText,
                    { color: outsideCount > 0 ? colors.warning : colors.success },
                  ]}
                >
                  {outsideCount > 0
                    ? `${outsideCount} outside tolerance`
                    : 'Within tolerance'}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            {measuredCount} inspection fields recorded · planned values stay read-only
          </Text>

          <SpanInspectionForm
            values={inspectionValues}
            checks={inspectionChecks}
            spanFeatureCount={spanFeatureCount}
            onValueChange={setInspectionValue}
            onCheckChange={setInspectionCheck}
          />

          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            Other layer readings
          </Text>

          {fields.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textSecondary }]}>
              No additional layer readings.
            </Text>
          ) : (
            fields.map((field) => {
              const plannedText = displayValue(planned[field.key]);
              const value = values[field.key];
              return (
                <View key={field.key} style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                      {field.label}
                      {field.required ? ' *' : ''}
                      {fieldUnit(field) ? ` (${fieldUnit(field)})` : ''}
                    </Text>
                    {plannedText ? (
                      <Text style={[styles.planned, { color: colors.textTertiary }]}>
                        planned {plannedText}
                      </Text>
                    ) : null}
                  </View>

                  {field.type === 'boolean' ? (
                    <TouchableOpacity
                      style={[
                        styles.toggle,
                        {
                          backgroundColor: value ? colors.success + '20' : colors.background,
                          borderColor: value ? colors.success : colors.outline,
                        },
                      ]}
                      onPress={() => setValue(field.key, !value)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: Boolean(value) }}
                      accessibilityLabel={field.label}
                    >
                      <Text
                        style={{
                          color: value ? colors.success : colors.textSecondary,
                          fontWeight: '600',
                        }}
                      >
                        {value ? 'Yes' : 'No'}
                      </Text>
                    </TouchableOpacity>
                  ) : field.type === 'select' && field.options ? (
                    <View style={styles.chips}>
                      {field.options.map((option) => {
                        const selected = value === option.value;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: selected ? colors.primary : colors.background,
                                borderColor: selected ? colors.primary : colors.outline,
                              },
                            ]}
                            onPress={() => setValue(field.key, option.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={option.label}
                          >
                            <Text
                              style={{
                                color: selected ? colors.onPrimary : colors.textSecondary,
                                fontSize: 13,
                                fontWeight: '600',
                              }}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : field.type === 'textarea' ? (
                    <TextInput
                      style={[
                        styles.textarea,
                        {
                          color: colors.textPrimary,
                          borderColor: colors.outline,
                          backgroundColor: colors.background,
                        },
                      ]}
                      value={String(value ?? '')}
                      onChangeText={(text) => setValue(field.key, text)}
                      placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`}
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      numberOfLines={3}
                      accessibilityLabel={field.label}
                    />
                  ) : (
                    <View
                      style={[
                        styles.inputWrap,
                        { borderColor: colors.outline, backgroundColor: colors.background },
                      ]}
                    >
                      <TextInput
                        style={[styles.input, { color: colors.textPrimary }]}
                        value={String(value ?? '')}
                        onChangeText={(text) => setValue(field.key, text)}
                        placeholder={
                          field.placeholder ??
                          `Enter ${field.label.toLowerCase()}${plannedText ? ` (planned ${plannedText})` : ''}`
                        }
                        placeholderTextColor={colors.textTertiary}
                        keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'}
                        accessibilityLabel={field.label}
                      />
                      {fieldUnit(field) ? (
                        <Text style={[styles.unit, { color: colors.textTertiary }]}>
                          {fieldUnit(field)}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* Engineer-added fields */}
          <View style={[styles.customHeader, { borderTopColor: colors.outlineLight }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                Engineer-added fields
              </Text>
              <Text style={[styles.customHint, { color: colors.textTertiary }]}>
                Anything else the planner should know, saved with this span.
              </Text>
            </View>
            <Button
              title="Add field"
              variant="secondary"
              size="sm"
              fullWidth={false}
              icon={<Plus size={15} stroke={colors.primary} />}
              onPress={addCustomField}
            />
          </View>

          {customFields.map((custom) => (
            <View
              key={custom.key}
              style={[styles.customRow, { borderColor: colors.outlineLight }]}
            >
              <View style={styles.customTopRow}>
                <TextInput
                  style={[
                    styles.customLabelInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.outline,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={custom.label}
                  onChangeText={(text) => updateCustom(custom.key, { label: text })}
                  placeholder="Field name (e.g. trench depth)"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Custom field name"
                />
                <TouchableOpacity
                  onPress={() => removeCustomField(custom.key)}
                  style={styles.removeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${custom.label || 'custom field'}`}
                >
                  <Trash2 size={17} stroke={colors.error} />
                </TouchableOpacity>
              </View>
              <View style={styles.customValueRow}>
                <TextInput
                  style={[
                    styles.customValueInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.outline,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={custom.value}
                  onChangeText={(text) => updateCustom(custom.key, { value: text })}
                  placeholder="Value"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Custom field value"
                />
                <TextInput
                  style={[
                    styles.customUnitInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.outline,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={custom.unit}
                  onChangeText={(text) => updateCustom(custom.key, { unit: text })}
                  placeholder="Unit"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Custom field unit"
                />
              </View>
            </View>
          ))}

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
              Remarks
            </Text>
            <TextInput
              style={[
                styles.textarea,
                {
                  color: colors.textPrimary,
                  borderColor: colors.outline,
                  backgroundColor: colors.background,
                },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything the planner should know — access, extra depth, a changed route…"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              accessibilityLabel="Remarks"
            />
          </View>

          <Button
            title="Save inspection"
            loading={saving}
            onPress={handleSave}
            style={{ marginTop: Spacing.sm }}
          />
        </View>

        {/* Planned vs as-built, computed by the backend */}
        {deviation && deviation.fields.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Planned vs as-built
            </Text>
            <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
              Tolerance ±{formatNumber(deviation.tolerance)}
            </Text>
            {deviation.fields.map((row) => (
              <View key={row.key} style={styles.deviationRow}>
                <Text style={[styles.deviationKey, { color: colors.textSecondary }]} numberOfLines={1}>
                  {row.key.replace(/_/g, ' ')}
                </Text>
                <Text style={[styles.deviationValue, { color: colors.textPrimary }]}>
                  {formatNumber(row.planned)} → {formatNumber(row.as_built)}
                </Text>
                <Text
                  style={[
                    styles.deviationState,
                    { color: row.within_tolerance ? colors.success : colors.warning },
                  ]}
                >
                  {row.within_tolerance ? 'within' : 'outside'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Submit */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {feature.status === 'under_review' ? (
            <Text style={[styles.submitNote, { color: colors.textSecondary }]}>
              Submitted — waiting for the planner&apos;s review.
            </Text>
          ) : canSubmit ? (
            confirmingSubmit ? (
              <View style={[styles.confirmBox, { borderColor: colors.outline }]}>
                <Text style={[styles.confirmText, { color: colors.textPrimary }]}>
                  Submit this span for review? It leaves your queue and goes to the planner.
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
                  title="Submit span for review"
                  variant="secondary"
                  icon={<Send size={16} stroke={colors.primary} />}
                  disabled={measuredCount === 0}
                  onPress={() => setConfirmingSubmit(true)}
                />
                {measuredCount === 0 && (
                  <Text style={[styles.submitHint, { color: colors.textTertiary }]}>
                    Record at least one reading before submitting.
                  </Text>
                )}
              </>
            )
          ) : (
            <Text style={[styles.submitNote, { color: colors.textSecondary }]}>
              This span is already {feature.status.replace(/_/g, ' ')}.
            </Text>
          )}
        </View>

        <Text style={[styles.footnote, { color: colors.textTertiary }]}>
          The planned values are the approved LLD baseline. Readings and photos are evidence
          recorded against this span; the design itself is never edited here.
        </Text>
      </ScrollView>

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
  mapCard: { borderRadius: Radius.lg, overflow: 'hidden' },
  mapCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  mapCaptionText: { ...Type.meta },
  card: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  countLabel: { ...Type.meta, fontWeight: '600' },
  cardHint: { ...Type.meta, marginTop: 2 },
  sectionLabel: {
    ...Type.meta,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
  },
  muted: { ...Type.body, marginTop: Spacing.sm },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  summaryPillText: { fontSize: 11, fontWeight: '700' },
  photoRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
  photo: { width: 104, height: 78, borderRadius: Radius.md, backgroundColor: '#00000010' },
  photoActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  photoBtn: { flex: 1 },
  field: { gap: Spacing.xs, marginTop: Spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm },
  fieldLabel: { ...Type.label, fontWeight: '600', flex: 1 },
  planned: { ...Type.meta },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: Spacing.sm },
  unit: { fontSize: 13, fontWeight: '600', marginLeft: Spacing.sm },
  textarea: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 88,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  toggle: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
    justifyContent: 'center',
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
  },
  customHint: { ...Type.meta, marginTop: 2 },
  customRow: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  customTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  customLabelInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    fontSize: 14,
  },
  removeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  customValueRow: { flexDirection: 'row', gap: Spacing.sm },
  customValueInput: {
    flex: 2,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    fontSize: 14,
  },
  customUnitInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    fontSize: 14,
  },
  deviationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000010',
  },
  deviationKey: { ...Type.meta, flex: 1 },
  deviationValue: { fontSize: 13, fontWeight: '600' },
  deviationState: { fontSize: 11, fontWeight: '700', width: 52, textAlign: 'right' },
  confirmBox: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  confirmText: { ...Type.body },
  confirmRow: { flexDirection: 'row', gap: Spacing.sm },
  confirmBtn: { flex: 1 },
  submitNote: { ...Type.meta },
  submitHint: { ...Type.meta, marginTop: 6, textAlign: 'center' },
  footnote: { ...Type.meta, lineHeight: 17, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  centerText: { ...Type.body, textAlign: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '600' },
});
