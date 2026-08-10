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

// Engineer accepts their assigned Survey copy → status becomes active.
export async function acceptProject(projectId: string): Promise<{
  project_id: string;
  name: string;
  status: string;
  source_ftth_project_id: string | null;
}> {
  return apiFetch(`/api/projects/${projectId}/accept/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// Engineer submits their finished Survey copy → status becomes submitted.
export async function submitProject(projectId: string): Promise<{
  project_id: string;
  name: string;
  status: string;
  source_ftth_project_id: string | null;
}> {
  return apiFetch(`/api/projects/${projectId}/submit/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// Admin review actions on a submitted Survey copy.
export type ReviewAction = 'start_review' | 'reviewed' | 'accept' | 'redo' | 'complete';

export async function reviewProject(
  projectId: string,
  action: ReviewAction
): Promise<{
  project_id: string;
  name: string;
  status: string;
  action: string;
  source_ftth_project_id: string | null;
}> {
  return apiFetch(`/api/projects/${projectId}/review/`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
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

  // On React Native, file objects use { uri, name, type } — on web we need
  // an actual Blob/File.  Detect browser context by checking for `document`
  // (present in browsers, absent in React Native Hermes).
  if (typeof document !== 'undefined') {
    // Web: fetch the blob and reconstruct as a File with correct MIME type.
    // Using bare Blob defaults to application/octet-stream which can be
    // rejected by Django validators expecting application/zip or similar.
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const webFile = new File([blob], file.name, { type: file.type || 'application/zip' });
    form.append('file', webFile);
  } else {
    // React Native: use the standard RN pattern
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob);
  }

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
  data: { selected_layers: string[] }
): Promise<{
  project_id: string;
  status: string;
  imported_layers: string[];
}> {
  return apiFetch(`/api/projects/${projectId}/import/import/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function importStatus(
  projectId: string
): Promise<{ project_id: string; status: string; session_id?: string; original_filename?: string }> {
  return apiFetch(`/api/projects/${projectId}/import/status/`);
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

// ── Layer Field Config ───────────────────────────────────────────────────

export async function getLayerFieldConfig(
  projectId: string,
  layerId: string
): Promise<{
  project_id: string;
  layer_id: string;
  schema: import('../utils/types').FieldSchemaField[];
}> {
  return apiFetch(`/api/projects/${projectId}/layers/${layerId}/field-config/`);
}

export async function updateLayerFieldConfig(
  projectId: string,
  layerId: string,
  schema: import('../utils/types').FieldSchemaField[]
): Promise<{
  project_id: string;
  layer_id: string;
  schema: import('../utils/types').FieldSchemaField[];
}> {
  return apiFetch(`/api/projects/${projectId}/layers/${layerId}/field-config/`, {
    method: 'PUT',
    body: JSON.stringify({ schema }),
  });
}

// ── Completion ────────────────────────────────────────────────────────────

export async function getProjectCompletion(projectId: string): Promise<{
  project_id: string;
  completion: number;
}> {
  return apiFetch(`/api/projects/${projectId}/completion/`);
}
