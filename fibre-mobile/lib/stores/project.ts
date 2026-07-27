import { create } from 'zustand';
import type { Project, AssignmentJob, GeoJSONFeature, Layer } from '../utils/types';
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

  /** GeoJSON features for the active project, keyed by layer ID */
  projectGeojsons: Record<string, GeoJSONFeature[]>;
  /** Layers for the imported project (for map layer display) */
  projectLayers: Layer[];

  fetchProjects: () => Promise<void>;
  fetchAssignments: (engineerId: string) => Promise<void>;
  setActiveProject: (project: Project | null) => void;
  importSurveyPackage: (projectId: string, file: { uri: string; name: string; type: string }) => Promise<void>;
  addDemoProject: (project: Project) => void;
  setProjectGeojsons: (geojsons: Record<string, GeoJSONFeature[]>) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  assignments: [],
  stats: null,
  isLoading: false,
  error: null,
  projectGeojsons: {},
  projectLayers: [],

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
    // NON-DEMO PATH — gracefully fall back to demo data if API unavailable
    console.warn('[importSurveyPackage] demoMode is false — attempting API call, will fall back if unavailable');
    set({ isLoading: true, error: null });
    try {
      const { session_id } = await projectsApi.uploadGpkg(projectId, file);
      await projectsApi.importGpkg(projectId, session_id);
      const projects = await projectsApi.listProjects();
      set({ projects, isLoading: false });
      return;
    } catch (err: unknown) {
      console.warn('[importSurveyPackage] API unavailable — falling back to demo data:', err);
      const sim = simulateImport();
      set((state) => ({
        projects: [sim.project, ...state.projects],
        activeProject: sim.project,
        projectGeojsons: sim.geojsons,
        projectLayers: sim.layers,
        isLoading: false,
        error: `Backend unavailable — using demo data. (${err instanceof Error ? err.message : 'API error'})`,
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

}));

