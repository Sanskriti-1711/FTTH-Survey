import { apiFetch } from './client';
import type { Feature, Layer, Project } from '../utils/types';

// ── Supervision API ───────────────────────────────────────────────────────
// A supervision project is an ordinary project row opened from a completed
// LLD run; the stage marker is `source_lld_run_id` (and origin 'lld_run').
// Its layers/features are the planned baseline the engineer inspects.

export function isSupervisionProject(project: Project): boolean {
  return Boolean(project.source_lld_run_id) || project.origin === 'lld_run';
}

/** The LLD run a supervision project was opened from, e.g. "LLD-V05". */
export function lldVersionLabel(project: Project): string {
  const ref = project.source_lld_run_id ?? '';
  const version = ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref;
  return version || 'LLD run';
}

export async function getSupervisionLayers(projectId: string): Promise<Layer[]> {
  const data = await apiFetch<{ project_id: string; layers: Layer[] }>(
    `/api/projects/${projectId}/layers/`,
  );
  return data.layers ?? [];
}

export async function getSupervisionLayerFeatures(
  projectId: string,
  layerId: string,
): Promise<{ layer: Layer; features: Feature[] }> {
  return apiFetch<{ project_id: string; layer: Layer; features: Feature[] }>(
    `/api/projects/${projectId}/layers/${encodeURIComponent(layerId)}/`,
  );
}

export async function getSupervisionFeature(
  projectId: string,
  featureId: string,
): Promise<{
  project_id: string;
  layer_name: string;
  feature: Feature;
  geojson: unknown;
}> {
  return apiFetch(
    `/api/projects/${projectId}/features/${featureId}/`,
  );
}

/** Planned values come from LLD properties; as-built from field measurements. */
export function measurementValue(measurement: unknown): string | null {
  if (measurement === null || measurement === undefined) return null;
  if (typeof measurement === 'object' && 'value' in (measurement as object)) {
    const m = measurement as { value: unknown; unit?: string };
    if (m.value === null || m.value === undefined || m.value === '') return null;
    return `${String(m.value)}${m.unit ? ` ${m.unit}` : ''}`;
  }
  if (typeof measurement === 'string' || typeof measurement === 'number') {
    return String(measurement) || null;
  }
  return null;
}

export function displayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const m = measurementValue(value);
    if (m) return m;
    return null;
  }
  return String(value);
}
