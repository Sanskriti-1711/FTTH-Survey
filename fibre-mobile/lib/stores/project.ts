import { create } from 'zustand';
import type { Project, AssignmentJob, Feature, GeoJSONFeature, Layer } from '../utils/types';
import * as projectsApi from '../api/projects';
import * as assignmentsApi from '../api/assignments';

// ── Project Store ─────────────────────────────────────────────────────────

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  assignments: AssignmentJob[];
  stats: {
    total: number;
    under_review: number;
    approved: number;
    redo: number;
    pending: number;
    assigned: number;
  } | null;
  isLoading: boolean;
  error: string | null;

  /** Progress of fetching GeoJSON layers from the backend: { fetched: N, total: N } */
  layerFetchProgress: { fetched: number; total: number } | null;

  /** GeoJSON features for the active project, keyed by layer ID */
  projectGeojsons: Record<string, GeoJSONFeature[]>;
  /** Layers for the imported project (for map layer display) */
  projectLayers: Layer[];

  /** Convert backend Feature[] into GeoJSONFeature[] for map rendering */
  featuresToGeoJSON: (features: Feature[]) => GeoJSONFeature[];
  /** Fetch all layers + features for a real project from the backend and populate projectGeojsons + projectLayers */
  fetchProjectGeojsons: (projectId: string) => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchAssignments: (engineerId: string) => Promise<void>;
  setActiveProject: (project: Project | null) => void;
  importSurveyPackage: (projectId: string, file: { uri: string; name: string; type: string }) => Promise<void>;
  setProjectGeojsons: (geojsons: Record<string, GeoJSONFeature[]>) => void;
  syncFeatureEdit: (
    projectId: string,
    featureId: string,
    data: {
      geometry?: Record<string, unknown> | null;
      properties?: Record<string, unknown>;
      field_measurements?: Record<string, unknown>;
      status?: string;
    }
  ) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  assignments: [],
  stats: null,
  isLoading: false,
  error: null,
  layerFetchProgress: null,
  projectGeojsons: {},
  projectLayers: [],

  /** Convert backend Feature[] into GeoJSONFeature[] for map rendering */
  featuresToGeoJSON: (features: Feature[]): GeoJSONFeature[] => {
    return features.map((f) => ({
      type: 'Feature' as const,
      geometry: (f.geometry as { type: string; coordinates: unknown[] }) ?? {
        type: 'Point',
        coordinates: [0, 0],
      },
      properties: { ...f.properties, id: f.id, _feature_id: f.id },
    }));
  },

  /**
   * Fetch all layers + features for a real project from the backend
   * and populate projectGeojsons + projectLayers.
   */
  fetchProjectGeojsons: async (projectId: string) => {
    if (projectId.startsWith('imported-')) {
      return; // Local-only import — nothing to fetch from the backend
    }
    set({ isLoading: true, error: null });
    try {
      // Step 1: Get all layers for this project
      const { layers } = await projectsApi.getProjectLayers(projectId);
      const totalLayers = layers.length;

      // Step 2: Fetch features for ALL layers in parallel, tracking progress
      let fetchedCount = 0;
      set({ layerFetchProgress: { fetched: 0, total: totalLayers } });

      const layerPromises = layers.map((layer) =>
        projectsApi
          .getLayerDetail(projectId, layer.layer_id)
          .then((data) => {
            // Update progress on each successful fetch
            fetchedCount++;
            set({ layerFetchProgress: { fetched: fetchedCount, total: totalLayers } });
            return {
              key: layer.layer_id,
              features: get().featuresToGeoJSON(data.features?.filter((f) => f.geometry) ?? []),
            };
          })
          .catch((err) => {
            // Update progress even on failure (still "fetched")
            fetchedCount++;
            set({ layerFetchProgress: { fetched: fetchedCount, total: totalLayers } });
            console.warn(`[fetchProjectGeojsons] Failed for layer ${layer.layer_id}:`, err);
            return { key: layer.layer_id, features: [] };
          })
      );

      const results = await Promise.all(layerPromises);
      const geojsons: Record<string, GeoJSONFeature[]> = {};
      for (const { key, features } of results) {
        if (features.length > 0) geojsons[key] = features;
      }

      console.log(
        `[fetchProjectGeojsons] Fetched ${Object.keys(geojsons).length} layers with ${Object.values(geojsons).reduce(
          (sum, f) => sum + f.length,
          0
        )} features total`
      );

      set({ projectGeojsons: geojsons, projectLayers: layers, isLoading: false, layerFetchProgress: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch project GeoJSON';
      console.error('[fetchProjectGeojsons] Error:', message);
      set({ error: message, isLoading: false, layerFetchProgress: null });
    }
  },

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectsApi.listProjects();
      set({ projects, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch projects';
      set({ error: message, isLoading: false });
    }
  },

  fetchAssignments: async (engineerId: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await assignmentsApi.getJobsForEngineer(engineerId, { page_size: 50 });
      set({ assignments: data.results, stats: data.stats, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch assignments';
      set({ error: message, isLoading: false });
    }
  },

  setActiveProject: (project) => set({ activeProject: project }),

  importSurveyPackage: async (projectId, file) => {
    // Import flow — auto-create project → upload → discover → import
    console.log('[importSurveyPackage] Running import flow');
    set({ isLoading: true, error: null });
    try {
      // Step 0: If no projectId provided, auto-create a project from the file name
      let targetProjectId = projectId;
      if (!targetProjectId) {
        // Append timestamp to prevent duplicate name conflicts (backend enforces unique names)
        const baseName = file?.name
          ? file.name.replace(/\.(zip|gpkg|geojson)$/i, '')
          : 'Imported Survey';
        const projectName = `${baseName}-${Date.now()}`;
        const newProject = await projectsApi.createProject({
          name: projectName,
          description: `Auto-created from ${file?.name ?? 'survey package'}`,
          region: 'Field Survey',
          status: 'active' as const,
        });
        targetProjectId = newProject.id;
        console.log('[importSurveyPackage] Created project:', targetProjectId, 'name:', projectName);
      }

      // Step 1: Upload the file (returns session_id)
      const uploadResult = await projectsApi.uploadGpkg(targetProjectId, file);
      const sessionId = uploadResult.session_id;

      // Step 2: Discover layers from the uploaded file
      const discoverResult = await projectsApi.discoverGpkg(targetProjectId, sessionId);

      // Extract layer names from discover result (supports both array and nested formats)
      const layersPayload = discoverResult.layers ?? [];
      const layerNames: string[] = Array.isArray(layersPayload)
        ? layersPayload.map((l: any) => l.name ?? l.layer_name ?? l)
        : [];

      if (layerNames.length === 0) {
        throw new Error('No layers discovered in the uploaded file');
      }

      // Step 3: Import the selected layers
      await projectsApi.importGpkg(targetProjectId, { selected_layers: layerNames });

      // Step 4: Refresh project list and set active project
      // NOTE: GeoJSON data is NOT fetched here — the map's useEffect handles fetching
      // when the map loads. This keeps the import flow fast.
      const projects = await projectsApi.listProjects();
      const createdProject = projects.find((p) => p.id === targetProjectId) ?? null;
      set({
        projects,
        activeProject: createdProject,
        isLoading: false,
      });
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown import error';
      // Log the FULL error details including backend validation messages
      const errorDetail = (err as any)?.data ?? (err as any)?.response ?? err;
      console.warn('[importSurveyPackage] API import failed:', message);
      console.warn('[importSurveyPackage] Full error detail:', JSON.stringify(errorDetail, null, 2));

      set({ isLoading: false, error: message });
      throw err;
    }
  },

  setProjectGeojsons: (geojsons) =>
    set({ projectGeojsons: geojsons }),

  /**
   * Sync a geometry or property edit to the backend.
   * This is a fire-and-forget operation — it doesn't block the UI.
   */
  syncFeatureEdit: async (
    projectId: string,
    featureId: string,
    data: {
      geometry?: Record<string, unknown> | null;
      properties?: Record<string, unknown>;
      field_measurements?: Record<string, unknown>;
      status?: string;
    }
  ) => {
    // Skip if project is a local-only import (no backend record)
    if (projectId.startsWith('imported-')) {
      console.log('[Sync] Local project — skipping feature sync');
      return;
    }

    // Skip if feature ID is a fake local ID
    if (featureId.startsWith('imp-feat-')) {
      console.log('[Sync] Local feature — skipping feature sync');
      return;
    }

    // Skip the user ID (UUID) fields that might be in properties
    // Only send geometry, editable properties, and status
    try {
      const result = await projectsApi.updateFeature(projectId, featureId, data);
      console.log(`[Sync] Feature ${featureId} synced:`, result);
    } catch (err) {
      console.warn(`[Sync] Failed to sync feature ${featureId}:`, err);
      // Don't throw — this is fire-and-forget
    }
  },

}));

