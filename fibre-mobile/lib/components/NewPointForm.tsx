// ── New Point Form Component ─────────────────────────────────────────────
// Appears as an overlay on the map immediately after an engineer adds a new
// point feature. Shows all editable fields from the layer schema so the
// engineer can fill in survey details right away.

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Animated,
  Easing,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import { getLayerSchema } from '../stores/layer-schemas';
import type { FieldSchemaField } from '../utils/types';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import MapPin from 'lucide-react-native/icons/map-pin';

// ── Types ─────────────────────────────────────────────────────────────────

export interface NewPointFormData {
  /** Layer ID for schema lookup */
  layerId: string;
  /** Feature ID to update on save */
  featureId: string;
  /** Initial property values */
  initialValues: Record<string, unknown>;
}

interface NewPointFormProps {
  /** Form data for the new point */
  formData: NewPointFormData | null;
  /** Called when the form is dismissed without saving */
  onDismiss: () => void;
  /** Called when the form is saved with the updated properties */
  onSave: (featureId: string, layerId: string, properties: Record<string, unknown>) => void;
}

// ── Field Renderer ────────────────────────────────────────────────────────

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
    <View style={[styles.fieldRow, { borderBottomColor: colors.outlineLight }]}>
      <View style={styles.fieldLabelRow}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          {field.label}
          {field.required && <Text style={{ color: '#EF4444' }}> *</Text>}
        </Text>
        {field.unit && (
          <Text style={[styles.fieldUnit, { color: colors.textTertiary }]}> ({field.unit})</Text>
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
          numberOfLines={2}
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

// ── Component ─────────────────────────────────────────────────────────────

export default function NewPointForm({
  formData,
  onDismiss,
  onSave,
}: NewPointFormProps) {
  const colors = useThemeStore((s) => s.colors);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Local state for form values
  const [values, setValues] = useState<Record<string, unknown>>({});

  // Get schema for the layer
  const schema = useMemo(() => {
    if (!formData) return null;
    return getLayerSchema(formData.layerId);
  }, [formData]);

  // Reset form values when formData changes
  useEffect(() => {
    if (formData) {
      // Pre-fill with initial values from the feature
      const initial: Record<string, unknown> = {};
      if (schema) {
        for (const field of schema.editableFields) {
          const val = formData.initialValues[field.key];
          initial[field.key] = val !== undefined ? val : '';
        }
      }
      setValues(initial);

      // Animate entrance
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [formData?.featureId]);

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (!formData) return;
    // Filter out empty strings for cleaner data
    const cleanValues: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(values)) {
      if (val !== '' && val !== undefined) {
        cleanValues[key] = val;
      }
    }
    // Add survey metadata
    cleanValues.surveyed_at = new Date().toISOString();
    cleanValues.survey_status = 'visited';
    onSave(formData.featureId, formData.layerId, cleanValues);
  }, [formData, values, onSave]);

  const handleCancel = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  if (!formData || !schema) {
    // If no schema found, still show a simple form with all properties
    if (formData && !schema) {
      return (
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: colors.surface + 'F0',
              borderColor: colors.outline,
              opacity: slideAnim,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MapPin size={14} stroke={colors.primary} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                New {formData.layerId} Point
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} stroke={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            No schema available for this layer type.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.outline }]}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Check size={14} stroke={colors.onPrimary} />
              <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface + 'F0',
          borderColor: colors.primary + '40',
          opacity: slideAnim,
          transform: [{ translateY: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [60, 0],
          }) }],
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MapPin size={14} stroke={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            New {schema.layerName}
          </Text>
          <View style={[styles.layerBadge, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.layerBadgeText, { color: colors.primary }]}>
              {schema.editableFields.length} fields
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={16} stroke={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
        Fill in the survey details for this new {schema.layerName.toLowerCase()} point
      </Text>

      {/* Scrollable fields */}
      <ScrollView
        style={styles.fieldsScroll}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={styles.fieldsContainer}>
          {schema.editableFields.map((field) => (
            <EditableField
              key={field.key}
              field={field}
              value={values[field.key] ?? ''}
              onChange={(val) => handleFieldChange(field.key, val)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: colors.outline }]}
          onPress={handleCancel}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Check size={14} stroke={colors.onPrimary} />
          <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>Save Point</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xxl + 160,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    maxHeight: 420,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000010',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  subtitle: {
    fontSize: 11,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  layerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  layerBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  fieldsScroll: {
    maxHeight: 220,
  },
  fieldsContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  fieldRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  fieldUnit: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  inputField: {
    height: 36,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    fontSize: 13,
  },
  textareaField: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 13,
    minHeight: 56,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  selectValue: {
    fontSize: 13,
    flex: 1,
  },
  booleanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  booleanLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  dropdownList: {
    marginTop: 2,
    borderWidth: 1,
    borderRadius: Radius.sm,
    maxHeight: 140,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 140,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownOptionText: {
    fontSize: 13,
    flex: 1,
  },
  dropdownCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000010',
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: Radius.md,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 12,
    fontStyle: 'italic',
    padding: Spacing.md,
    textAlign: 'center',
  },
});
