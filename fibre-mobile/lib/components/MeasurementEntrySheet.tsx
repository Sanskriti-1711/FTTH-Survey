// ── Measurement entry ─────────────────────────────────────────────────────
//
// The supervision feature screen shows planned vs as-built, but until now the
// only way to write an as-built reading was the survey screen's generic form.
// This sheet is the field entry point for a supervised LLD feature:
//
//   - one input per editable field of the layer's configured schema
//   - the planned value shown beside each input, so the engineer compares
//     while measuring instead of memorising the design
//   - readings saved in the backend's documented `{key: {value, unit}}` shape,
//     which is what `projects.services.deviation` compares against the plan
//
// Only readings are written. The planned properties are the approved design
// baseline and this sheet never touches them.

import React, { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, X } from 'lucide-react-native';
import { Button } from '../../components/ui/Button';
import {
  updateFieldMeasurements,
  uploadFeaturePhotoToGallery,
  type FeaturePhotoData,
} from '../api/features';
import { displayValue } from '../api/supervision';
import { useThemeStore } from '../stores/theme';
import { Radius, Spacing, Touch, Type } from '../theme/colors';
import type { Feature, FieldSchemaField } from '../utils/types';

/** A schema entry as the backend sends it — derived schemas also carry `editable`. */
type EntryField = FieldSchemaField & { editable?: boolean };

/** The fields an engineer may actually write a reading for. */
export function entryFields(feature: Feature | null): EntryField[] {
  if (!feature?.field_schema) return [];
  return feature.field_schema.filter((field) => {
    const entry = field as EntryField;
    if (entry.editable === false) return false;
    return field.type !== 'readonly' && !field.readOnly;
  });
}

/** The editable value inside a saved reading, for pre-filling the input. */
function readingText(entry: unknown): string {
  if (entry && typeof entry === 'object' && 'value' in entry) {
    const value = (entry as { value: unknown }).value;
    return value === null || value === undefined ? '' : String(value);
  }
  return entry === null || entry === undefined ? '' : String(entry);
}

/**
 * A unit worth showing, or an empty string.
 *
 * Auto-derived schemas carry `unit: true` as a flag ("this is a measurement"),
 * not a unit name, while admin-configured schemas carry `unit: 'mm'`. Rendering
 * or saving the boolean would put "(true)" on screen and in the JSON.
 */
function unitOf(field: EntryField): string {
  return typeof field.unit === 'string' ? field.unit : '';
}

function readingFlag(entry: unknown): boolean {
  if (entry && typeof entry === 'object' && 'value' in entry) {
    return Boolean((entry as { value: unknown }).value);
  }
  return entry === true || entry === 'true' || entry === 1 || entry === '1';
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

export interface SavedMeasurements {
  field_measurements: Record<string, unknown>;
  comparison_notes: string;
}

interface Props {
  visible: boolean;
  feature: Feature;
  /** The feature's existing gallery, and the backend's cap on its size. */
  photos: FeaturePhotoData[];
  photoLimit: number;
  onPhotosChanged: (photos: FeaturePhotoData[]) => void;
  onClose: () => void;
  onSaved: (saved: SavedMeasurements) => void;
}

export default function MeasurementEntrySheet({
  visible,
  feature,
  photos,
  photoLimit,
  onPhotosChanged,
  onClose,
  onSaved,
}: Props) {
  const colors = useThemeStore((s) => s.colors);
  const fields = useMemo(() => entryFields(feature), [feature]);
  const planned = useMemo(
    () => (feature.properties ?? {}) as Record<string, unknown>,
    [feature.properties],
  );

  const [values, setValues] = useState<Record<string, string | boolean>>(() => seedValues(feature));
  const [notes, setNotes] = useState(feature.comparison_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const atPhotoLimit = photoLimit > 0 && photos.length >= photoLimit;
  // Reset the draft whenever the sheet is opened for a feature, so a previous
  // visit's typing can never leak into this one.
  const [seededFor, setSeededFor] = useState<string | null>(visible ? feature.id : null);

  if (visible && seededFor !== feature.id) {
    setSeededFor(feature.id);
    setValues(seedValues(feature));
    setNotes(feature.comparison_notes ?? '');
    setError(null);
    setPhotoError(null);
  }
  if (!visible && seededFor !== null) {
    setSeededFor(null);
  }

  const setValue = (key: string, value: string | boolean) => {
    setError(null);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  // Photos are evidence for the readings, so they upload immediately instead of
  // waiting for Save: an engineer can capture the open trench and keep typing.
  // A failed upload leaves the readings draft untouched and can simply be retried.
  const addPhoto = async (source: 'camera' | 'library') => {
    if (uploadingPhoto) return;
    setPhotoError(null);
    try {
      let asset: ImagePicker.ImagePickerAsset | undefined;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          setPhotoError('Camera permission is needed to photograph this feature.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          allowsEditing: false,
        });
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
        name: asset.fileName ?? `site-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
      onPhotosChanged([...photos, ...(uploaded.uploaded ?? [])]);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not upload this photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;

    const missing = fields.filter((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      return typeof value === 'boolean' ? false : value.trim() === '';
    });
    if (missing.length > 0) {
      setError(`Add a reading for ${missing.map((f) => f.label).join(', ')}.`);
      return;
    }

    const invalid = fields.filter((field) => {
      if (field.type !== 'number') return false;
      const value = values[field.key];
      if (typeof value !== 'string' || value.trim() === '') return false;
      return Number.isNaN(Number(value.trim()));
    });
    if (invalid.length > 0) {
      setError(`${invalid.map((f) => f.label).join(', ')} must be a number.`);
      return;
    }

    // Keep readings for fields this schema no longer lists: deleting a layer
    // field must not silently erase what the engineer already measured.
    const saved = { ...((feature.field_measurements ?? {}) as Record<string, unknown>) };

    for (const field of fields) {
      const value = values[field.key];
      if (field.type === 'boolean') {
        saved[field.key] = { value: Boolean(value), unit: unitOf(field) };
        continue;
      }
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) {
        // Cleared input = the reading was removed.
        delete saved[field.key];
        continue;
      }
      saved[field.key] = {
        value: field.type === 'number' ? Number(text) : text,
        unit: unitOf(field),
      };
    }

    setSaving(true);
    setError(null);
    try {
      const result = await updateFieldMeasurements(feature.id, saved, notes.trim());
      onSaved({
        field_measurements: result.field_measurements ?? saved,
        comparison_notes: result.comparison_notes ?? notes.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these readings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close measurement entry"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.header, { borderBottomColor: colors.outlineLight }]}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Record measurements
                </Text>
                <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={2}>
                  {feature.layer_name} · as-built readings only, the plan stays unchanged
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close measurement entry"
              >
                <X size={22} stroke={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {fields.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  This layer has no editable measurement fields yet. Ask your planner to
                  configure the layer&apos;s fields.
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
                          {unitOf(field) ? ` (${unitOf(field)})` : ''}
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
                          {unitOf(field) ? (
                            <Text style={[styles.unit, { color: colors.textTertiary }]}>
                              {unitOf(field)}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                  Comparison notes
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
                  onChangeText={(text) => {
                    setError(null);
                    setNotes(text);
                  }}
                  placeholder="Anything that differs from the plan — access, extra depth, a changed route…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  accessibilityLabel="Comparison notes"
                />
              </View>

              <View style={styles.field}>
                <View style={styles.photoHeader}>
                  <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                    Site photos
                  </Text>
                  <Text style={[styles.planned, { color: colors.textTertiary }]}>
                    {photos.length}
                    {photoLimit > 0 ? ` / ${photoLimit}` : ''}
                  </Text>
                </View>

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
                  <Text style={[styles.photoHint, { color: colors.textTertiary }]}>
                    No photos yet. Capture the installed asset as evidence for these readings.
                  </Text>
                )}

                {atPhotoLimit ? (
                  <Text style={[styles.photoHint, { color: colors.textTertiary }]}>
                    This feature already has the maximum of {photoLimit} photos.
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

                {photoError ? (
                  <View style={[styles.error, { backgroundColor: colors.error + '14' }]}>
                    <Text style={[styles.errorText, { color: colors.error }]}>{photoError}</Text>
                  </View>
                ) : null}
              </View>

              {error ? (
                <View style={[styles.error, { backgroundColor: colors.error + '14' }]}>
                  <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: colors.outlineLight }]}>
              <View style={styles.footerRow}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  fullWidth={false}
                  style={styles.footerBtn}
                  onPress={onClose}
                  disabled={saving}
                />
                <Button
                  title="Save readings"
                  fullWidth={false}
                  style={styles.footerBtn}
                  loading={saving}
                  onPress={handleSave}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  keyboardWrap: { justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { ...Type.meta },
  closeBtn: {
    width: Touch.minTarget,
    height: Touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  field: { gap: Spacing.xs },
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
  empty: { ...Type.body, paddingVertical: Spacing.lg },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  photoRow: { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.xs },
  photo: { width: 96, height: 72, borderRadius: Radius.md, backgroundColor: '#00000010' },
  photoHint: { ...Type.meta },
  photoActions: { flexDirection: 'row', gap: Spacing.sm },
  photoBtn: { flex: 1 },
  error: { borderRadius: Radius.md, padding: Spacing.md },
  errorText: { ...Type.body, fontWeight: '500' },
  footer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
  footerBtn: { flex: 1 },
});
