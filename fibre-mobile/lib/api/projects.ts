import { apiFetch } from './client';
import type { Project, Layer, Feature, GeoJSONFeature } from '../utils/types';

// ── Projects API ──────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/api/projects/');
}

export async function createProject(data: Partial<Project>): Promise<Project> {
  return apiFetch<Project>('/api/projects/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getProject(projectId: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${projectId}/`);
}

export async function getLatestProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/api/projects/latest/');
}

// ── Layers ────────────────────────────────────────────────────────────────

export async function getProjectLayers(projectId: string): Promise<{
  project_id: string;
  layers: Layer[];
}> {
  return apiFetch(`/api/projects/${projectId}/layers/`);
}

export async function getLayerDetail(
  projectId: string,
  layerId: string
): Promise<{
  project_id: string;
  layer: Layer;
  features: Feature[];
}> {
  return apiFetch(`/api/projects/${projectId}/layers/${layerId}/`);
}

export async function getFeatureDetail(
  projectId: string,
  featureId: string
): Promise<{
  project_id: string;
  layer_name: string;
  feature: Feature;
  geojson: GeoJSONFeature;
  layer_source: string;
}> {
  return apiFetch(
    `/api/projects/${projectId}/features/${featureId}/`
  );
}

// ── Import ────────────────────────────────────────────────────────────────

export async function uploadGpkg(
  projectId: string,
  file: { uri: string; name: string; type: string }
): Promise<{ session_id: string }> {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);

  return apiFetch(`/api/projects/${projectId}/import/upload/`, {
    method: 'POST',
    body: form,
    isFormData: true,
  });
}

export async function discoverGpkg(
  projectId: string,
  sessionId: string
): Promise<{ layers: { name: string; feature_count: number }[] }> {
  return apiFetch(`/api/projects/${projectId}/import/discover/`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function importGpkg(
  projectId: string,
  sessionId: string,
  layerNames?: string[]
): Promise<{ imported_features: number }> {
  return apiFetch(`/api/projects/${projectId}/import/import/`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, layers: layerNames }),
  });
}

export async function importStatus(
  projectId: string,
  sessionId: string
): Promise<{ status: string; progress: number }> {
  return apiFetch(`/api/projects/${projectId}/import/status/`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

// ── Feature Updates ──────────────────────────────────────────────────────

export async function updateFeature(
  projectId: string,
  featureId: string,
  data: {
    geometry?: Record<string, unknown> | null;
    properties?: Record<string, unknown>;
    field_measurements?: Record<string, unknown>;
    comparison_notes?: string;
    status?: string;
  }
): Promise<{
  project_id: string;
  feature: Feature;
}> {
  return apiFetch(
    `/api/projects/${projectId}/features/${featureId}/update/`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
}

// ── Completion ────────────────────────────────────────────────────────────

export async function getProjectCompletion(projectId: string): Promise<{
  project_id: string;
  completion: number;
}> {
  return apiFetch(`/api/projects/${projectId}/completion/`);
}
