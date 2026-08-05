// ── Survey Features Store (HLD/Survey Separation) ────────────────────────
//
// This store manages SurveyFeature data separately from the HLD (High-Level
// Design) features. The HLD remains read-only — all engineer edits create or
// update SurveyFeature records that reference the original HLD feature.
//
// Architecture (think of it like Git):
//   HLD    = Original branch  (read-only, blue styling)
//   Survey = Working branch   (editable, orange styling)
//   Planner = Merge request   (future: compare HLD vs Survey)

import { create } from 'zustand';
import * as surveyApi from '../api/survey';
import { useProjectStore } from './project';
import type { SurveyFeatureData, GeoJSONFeature, LayerDisplayMode } from '../utils/types';

// ── Color scheme for survey features (orange) ─────────────────────────────
export const SURVEY_COLOR = '#FF8C00'; // Dark orange — survey edits
export const HLD_COLOR_OVERRIDE = '#2563EB'; // Blue — original HLD

interface SurveyFeaturesState {
  /** Survey features keyed by layer_id */
  surveyFeatures: Record<string, SurveyFeatureData[]>;
  /** Whether survey features have been loaded for the active project */
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;

  /** Display mode: 'hld' = blue only, 'survey' = orange only, 'overlay' = both */
  displayMode: LayerDisplayMode;

  /** Load all survey features for a project from the backend */
  fetchSurveyFeatures: (projectId: string) => Promise<void>;

  /** Upsert (create-or-update) a survey feature when the engineer starts editing an HLD feature.
   *  Pass hldFeatureId = null for brand-new engineer-created features (e.g. Add Point). */
  upsertSurveyFeature: (
    hldFeatureId: string | null,
    layerId: string,
    layerName: string,
    surveyGeometry: Record<string, unknown>,
    surveyAttributes?: Record<string, unknown>,
    originalGeometry?: Record<string, unknown> | null,
    originalAttributes?: Record<string, unknown> | null,
    changeReason?: string,
  ) => Promise<SurveyFeatureData | null>;

  /** Update an existing survey feature's geometry or attributes */
  updateSurveyFeature: (
    surveyFeatureId: string,
    layerId: string,
    data: Partial<Pick<SurveyFeatureData, 'survey_geometry' | 'survey_attributes' | 'survey_status' | 'change_reason'>>,
  ) => Promise<void>;

  /** Delete a survey feature (e.g. when the engineer discards an edit) */
  deleteSurveyFeature: (surveyFeatureId: string, layerId: string) => Promise<void>;

  /** Set the display mode (hld / survey / overlay) */
  setDisplayMode: (mode: LayerDisplayMode) => void;

  /** Clear all survey features (e.g. when switching projects) */
  clearSurveyFeatures: () => void;

  /** Convert survey features for a layer into GeoJSONFeature[] for map rendering */
  surveyFeaturesToGeoJSON: (layerId: string) => GeoJSONFeature[];

  /** Get survey features for a specific HLD feature (if any exist) */
  getSurveyFeatureForHld: (hldFeatureId: string) => SurveyFeatureData | null;
}

export const useSurveyFeaturesStore = create<SurveyFeaturesState>((set, get) => ({
  surveyFeatures: {},
  isLoaded: false,
  isLoading: false,
  error: null,
  displayMode: 'hld', // Default: show HLD only (blue)

  fetchSurveyFeatures: async (projectId: string) => {
    if (projectId.startsWith('imported-')) {
      // Local-only import project — no survey features on the backend
      set({ surveyFeatures: {}, isLoaded: true, isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // Fetch all survey features for this project (paginated — get up to 500)
      const data = await surveyApi.listSurveyFeatures({
        project: projectId,
        page_size: 100,
      });

      // Group by layer_id
      const grouped: Record<string, SurveyFeatureData[]> = {};
      for (const sf of data.results) {
        if (!grouped[sf.layer_id]) grouped[sf.layer_id] = [];
        grouped[sf.layer_id].push(sf);
      }

      // If there are more pages, fetch them
      let allResults = data.results;
      let currentPage = data.page;
      while (currentPage < data.total_pages && currentPage < 10) {
        currentPage++;
        const more = await surveyApi.listSurveyFeatures({
          project: projectId,
          page: currentPage,
          page_size: 100,
        });
        for (const sf of more.results) {
          if (!grouped[sf.layer_id]) grouped[sf.layer_id] = [];
          grouped[sf.layer_id].push(sf);
        }
        allResults = allResults.concat(more.results);
      }

      console.log(
        `[SurveyFeatures] Loaded ${allResults.length} survey features across ${Object.keys(grouped).length} layers`
      );

      set({ surveyFeatures: grouped, isLoaded: true, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch survey features';
      console.error('[SurveyFeatures] fetchSurveyFeatures:', message);
      set({ error: message, isLoading: false, isLoaded: true });
    }
  },

  upsertSurveyFeature: async (
    hldFeatureId,
    layerId,
    layerName,
    surveyGeometry,
    surveyAttributes,
    originalGeometry,
    originalAttributes,
    changeReason,
  ) => {
    const activeProject = useProjectStore.getState().activeProject;
    if (!activeProject || activeProject.id.startsWith('imported-')) {
      return null;
    }

    try {
      let result: SurveyFeatureData;

      if (hldFeatureId) {
        // ── Existing HLD feature → upsert ──
        result = await surveyApi.upsertSurveyFeature({
          original_hld_feature: hldFeatureId,
          project: activeProject.id,
          layer_id: layerId,
          layer_name: layerName,
          survey_geometry: surveyGeometry,
          survey_attributes: surveyAttributes,
          original_geometry: originalGeometry,
          original_attributes: originalAttributes,
          change_reason: changeReason,
        });
      } else {
        // ── Brand-new engineer-created feature (no HLD parent) → create ──
        result = await surveyApi.createSurveyFeature({
          original_hld_feature: null,
          project: activeProject.id,
          layer_id: layerId,
          layer_name: layerName,
          original_geometry: originalGeometry ?? null,
          original_attributes: originalAttributes ?? null,
          survey_geometry: surveyGeometry,
          survey_attributes: surveyAttributes ?? {},
          survey_status: 'new',
          version_number: 1,
          sync_status: 'pending',
          change_reason: changeReason ?? '',
        });
      }

      // Update local state
      set((s) => {
        const existing = s.surveyFeatures[layerId] ?? [];
        if (hldFeatureId) {
          const idx = existing.findIndex((sf) => sf.original_hld_feature === hldFeatureId);
          if (idx >= 0) {
            const updated = [...existing];
            updated[idx] = result;
            return { surveyFeatures: { ...s.surveyFeatures, [layerId]: updated } };
          }
        }
        // Add new
        return {
          surveyFeatures: {
            ...s.surveyFeatures,
            [layerId]: [...existing, result],
          },
        };
      });

      console.log(`[SurveyFeatures] ${hldFeatureId ? 'Upserted' : 'Created'} survey feature → ${result.id}`);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upsert survey feature';
      console.error('[SurveyFeatures] upsertSurveyFeature:', message);
      set({ error: message });
      return null;
    }
  },

  updateSurveyFeature: async (surveyFeatureId, layerId, data) => {
    try {
      const result = await surveyApi.updateSurveyFeature(surveyFeatureId, data);
      set((s) => {
        const features = s.surveyFeatures[layerId] ?? [];
        // Merge the requested fields OVER the API response: the backend
        // serializer can echo stale/original values (e.g. it ignores
        // survey_status PATCHes), so the fields we just sent must win.
        // Drop undefined keys so a caller that omits a field can't clobber
        // the backend's value with undefined.
        const cleanData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data ?? {})) {
          if (v !== undefined) cleanData[k] = v;
        }
        const updated = features.map((sf) =>
          sf.id === surveyFeatureId ? ({ ...result, ...cleanData } as SurveyFeatureData) : sf
        );
        return { surveyFeatures: { ...s.surveyFeatures, [layerId]: updated } };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update survey feature';
      console.error('[SurveyFeatures] updateSurveyFeature:', message);
      set({ error: message });
    }
  },

  deleteSurveyFeature: async (surveyFeatureId, layerId) => {
    try {
      await surveyApi.deleteSurveyFeature(surveyFeatureId);
      set((s) => {
        const features = s.surveyFeatures[layerId] ?? [];
        return {
          surveyFeatures: {
            ...s.surveyFeatures,
            [layerId]: features.filter((sf) => sf.id !== surveyFeatureId),
          },
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete survey feature';
      console.error('[SurveyFeatures] deleteSurveyFeature:', message);
      set({ error: message });
    }
  },

  setDisplayMode: (mode) => set({ displayMode: mode }),

  clearSurveyFeatures: () => set({ surveyFeatures: {}, isLoaded: false, error: null }),

  surveyFeaturesToGeoJSON: (layerId: string): GeoJSONFeature[] => {
    const features = get().surveyFeatures[layerId] ?? [];
    return features
      .filter((sf) => sf.survey_status !== 'removed')
      .map((sf) => ({
        type: 'Feature' as const,
        geometry: sf.survey_geometry as { type: string; coordinates: unknown[] },
        properties: {
          ...sf.survey_attributes,
          id: sf.id,
          _survey_feature_id: sf.id,
          _hld_feature_id: sf.original_hld_feature,
          _is_survey: true,
          _survey_status: sf.survey_status,
          _version: sf.version_number,
        },
      }));
  },

  getSurveyFeatureForHld: (hldFeatureId: string): SurveyFeatureData | null => {
    const all = get().surveyFeatures;
    for (const layerFeatures of Object.values(all)) {
      const found = layerFeatures.find((sf) => sf.original_hld_feature === hldFeatureId);
      if (found) return found;
    }
    return null;
  },
}));
