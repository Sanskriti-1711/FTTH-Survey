// ── Layer Editor Component ───────────────────────────────────────────────
// Dynamic form component that renders the correct survey form based on
// the feature's layer_name. Uses LayerSchema from layer-schemas to determine:
//  - Which fields are read-only (HLD data)
//  - Which fields are editable with dropdowns/validation
//  - Required photos for this layer type
//  - GPS accuracy requirements
//  - Geometry editing permissions

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import { getLayerSchema } from '../stores/layer-schemas';
import type { LayerSchema, FieldSchemaField } from '../utils/types';
import {
  Eye,
  EyeOff,
  Camera,
  Crosshair,
  ChevronDown,
  MapPin,
  Edit3,
  Lock,
} from 'lucide-react-native';

// ── Types ─────────────────────────────────────────────────────────────────

interface LayerEditorProps {
  layerId: string;
  /** Current field measurements (editable fields) */
  measurements: Record<string, unknown>;
  /** Current properties (all fields including read-only from HLD) */
  properties: Record<string, unknown>;
  /** Called when any editable field changes */
  onFieldChange: (key: string, value: unknown) => void;
  /** Called when save is requested */
  onSave: (measurements: Record<string, unknown>) => void;
  /** Whether the form is in a saving state */
  saving?: boolean;
}

// ── Field Rendering Helpers ────────────────────────────────────────────────

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.field, styles.readOnlyField, { backgroundColor: colors.background }]}>
      <View style={styles.fieldLabelRow}>
        <Lock size={10} stroke={colors.textTertiary} />
        <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>{label}</Text>
      </View>
      <Text style={[styles.readOnlyValue, { color: colors.textSecondary }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

function EditableField({
  field,
  value,
  onChange,
}: {
  field: FieldSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const displayValue = field.type === 'boolean'
    ? (value === true ? 'Yes' : value === false ? 'No' : '—')
    : field.type === 'select'
      ? (field.options?.find((o) => o.value === String(value))?.label ?? String(value ?? '—'))
      : String(value ?? '');

  const handleTextChange = (text: string) => {
    if (field.type === 'number') {
      const num = parseFloat(text);
      onChange(isNaN(num) ? undefined : num);
    } else {
      onChange(text);
    }
  };

  return (
    <View style={[styles.field, { borderBottomColor: colors.outlineLight }]}>
      <View style={styles.fieldLabelRow}>
        <Edit3 size={10} stroke={colors.primary} />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          {field.label}
          {field.required && <Text style={{ color: colors.error }}> *</Text>}
        </Text>
        {field.unit && (
          <Text style={[styles.fieldUnit, { color: colors.textTertiary }]}>({field.unit})</Text>
        )}
      </View>

      {field.type === 'select' ? (
        <TouchableOpacity
          style={[styles.selectField, {
            backgroundColor: colors.surface,
            borderColor: dropdownOpen ? colors.primary : colors.outline,
          }]}
          onPress={() => setDropdownOpen(!dropdownOpen)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.selectValue,
              { color: value !== undefined && value !== '' ? colors.textPrimary : colors.textTertiary },
            ]}
            numberOfLines={1}
          >
            {displayValue === '—' ? 'Select...' : displayValue}
          </Text>
          <ChevronDown size={14} stroke={colors.textSecondary} />
        </TouchableOpacity>
      ) : field.type === 'boolean' ? (
        <View style={styles.booleanRow}>
          <Switch
            value={value === true}
            onValueChange={(v) => onChange(v)}
            trackColor={{ false: colors.outline, true: colors.primary + '60' }}
            thumbColor={value === true ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.booleanLabel, { color: colors.textPrimary }]}>
            {value === true ? 'Yes' : value === false ? 'No' : 'Not set'}
          </Text>
        </View>
      ) : field.type === 'textarea' ? (
        <TextInput
          style={[styles.textareaField, {
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: colors.outline,
          }]}
          value={String(value ?? '')}
          onChangeText={handleTextChange}
          placeholder={field.placeholder ?? ''}
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      ) : field.type === 'number' ? (
        <TextInput
          style={[styles.inputField, {
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: colors.outline,
          }]}
          value={value !== undefined && value !== null ? String(value) : ''}
          onChangeText={handleTextChange}
          placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}...`}
          placeholderTextColor={colors.textTertiary}
          keyboardType="numeric"
        />
      ) : (
        <TextInput
          style={[styles.inputField, {
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: colors.outline,
          }]}
          value={String(value ?? '')}
          onChangeText={handleTextChange}
          placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}...`}
          placeholderTextColor={colors.textTertiary}
        />
      )}

      {/* Dropdown options */}
      {field.type === 'select' && dropdownOpen && field.options && (
        <View style={[styles.dropdownList, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
          <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
            {field.options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.dropdownOption,
                  { borderBottomColor: colors.outlineLight },
                  String(value) === opt.value && { backgroundColor: colors.primary + '10' },
                ]}
                onPress={() => {
                  onChange(opt.value);
                  setDropdownOpen(false);
                }}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    { color: String(value) === opt.value ? colors.primary : colors.textPrimary },
                    String(value) === opt.value && { fontWeight: '700' },
                  ]}
                >
                  {opt.label}
                </Text>
                {String(value) === opt.value && (
                  <View style={[styles.dropdownCheck, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── Photo Requirements Section ─────────────────────────────────────────────

function PhotoRequirements({ photos, layerName }: { photos: string[]; layerName: string }) {
  const colors = useThemeStore((s) => s.colors);

  if (photos.length === 0) return null;

  return (
    <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
      <View style={styles.sectionHeader}>
        <Camera size={14} stroke={colors.warning} />
        <Text style={[styles.sectionTitle, { color: colors.warning }]}>Required Photos</Text>
      </View>
      <Text style={[styles.sectionHint, { color: colors.textTertiary }]}>
        {layerName} survey requires {photos.length} mandatory photo{photos.length > 1 ? 's' : ''}:
      </Text>
      {photos.map((photo, i) => (
        <View key={i} style={styles.photoItem}>
          <View style={[styles.photoDot, { backgroundColor: colors.warning + '30' }]}>
            <Camera size={10} stroke={colors.warning} />
          </View>
          <Text style={[styles.photoLabel, { color: colors.textPrimary }]}>{photo}</Text>
          <View style={[styles.photoStatus, { backgroundColor: colors.outlineLight }]}>
            <Text style={[styles.photoStatusText, { color: colors.textTertiary }]}>Pending</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── GPS Accuracy Requirement ───────────────────────────────────────────────

function GPSRequirement({ accuracyM }: { accuracyM: number }) {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
      <View style={styles.sectionHeader}>
        <Crosshair size={14} stroke={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>GPS Accuracy Required</Text>
      </View>
      <View style={[styles.gpsInfo, { backgroundColor: colors.primary + '08' }]}>
        <MapPin size={14} stroke={colors.primary} />
        <Text style={[styles.gpsText, { color: colors.textPrimary }]}>
          Within <Text style={{ fontWeight: '700', color: colors.primary }}>{accuracyM} metres</Text> of actual location
        </Text>
      </View>
    </View>
  );
}

// ── Geometry Edit Permission ──────────────────────────────────────────────

function GeometryPermission({ allowed }: { allowed?: boolean }) {
  const colors = useThemeStore((s) => s.colors);

  if (!allowed) return null;

  return (
    <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
      <View style={styles.sectionHeader}>
        <MapPin size={14} stroke={colors.success} />
        <Text style={[styles.sectionTitle, { color: colors.success }]}>Geometry Editing Available</Text>
      </View>
      <Text style={[styles.sectionHint, { color: colors.textTertiary }]}>
        You can drag this feature to a new location on the map.
      </Text>
    </View>
  );
}

// ── Main LayerEditor Component ─────────────────────────────────────────────

export default function LayerEditor({
  layerId,
  measurements,
  properties,
  onFieldChange,
  onSave,
  saving = false,
}: LayerEditorProps) {
  const colors = useThemeStore((s) => s.colors);
  const schema = getLayerSchema(layerId);

  // ── No schema found — show legacy form ──────────────────────────────────
  if (!schema) {
    return (
      <View style={styles.container}>
        <View style={[styles.legacyNotice, { backgroundColor: colors.warning + '10', borderColor: colors.warning + '30' }]}>
          <Text style={[styles.legacyTitle, { color: colors.warning }]}>Generic Layer</Text>
          <Text style={[styles.legacyHint, { color: colors.textSecondary }]}>
            No survey data dictionary found for layer "{layerId}". All properties are editable.
          </Text>
        </View>

        {/* Show all properties as editable text fields */}
        {Object.entries(properties).filter(([k]) => !k.startsWith('_')).map(([key, value]) => (
          <View key={key} style={[styles.field, { borderBottomColor: colors.outlineLight }]}>
            <View style={styles.fieldLabelRow}>
              <Edit3 size={10} stroke={colors.primary} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{key}</Text>
            </View>
            <TextInput
              style={[styles.inputField, {
                color: colors.textPrimary,
                backgroundColor: colors.surface,
                borderColor: colors.outline,
              }]}
              value={String(value ?? '')}
              onChangeText={(text) => {
                const num = !isNaN(Number(text)) && text !== '' ? Number(text) : text;
                onFieldChange(key, num === '' ? undefined : num);
              }}
              placeholder={`Enter ${key}...`}
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        ))}

        {/* Save button for legacy */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={() => onSave(measurements)}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Full schema render ──────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.outlineLight }]}>
        <View style={[styles.headerDot, { backgroundColor: colors.primary }]} />
        <View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{schema.layerName}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]}>
            {schema.editableFields.length} editable fields · {schema.readOnlyFields.length} read-only
          </Text>
        </View>
      </View>

      {/* ── Read-Only Fields Section ─────────────────────────────────────── */}
      {schema.readOnlyFields.length > 0 && (
        <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
          <View style={styles.sectionHeader}>
            <EyeOff size={14} stroke={colors.textTertiary} />
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              Read-Only (From HLD)
            </Text>
          </View>
          <View style={styles.readOnlyGrid}>
            {schema.readOnlyFields.map((field) => (
              <ReadOnlyField
                key={field.key}
                label={field.label}
                value={
                  field.type === 'number'
                    ? (Number(properties[field.key])?.toLocaleString() ?? '—')
                    : String(properties[field.key] ?? '—')
                }
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Editable Fields Section ──────────────────────────────────────── */}
      <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
        <View style={styles.sectionHeader}>
          <Edit3 size={14} stroke={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Editable Fields</Text>
        </View>
        {schema.editableFields.map((field) => (
          <EditableField
            key={field.key}
            field={field}
            value={measurements[field.key] ?? ''}
            onChange={(value) => onFieldChange(field.key, value)}
          />
        ))}
      </View>

      {/* ── Photo Requirements ───────────────────────────────────────────── */}
      <PhotoRequirements photos={schema.requiredPhotos} layerName={schema.layerName} />

      {/* ── GPS Accuracy ─────────────────────────────────────────────────── */}
      {schema.gpsAccuracyM && <GPSRequirement accuracyM={schema.gpsAccuracyM} />}

      {/* ── Geometry Edit Permission ─────────────────────────────────────── */}
      <GeometryPermission allowed={schema.allowGeometryEdit} />

      {/* ── Save Button ──────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
        onPress={() => onSave(measurements)}
        disabled={saving}
        activeOpacity={0.8}
      >
        <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: Spacing.xxl * 2 }} />
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  // Section
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.lg,
    marginTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: Spacing.md,
  },

  // Field
  field: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readOnlyField: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldUnit: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  readOnlyValue: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Input fields
  inputField: {
    height: 40,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    fontSize: 14,
  },
  textareaField: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    minHeight: 70,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  selectValue: {
    fontSize: 14,
    flex: 1,
  },
  booleanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  booleanLabel: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Dropdown
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: Radius.sm,
    maxHeight: 180,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownOptionText: {
    fontSize: 14,
    flex: 1,
  },
  dropdownCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Read-only grid
  readOnlyGrid: {
    gap: Spacing.xs,
  },

  // Photos
  photoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  photoDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  photoStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  photoStatusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // GPS
  gpsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gpsText: {
    fontSize: 13,
    flex: 1,
  },

  // Legacy
  legacyNotice: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  legacyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  legacyHint: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Save button
  saveBtn: {
    marginTop: Spacing.xl,
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
