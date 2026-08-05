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
  syncQueue: BackendSyncQueueItem[];      /** Track point move history: compositeKey → { hldCoords (original HLD, never changes), surveyCoords (current position), layerId } */
  surveyPointGeometries: Record<string, { hldCoords: [number, number]; surveyCoords: [number, number]; layerId: string }>;
  /** Record a point move: updates the GeoJSON point position AND creates a SurveyChange audit trail.
   * @param dbFeatureUuid - The REAL database Feature UUID (sent to backend as feature ForeignKey)
   * @param compositeKey - `${layerId}:${featureId}` for local state tracking
   */
  recordPointMove: (
    dbFeatureUuid: string,
    compositeKey: string,
    layerId: string,
    oldLng: number,
    oldLat: number,
    newLng: number,
    newLat: number
  ) => void;

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
  surveyPointGeometries: {},

  fetchLayers: async (projectId) => {
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
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listGPSTraces();
      set({ gpsTraces: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed to fetch traces'), isLoading: false });
    }
  },

  createGPSTrace: async (data) => {
    try {
      const trace = await surveyApi.createGPSTrace(data);
      set((s) => ({ gpsTraces: [trace, ...s.gpsTraces] }));
      return trace;
    } catch (err: unknown) {
      throw err;
    }
  },

  batchCreateGPSPoints: async (traceId, points) => {
    await surveyApi.batchCreateGPSPoints(traceId, points);
  },

  endGPSTrace: async (traceId, distanceM) => {
    await surveyApi.updateGPSTrace(traceId, { ended_at: new Date().toISOString(), total_distance_m: distanceM });
    set((s) => ({ gpsTraces: s.gpsTraces.map((t) => t.id === traceId ? { ...t, ended_at: new Date().toISOString(), total_distance_m: distanceM } : t) }));
  },

  // ── Trench Surveys ────────────────────────────────────────────────────
  fetchTrenchSurveys: async (featureId) => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listTrenchSurveys(featureId ? { feature: featureId } : undefined);
      set({ trenchSurveys: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveTrenchSurvey: async (data) => {
    const result = await surveyApi.createTrenchSurvey(data);
    set((s) => ({ trenchSurveys: [result, ...s.trenchSurveys] }));
    return result;
  },

  // ── Assets ─────────────────────────────────────────────────────────────
  fetchAssets: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listExistingAssets();
      set({ assets: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveAsset: async (data) => {
    const result = await surveyApi.createExistingAsset(data);
    set((s) => ({ assets: [result, ...s.assets] }));
  },

  // ── Risks ──────────────────────────────────────────────────────────────
  fetchRisks: async (featureId) => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listRiskAssessments(featureId ? { feature: featureId } : undefined);
      set({ riskAssessments: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveRisk: async (data) => {
    const result = await surveyApi.createRiskAssessment(data);
    set((s) => ({ riskAssessments: [result, ...s.riskAssessments] }));
    return result;
  },

  updateRisk: async (riskId, data) => {
    const result = await surveyApi.updateRiskAssessment(riskId, data);
    set((s) => ({ riskAssessments: s.riskAssessments.map((r) => (r.id === riskId ? result : r)) }));
  },

  // ── Hazards ────────────────────────────────────────────────────────────
  fetchHazards: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listHazards();
      set({ hazards: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveHazard: async (data) => {
    const result = await surveyApi.createHazard(data);
    set((s) => ({ hazards: [result, ...s.hazards] }));
  },

  // ── Evidence ───────────────────────────────────────────────────────────
  fetchEvidence: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listFieldEvidence();
      set({ evidence: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveEvidence: async (data) => {
    const result = await surveyApi.createFieldEvidence(data);
    set((s) => ({ evidence: [result, ...s.evidence] }));
  },

  // ── Point Move Recording (Sprint 6) ──────────────────────────────────
  /**
   * Record a point drag as a SurveyChange — NEVER mutates HLD data.
   * Stores old→new coordinates for rendering a synthetic "Survey Points" layer.
   *
   * @param dbFeatureUuid — The REAL database Feature UUID (sent as `feature` ForeignKey)
   * @param compositeKey — `${layerId}:${dbFeatureUuid}` for local state tracking
   */
  recordPointMove: (
    dbFeatureUuid: string,
    compositeKey: string,
    layerId: string,
    oldLng: number,
    oldLat: number,
    newLng: number,
    newLat: number
  ) => {
    // ── Track point move history: HLD original (first move) + current survey position ──
    // IMPORTANT: Check isFirstMove BEFORE set() since zustand sets are synchronous
    const isFirstMove = !get().surveyPointGeometries[compositeKey];

    set((s) => ({
      surveyPointGeometries: {
        ...s.surveyPointGeometries,
        [compositeKey]: {
          // HLD original: set on first move, preserved forever
          hldCoords: isFirstMove ? [oldLng, oldLat] : (s.surveyPointGeometries[compositeKey]?.hldCoords ?? [oldLng, oldLat]),
          // Current surveyed position: always updated to latest
          surveyCoords: [newLng, newLat],
          layerId,
        },
      },
    }));

    // The oldLng/oldLat represent the "previous position":
    // - First move: HLD original position
    // - Subsequent moves: previous survey position (GeoJSON was already updated)
    const reason = isFirstMove
      ? `Moved from HLD planned position to surveyed location`
      : `Re-adjusted survey position`;

    // Create a SurveyChange record (local-first, sync later) — save to backend (fire-and-forget)
    const saveToBackend = async () => {
      try {
        await get().saveChange({
          feature: dbFeatureUuid,  // REAL DB UUID — backend ForeignKey validation passes
          field_name: 'geometry',
          old_value: [oldLng, oldLat],
          new_value: [newLng, newLat],
          reason,
          latitude: newLat,
          longitude: newLng,
        });
      } catch (err) {
        console.warn('[Survey] Failed to sync point move to backend:', err);
      }
    };
    setTimeout(saveToBackend, 0);
  },

  // ── Changes ────────────────────────────────────────────────────────────
  fetchChanges: async (featureId) => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.listSurveyChanges(featureId ? { feature: featureId } : undefined);
      set({ changes: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  saveChange: async (data) => {
    const result = await surveyApi.createSurveyChange(data);
    set((s) => ({ changes: [result, ...s.changes] }));
  },

  // ── Statuses ───────────────────────────────────────────────────────────
  fetchStatuses: async (featureId) => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.getSurveyStatus(featureId ? { feature: featureId } : undefined);
      set({ statuses: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  updateStatus: async (featureId, status, notes) => {
    const result = await surveyApi.updateSurveyStatus({ feature: featureId, status, notes });
    set((s) => ({ statuses: s.statuses.some((st) => st.feature === featureId) ? s.statuses.map((st) => (st.feature === featureId ? result : st)) : [result, ...s.statuses] }));
  },

  // ── Sync ───────────────────────────────────────────────────────────────
  fetchSyncQueue: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await surveyApi.getSyncQueue();
      set({ syncQueue: data.results, isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },

  pushToSyncQueue: async (items) => {
    await surveyApi.pushToSyncQueue(items);
  },

  processSyncQueue: async () => {
    set({ isLoading: true });
    try {
      await surveyApi.processSyncQueue();
      set({ syncQueue: [], isLoading: false });
    } catch (err: unknown) {
      set({ error: (err instanceof Error ? err.message : 'Failed'), isLoading: false });
    }
  },
}));
