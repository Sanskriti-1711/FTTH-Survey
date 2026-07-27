import { create } from 'zustand';
import type {
  Feature,
  Layer,
  GPSTrace,
  TrenchSurveyData,
  ExistingAssetData,
  RiskAssessmentData,
  HazardData,
  FieldEvidenceData,
  SurveyChangeData,
  SurveyStatusData,
  BackendSyncQueueItem,
} from '../utils/types';
import * as projectsApi from '../api/projects';
import * as featuresApi from '../api/features';
import * as surveyApi from '../api/survey';
import { useAuthStore } from './auth';
import {
  DEMO_FEATURES,
  DEMO_LAYERS,
  getDemoFeatureDetail,
} from './demo-data';

// ── Survey Store ──────────────────────────────────────────────────────────

interface SurveyState {
  layers: Layer[];
  features: Record<string, Feature[]>;        // layerId -> features
  selectedFeature: Feature | null;
  isLoading: boolean;
  error: string | null;

  fetchLayers: (projectId: string) => Promise<void>;
  fetchLayerFeatures: (projectId: string, layerId: string) => Promise<void>;
  fetchFeatureDetail: (projectId: string, featureId: string) => Promise<void>;
  updateFieldMeasurements: (
    featureId: string,
    measurements: Record<string, unknown>,
    notes?: string
  ) => Promise<void>;
  submitFeatures: (featureIds: string[], engineerId: string) => Promise<void>;

  // Survey data
  gpsTraces: GPSTrace[];
  trenchSurveys: TrenchSurveyData[];
  assets: ExistingAssetData[];
  riskAssessments: RiskAssessmentData[];
  hazards: HazardData[];
  evidence: FieldEvidenceData[];
  changes: SurveyChangeData[];
  statuses: SurveyStatusData[];
  syncQueue: BackendSyncQueueItem[];

  fetchGPSTraces: () => Promise<void>;
  createGPSTrace: (data: { project?: string }) => Promise<GPSTrace>;
  batchCreateGPSPoints: (traceId: string, points: Omit<import('../utils/types').GPSPoint, 'id' | 'trace'>[]) => Promise<void>;
  endGPSTrace: (traceId: string, distanceM: number) => Promise<void>;

  fetchTrenchSurveys: (featureId?: string) => Promise<void>;
  saveTrenchSurvey: (data: Omit<TrenchSurveyData, 'id' | 'engineer' | 'engineer_name' | 'created_at' | 'updated_at'>) => Promise<TrenchSurveyData>;

  fetchAssets: () => Promise<void>;
  saveAsset: (data: Omit<ExistingAssetData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>) => Promise<void>;

  fetchRisks: (featureId?: string) => Promise<void>;
  saveRisk: (data: Omit<RiskAssessmentData, 'id' | 'engineer' | 'engineer_name' | 'created_at' | 'updated_at'>) => Promise<RiskAssessmentData>;
  updateRisk: (riskId: string, data: Partial<RiskAssessmentData>) => Promise<void>;

  fetchHazards: () => Promise<void>;
  saveHazard: (data: Omit<HazardData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>) => Promise<void>;

  fetchEvidence: () => Promise<void>;
  saveEvidence: (data: Omit<FieldEvidenceData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>) => Promise<void>;

  fetchChanges: (featureId?: string) => Promise<void>;
  saveChange: (data: Omit<SurveyChangeData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>) => Promise<void>;

  fetchStatuses: (featureId?: string) => Promise<void>;
  updateStatus: (featureId: string, status: string, notes?: string) => Promise<void>;

  fetchSyncQueue: () => Promise<void>;
  pushToSyncQueue: (items: Omit<BackendSyncQueueItem, 'id' | 'engineer' | 'engineer_name' | 'synced_at'>[]) => Promise<void>;
  processSyncQueue: () => Promise<void>;
}

export const useSurveyStore = create<SurveyState>((set, get) => ({
  layers: [],
  features: {},
  selectedFeature: null,
  isLoading: false,
  error: null,

  // Survey data initial state
  gpsTraces: [],
  trenchSurveys: [],
  assets: [],
  riskAssessments: [],
  hazards: [],
  evidence: [],
  changes: [],
  statuses: [],
  syncQueue: [],

  fetchLayers: async (projectId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      set({ layers: DEMO_LAYERS, isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const data = await projectsApi.getProjectLayers(projectId);
      set({ layers: data.layers, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch layers';
      set({ error: message, isLoading: false });
    }
  },

  fetchLayerFeatures: async (projectId, layerId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const features = DEMO_FEATURES[layerId] ?? [];
      set({
        features: { ...get().features, [layerId]: features },
        isLoading: false,
      });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const data = await projectsApi.getLayerDetail(projectId, layerId);
      set({
        features: { ...get().features, [layerId]: data.features },
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch features';
      set({ error: message, isLoading: false });
    }
  },

  fetchFeatureDetail: async (projectId, featureId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode && featureId.startsWith('demo-')) {
      const detail = getDemoFeatureDetail(featureId);
      set({ selectedFeature: detail.feature, isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const data = await projectsApi.getFeatureDetail(projectId, featureId);
      set({ selectedFeature: data.feature, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch feature';
      set({ error: message, isLoading: false });
    }
  },

  updateFieldMeasurements: async (featureId, measurements, notes) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      // Update locally
      const current = get().selectedFeature;
      if (current?.id === featureId) {
        set({
          selectedFeature: {
            ...current,
            field_measurements: measurements,
            comparison_notes: notes ?? '',
          },
        });
      }
      return;
    }
    try {
      await featuresApi.updateFieldMeasurements(
        featureId,
        measurements,
        notes
      );
      const current = get().selectedFeature;
      if (current?.id === featureId) {
        set({
          selectedFeature: {
            ...current,
            field_measurements: measurements,
            comparison_notes: notes ?? '',
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save measurements';
      set({ error: message });
      throw err;
    }
  },

  submitFeatures: async (featureIds, engineerId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      set({ isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      await featuresApi.submitFeatures(featureIds, engineerId);
      set({ isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit features';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  // ── GPS Traces ────────────────────────────────────────────────────────
  fetchGPSTraces: async () => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ gpsTraces: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listGPSTraces();
      set({ gpsTraces: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed to fetch traces'), isLoading: false });
    }
  },

  createGPSTrace: async (data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: GPSTrace = { id: `demo-trace-${Date.now()}`, engineer: 'demo-user', started_at: new Date().toISOString(), point_count: 0, points: [] };
      set((s) => ({ gpsTraces: [mock, ...s.gpsTraces] }));
      return mock;
    }
    try {
      const trace = await surveyApi.createGPSTrace(data);
      set((s) => ({ gpsTraces: [trace, ...s.gpsTraces] }));
      return trace;
    } catch (err: unknown) {
      throw err;
    }
  },

  batchCreateGPSPoints: async (traceId, points) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) return;
    await surveyApi.batchCreateGPSPoints(traceId, points);
  },

  endGPSTrace: async (traceId, distanceM) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      set((s) => ({ gpsTraces: s.gpsTraces.map((t) => t.id === traceId ? { ...t, ended_at: new Date().toISOString(), total_distance_m: distanceM } : t) }));
      return;
    }
    await surveyApi.updateGPSTrace(traceId, { ended_at: new Date().toISOString(), total_distance_m: distanceM });
    set((s) => ({ gpsTraces: s.gpsTraces.map((t) => t.id === traceId ? { ...t, ended_at: new Date().toISOString(), total_distance_m: distanceM } : t) }));
  },

  // ── Trench Surveys ────────────────────────────────────────────────────
  fetchTrenchSurveys: async (featureId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ trenchSurveys: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listTrenchSurveys(featureId ? { feature: featureId } : undefined);
      set({ trenchSurveys: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveTrenchSurvey: async (data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: TrenchSurveyData = { id: `demo-trench-${Date.now()}`, engineer: 'demo-user', feature: data.feature, trench_type: data.trench_type, road_crossing: false, footpath_crossing: false, rail_crossing: false, river_crossing: false, private_property: false, traffic_sensitive: false, permit_required: false, notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      set((s) => ({ trenchSurveys: [mock, ...s.trenchSurveys] }));
      return mock;
    }
    const result = await surveyApi.createTrenchSurvey(data);
    set((s) => ({ trenchSurveys: [result, ...s.trenchSurveys] }));
    return result;
  },

  // ── Assets ─────────────────────────────────────────────────────────────
  fetchAssets: async () => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ assets: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listExistingAssets();
      set({ assets: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveAsset: async (data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: ExistingAssetData = { id: `demo-asset-${Date.now()}`, engineer: 'demo-user', asset_type: data.asset_type, condition: data.condition, latitude: data.latitude, longitude: data.longitude, description: data.description ?? '', created_at: new Date().toISOString() };
      set((s) => ({ assets: [mock, ...s.assets] }));
      return;
    }
    const result = await surveyApi.createExistingAsset(data);
    set((s) => ({ assets: [result, ...s.assets] }));
  },

  // ── Risks ──────────────────────────────────────────────────────────────
  fetchRisks: async (featureId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ riskAssessments: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listRiskAssessments(featureId ? { feature: featureId } : undefined);
      set({ riskAssessments: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveRisk: async (data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: RiskAssessmentData = { id: `demo-risk-${Date.now()}`, engineer: 'demo-user', category: data.category, severity: data.severity ?? 'medium', probability: data.probability ?? 'possible', mitigation: '', notes: '', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      set((s) => ({ riskAssessments: [mock, ...s.riskAssessments] }));
      return mock;
    }
    const result = await surveyApi.createRiskAssessment(data);
    set((s) => ({ riskAssessments: [result, ...s.riskAssessments] }));
    return result;
  },

  updateRisk: async (riskId, data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      set((s) => ({ riskAssessments: s.riskAssessments.map((r) => r.id === riskId ? { ...r, ...data } : r) }));
      return;
    }
    const result = await surveyApi.updateRiskAssessment(riskId, data);
    set((s) => ({ riskAssessments: s.riskAssessments.map((r) => (r.id === riskId ? result : r)) }));
  },

  // ── Hazards ────────────────────────────────────────────────────────────
  fetchHazards: async () => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ hazards: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listHazards();
      set({ hazards: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveHazard: async (data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: HazardData = { id: `demo-hazard-${Date.now()}`, engineer: 'demo-user', hazard_type: data.hazard_type, mitigation_template: data.mitigation_template ?? null, notes: data.notes ?? '', is_active: true, created_at: new Date().toISOString() };
      set((s) => ({ hazards: [mock, ...s.hazards] }));
      return;
    }
    const result = await surveyApi.createHazard(data);
    set((s) => ({ hazards: [result, ...s.hazards] }));
  },

  // ── Evidence ───────────────────────────────────────────────────────────
  fetchEvidence: async () => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ evidence: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listFieldEvidence();
      set({ evidence: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveEvidence: async (data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: FieldEvidenceData = { id: `demo-evidence-${Date.now()}`, engineer: 'demo-user', evidence_type: data.evidence_type ?? 'photo', description: data.description ?? '', weather: data.weather ?? '', captured_at: new Date().toISOString(), created_at: new Date().toISOString() };
      set((s) => ({ evidence: [mock, ...s.evidence] }));
      return;
    }
    const result = await surveyApi.createFieldEvidence(data);
    set((s) => ({ evidence: [result, ...s.evidence] }));
  },

  // ── Changes ────────────────────────────────────────────────────────────
  fetchChanges: async (featureId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ changes: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listSurveyChanges(featureId ? { feature: featureId } : undefined);
      set({ changes: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveChange: async (data) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: SurveyChangeData = { id: `demo-change-${Date.now()}`, engineer: 'demo-user', feature: data.feature, field_name: data.field_name, reason: data.reason ?? '', created_at: new Date().toISOString() };
      set((s) => ({ changes: [mock, ...s.changes] }));
      return;
    }
    const result = await surveyApi.createSurveyChange(data);
    set((s) => ({ changes: [result, ...s.changes] }));
  },

  // ── Statuses ───────────────────────────────────────────────────────────
  fetchStatuses: async (featureId) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ statuses: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.getSurveyStatus(featureId ? { feature: featureId } : undefined);
      set({ statuses: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  updateStatus: async (featureId, status, notes) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mock: SurveyStatusData = { id: `demo-status-${Date.now()}`, engineer: 'demo-user', feature: featureId, status: status as SurveyStatusData['status'], notes: notes ?? '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      set((s) => ({ statuses: s.statuses.some((st) => st.feature === featureId) ? s.statuses.map((st) => (st.feature === featureId ? mock : st)) : [mock, ...s.statuses] }));
      return;
    }
    const result = await surveyApi.updateSurveyStatus({ feature: featureId, status, notes });
    set((s) => ({ statuses: s.statuses.some((st) => st.feature === featureId) ? s.statuses.map((st) => (st.feature === featureId ? result : st)) : [result, ...s.statuses] }));
  },

  // ── Sync ───────────────────────────────────────────────────────────────
  fetchSyncQueue: async () => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ syncQueue: [], isLoading: false }); return; }
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.getSyncQueue();
      set({ syncQueue: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  pushToSyncQueue: async (items) => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      const mocks: BackendSyncQueueItem[] = items.map((item, i) => ({ id: `demo-sync-${Date.now()}-${i}`, engineer: 'demo-user', item_type: item.item_type, entity_id: item.entity_id, payload: item.payload, status: 'pending', retry_count: 0, error_message: '', created_at: new Date().toISOString() }));
      set((s) => ({ syncQueue: [...mocks, ...s.syncQueue] }));
      return;
    }
    await surveyApi.pushToSyncQueue(items);
  },

  processSyncQueue: async () => {
    const { demoMode } = useAuthStore.getState();
    if (demoMode) { set({ syncQueue: [], isLoading: false }); return; }
    set({ isLoading: true });
    try {
      await surveyApi.processSyncQueue();
      set({ syncQueue: [], isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },
}));
