import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Radius, Spacing, Type } from '../theme/colors';
import {
  CONSTRUCTION_CHECKS,
  LLD_CHECKS,
  TRENCH_TYPES,
  type CheckValue,
  type InspectionCheck,
} from '../utils/spanInspection';

interface Props {
  values: Record<string, string>;
  checks: Record<string, CheckValue>;
  spanFeatureCount?: number;
  readOnly?: boolean;
  onValueChange: (key: string, value: string) => void;
  onCheckChange: (key: string, value: CheckValue) => void;
}

// ── Span inspection form ──────────────────────────────────────────────────
// One span is one physical trench inspected from chamber to chamber. Keep the
// metadata, LLD checks, as-built capture and construction checks together so
// the planner receives one complete record for the span.

export default function SpanInspectionForm({
  values,
  checks,
  spanFeatureCount = 0,
  readOnly = false,
  onValueChange,
  onCheckChange,
}: Props) {
  const colors = useThemeStore((s) => s.colors);
  const value = (key: string) => values[key] ?? '';

  return (
    <View style={styles.wrap}>
      <View style={styles.section}>
        <Text style={[styles.sectionHeading, { color: colors.textTertiary }]}>
          Span details
        </Text>
        {spanFeatureCount > 0 && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {spanFeatureCount} components in this span
          </Text>
        )}
        <DetailRow label="Project ID" value={value('inspection_project_id')} />
        <DetailRow label="Span ID" value={value('inspection_span_id')} />
        <DetailRow label="Sub Span ID" value={value('inspection_sub_span_id')} />
        <DetailRow label="Trench ID" value={value('inspection_trench_id')} />
        <LabelledInput
          readOnly={readOnly}
          label="Inspector Name"
          value={value('inspection_inspector_name')}
          onChangeText={(text) => onValueChange('inspection_inspector_name', text)}
          placeholder="Name of the inspector"
        />
        <LabelledInput
          readOnly={readOnly}
          label="Inspection Date"
          value={value('inspection_date')}
          onChangeText={(text) => onValueChange('inspection_date', text)}
          placeholder="YYYY-MM-DD"
        />
        <DetailRow label="GPS Start Location" value={value('inspection_gps_start')} />
        <DetailRow label="GPS End Location" value={value('inspection_gps_end')} />
      </View>

      <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
        <Text style={[styles.sectionHeading, { color: colors.textTertiary }]}>
          LLD compliance checks
        </Text>
        {LLD_CHECKS.map((check) => (
          <CheckRow
            key={check.key}
            check={check}
            value={checks[check.key] ?? ''}
            readOnly={readOnly}
            onChange={onCheckChange}
          />
        ))}
      </View>

      <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
        <Text style={[styles.sectionHeading, { color: colors.textTertiary }]}>
          Field to capture
        </Text>

        <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Trench Type</Text>
        <View style={styles.chips}>
          {TRENCH_TYPES.map((type) => {
            const selected = value('trench_type') === type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => onValueChange('trench_type', type)}
                disabled={readOnly}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primary : colors.background,
                    borderColor: selected ? colors.primary : colors.outline,
                    opacity: readOnly ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: readOnly }}
                accessibilityLabel={`Trench type ${type}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <LabelledInput
          readOnly={readOnly}
          label="Start GPS Coordinate"
          value={value('start_gps')}
          onChangeText={(text) => onValueChange('start_gps', text)}
          placeholder="longitude, latitude"
        />
        <LabelledInput
          readOnly={readOnly}
          label="End GPS Coordinate"
          value={value('end_gps')}
          onChangeText={(text) => onValueChange('end_gps', text)}
          placeholder="longitude, latitude"
        />
        <LabelledInput
          readOnly={readOnly}
          label="Measured Length (m)"
          value={value('measured_length_m')}
          onChangeText={(text) => onValueChange('measured_length_m', text)}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        <LabelledInput
          readOnly={readOnly}
          label="Actual Depth (mm)"
          value={value('actual_depth_mm')}
          onChangeText={(text) => onValueChange('actual_depth_mm', text)}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <LabelledInput
          readOnly={readOnly}
          label="Actual Width (mm)"
          value={value('actual_width_mm')}
          onChangeText={(text) => onValueChange('actual_width_mm', text)}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <LabelledInput
          readOnly={readOnly}
          label="Surface Type"
          value={value('surface_type')}
          onChangeText={(text) => onValueChange('surface_type', text)}
          placeholder="Asphalt, paving, grass…"
        />
        <LabelledInput
          readOnly={readOnly}
          label="Existing Utilities Encountered"
          value={value('existing_utilities')}
          onChangeText={(text) => onValueChange('existing_utilities', text)}
          placeholder="Water, gas, power, telecom…"
          multiline
        />
        <LabelledInput
          readOnly={readOnly}
          label="Distance from Utility"
          value={value('utility_distance')}
          onChangeText={(text) => onValueChange('utility_distance', text)}
          placeholder="e.g. 1.2 m"
        />
        <LabelledInput
          readOnly={readOnly}
          label="Joint / Pit Locations"
          value={value('joint_pit_locations')}
          onChangeText={(text) => onValueChange('joint_pit_locations', text)}
          placeholder="Chainage or GPS of joints and pits"
          multiline
        />
      </View>

      <View style={[styles.section, { borderTopColor: colors.outlineLight }]}>
        <Text style={[styles.sectionHeading, { color: colors.textTertiary }]}>
          Construction checks
        </Text>
        {CONSTRUCTION_CHECKS.map((check) => (
          <CheckRow
            key={check.key}
            check={check}
            value={checks[check.key] ?? ''}
            readOnly={readOnly}
            onChange={onCheckChange}
          />
        ))}
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.textPrimary }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

function CheckRow({
  check,
  value,
  readOnly,
  onChange,
}: {
  check: InspectionCheck;
  value: CheckValue;
  readOnly: boolean;
  onChange: (key: string, value: CheckValue) => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <View style={styles.checkRow}>
      <Text style={[styles.checkLabel, { color: colors.textPrimary }]}>{check.label}</Text>
      <View style={styles.passRow}>
        {(['pass', 'fail'] as const).map((option) => {
          const selected = value === option;
          const tone = option === 'pass' ? colors.success : colors.error;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => onChange(check.key, selected ? '' : option)}
              disabled={readOnly}
              style={[
                styles.passBtn,
                {
                  backgroundColor: selected ? `${tone}20` : colors.background,
                  borderColor: selected ? tone : colors.outline,
                  opacity: readOnly ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: readOnly }}
              accessibilityLabel={`${check.label}: ${option}`}
            >
              <Text
                style={[
                  styles.passText,
                  { color: selected ? tone : colors.textSecondary },
                ]}
              >
                {option === 'pass' ? 'Pass' : 'Fail'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function LabelledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps['keyboardType'];
  multiline?: boolean;
  readOnly?: boolean;
}) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{label}</Text>
      <TextInput
        style={[
          multiline ? styles.textarea : styles.input,
          {
            color: colors.textPrimary,
            borderColor: colors.outline,
            backgroundColor: colors.background,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        editable={!readOnly}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        accessibilityLabel={label}
        accessibilityState={{ disabled: readOnly }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  section: {
    gap: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
    marginTop: Spacing.xs,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  hint: { ...Type.meta, marginBottom: Spacing.xs },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 5,
  },
  detailLabel: { ...Type.meta, flex: 1 },
  detailValue: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  field: { gap: Spacing.xs, marginTop: Spacing.sm },
  fieldLabel: { ...Type.label, fontWeight: '600' },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 46,
    fontSize: 15,
  },
  textarea: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 80,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginVertical: Spacing.xs },
  chip: {
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  checkRow: {
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000010',
    gap: 7,
  },
  checkLabel: { ...Type.label, fontWeight: '600' },
  passRow: { flexDirection: 'row', gap: Spacing.sm },
  passBtn: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passText: { fontSize: 13, fontWeight: '700' },
});
