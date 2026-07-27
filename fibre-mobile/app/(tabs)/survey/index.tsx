import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore } from '../../../lib/stores/theme';
import { useAuthStore } from '../../../lib/stores/auth';
import { useSurveyStore } from '../../../lib/stores/survey';
import { Card, Badge } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge, ProgressBar } from '../../../components/ui/StatusBadge';
import { Toast } from '../../../components/ui/Toast';
import { Spacing, Radius } from '../../../lib/theme/colors';
import {
  Search,
  ChevronRight,
  MapPin,
  Ruler,
  Camera,
  ClipboardList,
  CheckCircle,
  ArrowLeft,
  Save,
  Flag,
} from 'lucide-react-native';
import type { Feature, GeoJSONFeature } from '../../../lib/utils/types';
import { DEMO_FEATURES, DEMO_GEOJSON_FEATURES } from '../../../lib/stores/demo-data';

// ── Types ─────────────────────────────────────────────────────────────────

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

// ── Survey Editor Screen ──────────────────────────────────────────────────

export default function SurveyScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { demoMode } = useAuthStore();
  const store = useSurveyStore();

  // Navigation state
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [search, setSearch] = useState('');
  const [layerFilter, setLayerFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Survey module states
  const [selectedTrenchType, setSelectedTrenchType] = useState<TrenchType | null>(null);
  const [trenchAttrs, setTrenchAttrs] = useState({
    depth: '', width: '', surface_type: '', construction_method: '',
    road_crossing: false, footpath_crossing: false, rail_crossing: false,
    river_crossing: false, private_property: false, traffic_sensitive: false,
    permit_required: false, notes: '',
  });
  const [riskCategory, setRiskCategory] = useState('');
  const [riskSeverity, setRiskSeverity] = useState<string>('medium');
  const [riskProbability, setRiskProbability] = useState<string>('possible');
  const [riskMitigation, setRiskMitigation] = useState('');
  const [riskNotes, setRiskNotes] = useState('');
  const [selectedHazard, setSelectedHazard] = useState('');
  const [hazardMitigation, setHazardMitigation] = useState('');
  const [hazardNotes, setHazardNotes] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceWeather, setEvidenceWeather] = useState('');
  const [surveyStatus, setSurveyStatus] = useState<string>('not_started');
  const [fieldNotes, setFieldNotes] = useState('');
  const [activeModule, setActiveModule] = useState<string | null>(null);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // ── Demo Data ───────────────────────────────────────────────────────

  const [allFeatures, setAllFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    if (demoMode) {
      const features = Object.values(DEMO_FEATURES).flat();
      setAllFeatures(features);
    }
  }, [demoMode]);

  // Get feature geojson for coordinate display
  const getFeatureGeoJSON = (feature: Feature): GeoJSONFeature | null => {
    if (!demoMode) return null;
    const layerGeoJSONs = DEMO_GEOJSON_FEATURES[feature.layer_id];
    if (!layerGeoJSONs) return null;
    const idx = allFeatures.filter((f) => f.layer_id === feature.layer_id).indexOf(feature);
    return layerGeoJSONs[idx] ?? layerGeoJSONs[0] ?? null;
  };

  // Safely extract coordinates from any geometry type
  const getCoordDisplay = (geojson: GeoJSONFeature | null): string => {
    if (!geojson?.geometry?.coordinates) return '';
    const coords = geojson.geometry.coordinates;
    const geomType = geojson.geometry.type;
    // Point: [lng, lat]
    // LineString: [[lng, lat], [lng, lat]]
    // Polygon: [[[lng, lat], [lng, lat]]]
    try {
      if (geomType === 'Point' || geomType === 'point') {
        const lng = coords[0] as number;
        const lat = coords[1] as number;
        return `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
      } else if (geomType === 'LineString' || geomType === 'linestring') {
        const first = (coords as number[][])[0];
        const last = (coords as number[][]).slice(-1)[0];
        return `${(coords as number[][]).length} pts • ${first[1].toFixed(4)}, ${first[0].toFixed(4)} → ${last[1].toFixed(4)}, ${last[0].toFixed(4)}`;
      } else if (geomType === 'Polygon' || geomType === 'polygon') {
        const ring = (coords as number[][][])[0];
        return `${ring?.length ?? 0} vertices`;
      }
      return '';
    } catch {
      return String(coords).slice(0, 40);
    }
  };

  // ── Feature List ────────────────────────────────────────────────────

  const filteredFeatures = allFeatures.filter((f) => {
    if (layerFilter !== 'all' && f.layer_id !== layerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        f.layer_name?.toLowerCase().includes(q) ||
        JSON.stringify(f.properties).toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const layerOptions = [
    { label: 'All Layers', value: 'all' },
    ...Object.keys(DEMO_FEATURES).map((key) => ({
      label: key.toUpperCase(),
      value: key,
    })),
  ];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (demoMode) {
      const features = Object.values(DEMO_FEATURES).flat();
      setAllFeatures(features);
    }
    setRefreshing(false);
  }, [demoMode]);

  const handleSelectFeature = (feature: Feature) => {
    setSelectedFeature(feature);
    setView('detail');
    resetForm();
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedFeature(null);
  };

  const resetForm = () => {
    setActiveModule(null);
    setSelectedTrenchType(null);
    setTrenchAttrs({
      depth: '', width: '', surface_type: '', construction_method: '',
      road_crossing: false, footpath_crossing: false, rail_crossing: false,
      river_crossing: false, private_property: false, traffic_sensitive: false,
      permit_required: false, notes: '',
    });
    setRiskCategory('');
    setRiskSeverity('medium');
    setRiskProbability('possible');
    setRiskMitigation('');
    setRiskNotes('');
    setSelectedHazard('');
    setHazardMitigation('');
    setHazardNotes('');
    setEvidenceDescription('');
    setEvidenceWeather('');
    setSurveyStatus('not_started');
    setFieldNotes('');
    setActiveModule(null);
  };

  // ── Save Actions ────────────────────────────────────────────────────

  const handleSaveTrench = async () => {
    if (!selectedTrenchType || !selectedFeature) return;
    try {
      await store.saveTrenchSurvey({
        feature: selectedFeature.id,
        trench_type: selectedTrenchType,
    depth_mm: trenchAttrs.depth ? parseInt(trenchAttrs.depth) : null,
    width_mm: trenchAttrs.width ? parseInt(trenchAttrs.width) : null,
    surface_type: trenchAttrs.surface_type || null,
    construction_method: trenchAttrs.construction_method || null,
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
    } catch {
      showToast('Failed to save trench', 'error');
    }
  };

  const handleSaveRisk = async () => {
    if (!riskCategory || !selectedFeature) return;
    try {
      await store.saveRisk({
        feature: selectedFeature.id,
        category: riskCategory,
        severity: riskSeverity as any,
        probability: riskProbability as any,
        mitigation: riskMitigation,
        notes: riskNotes,
        status: 'open',
      });
      showToast('Risk assessment saved', 'success');
      setActiveModule(null);
    } catch {
      showToast('Failed to save risk', 'error');
    }
  };

  const handleSaveHazard = async () => {
    if (!selectedHazard || !selectedFeature) return;
    try {
      await store.saveHazard({
        feature: selectedFeature.id,
        hazard_type: selectedHazard,
        mitigation_template: hazardMitigation || null,
        notes: hazardNotes,
        is_active: true,
      });
      showToast('Hazard recorded', 'success');
      setActiveModule(null);
    } catch {
      showToast('Failed to save hazard', 'error');
    }
  };

  const handleSaveEvidence = async () => {
    if (!selectedFeature) return;
    try {
      await store.saveEvidence({
        feature: selectedFeature.id,
        evidence_type: 'measurement',
        description: evidenceDescription,
        weather: evidenceWeather,
      });
      showToast('Field evidence saved', 'success');
      setEvidenceDescription('');
      setEvidenceWeather('');
    } catch {
      showToast('Failed to save evidence', 'error');
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedFeature) return;
    try {
      await store.updateStatus(selectedFeature.id, surveyStatus, fieldNotes);
      showToast(`Status updated to ${surveyStatus.replace(/_/g, ' ')}`, 'success');
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const handleFlag = () => {
    Alert.alert('Flag Feature', 'Mark this feature as needing additional review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Flag', style: 'destructive', onPress: () => showToast('Feature flagged', 'success') },
    ]);
  };

  // ── Color Helpers ──────────────────────────────────────────────────

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return { bg: '#27AE6020', text: '#27AE60' };
      case 'medium': return { bg: '#F39C1220', text: '#F39C12' };
      case 'high': return { bg: '#E74C3C20', text: '#E74C3C' };
      case 'critical': return { bg: '#8E44AD20', text: '#8E44AD' };
      default: return { bg: '#95A5A620', text: '#95A5A6' };
    }
  };

  const getProbabilityColor = (prob: string) => {
    switch (prob) {
      case 'rare': return { bg: '#3498DB20', text: '#3498DB' };
      case 'possible': return { bg: '#F39C1220', text: '#F39C12' };
      case 'likely': return { bg: '#E67E2220', text: '#E67E22' };
      case 'certain': return { bg: '#E74C3C20', text: '#E74C3C' };
      default: return { bg: '#95A5A620', text: '#95A5A6' };
    }
  };

  // ── Render: Feature List ─────────────────────────────────────────────

  if (view === 'list') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Survey Editor</Text>
            {demoMode && (
              <Badge label="Demo" color={colors.warning} bgColor={colors.warning + '20'} size="sm" />
            )}
          </View>

          {/* Search */}
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
            <Search size={18} stroke={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search features..."
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Layer Filter Chips */}
          <FlatList
            horizontal
            data={layerOptions}
            keyExtractor={(item) => item.value}
            showsHorizontalScrollIndicator={false}
            style={styles.filterList}
            contentContainerStyle={styles.filterContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor: layerFilter === item.value ? colors.primary : colors.surface,
                    borderColor: layerFilter === item.value ? colors.primary : colors.outline,
                  },
                ]}
                onPress={() => setLayerFilter(item.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: layerFilter === item.value ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />

          {/* Stats Summary */}
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>{filteredFeatures.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Features</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statNumber, { color: colors.success }]}>
                {filteredFeatures.filter((f) => f.status === 'approved').length}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Done</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statNumber, { color: colors.warning }]}>
                {filteredFeatures.filter((f) => f.status === 'assigned' || f.status === 'pending').length}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Pending</Text>
            </View>
          </View>

          {/* Feature List */}
          <FlatList
            data={filteredFeatures}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={filteredFeatures.length === 0 ? styles.emptyList : styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <ClipboardList size={48} stroke={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No Features Found</Text>
                <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                  {search ? 'Try adjusting your search' : 'Import a survey package to get started'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const geojson = getFeatureGeoJSON(item);
              const coordStr = getCoordDisplay(geojson);

              return (
                <TouchableOpacity
                  style={[styles.featureCard, { backgroundColor: colors.surface, borderLeftColor: item.status === 'approved' ? colors.success : item.status === 'under_review' ? colors.warning : colors.outline }]}
                  onPress={() => handleSelectFeature(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.featureCardTop}>
                    <View style={styles.featureCardLeft}>
                      <View style={[styles.layerDot, { backgroundColor: item.layer_id === 'objects' ? '#3498DB' : item.layer_id === 'polygons' ? '#2ECC71' : item.layer_id === 'pdps' ? '#9B59B6' : '#E74C3C' }]}>
                        <Text style={styles.layerDotText}>
                          {item.layer_name?.charAt(0) ?? 'F'}
                        </Text>
                      </View>
                      <View style={styles.featureCardInfo}>
                        <Text style={[styles.featureCardName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.layer_name} • {item.id.slice(-8)}
                        </Text>
                        {coordStr ? (
                          <Text style={[styles.featureCardCoord, { color: colors.textTertiary }]}>
                            <MapPin size={10} stroke={colors.textTertiary} /> {coordStr}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <StatusBadge status={item.status} />
                  </View>

                  <View style={styles.featureCardBottom}>
                    <Text style={[styles.featureCardProps, { color: colors.textTertiary }]} numberOfLines={1}>
                      {item.properties && Object.entries(item.properties).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                    </Text>
                    <ChevronRight size={14} stroke={colors.textTertiary} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Feature Detail ──────────────────────────────────────────

  if (!selectedFeature) return null;
  const feature = selectedFeature;
  const geojson = getFeatureGeoJSON(feature);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
        {/* Back Button & Header */}
        <View style={styles.detailTopBar}>
          <TouchableOpacity onPress={handleBackToList} style={styles.backBtn}>
            <ArrowLeft size={22} stroke={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.detailTopInfo}>
            <Text style={[styles.detailTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {feature.layer_name} Survey
            </Text>
            <Text style={[styles.detailSubtitle, { color: colors.textTertiary }]}>{feature.id.slice(-12)}</Text>
          </View>
          <StatusBadge status={feature.status} />
        </View>

        {/* Feature Properties */}
        <View style={[styles.coordBar, { backgroundColor: colors.surface }]}>
          <MapPin size={14} stroke={colors.primary} />
          <Text style={[styles.coordText, { color: colors.textSecondary }]} numberOfLines={1}>
            {geojson ? getCoordDisplay(geojson) : 'No GPS data'}
          </Text>
        </View>

        {/* Quick Property Summary */}
        {feature.properties && Object.keys(feature.properties).length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propChipsRow}>
            {Object.entries(feature.properties as Record<string, unknown>).map(([key, value]) => (
              <View key={key} style={[styles.propChip, { backgroundColor: colors.surface }]}>
                <Text style={[styles.propChipKey, { color: colors.textTertiary }]}>{key}</Text>
                <Text style={[styles.propChipValue, { color: colors.textPrimary }]}>{String(value)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Survey Modules ────────────────────────────────────────── */}

        {/* Module 1: Trench Classification */}
        <Card
          title="🏗️  Trench Classification"
          subtitle="Select the trench type and configure attributes"
          variant="elevated"
          headerRight={
            <TouchableOpacity
              style={[styles.moduleToggle, { backgroundColor: activeModule === 'trench' ? colors.primary + '20' : 'transparent' }]}
              onPress={() => setActiveModule(activeModule === 'trench' ? null : 'trench')}
            >
              <ChevronRight size={16} stroke={colors.primary} style={{ transform: activeModule === 'trench' ? [{ rotate: '90deg' }] : [] }} />
            </TouchableOpacity>
          }
        >
          {/* Trench Type Grid */}
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
                activeOpacity={0.7}
              >
                <Text style={styles.trenchIcon}>{info.icon}</Text>
                <Text
                  style={[
                    styles.trenchLabel,
                    { color: selectedTrenchType === type ? info.color : colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {info.label}
                </Text>
                {selectedTrenchType === type && (
                  <View style={[styles.trenchSelectedDot, { backgroundColor: info.color }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {activeModule === 'trench' && selectedTrenchType && (
            <View style={styles.moduleContent}>
              {/* Trench Attributes */}
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
                <Text style={[styles.attrLabel, { color: colors.textSecondary }]}>Surface Type</Text>
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

              {/* Crossing Toggles */}
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

              {/* Other Attributes Toggles */}
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

              {/* Notes */}
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
        </Card>

        {/* Module 2: Risk Assessment */}
        <Card
          title="⚠️  Risk Assessment"
          subtitle="Evaluate risks for this feature"
          variant="elevated"
          headerRight={
            <TouchableOpacity
              style={[styles.moduleToggle, { backgroundColor: activeModule === 'risk' ? colors.primary + '20' : 'transparent' }]}
              onPress={() => setActiveModule(activeModule === 'risk' ? null : 'risk')}
            >
              <ChevronRight size={16} stroke={colors.primary} style={{ transform: activeModule === 'risk' ? [{ rotate: '90deg' }] : [] }} />
            </TouchableOpacity>
          }
        >
          {/* Risk Category */}
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
              {/* Severity */}
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Severity</Text>
              <View style={styles.severityRow}>
                {SEVERITY_LEVELS.map((sev) => {
                  const sevColor = getSeverityColor(sev);
                  return (
                    <TouchableOpacity
                      key={sev}
                      style={[styles.severityBtn, { backgroundColor: riskSeverity === sev ? sevColor.bg : colors.background, borderColor: riskSeverity === sev ? sevColor.text : colors.outline }]}
                      onPress={() => setRiskSeverity(sev)}
                    >
                      <Text style={[styles.severityText, { color: riskSeverity === sev ? sevColor.text : colors.textSecondary, fontWeight: riskSeverity === sev ? '700' : '500' }]}>
                        {sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Probability */}
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Probability</Text>
              <View style={styles.severityRow}>
                {PROBABILITY_LEVELS.map((prob) => {
                  const probColor = getProbabilityColor(prob);
                  return (
                    <TouchableOpacity
                      key={prob}
                      style={[styles.severityBtn, { backgroundColor: riskProbability === prob ? probColor.bg : colors.background, borderColor: riskProbability === prob ? probColor.text : colors.outline }]}
                      onPress={() => setRiskProbability(prob)}
                    >
                      <Text style={[styles.severityText, { color: riskProbability === prob ? probColor.text : colors.textSecondary, fontWeight: riskProbability === prob ? '700' : '500' }]}>
                        {prob.charAt(0).toUpperCase() + prob.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Mitigation */}
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Mitigation</Text>
              <TextInput
                style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                value={riskMitigation}
                onChangeText={setRiskMitigation}
                placeholder="Describe mitigation measures..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={2}
              />

              {/* Notes */}
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
        </Card>

        {/* Module 3: Hazards */}
        <Card
          title="🚧  Hazards"
          subtitle="Identify site hazards and record mitigations"
          variant="elevated"
          headerRight={
            <TouchableOpacity
              style={[styles.moduleToggle, { backgroundColor: activeModule === 'hazard' ? colors.primary + '20' : 'transparent' }]}
              onPress={() => setActiveModule(activeModule === 'hazard' ? null : 'hazard')}
            >
              <ChevronRight size={16} stroke={colors.primary} style={{ transform: activeModule === 'hazard' ? [{ rotate: '90deg' }] : [] }} />
            </TouchableOpacity>
          }
        >
          {/* Hazard Types */}
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
              {/* Mitigation Templates */}
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

              {/* Notes */}
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
        </Card>

        {/* Module 4: Field Evidence */}
        <Card
          title="📸  Field Evidence"
          subtitle="Record observations, photos, and measurements"
          variant="elevated"
          headerRight={
            <TouchableOpacity
              style={[styles.moduleToggle, { backgroundColor: activeModule === 'evidence' ? colors.primary + '20' : 'transparent' }]}
              onPress={() => setActiveModule(activeModule === 'evidence' ? null : 'evidence')}
            >
              <ChevronRight size={16} stroke={colors.primary} style={{ transform: activeModule === 'evidence' ? [{ rotate: '90deg' }] : [] }} />
            </TouchableOpacity>
          }
        >
          {activeModule === 'evidence' && (
            <View style={styles.moduleContent}>
              {/* Evidence Type Quick Add */}
              <View style={styles.evidenceTypes}>
                <TouchableOpacity style={[styles.evidenceBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
                  <Camera size={20} stroke={colors.primary} />
                  <Text style={[styles.evidenceBtnText, { color: colors.primary }]}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.evidenceBtn, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
                  <Ruler size={20} stroke={colors.warning} />
                  <Text style={[styles.evidenceBtnText, { color: colors.warning }]}>Measure</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.evidenceBtn, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                  <ClipboardList size={20} stroke={colors.success} />
                  <Text style={[styles.evidenceBtnText, { color: colors.success }]}>Note</Text>
                </TouchableOpacity>
              </View>

              {/* Description */}
              <TextInput
                style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: colors.background }]}
                value={evidenceDescription}
                onChangeText={setEvidenceDescription}
                placeholder="Describe what you observed..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
              />

              {/* Weather */}
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Weather Conditions</Text>
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
        </Card>

        {/* Module 5: Survey Status & Notes */}
        <Card
          title="📋  Survey Status"
          subtitle="Update feature workflow status"
          variant="elevated"
        >
          {/* Status Progress */}
          <View style={styles.statusFlow}>
            {SURVEY_STATUS_FLOW.slice(0, 4).map((status, idx) => {
              const isActive = surveyStatus === status;
              const isPast = SURVEY_STATUS_FLOW.indexOf(surveyStatus as typeof SURVEY_STATUS_FLOW[number]) > SURVEY_STATUS_FLOW.indexOf(status);
              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.statusStep, { flex: 1 }]}
                  onPress={() => setSurveyStatus(status)}
                >
                  <View style={[styles.statusDot, {
                    backgroundColor: isActive ? colors.primary : isPast ? colors.success : colors.outlineLight,
                    borderColor: isActive ? colors.primary : colors.outline,
                    borderWidth: isActive ? 3 : 1,
                  }]}>
                    {isPast && <CheckCircle size={12} stroke={colors.onPrimary} fill={colors.onPrimary} />}
                    {isActive && <View style={[styles.statusInnerDot, { backgroundColor: colors.onPrimary }]} />}
                  </View>
                  <Text style={[styles.statusLabel, { color: isActive ? colors.primary : colors.textTertiary, fontWeight: isActive ? '700' : '400' }]} numberOfLines={2}>
                    {status.replace(/_/g, '\n')}
                  </Text>
                  {idx < 3 && (
                    <View style={[styles.statusLine, { backgroundColor: isPast ? colors.success : colors.outlineLight }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.statusFlow}>
            {SURVEY_STATUS_FLOW.slice(4).map((status, idx) => {
              const isActive = surveyStatus === status;
              const isPast = SURVEY_STATUS_FLOW.indexOf(surveyStatus as typeof SURVEY_STATUS_FLOW[number]) > SURVEY_STATUS_FLOW.indexOf(status);
              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.statusStep, { flex: 1 }]}
                  onPress={() => setSurveyStatus(status)}
                >
                  <View style={[styles.statusDot, {
                    backgroundColor: isActive ? colors.primary : isPast ? colors.success : colors.outlineLight,
                    borderColor: isActive ? colors.primary : colors.outline,
                    borderWidth: isActive ? 3 : 1,
                  }]}>
                    {isPast && <CheckCircle size={12} stroke={colors.onPrimary} fill={colors.onPrimary} />}
                    {isActive && <View style={[styles.statusInnerDot, { backgroundColor: colors.onPrimary }]} />}
                  </View>
                  <Text style={[styles.statusLabel, { color: isActive ? colors.primary : colors.textTertiary, fontWeight: isActive ? '700' : '400' }]} numberOfLines={2}>
                    {status.replace(/_/g, '\n')}
                  </Text>
                  {idx < 3 && (
                    <View style={[styles.statusLine, { backgroundColor: isPast ? colors.success : colors.outlineLight }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Field Notes */}
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
            <Button title="Flag Issue" variant="secondary" size="sm" icon={<Flag size={14} stroke={colors.primary} />} onPress={handleFlag} style={{ flex: 1 }} />
          </View>
        </Card>

        {/* Change History */}
        {store.changes.length > 0 && (
          <Card title="📝  Recent Changes" variant="outlined">
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
          </Card>
        )}

        {/* Spacer for bottom bar */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.outline }]}>
        <Button
          title="Save Draft"
          variant="tertiary"
          size="sm"
          icon={<Save size={16} stroke={colors.textSecondary} />}
          onPress={() => showToast('Draft saved', 'success')}
          style={{ flex: 1 }}
        />
        <Button
          title="Flag"
          variant="secondary"
          size="sm"
          icon={<Flag size={16} stroke={colors.primary} />}
          onPress={handleFlag}
          style={{ flex: 1 }}
        />
        <Button
          title="Submit"
          variant="primary"
          size="sm"
          icon={<CheckCircle size={16} stroke={colors.onPrimary} />}
          onPress={handleUpdateStatus}
          loading={store.isLoading}
          style={{ flex: 1 }}
        />
      </View>

      <Toast visible={toastVisible} message={toastMsg} type={toastType} onDismiss={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  title: { fontSize: 26, fontWeight: '700' },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    height: 48,
    marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, marginLeft: Spacing.md, fontSize: 15, height: 48 },

  // Filter Chips
  filterList: { flexGrow: 0, marginBottom: Spacing.md },
  filterContent: { gap: Spacing.sm, paddingRight: Spacing.lg },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statBox: { flex: 1, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: '500' },

  // Feature List
  listContent: { paddingBottom: Spacing.xxl },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: Spacing.lg },
  emptyDesc: { fontSize: 14, textAlign: 'center', marginTop: Spacing.sm, paddingHorizontal: 40 },

  // Feature Card
  featureCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  featureCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  featureCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: Spacing.md },
  featureCardInfo: { flex: 1 },
  featureCardName: { fontSize: 15, fontWeight: '600' },
  featureCardCoord: { fontSize: 11, marginTop: 2 },
  featureCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featureCardProps: { fontSize: 12, flex: 1, marginRight: Spacing.sm },

  // Layer Dot
  layerDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  layerDotText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // ── Detail View ────────────────────────────────────────────────────

  detailScroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  detailTopBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  detailTopInfo: { flex: 1 },
  detailTitle: { fontSize: 18, fontWeight: '700' },
  detailSubtitle: { fontSize: 12, marginTop: 1 },
  coordBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  coordText: { fontSize: 12, flex: 1 },

  // Property Chips
  propChipsRow: { marginBottom: Spacing.lg, flexGrow: 0 },
  propChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, marginRight: Spacing.sm, alignItems: 'center', minWidth: 80 },
  propChipKey: { fontSize: 10, fontWeight: '500' },
  propChipValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },

  // Module Toggle
  moduleToggle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moduleContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },

  // Trench Grid
  trenchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  trenchChip: {
    width: '23%',
    paddingVertical: Spacing.md,
    paddingHorizontal: 4,
    borderRadius: Radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    minWidth: 70,
  },
  trenchIcon: { fontSize: 20, marginBottom: 4 },
  trenchLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  trenchSelectedDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },

  // Attribute Form
  attrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  attrLabel: { fontSize: 13, fontWeight: '500', width: 100 },
  attrInput: { flex: 1, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 14, height: 44 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, flex: 1 },
  smallChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  smallChipText: { fontSize: 12, fontWeight: '500' },

  // Section Label
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.md },

  // Toggle Grid
  toggleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  toggleCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  toggleLabel: { fontSize: 12, fontWeight: '500' },

  // Textarea
  textarea: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },

  // Risk Category Grid
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  categoryText: { fontSize: 12, fontWeight: '500' },

  // Severity
  severityRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  severityBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center' },
  severityText: { fontSize: 13 },

  // Mitigation
  mitigationChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1 },
  mitigationText: { fontSize: 11, fontWeight: '500' },

  // Evidence
  evidenceTypes: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  evidenceBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: Spacing.sm,
  },
  evidenceBtnText: { fontSize: 13, fontWeight: '600' },

  // Status Flow
  statusFlow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg, paddingHorizontal: 4 },
  statusStep: { alignItems: 'center', position: 'relative' },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statusInnerDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 9, textAlign: 'center', textTransform: 'capitalize', lineHeight: 13 },
  statusLine: {
    position: 'absolute',
    top: 14,
    left: '60%',
    right: '-60%',
    height: 2,
  },
  statusActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },

  // Change History
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  changeLeft: { flex: 1 },
  changeField: { fontSize: 14, fontWeight: '500' },
  changeReason: { fontSize: 12, marginTop: 2 },
  changeTime: { fontSize: 11 },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.md,
    borderTopWidth: 1,
  },
});
