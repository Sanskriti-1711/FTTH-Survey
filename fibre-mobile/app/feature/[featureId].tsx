import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { useAuthStore } from '../../lib/stores/auth';
import { useSurveyStore } from '../../lib/stores/survey';
import { useImageStore } from '../../lib/stores/image';
import { useProjectStore } from '../../lib/stores/project';
import { getFeatureDetail as apiGetFeatureDetail } from '../../lib/api/projects';
import { getDemoFeatureDetail, getLayerSchema } from '../../lib/stores/demo-data';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Toast } from '../../components/ui/Toast';
import LayerEditor from '../../lib/components/LayerEditor';
import FeatureSurveySections from '../../lib/components/FeatureSurveySections';
import { Spacing, Radius } from '../../lib/theme/colors';
import {
  ArrowLeft,
  Save,
  CheckCircle,
  AlertTriangle,
  Camera,
  MapPin,
  Crosshair,
  Edit3,
  Move,
  ClipboardList,
} from 'lucide-react-native';
import { useSurveyFeaturesStore } from '../../lib/stores/survey-features';
import type { Feature, GeoJSONFeature } from '../../lib/utils/types';

// ── Feature Detail Screen ─────────────────────────────────────────────────

export default function FeatureDetailScreen() {
  const { featureId, projectId: routeProjectId } = useLocalSearchParams<{ featureId: string; projectId: string }>();
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();
  const { updateFieldMeasurements, submitFeatures, isLoading } = useSurveyStore();
  const { addPhoto } = useImageStore();

  const [feature, setFeature] = useState<Feature | null>(null);
  const [geojson, setGeojson] = useState<GeoJSONFeature | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [loading, setLoading] = useState(true);

  const { demoMode } = useAuthStore();
  const { projectGeojsons } = useProjectStore();

  useEffect(() => {
    if (!featureId) return;
    loadData();
  }, [featureId, routeProjectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (demoMode && featureId?.startsWith('demo-')) {
        const detail = getDemoFeatureDetail(featureId as string);
        setFeature(detail.feature);
        setGeojson(detail.geojson);
        setMeasurements((detail.feature.field_measurements as Record<string, unknown>) ?? {});
        setNotes(detail.feature.comparison_notes ?? '');
      } else if (routeProjectId) {
        try {
          const data = await apiGetFeatureDetail(routeProjectId, featureId as string);
          setFeature(data.feature);
          setGeojson(data.geojson);
          setMeasurements((data.feature.field_measurements as Record<string, unknown>) ?? {});
          setNotes(data.feature.comparison_notes ?? '');
        } catch {
          // API failed — try to find imported feature from project store
          const found = findImportedFeature(featureId as string, projectGeojsons);
          if (found) {
            setFeature(found.feature);
            setGeojson(found.geojson);
            setMeasurements({});
            setNotes('');
          } else {
            // Try survey features store
            const surveyFound = findSurveyFeature(featureId as string);
            if (surveyFound) {
              setFeature(surveyFound.feature);
              setGeojson(surveyFound.geojson);
              setMeasurements({});
              setNotes('');
            } else {
              showToast('Failed to load feature details', 'error');
            }
          }
        }
      } else {
        // No routeProjectId — lookup in imported data
        const found = findImportedFeature(featureId as string, projectGeojsons);
        if (found) {
          setFeature(found.feature);
          setGeojson(found.geojson);
          setMeasurements({});
          setNotes('');
        } else {
          // Try survey features store
          const surveyFound = findSurveyFeature(featureId as string);
          if (surveyFound) {
            setFeature(surveyFound.feature);
            setGeojson(surveyFound.geojson);
            setMeasurements({});
            setNotes('');
          } else {
            setLoading(false);
          }
        }
      }
    } catch {
      showToast('Failed to load feature details', 'error');
    } finally {
      setLoading(false);
    }
  };

  /** Look up an imported feature by ID in projectGeojsons */
  function findImportedFeature(
    fid: string,
    geojsons: Record<string, import('../../lib/utils/types').GeoJSONFeature[]>
  ): { feature: import('../../lib/utils/types').Feature; geojson: import('../../lib/utils/types').GeoJSONFeature } | null {
    // Try 1: Direct property match (original GeoJSON had an id in properties)
    for (const [layerId, features] of Object.entries(geojsons)) {
      const idx = features.findIndex((f) => f.properties?.id === fid || f.properties?._id === fid);
      if (idx !== -1) {
        const gf = features[idx];
        const feat: import('../../lib/utils/types').Feature = {
          id: fid,
          layer_name: layerId.toUpperCase(),
          layer_id: layerId,
          properties: (gf.properties as Record<string, unknown>) ?? {},
          field_schema: null,
          field_measurements: null,
          comparison_notes: '',
          status: 'assigned',
          photo_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return { feature: feat, geojson: gf };
      }
    }

    // Try 2: Parse imported feature ID pattern: imp-feat-{layerId}-{index}
    const match = fid.match(/^imp-feat-(.+?)-(\d+)$/);
    if (match) {
      const [, layerId, idxStr] = match;
      const idx = parseInt(idxStr, 10) - 1;
      const features = geojsons[layerId];
      if (features && features[idx]) {
        const gf = features[idx];
        const feat: import('../../lib/utils/types').Feature = {
          id: fid,
          layer_name: layerId.toUpperCase(),
          layer_id: layerId,
          properties: (gf.properties as Record<string, unknown>) ?? {},
          field_schema: null,
          field_measurements: null,
          comparison_notes: '',
          status: 'assigned',
          photo_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return { feature: feat, geojson: gf };
      }
    }

    return null;
  }

  /** Look up a survey feature by ID in the survey-features store */
  function findSurveyFeature(
    fid: string,
  ): { feature: Feature; geojson: GeoJSONFeature } | null {
    const { surveyFeatures } = useSurveyFeaturesStore.getState();
    for (const [layerId, sfList] of Object.entries(surveyFeatures)) {
      const sf = sfList.find((s) => s.id === fid);
      if (sf) {
        const feat: Feature = {
          id: sf.id,
          layer_name: `Survey: ${sf.layer_name || layerId.toUpperCase()}`,
          layer_id: sf.layer_id,
          properties: (sf.survey_attributes as Record<string, unknown>) ?? {},
          field_schema: null,
          field_measurements: null,
          comparison_notes: '',
          status: (sf.survey_status === 'new' || sf.survey_status === 'modified' ? 'assigned' : 'under_review') as 'assigned' | 'under_review',
          photo_url: null,
          created_at: sf.created_at,
          updated_at: sf.updated_at,
        };
        const gf: GeoJSONFeature = {
          type: 'Feature',
          geometry: sf.survey_geometry as { type: string; coordinates: unknown[] },
          properties: feat.properties,
        };
        return { feature: feat, geojson: gf };
      }
    }
    return null;
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  const handleSave = async () => {
    if (!featureId || !feature) return;
    try {
      await updateFieldMeasurements(featureId as string, measurements, notes);
      showToast('Measurements saved', 'success');
    } catch {
      showToast('Failed to save', 'error');
    }
  };

  const handleSubmit = async () => {
    if (!featureId || !user) return;
    Alert.alert(
      'Submit for Review',
      'Are you sure you want to submit this feature for review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              await submitFeatures([featureId as string], user.id);
              showToast('Feature submitted for review', 'success');
              if (feature) {
                setFeature({ ...feature, status: 'under_review' });
              }
            } catch {
              showToast('Failed to submit', 'error');
            }
          },
        },
      ]
    );
  };

  const handleFlag = () => {
    Alert.alert('Flag Feature', 'Mark this feature as needing additional review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Flag',
        style: 'destructive',
        onPress: () => showToast('Feature flagged', 'success'),
      },
    ]);
  };

  const renderFieldSchema = (schema: FieldSchemaField[] | null) => {
    if (!schema || schema.length === 0) return null;

    return schema.map((field) => {
      if (field.type === 'readonly') {
        return (
          <View key={field.key} style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{field.label}</Text>
            <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>
              {String(measurements[field.key] ?? '—')}
            </Text>
          </View>
        );
      }

      return (
        <View key={field.key} style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {field.label}
            {field.required ? ' *' : ''}
            {field.unit ? ` (${field.unit})` : ''}
          </Text>
          {field.type === 'textarea' ? (
            <TextInput
              style={[
                styles.textarea,
                {
                  color: colors.textPrimary,
                  borderColor: colors.outline,
                  backgroundColor: colors.background,
                },
              ]}
              value={String(measurements[field.key] ?? '')}
              onChangeText={(val) =>
                setMeasurements((prev) => ({ ...prev, [field.key]: val }))
              }
              multiline
              numberOfLines={3}
              placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`}
              placeholderTextColor={colors.textTertiary}
            />
          ) : field.type === 'select' && field.options ? (
            <View style={styles.optionsRow}>
              {field.options.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor:
                        measurements[field.key] === opt.value
                          ? colors.primary
                          : colors.outlineLight,
                      borderColor: colors.outline,
                    },
                  ]}
                  onPress={() =>
                    setMeasurements((prev) => ({ ...prev, [field.key]: opt.value }))
                  }
                >
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color:
                          measurements[field.key] === opt.value
                            ? colors.onPrimary
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : field.type === 'boolean' ? (
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: measurements[field.key]
                    ? colors.success + '20'
                    : colors.outlineLight,
                  borderColor: measurements[field.key] ? colors.success : colors.outline,
                },
              ]}
              onPress={() =>
                setMeasurements((prev) => ({
                  ...prev,
                  [field.key]: !prev[field.key],
                }))
              }
            >
              <Text
                style={{
                  color: measurements[field.key] ? colors.success : colors.textSecondary,
                  fontSize: 14,
                  fontWeight: '500',
                }}
              >
                {measurements[field.key] ? 'Yes' : 'No'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TextInput
              style={[
                styles.textInput,
                {
                  color: colors.textPrimary,
                  borderColor: colors.outline,
                  backgroundColor: colors.background,
                },
              ]}
              value={String(measurements[field.key] ?? '')}
              onChangeText={(val) =>
                setMeasurements((prev) => ({
                  ...prev,
                  [field.key]: field.type === 'number' ? Number(val) || 0 : val,
                }))
              }
              keyboardType={field.type === 'number' ? 'numeric' : 'default'}
              placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`}
              placeholderTextColor={colors.textTertiary}
            />
          )}
        </View>
      );
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!feature) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary }}>Feature not found</Text>
          <Button title="Go Back" variant="secondary" size="sm" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} stroke={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.topInfo}>
            <Text style={[styles.featureTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {feature.layer_name}
            </Text>
          </View>
          <StatusBadge status={feature.status} />
        </View>

        {/* GPS / Coordinates */}
        {geojson?.geometry && (
          <View style={[styles.gpsBar, { backgroundColor: colors.surface }]}>
            <MapPin size={14} stroke={colors.primary} />
            <Text style={[styles.gpsText, { color: colors.textSecondary }]} numberOfLines={1}>
              {(() => {
                try {
                  const coords = geojson.geometry.coordinates;
                  const geomType = geojson.geometry.type;
                  if (geomType === 'Point') {
                    return `Lat ${(coords[1] as number).toFixed(6)}, Lng ${(coords[0] as number).toFixed(6)}`;
                  } else if (geomType === 'LineString') {
                    const pts = coords as number[][];
                    return `${pts.length} pts • ${pts[0][1].toFixed(4)}, ${pts[0][0].toFixed(4)} → ${pts[pts.length - 1][1].toFixed(4)}, ${pts[pts.length - 1][0].toFixed(4)}`;
                  } else if (geomType === 'Polygon') {
                    return `Polygon • ${((coords as number[][][])[0]?.length ?? 0)} vertices`;
                  }
                  return JSON.stringify(coords).slice(0, 60);
                } catch { return ''; }
              })()}
            </Text>
          </View>
        )}

        {/* GPS Accuracy Requirement (from schema) */}
        {feature.layer_id && (() => {
          const schema = getLayerSchema(feature.layer_id);
          if (!schema?.gpsAccuracyM) return null;
          return (
            <View style={[styles.gpsAccuracy, { backgroundColor: colors.primary + '08' }]}>
              <Crosshair size={14} stroke={colors.primary} />
              <Text style={[styles.gpsAccuracyText, { color: colors.textPrimary }]}>
                GPS accuracy required: within <Text style={{ fontWeight: '700', color: colors.primary }}>{schema.gpsAccuracyM}m</Text>
              </Text>
            </View>
          );
        })()}

        {/* Required Photos indicator */}
        {feature.layer_id && (() => {
          const schema = getLayerSchema(feature.layer_id);
          if (!schema?.requiredPhotos?.length) return null;
          return (
            <View style={[styles.photoReq, { backgroundColor: colors.warning + '08' }]}>
              <Camera size={14} stroke={colors.warning} />
              <Text style={[styles.photoReqText, { color: colors.textPrimary }]}>
                <Text style={{ fontWeight: '700', color: colors.warning }}>{schema.requiredPhotos.length} photo{schema.requiredPhotos.length !== 1 ? 's' : ''} required:</Text> {schema.requiredPhotos.join(', ')}
              </Text>
            </View>
          );
        })()}

        {/* Geometry Editing Notice */}
        {feature.layer_id && (() => {
          const schema = getLayerSchema(feature.layer_id);
          if (!schema?.allowGeometryEdit) return null;
          return (
            <View style={[styles.geometryNotice, { backgroundColor: colors.success + '08' }]}>
              <Move size={14} stroke={colors.success} />
              <Text style={[styles.geometryText, { color: colors.textPrimary }]}>
                <Text style={{ fontWeight: '700', color: colors.success }}>Geometry editable</Text> — switch to drag mode on the map to adjust position
              </Text>
            </View>
          );
        })()}

        {/* Reference Properties */}
        {feature.properties && Object.keys(feature.properties).length > 0 && (
          <Card title="Reference Data" variant="outlined">
            {Object.entries(feature.properties as Record<string, unknown>).map(
              ([key, value]) => (
                <View key={key} style={styles.propRow}>
                  <Text style={[styles.propKey, { color: colors.textSecondary }]}>{key}</Text>
                  <Text style={[styles.propValue, { color: colors.textPrimary }]}>
                    {String(value).slice(0, 100)}
                  </Text>
                </View>
              )
            )}
          </Card>
        )}

        {/* Dynamic Form — LayerEditor replaces legacy schema renderer */}
        <Card title="Field Measurements" variant="default">
          <LayerEditor
            layerId={feature.layer_id}
            measurements={measurements}
            properties={(feature.properties as Record<string, unknown>) ?? {}}
            onFieldChange={(key, value) =>
              setMeasurements((prev) => ({ ...prev, [key]: value }))
            }
            onSave={async (updatedMeasurements) => {
              if (!featureId) return;
              try {
                await updateFieldMeasurements(featureId as string, updatedMeasurements, notes);
                showToast('Measurements saved', 'success');
              } catch {
                showToast('Failed to save', 'error');
              }
            }}
            saving={isLoading}
          />
        </Card>

        {/* Notes */}
        <Card title="Notes" variant="outlined" headerRight={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Edit3 size={12} stroke={colors.textTertiary} />
            <Text style={[styles.cardHeaderHint, { color: colors.textTertiary }]}>Observations</Text>
          </View>
        }>
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
            placeholder="Add comparison notes or observations..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
          />
        </Card>

        {/* ── Survey Modules (Trench, Risk, Hazard, Evidence, Status) ── */}
        <View style={{ marginTop: Spacing.md }}>
          <View style={styles.surveyModulesHeader}>
            <ClipboardList size={16} stroke={colors.primary} />
            <Text style={[styles.surveyModulesTitle, { color: colors.textPrimary }]}>Survey & Risk Management</Text>
          </View>
          <FeatureSurveySections
            featureId={featureId as string}
            layerId={feature.layer_id}
          />
        </View>

        {/* Photo */}
        <Card
          title="Photos"
          variant="outlined"
          headerRight={
            <TouchableOpacity
              style={[styles.addPhotoBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/camera')}
            >
              <Camera size={16} stroke={colors.onPrimary} />
              <Text style={[styles.addPhotoText, { color: colors.onPrimary }]}>Add</Text>
            </TouchableOpacity>
          }
        >
          {feature.photo_url ? (
            <View style={styles.photoPreview}>
              <Text style={[styles.photoUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                Photo uploaded
              </Text>
            </View>
          ) : (
            <Text style={[styles.noPhoto, { color: colors.textTertiary }]}>
              No photos attached yet. Use the camera to capture field evidence.
            </Text>
          )}
        </Card>
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.outline }]}>
        <Button
          title="Save Draft"
          variant="tertiary"
          size="sm"
          icon={<Save size={16} stroke={colors.textSecondary} />}
          onPress={handleSave}
          loading={isLoading}
          style={{ flex: 1 }}
        />
        <Button
          title="Flag"
          variant="secondary"
          size="sm"
          icon={<AlertTriangle size={16} stroke={colors.primary} />}
          onPress={handleFlag}
          style={{ flex: 1 }}
        />
        <Button
          title="Submit"
          variant="primary"
          size="sm"
          icon={<CheckCircle size={16} stroke={colors.onPrimary} />}
          onPress={handleSubmit}
          loading={isLoading}
          style={{ flex: 1 }}
        />
      </View>

      <Toast visible={toastVisible} message={toastMsg} type={toastType} onDismiss={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: 100 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topInfo: { flex: 1 },
  featureTitle: { fontSize: 18, fontWeight: '600' },
  gpsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  gpsText: { fontSize: 12, flex: 1 },
  propRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  propKey: { fontSize: 13, flex: 1 },
  propValue: { fontSize: 13, flex: 1.5, textAlign: 'right', fontWeight: '500' },
  fieldRow: { marginBottom: Spacing.lg },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: Spacing.xs },
  fieldValue: { fontSize: 15, fontWeight: '500' },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    height: 56,
    fontSize: 15,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  optionText: { fontSize: 13, fontWeight: '500' },
  toggleBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  noSchema: { fontSize: 14, textAlign: 'center', paddingVertical: Spacing.lg },
  photoPreview: { padding: Spacing.md },
  photoUrl: { fontSize: 13 },
  noPhoto: { fontSize: 14, textAlign: 'center', paddingVertical: Spacing.lg },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  addPhotoText: { fontSize: 12, fontWeight: '600' },
  // ── GPS Accuracy bar ───────────────────────────────────────────────
  gpsAccuracy: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  gpsAccuracyText: {
    fontSize: 12,
    flex: 1,
  },

  // ── Photo Requirements bar ─────────────────────────────────────────
  photoReq: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  photoReqText: {
    fontSize: 12,
    flex: 1,
  },

  // ── Geometry Notice ────────────────────────────────────────────────
  geometryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  geometryText: {
    fontSize: 12,
    flex: 1,
  },

  // ── Survey Modules Header ─────────────────────────────────────────
  surveyModulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  surveyModulesTitle: {
    fontSize: 17,
    fontWeight: '700',
  },

  // ── Card Header Hint ──────────────────────────────────────────────
  cardHeaderHint: {
    fontSize: 11,
    fontStyle: 'italic',
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
  },
});
