// ── Feature Survey Sections ─────────────────────────────────-------------
// Reusable component that renders all survey editing modules for a feature:
//  - Trench Classification
//  - Risk Assessment
//  - Hazards
//  - Field Evidence
//  - Survey Status & Notes
//  - Change History
//
// Used by: feature/[featureId].tsx detail screen

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { useSurveyStore } from '../stores/survey';
import { router } from 'expo-router';
import {
  Camera, Ruler, ClipboardList, CheckCircle, Flag,
  ChevronRight, AlertTriangle,
} from 'lucide-react-native';
import { Spacing, Radius } from '../theme/colors';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';

// ── Constants ─────────────────────────────────────────────────────────────

type TrenchType =
  | 'new_trench' | 'existing_duct' | 'existing_trench' | 'existing_fibre_route'
  | 'existing_openreach_duct' | 'existing_virgin_duct' | 'hdd_bore'
  | 'mole_plough' | 'micro_trench' | 'surface_mounted' | 'pole_route';

interface TrenchTypeInfo {
  label: string;
  color: string;
  icon: string;
}

const TRENCH_TYPES: Record<TrenchType, TrenchTypeInfo> = {
  new_trench: { label: 'New Trench', color: '#E74C3C', icon: '⛏️' },
  existing_duct: { label: 'Existing Duct', color: '#2ECC71', icon: '🔌' },
  existing_trench: { label: 'Existing Trench', color: '#3498DB', icon: '🔄' },
  existing_fibre_route: { label: 'Existing Fibre', color: '#9B59B6', icon: '🔗' },
  existing_openreach_duct: { label: 'Openreach Duct', color: '#1ABC9C', icon: '📡' },
  existing_virgin_duct: { label: 'Virgin Duct', color: '#E67E22', icon: '📺' },
  hdd_bore: { label: 'HDD Bore', color: '#F39C12', icon: '🔩' },
  mole_plough: { label: 'Mole Plough', color: '#8E44AD', icon: '🚜' },
  micro_trench: { label: 'Micro Trench', color: '#2C3E50', icon: '🔧' },
  surface_mounted: { label: 'Surface Mounted', color: '#7F8C8D', icon: '📐' },
  pole_route: { label: 'Pole Route', color: '#795548', icon: '🏗️' },
};

const RISK_CATEGORIES = [
  'Traffic', 'Pedestrian', 'Private Land', 'Tree Roots',
  'Concrete Surface', 'Railway', 'Bridge', 'River',
  'Protected Area', 'Environmental', 'Gas Line', 'Water Main',
  'Electric Cable', 'Telecom', 'Asbestos', 'Confined Space',
];

const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const PROBABILITY_LEVELS = ['rare', 'possible', 'likely', 'certain'] as const;

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

const SURVEY_STATUS_FLOW = [
  'not_started', 'visited', 'verified', 'modified',
  'needs_review', 'rejected', 'approved', 'completed',
] as const;

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  featureId: string;
  layerId: string;
}

// ── Color Helpers ─────────────────────────────────────────────────────────

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'low': return { bg: '#27AE6020', text: '#27AE60' };
    case 'medium': return { bg: '#F39C1220', text: '#F39C12' };
    case 'high': return { bg: '#E74C3C20', text: '#E74C3C' };
    case 'critical': return { bg: '#8E44AD20', text: '#8E44AD' };
    default: return { bg: '#95A5A620', text: '#95A5A6' };
  }
}

function getProbabilityColor(prob: string) {
  switch (prob) {
    case 'rare': return { bg: '#3498DB20', text: '#3498DB' };
    case 'possible': return { bg: '#F39C1220', text: '#F39C12' };
    case 'likely': return { bg: '#E67E2220', text: '#E67E22' };
    case 'certain': return { bg: '#E74C3C20', text: '#E74C3C' };
    default: return { bg: '#95A5A620', text: '#95A5A6' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function FeatureSurveySections({ featureId, layerId }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const store = useSurveyStore();

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Trench Module
  const [selectedTrenchType, setSelectedTrenchType] = useState<TrenchType | null>(null);
  const [trenchAttrs, setTrenchAttrs] = useState({
    depth: '', width: '', surface_type: '',
    road_crossing: false, footpath_crossing: false, rail_crossing: false,
    river_crossing: false, private_property: false, traffic_sensitive: false,
    permit_required: false, notes: '',
  });

  // Risk Module
  const [riskCategory, setRiskCategory] = useState('');
  const [riskSeverity, setRiskSeverity] = useState<string>('medium');
  const [riskProbability, setRiskProbability] = useState<string>('possible');
  const [riskMitigation, setRiskMitigation] = useState('');
  const [riskNotes, setRiskNotes] = useState('');

  // Hazard Module
  const [selectedHazard, setSelectedHazard] = useState('');
  const [hazardMitigation, setHazardMitigation] = useState('');
  const [hazardNotes, setHazardNotes] = useState('');

  // Evidence Module
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceWeather, setEvidenceWeather] = useState('');

  // Status Module
  const [surveyStatus, setSurveyStatus] = useState<string>('not_started');
  const [fieldNotes, setFieldNotes] = useState('');

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleSaveTrench = async () => {
    if (!selectedTrenchType) return;
    try {
      await store.saveTrenchSurvey({
        feature: featureId,
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
      showToast('Trench classification saved', 'success');
      setActiveModule(null);
    } catch { showToast('Failed to save trench', 'error'); }
  };

  const handleSaveRisk = async () => {
    if (!riskCategory) return;
    try {
      await store.saveRisk({
        feature: featureId,
        category: riskCategory,
        severity: riskSeverity as any,
        probability: riskProbability as any,
        mitigation: riskMitigation,
        notes: riskNotes,
        status: 'open',
      });
      showToast('Risk assessment saved', 'success');
      setActiveModule(null);
    } catch { showToast('Failed to save risk', 'error'); }
  };

  const handleSaveHazard = async () => {
    if (!selectedHazard) return;
    try {
      await store.saveHazard({
        feature: featureId,
        hazard_type: selectedHazard,
        mitigation_template: hazardMitigation || null,
        notes: hazardNotes,
        is_active: true,
      });
      showToast('Hazard recorded', 'success');
      setActiveModule(null);
    } catch { showToast('Failed to save hazard', 'error'); }
  };

  const handleSaveEvidence = async () => {
    try {
      await store.saveEvidence({
        feature: featureId,
        evidence_type: 'measurement',
        description: evidenceDescription,
        weather: evidenceWeather,
        captured_at: new Date().toISOString(),
      });
      showToast('Field evidence saved', 'success');
      setEvidenceDescription('');
      setEvidenceWeather('');
      setActiveModule(null);
    } catch { showToast('Failed to save evidence', 'error'); }
  };

  const handleUpdateStatus = async () => {
    try {
      await store.updateStatus(featureId, surveyStatus, fieldNotes);
      showToast('Status updated to ' + surveyStatus.replace(/_/g, ' '), 'success');
    } catch { showToast('Failed to update status', 'error'); }
  };

  const isTrenchLayer = layerId === 'trenches' || layerId.includes('trench');

  const toggleModule = (name: string) => {
    setActiveModule(activeModule === name ? null : name);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <View>
      {/* Module 1: Trench Classification */}
      {isTrenchLayer && (
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={{ fontSize: 20, marginRight: 6 }}>🏗️</Text>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Trench Classification</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Select trench type & configure attributes</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.moduleToggle, { backgroundColor: activeModule === 'trench' ? colors.primary + '20' : 'transparent' }]}
              onPress={() => toggleModule('trench')}
            >
              <ChevronRight size={16} stroke={colors.primary} style={activeModule === 'trench' ? { transform: [{ rotate: '90deg' }] } : undefined} />
            </TouchableOpacity>
          </View>

          <View style={styles.trenchGrid}>
            {(Object.entries(TRENCH_TYPES) as [TrenchType, TrenchTypeInfo][]).map(([type, info]) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.trenchChip,
                  {
                    backgroundColor: selectedTrenchType === type ? info.color + '20' : colors.background,
                    borderColor: selectedTrenchType === type ? info.color : colors.outline,
                    borderWidth: selectedTrenchType === type ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedTrenchType(type)}
              >
                <Text style={styles.trenchIcon}>{info.icon}</Text>
                <Text style={[styles.trenchLabel, { color: selectedTrenchType === type ? info.color : colors.textSecondary }]} numberOfLines={1}>
                  {info.label}
                </Text>
                {selectedTrenchType === type && <View style={[styles.trenchSelectedDot, { backgroundColor: info.color }]} />}
              </TouchableOpacity>
            ))}
          </View>

          {activeModule === 'trench' && selectedTrenchType && (
            <View style={styles.moduleContent}>
              <View style={styles.attrRow}>
                <Text style={[styles.attrLabel, { color: colors.textSecondary }]}>Depth (mm)</Text>
                <TextInput
                  style={[styles.attrInput, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                  value={trenchAttrs.depth}
                  onChangeText={(v) => setTrenchAttrs((p) => ({ ...p, depth: v }))}
                  keyboardType="numeric"
                  placeholder="e.g. 450"
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
                  placeholder="e.g. 300"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              <View style={styles.attrRow}>
                <Text style={[styles.attrLabel, { color: colors.textSecondary }]}>Surface</Text>
                <View style={styles.optionRow}>
                  {['Asphalt', 'Concrete', 'Paving', 'Earth', 'Grass'].map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.smallChip, { backgroundColor: trenchAttrs.surface_type === s.toLowerCase() ? colors.primary : colors.background, borderColor: colors.outline }]}
                      onPress={() => setTrenchAttrs((p) => ({ ...p, surface_type: s.toLowerCase() }))}
                    >
                      <Text style={[styles.smallChipText, { color: trenchAttrs.surface_type === s.toLowerCase() ? colors.onPrimary : colors.textSecondary }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Crossings</Text>
              <View style={styles.toggleGrid}>
                {(['road_crossing', 'footpath_crossing', 'rail_crossing', 'river_crossing'] as const).map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleBtn, { backgroundColor: trenchAttrs[key] ? colors.primary + '20' : colors.background, borderColor: trenchAttrs[key] ? colors.primary : colors.outline }]}
                    onPress={() => setTrenchAttrs((p) => ({ ...p, [key]: !p[key] }))}
                  >
                    <View style={[styles.toggleCheck, { backgroundColor: trenchAttrs[key] ? colors.primary : 'transparent', borderColor: trenchAttrs[key] ? colors.primary : colors.outline }]}>
                      {trenchAttrs[key] && <CheckCircle size={12} stroke={colors.onPrimary} fill={colors.onPrimary} />}
                    </View>
                    <Text style={[styles.toggleLabel, { color: trenchAttrs[key] ? colors.primary : colors.textSecondary }]}>
                      {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.toggleGrid}>
                {(['private_property', 'traffic_sensitive', 'permit_required'] as const).map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleBtn, { backgroundColor: trenchAttrs[key] ? colors.warning + '20' : colors.background, borderColor: trenchAttrs[key] ? colors.warning : colors.outline }]}
                    onPress={() => setTrenchAttrs((p) => ({ ...p, [key]: !p[key] }))}
                  >
                    <View style={[styles.toggleCheck, { backgroundColor: trenchAttrs[key] ? colors.warning : 'transparent', borderColor: trenchAttrs[key] ? colors.warning : colors.outline }]}>
                      {trenchAttrs[key] && <CheckCircle size={12} stroke={colors.onPrimary} fill={colors.onPrimary} />}
                    </View>
                    <Text style={[styles.toggleLabel, { color: trenchAttrs[key] ? colors.warning : colors.textSecondary }]}>
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
                numberOfLines={3}
              />

              <Button title="Save Trench Classification" variant="primary" size="sm" onPress={handleSaveTrench} style={{ marginTop: Spacing.md }} />
            </View>
          )}
        </View>
      )}

      {/* Module 2: Risk Assessment */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <AlertTriangle size={18} stroke={colors.error} style={{ marginRight: 6 }} />
            <View>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Risk Assessment</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Evaluate risks for this feature</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.moduleToggle, { backgroundColor: activeModule === 'risk' ? colors.primary + '20' : 'transparent' }]}
            onPress={() => toggleModule('risk')}
          >
            <ChevronRight size={16} stroke={colors.primary} style={activeModule === 'risk' ? { transform: [{ rotate: '90deg' }] } : undefined} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Risk Category</Text>
        <View style={styles.categoryGrid}>
          {RISK_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, { backgroundColor: riskCategory === cat ? colors.error + '20' : colors.background, borderColor: riskCategory === cat ? colors.error : colors.outline }]}
              onPress={() => setRiskCategory(cat)}
            >
              <Text style={[styles.categoryText, { color: riskCategory === cat ? colors.error : colors.textSecondary }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeModule === 'risk' && riskCategory && (
          <View style={styles.moduleContent}>
            <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Severity</Text>
            <View style={styles.severityRow}>
              {SEVERITY_LEVELS.map((sev) => {
                const sc = getSeverityColor(sev);
                return (
                  <TouchableOpacity
                    key={sev}
                    style={[styles.severityBtn, { backgroundColor: riskSeverity === sev ? sc.bg : colors.background, borderColor: riskSeverity === sev ? sc.text : colors.outline }]}
                    onPress={() => setRiskSeverity(sev)}
                  >
                    <Text style={[styles.severityText, { color: riskSeverity === sev ? sc.text : colors.textSecondary, fontWeight: riskSeverity === sev ? '700' : '500' }]}>
                      {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Probability</Text>
            <View style={styles.severityRow}>
              {PROBABILITY_LEVELS.map((prob) => {
                const pc = getProbabilityColor(prob);
                return (
                  <TouchableOpacity
                    key={prob}
                    style={[styles.severityBtn, { backgroundColor: riskProbability === prob ? pc.bg : colors.background, borderColor: riskProbability === prob ? pc.text : colors.outline }]}
                    onPress={() => setRiskProbability(prob)}
                  >
                    <Text style={[styles.severityText, { color: riskProbability === prob ? pc.text : colors.textSecondary, fontWeight: riskProbability === prob ? '700' : '500' }]}>
                      {prob.charAt(0).toUpperCase() + prob.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
              value={riskMitigation}
              onChangeText={setRiskMitigation}
              placeholder="Describe mitigation measures..."
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

            <Button title="Save Risk Assessment" variant="primary" size="sm" onPress={handleSaveRisk} style={{ marginTop: Spacing.md }} />
          </View>
        )}
      </View>

      {/* Module 3: Hazards */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={{ fontSize: 20, marginRight: 6 }}>🚧</Text>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Hazards</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Identify site hazards & record mitigations</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.moduleToggle, { backgroundColor: activeModule === 'hazard' ? colors.primary + '20' : 'transparent' }]}
            onPress={() => toggleModule('hazard')}
          >
            <ChevronRight size={16} stroke={colors.primary} style={activeModule === 'hazard' ? { transform: [{ rotate: '90deg' }] } : undefined} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Hazard Type</Text>
        <View style={styles.categoryGrid}>
          {HAZARD_TYPES.map((hazard) => (
            <TouchableOpacity
              key={hazard}
              style={[styles.categoryChip, { backgroundColor: selectedHazard === hazard ? colors.warning + '20' : colors.background, borderColor: selectedHazard === hazard ? colors.warning : colors.outline }]}
              onPress={() => setSelectedHazard(hazard)}
            >
              <Text style={[styles.categoryText, { color: selectedHazard === hazard ? colors.warning : colors.textSecondary }]}>{hazard}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeModule === 'hazard' && selectedHazard && (
          <View style={styles.moduleContent}>
            <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Mitigation Template</Text>
            <View style={styles.categoryGrid}>
              {MITIGATION_TEMPLATES.map((tmpl) => (
                <TouchableOpacity
                  key={tmpl}
                  style={[styles.mitigationChip, { backgroundColor: hazardMitigation === tmpl ? colors.success + '20' : colors.background, borderColor: hazardMitigation === tmpl ? colors.success : colors.outline }]}
                  onPress={() => setHazardMitigation(tmpl)}
                >
                  <Text style={[styles.mitigationText, { color: hazardMitigation === tmpl ? colors.success : colors.textSecondary }]}>{tmpl}</Text>
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
              numberOfLines={3}
            />

            <Button title="Record Hazard" variant="primary" size="sm" onPress={handleSaveHazard} style={{ marginTop: Spacing.md }} />
          </View>
        )}
      </View>

      {/* Module 4: Field Evidence */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Camera size={18} stroke={colors.primary} style={{ marginRight: 6 }} />
            <View>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Field Evidence</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Record observations, photos, and measurements</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.moduleToggle, { backgroundColor: activeModule === 'evidence' ? colors.primary + '20' : 'transparent' }]}
            onPress={() => toggleModule('evidence')}
          >
            <ChevronRight size={16} stroke={colors.primary} style={activeModule === 'evidence' ? { transform: [{ rotate: '90deg' }] } : undefined} />
          </TouchableOpacity>
        </View>

        {activeModule === 'evidence' && (
          <View style={styles.moduleContent}>
            <View style={styles.evidenceTypes}>
              <TouchableOpacity
                style={[styles.evidenceBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                onPress={() => router.push({ pathname: '/camera', params: { featureId } })}
              >
                <Camera size={20} stroke={colors.primary} />
                <Text style={[styles.evidenceBtnText, { color: colors.primary }]}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.evidenceBtn, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}
                onPress={() => setEvidenceDescription((prev) => (prev ? prev + '\n' : '') + 'Measurement: ')}
              >
                <Ruler size={20} stroke={colors.warning} />
                <Text style={[styles.evidenceBtnText, { color: colors.warning }]}>Measure</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.evidenceBtn, { backgroundColor: colors.success + '15', borderColor: colors.success }]}
                onPress={() => setEvidenceDescription((prev) => (prev ? prev + '\n' : '') + 'Note: ')}
              >
                <ClipboardList size={20} stroke={colors.success} />
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
            <View style={styles.optionRow}>
              {['Sunny', 'Cloudy', 'Rain', 'Fog', 'Wind'].map((w) => (
                <TouchableOpacity
                  key={w}
                  style={[styles.smallChip, { backgroundColor: evidenceWeather === w.toLowerCase() ? colors.primary : colors.background, borderColor: colors.outline }]}
                  onPress={() => setEvidenceWeather(w.toLowerCase())}
                >
                  <Text style={[styles.smallChipText, { color: evidenceWeather === w.toLowerCase() ? colors.onPrimary : colors.textSecondary }]}>{w}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button title="Save Observation" variant="primary" size="sm" onPress={handleSaveEvidence} style={{ marginTop: Spacing.md }} />
          </View>
        )}
      </View>

      {/* Module 5: Survey Status */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <ClipboardList size={18} stroke={colors.primary} style={{ marginRight: 6 }} />
            <View>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Survey Status</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>Update feature workflow status</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.moduleToggle, { backgroundColor: activeModule === 'status' ? colors.primary + '20' : 'transparent' }]}
            onPress={() => toggleModule('status')}
          >
            <ChevronRight size={16} stroke={colors.primary} style={activeModule === 'status' ? { transform: [{ rotate: '90deg' }] } : undefined} />
          </TouchableOpacity>
        </View>

        {activeModule === 'status' && (
          <View style={styles.moduleContent}>
            <View style={styles.statusFlow}>
              {SURVEY_STATUS_FLOW.slice(0, 4).map((status, idx) => {
                const flowIdx = SURVEY_STATUS_FLOW.indexOf(surveyStatus as typeof SURVEY_STATUS_FLOW[number]);
                const itemIdx = SURVEY_STATUS_FLOW.indexOf(status);
                const isActive = surveyStatus === status;
                const isPast = flowIdx > itemIdx;
                return (
                  <TouchableOpacity key={status} style={[styles.statusStep, { flex: 1 }]} onPress={() => setSurveyStatus(status)}>
                    <View style={[styles.statusDot, {
                      backgroundColor: isActive ? colors.primary : isPast ? colors.success : colors.outlineLight,
                      borderColor: isActive ? colors.primary : colors.outline,
                      borderWidth: isActive ? 3 : 1,
                    }]}>
                      {isPast && <CheckCircle size={12} stroke={colors.onPrimary} fill={colors.onPrimary} />}
                      {isActive && <View style={[styles.statusInnerDot, { backgroundColor: colors.onPrimary }]} />}
                    </View>
                    <Text style={[styles.statusLabel, { color: isActive ? colors.primary : colors.textTertiary, fontWeight: isActive ? '700' : '400' }]} numberOfLines={2}>
                      {status.replace(/_/g, ' ')}
                    </Text>
                    {idx < 3 && <View style={[styles.statusLine, { backgroundColor: isPast ? colors.success : colors.outlineLight }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.statusFlow}>
              {SURVEY_STATUS_FLOW.slice(4).map((status, idx) => {
                const flowIdx = SURVEY_STATUS_FLOW.indexOf(surveyStatus as typeof SURVEY_STATUS_FLOW[number]);
                const itemIdx = SURVEY_STATUS_FLOW.indexOf(status);
                const isActive = surveyStatus === status;
                const isPast = flowIdx > itemIdx;
                return (
                  <TouchableOpacity key={status} style={[styles.statusStep, { flex: 1 }]} onPress={() => setSurveyStatus(status)}>
                    <View style={[styles.statusDot, {
                      backgroundColor: isActive ? colors.primary : isPast ? colors.success : colors.outlineLight,
                      borderColor: isActive ? colors.primary : colors.outline,
                      borderWidth: isActive ? 3 : 1,
                    }]}>
                      {isPast && <CheckCircle size={12} stroke={colors.onPrimary} fill={colors.onPrimary} />}
                      {isActive && <View style={[styles.statusInnerDot, { backgroundColor: colors.onPrimary }]} />}
                    </View>
                    <Text style={[styles.statusLabel, { color: isActive ? colors.primary : colors.textTertiary, fontWeight: isActive ? '700' : '400' }]} numberOfLines={2}>
                      {status.replace(/_/g, ' ')}
                    </Text>
                    {idx < 3 && <View style={[styles.statusLine, { backgroundColor: isPast ? colors.success : colors.outlineLight }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
              value={fieldNotes}
              onChangeText={setFieldNotes}
              placeholder="Add field notes, observations, or reasons for status change..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
            />

            <View style={styles.statusActions}>
              <Button title="Update Status" variant="primary" size="sm" onPress={handleUpdateStatus} style={{ flex: 1 }} />
              <Button title="Flag Issue" variant="secondary" size="sm" icon={<Flag size={14} stroke={colors.primary} />} onPress={() => showToast('Feature flagged for review', 'success')} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </View>

      {/* Change History */}
      {store.changes.length > 0 && (
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={{ fontSize: 18, marginRight: 6 }}>📝</Text>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Changes</Text>
            </View>
          </View>
          {store.changes.slice(0, 5).map((change) => (
            <View key={change.id} style={styles.changeRow}>
              <View style={styles.changeLeft}>
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

      <Toast visible={toastVisible} message={toastMsg} type={toastType} onDismiss={() => setToastVisible(false)} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionSubtitle: { fontSize: 11, marginTop: 1 },
  moduleToggle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moduleContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },

  trenchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  trenchChip: { width: '23%', paddingVertical: Spacing.md, paddingHorizontal: 4, borderRadius: Radius.lg, alignItems: 'center', borderWidth: 1, minWidth: 70 },
  trenchIcon: { fontSize: 20, marginBottom: 4 },
  trenchLabel: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
  trenchSelectedDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  attrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  attrLabel: { fontSize: 13, fontWeight: '500', width: 100 },
  attrInput: { flex: 1, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 14, height: 44 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, flex: 1 },
  smallChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  smallChipText: { fontSize: 12, fontWeight: '500' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.md },
  toggleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1 },
  toggleCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  toggleLabel: { fontSize: 12, fontWeight: '500' },
  textarea: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: Spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  categoryText: { fontSize: 12, fontWeight: '500' },
  severityRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  severityBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center' },
  severityText: { fontSize: 13 },
  mitigationChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1 },
  mitigationText: { fontSize: 11, fontWeight: '500' },
  evidenceTypes: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  evidenceBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1.5, borderStyle: 'dashed', gap: Spacing.sm },
  evidenceBtnText: { fontSize: 13, fontWeight: '600' },
  statusFlow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg, paddingHorizontal: 4 },
  statusStep: { alignItems: 'center', position: 'relative' },
  statusDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statusInnerDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 9, textAlign: 'center', textTransform: 'capitalize', lineHeight: 13 },
  statusLine: { position: 'absolute', top: 14, left: '60%', right: '-60%', height: 2 },
  statusActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  changeLeft: { flex: 1 },
  changeField: { fontSize: 14, fontWeight: '500' },
  changeReason: { fontSize: 12, marginTop: 2 },
  changeTime: { fontSize: 11 },
});
