import { create } from 'zustand';
import type { Project, AssignmentJob, Feature, GeoJSONFeature, Layer } from '../utils/types';
import * as projectsApi from '../api/projects';
import * as assignmentsApi from '../api/assignments';
import { useAuthStore } from './auth';
import {
  DEMO_PROJECTS,
  DEMO_ASSIGNMENTS,
  DEMO_STATS,
  simulateImport,
  parseZipToGeojsons,
  buildLayersFromGeojsons,
} from './demo-data';

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
  addDemoProject: (project: Project) => void;
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
    const { demoMode } = useAuthStore.getState();
    if (demoMode || projectId.startsWith('demo-') || projectId.startsWith('imported-')) {
      return; // Not a real project — nothing to fetch
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
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      set({ projects: DEMO_PROJECTS, isLoading: false });
      return;
    }
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
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      set({ assignments: DEMO_ASSIGNMENTS, stats: DEMO_STATS, isLoading: false });
      return;
    }
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
    const { demoMode } = useAuthStore.getState();
    if (demoMode) {
      try {
        set({ isLoading: true, error: null });
        let geojsons: Record<string, GeoJSONFeature[]> | null = null;
        let layers: Layer[] = [];
        let project: Project | null = null;
        let usedFallback = false;
        let parseErrorMessage = '';

        // Step 1: Try to parse the actual zip file
        if (file?.uri) {
          try {
            geojsons = await parseZipToGeojsons(file.uri);
          } catch (zipErr) {
            parseErrorMessage = zipErr instanceof Error ? zipErr.message : 'Unknown zip parse error';
            console.error('[importSurveyPackage] ZIP parse threw:', zipErr);
            geojsons = null;
          }
        }

        // Step 2: Fall back to simulated data if zip parsing failed or no file
        if (!geojsons) {
          console.warn('[importSurveyPackage] ZIP parsing failed or no file — using demo data fallback');
          usedFallback = true;
          const sim = simulateImport();
          project = sim.project;
          geojsons = sim.geojsons;
          layers = sim.layers;
        } else {
          layers = buildLayersFromGeojsons(geojsons);
        }

        // Step 3: Create project if not already created by simulateImport
        if (!project) {
          const name = file?.name?.replace(/\.(zip|gpkg)$/i, '') ?? `Imported Survey`;
          project = {
            id: `imported-${Date.now()}`,
            name,
            description: `Imported from ${file?.name ?? 'survey package'}`,
            region: 'Field Survey',
            status: 'active',
            standard_completion: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          };
        }

        // Step 4: Store everything (map screen handles layer rendering from projectGeojsons)
        const errorMsg = usedFallback
          ? (parseErrorMessage
              ? `ZIP parse error: ${parseErrorMessage}. Using demo data.`
              : 'Used demo data — ZIP contained no .geojson files. Ensure the HLD survey package includes GeoJSON layers.')
          : null;

        set((state) => ({
          projects: [project, ...state.projects],
          activeProject: project,
          projectGeojsons: geojsons!,
          projectLayers: layers,
          isLoading: false,
          error: errorMsg,
        }));

        return;
      } catch (err) {
        // Absolute last-resort safety net — log the error and set fallback data
        console.error('[importSurveyPackage] Fatal error in demo mode:', err);
        const sim = simulateImport();
        set((state) => ({
          projects: [sim.project, ...state.projects],
          activeProject: sim.project,
          projectGeojsons: sim.geojsons,
          projectLayers: sim.layers,
          isLoading: false,
          error: `Import error: ${err instanceof Error ? err.message : 'Unknown error'}. Using demo data.`,
        }));
        return;
      }
    }
    // NON-DEMO PATH — auto-create project → upload → discover → import
    console.log('[importSurveyPackage] Running non-demo import flow');
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

      // Fall back to demo data so the user isn't stuck
      const sim = simulateImport();
      set((state) => ({
        projects: [sim.project, ...state.projects],
        activeProject: sim.project,
        projectGeojsons: sim.geojsons,
        projectLayers: sim.layers,
        isLoading: false,
        error: `Import failed: ${message}. Using demo data as fallback.`,
      }));
      return;
    }
  },

  addDemoProject: (project) =>
    set((state) => ({
      projects: [project, ...state.projects],
      activeProject: project,
    })),

  setProjectGeojsons: (geojsons) =>
    set({ projectGeojsons: geojsons }),

  /**
   * Sync a geometry or property edit to the backend.
   * This is a fire-and-forget operation — it doesn't block the UI.
   * In demo mode, this is a no-op.
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
    const { demoMode } = useAuthStore.getState();

    // Skip sync in demo mode or if project ID is a fake demo/imported ID
    if (demoMode) {
      console.log('[Sync] Demo mode — skipping feature sync');
      return;
    }

    // Skip if project is fake (demo or local-only import)
    if (projectId.startsWith('demo-') || projectId.startsWith('imported-')) {
      console.log('[Sync] Local project — skipping feature sync');
      return;
    }

    // Skip if feature ID is a fake local ID
    if (featureId.startsWith('imp-feat-') || featureId.startsWith('demo-')) {
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

