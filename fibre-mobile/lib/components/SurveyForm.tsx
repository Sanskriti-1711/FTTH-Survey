// ── Survey Form Component ─────────────────────────────────────────────────
// A comprehensive survey form overlay that combines:
//   1. Editable fields from the layer schema (premises, PDP, MFG, etc.)
//   2. Trench Classification (for line layers)
//   3. Risk Assessment
//   4. Hazards
//   5. Field Evidence
//   6. Survey Status & Notes
//
// This replaces NewPointForm and is used both when adding new points AND
// when editing existing features from the map popup.

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
import { useSurveyStore } from '../stores/survey';
import { router } from 'expo-router';
import { Spacing, Radius } from '../theme/colors';
import { getLayerSchema } from '../stores/layer-schemas';
import type { FieldSchemaField } from '../utils/types';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import MapPin from 'lucide-react-native/icons/map-pin';
import Camera from 'lucide-react-native/icons/camera';
import Ruler from 'lucide-react-native/icons/ruler';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import Flag from 'lucide-react-native/icons/flag';

// ── Types ─────────────────────────────────────────────────────────────────

export interface SurveyFormData {
  /** Layer ID for schema lookup */
  layerId: string;
  /** Feature ID to update on save */
  featureId: string;
  /** HLD feature ID for photo uploads (backend photo endpoint only accepts HLD Feature ids).
   *  Undefined for engineer-created points with no HLD row — photos stay local. */
  photoTargetId?: string;
  /** Feature name for header display */
  featureName?: string;
  /** Initial property values */
  initialValues: Record<string, unknown>;
  /** Whether this is a new point (shows "Discard" vs "Cancel") */
  isNewPoint?: boolean;
}

interface SurveyFormProps {
  /** Form data, or null to hide */
  formData: SurveyFormData | null;
  /** Called when the form is dismissed without saving */
  onDismiss: () => void;
  /** Called when the editable fields are saved */
  onSave: (featureId: string, layerId: string, properties: Record<string, unknown>) => void;
}

// ── Constants (from FeatureSurveySections) ────────────────────────────────

type TrenchType =
  | 'new_trench' | 'existing_duct' | 'existing_trench' | 'existing_fibre_route'
  | 'existing_openreach_duct' | 'existing_virgin_duct' | 'hdd_bore'
  | 'mole_plough' | 'micro_trench' | 'surface_mounted' | 'pole_route';

const TRENCH_TYPES: Record<TrenchType, { label: string; icon: string }> = {
  new_trench: { label: 'New Trench', icon: '⛏️' },
  existing_duct: { label: 'Existing Duct', icon: '🔌' },
  existing_trench: { label: 'Existing Trench', icon: '🔄' },
  existing_fibre_route: { label: 'Existing Fibre', icon: '🔗' },
  existing_openreach_duct: { label: 'Openreach Duct', icon: '📡' },
  existing_virgin_duct: { label: 'Virgin Duct', icon: '📺' },
  hdd_bore: { label: 'HDD Bore', icon: '🔩' },
  mole_plough: { label: 'Mole Plough', icon: '🚜' },
  micro_trench: { label: 'Micro Trench', icon: '🔧' },
  surface_mounted: { label: 'Surface Mounted', icon: '📐' },
  pole_route: { label: 'Pole Route', icon: '🏗️' },
};

const RISK_CATEGORIES = [
  'Traffic', 'Pedestrian', 'Private Land', 'Tree Roots',
  'Concrete Surface', 'Railway', 'Bridge', 'River',
  'Protected Area', 'Environmental', 'Gas Line', 'Water Main',
  'Electric Cable', 'Telecom', 'Asbestos', 'Confined Space',
];

const HAZARD_TYPES = [
  'Working at Height', 'Confined Space', 'Excavation', 'Traffic Management',
  'High Voltage', 'Flood Risk', 'Dog', 'Aggressive Resident',
  'Private Security', 'Environmental Protection', 'Tree Preservation Order',
];

const MITIGATION_TEMPLATES = [
  'Traffic Lights', 'Temporary Barriers', 'Road Closure', 'Permit',
  'HDD', 'Night Work', 'Police Assistance', 'Tree Officer Approval',
  'Environmental Approval', 'Utility Locate', 'CAT Scan', 'Trial Hole',
];

// ── Editable Field Renderer (reused from NewPointForm) ────────────────────

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
    <View style={[fieldStyles.fieldRow, { borderBottomColor: colors.outlineLight }]}>
      <View style={fieldStyles.fieldLabelRow}>
        <Text style={[fieldStyles.fieldLabel, { color: colors.textSecondary }]}>
          {field.label}
          {field.required && <Text style={{ color: '#EF4444' }}> *</Text>}
        </Text>
        {field.unit && (
          <Text style={[fieldStyles.fieldUnit, { color: colors.textTertiary }]}> ({field.unit})</Text>
        )}
      </View>

      {field.type === 'select' ? (
        <TouchableOpacity
          style={[fieldStyles.selectField, {
            backgroundColor: colors.surface,
            borderColor: dropdownOpen ? colors.primary : colors.outline,
          }]}
          onPress={() => setDropdownOpen(!dropdownOpen)}
          activeOpacity={0.7}
        >
          <Text
            style={[fieldStyles.selectValue, {
              color: value !== undefined && value !== '' ? colors.textPrimary : colors.textTertiary,
            }]}
            numberOfLines={1}
          >
            {displayValue === '—' ? 'Select...' : displayValue}
          </Text>
          <ChevronDown size={14} stroke={colors.textSecondary} />
        </TouchableOpacity>
      ) : field.type === 'boolean' ? (
        <View style={fieldStyles.booleanRow}>
          <Switch
            value={value === true}
            onValueChange={(v) => onChange(v)}
            trackColor={{ false: colors.outline, true: colors.primary + '60' }}
            thumbColor={value === true ? colors.primary : colors.textTertiary}
          />
          <Text style={[fieldStyles.booleanLabel, { color: colors.textPrimary }]}>
            {value === true ? 'Yes' : value === false ? 'No' : 'Not set'}
          </Text>
        </View>
      ) : field.type === 'textarea' ? (
        <TextInput
          style={[fieldStyles.textareaField, {
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
          style={[fieldStyles.inputField, {
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
          style={[fieldStyles.inputField, {
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

      {field.type === 'select' && dropdownOpen && field.options && (
        <View style={[fieldStyles.dropdownList, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
          <ScrollView style={fieldStyles.dropdownScroll} nestedScrollEnabled>
            {field.options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  fieldStyles.dropdownOption,
                  { borderBottomColor: colors.outlineLight },
                  String(value) === opt.value && { backgroundColor: colors.primary + '10' },
                ]}
                onPress={() => { onChange(opt.value); setDropdownOpen(false); }}
                activeOpacity={0.6}
              >
                <Text style={[
                  fieldStyles.dropdownOptionText,
                  { color: String(value) === opt.value ? colors.primary : colors.textPrimary },
                  String(value) === opt.value && { fontWeight: '700' },
                ]}>
                  {opt.label}
                </Text>
                {String(value) === opt.value && (
                  <View style={[fieldStyles.dropdownCheck, { backgroundColor: colors.primary }]}>
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

// ── Collapsible Section Wrapper ────────────────────────────────────────────

function CollapsibleSection({
  icon, title, subtitle, badge, isOpen, onToggle, children, accentColor,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  accentColor: string;
}) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <View style={[sectionStyles.card, { backgroundColor: colors.surface }]}>
      <TouchableOpacity
        style={sectionStyles.header}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={sectionStyles.headerLeft}>
          <View style={[sectionStyles.iconWrap, { backgroundColor: accentColor + '15' }]}>
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <Text style={[sectionStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                {title}
              </Text>
              {badge && (
                <View style={[sectionStyles.badge, { backgroundColor: accentColor + '20' }]}>
                  <Text style={[sectionStyles.badgeText, { color: accentColor }]}>{badge}</Text>
                </View>
              )}
            </View>
            {subtitle && (
              <Text style={[sectionStyles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        <ChevronRight
          size={16}
          stroke={colors.primary}
          style={isOpen ? { transform: [{ rotate: '90deg' }] } : undefined}
        />
      </TouchableOpacity>
      {isOpen && children && (
        <View style={[sectionStyles.content, { borderTopColor: colors.outlineLight }]}>
          {children}
        </View>
      )}
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function SurveyForm({ formData, onDismiss, onSave }: SurveyFormProps) {
  const colors = useThemeStore((s) => s.colors);
  const store = useSurveyStore();
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Active section state — which collapsible section is open
  const [activeSection, setActiveSection] = useState<string | null>('fields');

  // Editable field values
  const [values, setValues] = useState<Record<string, unknown>>({});

  // Trench Classification state
  const [selectedTrenchType, setSelectedTrenchType] = useState<TrenchType | null>(null);
  const [trenchAttrs, setTrenchAttrs] = useState({
    depth: '', width: '', surface_type: '',
    road_crossing: false, footpath_crossing: false, rail_crossing: false,
    river_crossing: false, private_property: false, traffic_sensitive: false,
    permit_required: false, notes: '',
  });

  // Risk Assessment state
  const [riskCategory, setRiskCategory] = useState('');
  const [riskSeverity, setRiskSeverity] = useState('medium');
  const [riskProbability, setRiskProbability] = useState('possible');
  const [riskMitigation, setRiskMitigation] = useState('');
  const [riskNotes, setRiskNotes] = useState('');

  // Hazard state
  const [selectedHazard, setSelectedHazard] = useState('');
  const [hazardMitigation, setHazardMitigation] = useState('');
  const [hazardNotes, setHazardNotes] = useState('');

  // Evidence state
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceWeather, setEvidenceWeather] = useState('');

  // Survey Status state
  const [surveyStatus, setSurveyStatus] = useState('visited');
  const [fieldNotes, setFieldNotes] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  };

  // Get schema
  const schema = useMemo(() => formData ? getLayerSchema(formData.layerId) : null, [formData]);
  const isTrenchLayer = formData ? (formData.layerId === 'trenches' || formData.layerId.includes('trench')) : false;

  // Reset form when formData changes
  useEffect(() => {
    if (formData) {
      const initial: Record<string, unknown> = {};
      if (schema) {
        for (const field of schema.editableFields) {
          const val = formData.initialValues[field.key];
          initial[field.key] = val !== undefined ? val : '';
        }
      }
      setValues(initial);
      setActiveSection('fields');

      // Pre-fill trench type if available
      if (isTrenchLayer && formData.initialValues.trench_type) {
        setSelectedTrenchType(formData.initialValues.trench_type as TrenchType);
      }

      Animated.timing(slideAnim, {
        toValue: 1, duration: 300,
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

  const handleSaveFields = useCallback(() => {
    if (!formData) return;
    const cleanValues: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(values)) {
      if (val !== '' && val !== undefined) cleanValues[key] = val;
    }
    cleanValues.surveyed_at = new Date().toISOString();
    cleanValues.survey_status = surveyStatus;
    onSave(formData.featureId, formData.layerId, cleanValues);
  }, [formData, values, surveyStatus, onSave]);

  // Section save handlers
  const handleSaveTrench = async () => {
    if (!formData || !selectedTrenchType) return;
    try {
      await store.saveTrenchSurvey({
        feature: formData.featureId,
        trench_type: selectedTrenchType,
        depth_mm: trenchAttrs.depth ? parseInt(trenchAttrs.depth) : null,
        width_mm: trenchAttrs.width ? parseInt(trenchAttrs.width) : null,
        surface_type: trenchAttrs.surface_type || null,
        construction_method: null,
        road_crossing: trenchAttrs.road_crossing,
        footpath_crossing: trenchAttrs.footpath_crossing,
        rail_crossing: trenchAttrs.rail_crossing,
        river_crossing: trenchAttrs.river_crossing,
        private_property: trenchAttrs.private_property,
        traffic_sensitive: trenchAttrs.traffic_sensitive,
        permit_required: trenchAttrs.permit_required,
        notes: trenchAttrs.notes,
      });
      showToast('Trench classification saved');
      setActiveSection(null);
    } catch { showToast('Failed to save trench'); }
  };

  const handleSaveRisk = async () => {
    if (!formData || !riskCategory) return;
    try {
      await store.saveRisk({
        feature: formData.featureId,
        category: riskCategory,
        severity: riskSeverity as any,
        probability: riskProbability as any,
        mitigation: riskMitigation,
        notes: riskNotes,
        status: 'open',
      });
      showToast('Risk assessment saved');
      setActiveSection(null);
    } catch { showToast('Failed to save risk'); }
  };

  const handleSaveHazard = async () => {
    if (!formData || !selectedHazard) return;
    try {
      await store.saveHazard({
        feature: formData.featureId,
        hazard_type: selectedHazard,
        mitigation_template: hazardMitigation || null,
        notes: hazardNotes,
        is_active: true,
      });
      showToast('Hazard recorded');
      setActiveSection(null);
    } catch { showToast('Failed to save hazard'); }
  };

  const handleSaveEvidence = async () => {
    if (!formData) return;
    try {
      await store.saveEvidence({
        feature: formData.featureId,
        evidence_type: 'measurement',
        description: evidenceDescription,
        weather: evidenceWeather,
        captured_at: new Date().toISOString(),
      });
      showToast('Field evidence saved');
      setEvidenceDescription('');
      setEvidenceWeather('');
      setActiveSection(null);
    } catch { showToast('Failed to save evidence'); }
  };

  const handleUpdateStatus = async () => {
    if (!formData) return;
    try {
      await store.updateStatus(formData.featureId, surveyStatus, fieldNotes);
      showToast('Status updated to ' + surveyStatus.replace(/_/g, ' '));
    } catch { showToast('Failed to update status'); }
  };

  const toggleSection = (name: string) => {
    setActiveSection(activeSection === name ? null : name);
  };

  if (!formData) return null;

  const sectionList = [
    { id: 'fields', icon: <MapPin size={16} stroke={colors.primary} />, title: 'Survey Details', subtitle: `${schema?.editableFields.length ?? 0} editable fields`, accent: colors.primary, show: true },
    { id: 'trench', icon: <Text style={{ fontSize: 16 }}>🏗️</Text>, title: 'Trench Classification', subtitle: 'Type, dimensions, crossings', accent: '#E74C3C', show: isTrenchLayer },
    { id: 'risk', icon: <AlertTriangle size={16} stroke={colors.error} />, title: 'Risk Assessment', subtitle: 'Evaluate risks for this feature', accent: colors.error, show: true },
    { id: 'hazard', icon: <Text style={{ fontSize: 16 }}>🚧</Text>, title: 'Hazards', subtitle: 'Site hazards & mitigations', accent: '#F39C12', show: true },
    { id: 'evidence', icon: <Camera size={16} stroke={colors.primary} />, title: 'Field Evidence', subtitle: 'Photos, measurements, notes', accent: colors.primary, show: true },
    { id: 'status', icon: <ClipboardList size={16} stroke={colors.success} />, title: 'Survey Status', subtitle: 'Update workflow status', accent: colors.success, show: true },
  ].filter((s) => s.show);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface + 'F5',
          borderColor: colors.primary + '40',
          opacity: slideAnim,
          transform: [{
            translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [80, 0],
            }),
          }],
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.outlineLight }]}>
        <View style={styles.headerLeft}>
          <MapPin size={14} stroke={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {formData.featureName ?? `Survey: ${formData.layerId}`}
          </Text>
          {formData.isNewPoint && (
            <View style={[styles.newBadge, { backgroundColor: '#10B981' + '20' }]}>
              <Text style={[styles.newBadgeText, { color: '#10B981' }]}>NEW</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={18} stroke={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Scrollable sections */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {sectionList.map((section) => (
          <CollapsibleSection
            key={section.id}
            icon={section.icon}
            title={section.title}
            subtitle={section.subtitle}
            isOpen={activeSection === section.id}
            onToggle={() => toggleSection(section.id)}
            accentColor={section.accent}
          >
            {/* ── Editable Fields Section ── */}
            {section.id === 'fields' && schema && schema.editableFields.length > 0 && (
              <View>
                {schema.editableFields.map((field) => (
                  <EditableField
                    key={field.key}
                    field={field}
                    value={values[field.key] ?? ''}
                    onChange={(val) => handleFieldChange(field.key, val)}
                  />
                ))}
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveFields}
                  activeOpacity={0.7}
                >
                  <Check size={14} stroke={colors.onPrimary} />
                  <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
                    Save Survey Details
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {section.id === 'fields' && (!schema || schema.editableFields.length === 0) && (
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                No editable fields for this layer type.
              </Text>
            )}

            {/* ── Trench Classification Section ── */}
            {section.id === 'trench' && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Trench Type</Text>
                <View style={styles.chipGrid}>
                  {(Object.entries(TRENCH_TYPES) as [TrenchType, { label: string; icon: string }][]).map(([type, info]) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.trenchChip,
                        {
                          backgroundColor: selectedTrenchType === type ? '#E74C3C20' : colors.background,
                          borderColor: selectedTrenchType === type ? '#E74C3C' : colors.outline,
                          borderWidth: selectedTrenchType === type ? 2 : 1,
                        },
                      ]}
                      onPress={() => setSelectedTrenchType(type)}
                    >
                      <Text style={styles.trenchIcon}>{info.icon}</Text>
                      <Text
                        style={[styles.trenchLabel, { color: selectedTrenchType === type ? '#E74C3C' : colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {info.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedTrenchType && (
                  <View style={{ marginTop: Spacing.md }}>
                    <View style={styles.attrRow}>
                      <Text style={[styles.attrLabel, { color: colors.textSecondary }]}>Depth (mm)</Text>
                      <TextInput
                        style={[styles.attrInput, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                        value={trenchAttrs.depth}
                        onChangeText={(v) => setTrenchAttrs((p) => ({ ...p, depth: v }))}
                        keyboardType="numeric"
                        placeholder="450"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                    <View style={styles.attrRow}>
                      <Text style={[styles.attrLabel, { color: colors.textSecondary }]}>Width (mm)</Text>
                      <TextInput
                        style={[styles.attrInput, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                        value={trenchAttrs.width}
                        onChangeText={(v) => setTrenchAttrs((p) => ({ ...p, width: v }))}
                        keyboardType="numeric"
                        placeholder="300"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>

                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Surface Type</Text>
                    <View style={styles.chipRow}>
                      {['Asphalt', 'Concrete', 'Paving', 'Earth', 'Grass'].map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={[styles.weatherChip, {
                            backgroundColor: trenchAttrs.surface_type === s.toLowerCase() ? '#E74C3C' : colors.background,
                            borderColor: trenchAttrs.surface_type === s.toLowerCase() ? '#E74C3C' : colors.outline,
                          }]}
                          onPress={() => setTrenchAttrs((p) => ({ ...p, surface_type: s.toLowerCase() }))}
                        >
                          <Text style={[styles.weatherText, { color: trenchAttrs.surface_type === s.toLowerCase() ? '#FFF' : colors.textSecondary }]}>
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Crossings</Text>
                    <View style={styles.toggleGrid}>
                      {(['road_crossing', 'footpath_crossing', 'rail_crossing', 'river_crossing', 'private_property', 'traffic_sensitive', 'permit_required'] as const).map((key) => (
                        <TouchableOpacity
                          key={key}
                          style={[styles.toggleBtn, {
                            backgroundColor: trenchAttrs[key] ? colors.primary + '20' : colors.background,
                            borderColor: trenchAttrs[key] ? colors.primary : colors.outline,
                          }]}
                          onPress={() => setTrenchAttrs((p) => ({ ...p, [key]: !p[key] }))}
                        >
                          <View style={[styles.toggleDot, {
                            backgroundColor: trenchAttrs[key] ? colors.primary : 'transparent',
                            borderColor: trenchAttrs[key] ? colors.primary : colors.outline,
                          }]}>
                            {trenchAttrs[key] && <Check size={10} stroke={colors.onPrimary} fill={colors.onPrimary} />}
                          </View>
                          <Text style={[styles.toggleText, { color: trenchAttrs[key] ? colors.primary : colors.textSecondary }]}>
                            {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TextInput
                      style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                      value={trenchAttrs.notes}
                      onChangeText={(v) => setTrenchAttrs((p) => ({ ...p, notes: v }))}
                      placeholder="Trench notes, construction method details..."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      numberOfLines={2}
                    />

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: '#E74C3C' }]}
                      onPress={handleSaveTrench}
                      activeOpacity={0.7}
                    >
                      <Check size={14} stroke="#FFF" />
                      <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Save Trench Classification</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Risk Assessment Section ── */}
            {section.id === 'risk' && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Risk Category</Text>
                <View style={styles.chipGrid}>
                  {RISK_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, {
                        backgroundColor: riskCategory === cat ? colors.error + '20' : colors.background,
                        borderColor: riskCategory === cat ? colors.error : colors.outline,
                      }]}
                      onPress={() => setRiskCategory(cat)}
                    >
                      <Text style={[styles.catText, { color: riskCategory === cat ? colors.error : colors.textSecondary }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {riskCategory && (
                  <View style={{ marginTop: Spacing.md }}>
                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Severity</Text>
                    <View style={styles.levelRow}>
                      {['low', 'medium', 'high', 'critical'].map((sev) => (
                        <TouchableOpacity
                          key={sev}
                          style={[styles.levelBtn, {
                            backgroundColor: riskSeverity === sev ? colors.error + '20' : colors.background,
                            borderColor: riskSeverity === sev ? colors.error : colors.outline,
                          }]}
                          onPress={() => setRiskSeverity(sev)}
                        >
                          <Text style={[styles.levelText, {
                            color: riskSeverity === sev ? colors.error : colors.textSecondary,
                            fontWeight: riskSeverity === sev ? '700' : '500',
                          }]}>
                            {sev.charAt(0).toUpperCase() + sev.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Probability</Text>
                    <View style={styles.levelRow}>
                      {['rare', 'possible', 'likely', 'certain'].map((prob) => (
                        <TouchableOpacity
                          key={prob}
                          style={[styles.levelBtn, {
                            backgroundColor: riskProbability === prob ? colors.warning + '20' : colors.background,
                            borderColor: riskProbability === prob ? colors.warning : colors.outline,
                          }]}
                          onPress={() => setRiskProbability(prob)}
                        >
                          <Text style={[styles.levelText, {
                            color: riskProbability === prob ? colors.warning : colors.textSecondary,
                            fontWeight: riskProbability === prob ? '700' : '500',
                          }]}>
                            {prob.charAt(0).toUpperCase() + prob.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TextInput
                      style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                      value={riskMitigation}
                      onChangeText={setRiskMitigation}
                      placeholder="Mitigation measures..."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      numberOfLines={2}
                    />
                    <TextInput
                      style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                      value={riskNotes}
                      onChangeText={setRiskNotes}
                      placeholder="Additional notes..."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      numberOfLines={2}
                    />

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: colors.error }]}
                      onPress={handleSaveRisk}
                      activeOpacity={0.7}
                    >
                      <Check size={14} stroke="#FFF" />
                      <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Save Risk Assessment</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Hazard Section ── */}
            {section.id === 'hazard' && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Hazard Type</Text>
                <View style={styles.chipGrid}>
                  {HAZARD_TYPES.map((hazard) => (
                    <TouchableOpacity
                      key={hazard}
                      style={[styles.catChip, {
                        backgroundColor: selectedHazard === hazard ? '#F39C1220' : colors.background,
                        borderColor: selectedHazard === hazard ? '#F39C12' : colors.outline,
                      }]}
                      onPress={() => setSelectedHazard(hazard)}
                    >
                      <Text style={[styles.catText, { color: selectedHazard === hazard ? '#F39C12' : colors.textSecondary }]}>
                        {hazard}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedHazard && (
                  <View style={{ marginTop: Spacing.md }}>
                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Mitigation</Text>
                    <View style={styles.chipGrid}>
                      {MITIGATION_TEMPLATES.map((tmpl) => (
                        <TouchableOpacity
                          key={tmpl}
                          style={[styles.catChip, {
                            backgroundColor: hazardMitigation === tmpl ? colors.success + '20' : colors.background,
                            borderColor: hazardMitigation === tmpl ? colors.success : colors.outline,
                          }]}
                          onPress={() => setHazardMitigation(tmpl)}
                        >
                          <Text style={[styles.catText, { color: hazardMitigation === tmpl ? colors.success : colors.textSecondary }]}>
                            {tmpl}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TextInput
                      style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                      value={hazardNotes}
                      onChangeText={setHazardNotes}
                      placeholder="Hazard notes, location, severity details..."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      numberOfLines={2}
                    />

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: '#F39C12' }]}
                      onPress={handleSaveHazard}
                      activeOpacity={0.7}
                    >
                      <Check size={14} stroke="#FFF" />
                      <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Record Hazard</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Field Evidence Section ── */}
            {section.id === 'evidence' && (
              <View>
                <View style={styles.evidenceRow}>
                  <TouchableOpacity
                    style={[styles.evidenceBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                    onPress={() => {
                      // Open camera with the HLD feature id so the photo attaches +
                      // uploads (backend only accepts HLD Feature ids). For
                      // engineer-created points with no HLD row, no featureId is
                      // passed — the camera stores the photo locally instead.
                      router.push({ pathname: '/camera', params: formData.photoTargetId ? { featureId: formData.photoTargetId } : {} });
                    }}
                  >
                    <Camera size={18} stroke={colors.primary} />
                    <Text style={[styles.evidenceBtnText, { color: colors.primary }]}>Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.evidenceBtn, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}
                    onPress={() => setEvidenceDescription((prev) => (prev ? prev + '\n' : '') + 'Measurement: ')}
                  >
                    <Ruler size={18} stroke={colors.warning} />
                    <Text style={[styles.evidenceBtnText, { color: colors.warning }]}>Measure</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.evidenceBtn, { backgroundColor: colors.success + '15', borderColor: colors.success }]}
                    onPress={() => setEvidenceDescription((prev) => (prev ? prev + '\n' : '') + 'Note: ')}
                  >
                    <ClipboardList size={18} stroke={colors.success} />
                    <Text style={[styles.evidenceBtnText, { color: colors.success }]}>Note</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                  value={evidenceDescription}
                  onChangeText={setEvidenceDescription}
                  placeholder="Describe what you observed..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                />

                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Weather</Text>
                <View style={styles.chipRow}>
                  {['Sunny', 'Cloudy', 'Rain', 'Fog', 'Wind'].map((w) => (
                    <TouchableOpacity
                      key={w}
                      style={[styles.weatherChip, {
                        backgroundColor: evidenceWeather === w.toLowerCase() ? colors.primary : colors.background,
                        borderColor: colors.outline,
                      }]}
                      onPress={() => setEvidenceWeather(w.toLowerCase())}
                    >
                      <Text style={[styles.weatherText, { color: evidenceWeather === w.toLowerCase() ? colors.onPrimary : colors.textSecondary }]}>
                        {w}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveEvidence}
                  activeOpacity={0.7}
                >
                  <Check size={14} stroke={colors.onPrimary} />
                  <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>Save Evidence</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Survey Status Section ── */}
            {section.id === 'status' && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Status</Text>
                <View style={styles.statusGrid}>
                  {['visited', 'verified', 'modified', 'needs_review', 'rejected', 'approved', 'completed'].map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.statusChip, {
                        backgroundColor: surveyStatus === st ? colors.success + '20' : colors.background,
                        borderColor: surveyStatus === st ? colors.success : colors.outline,
                      }]}
                      onPress={() => setSurveyStatus(st)}
                    >
                      <Text style={[styles.statusChipText, {
                        color: surveyStatus === st ? colors.success : colors.textSecondary,
                        fontWeight: surveyStatus === st ? '700' : '500',
                      }]}>
                        {st.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                  value={fieldNotes}
                  onChangeText={setFieldNotes}
                  placeholder="Field notes, observations, reasons for status change..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                />

                <View style={styles.statusActions}>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.success, flex: 1 }]}
                    onPress={handleUpdateStatus}
                    activeOpacity={0.7}
                  >
                    <Check size={14} stroke="#FFF" />
                    <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Update</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.flagBtn, { borderColor: colors.primary }]}
                    onPress={() => showToast('Feature flagged for review')}
                    activeOpacity={0.7}
                  >
                    <Flag size={14} stroke={colors.primary} />
                    <Text style={[styles.flagBtnText, { color: colors.primary }]}>Flag</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </CollapsibleSection>
        ))}

        {/* Change History */}
        {store.changes.length > 0 && (
          <View style={[sectionStyles.card, { backgroundColor: colors.surface }]}>
            <View style={sectionStyles.header}>
              <View style={sectionStyles.headerLeft}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>📝</Text>
                <Text style={[sectionStyles.title, { color: colors.textPrimary }]}>Recent Changes</Text>
              </View>
            </View>
            {store.changes.slice(0, 5).map((change) => (
              <View key={change.id} style={styles.changeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.changeField, { color: colors.textPrimary }]}>{change.field_name}</Text>
                  <Text style={[styles.changeReason, { color: colors.textTertiary }]}>{change.reason}</Text>
                </View>
                <Text style={[styles.changeTime, { color: colors.textTertiary }]}>
                  {new Date(change.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: Spacing.lg }} />
      </ScrollView>

      {/* Footer Actions */}
      <View style={[styles.footer, { borderTopColor: colors.outlineLight }]}>
        <TouchableOpacity
          style={[styles.discardBtn, { borderColor: colors.outline }]}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text style={[styles.discardBtnText, { color: colors.textSecondary }]}>
            {formData.isNewPoint ? 'Discard' : 'Close'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap}>
          <View style={[styles.toast, { backgroundColor: colors.surface }]}>
            <Check size={14} stroke={colors.success} />
            <Text style={[styles.toastText, { color: colors.textPrimary }]}>{toastMsg}</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// ── Main Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xxl + 140,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
    maxHeight: 520,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  newBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  discardBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  discardBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
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
  // Shared section styles
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  trenchChip: {
    width: '31%',
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    minWidth: 65,
  },
  trenchIcon: { fontSize: 18, marginBottom: 2 },
  trenchLabel: { fontSize: 8, fontWeight: '600', textAlign: 'center' },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  catText: { fontSize: 11, fontWeight: '500' },
  weatherChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  weatherText: { fontSize: 12, fontWeight: '500' },
  levelRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  levelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  levelText: { fontSize: 12 },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  attrLabel: { fontSize: 12, fontWeight: '500', width: 90 },
  attrInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 13,
    height: 38,
  },
  toggleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  toggleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  toggleText: { fontSize: 11, fontWeight: '500' },
  textarea: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    fontSize: 13,
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: Spacing.sm,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 11 },
  statusActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  flagBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  flagBtnText: { fontSize: 12, fontWeight: '600' },
  evidenceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  evidenceBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: Spacing.xs,
  },
  evidenceBtnText: { fontSize: 12, fontWeight: '600' },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  changeField: { fontSize: 13, fontWeight: '500' },
  changeReason: { fontSize: 11, marginTop: 1 },
  changeTime: { fontSize: 10 },
  toastWrap: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  toastText: { fontSize: 12, fontWeight: '500' },
});

// ── Section Styles ────────────────────────────────────────────────────────

const sectionStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 10, marginTop: 1 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  badgeText: { fontSize: 9, fontWeight: '600' },
  content: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

// ── Field Styles (from NewPointForm) ──────────────────────────────────────

const fieldStyles = StyleSheet.create({
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
  fieldLabel: { fontSize: 11, fontWeight: '600' },
  fieldUnit: { fontSize: 10, fontStyle: 'italic' },
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
    minHeight: 52,
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
  selectValue: { fontSize: 13, flex: 1 },
  booleanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  booleanLabel: { fontSize: 13, fontWeight: '500' },
  dropdownList: {
    marginTop: 2,
    borderWidth: 1,
    borderRadius: Radius.sm,
    maxHeight: 130,
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 130 },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownOptionText: { fontSize: 13, flex: 1 },
  dropdownCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
