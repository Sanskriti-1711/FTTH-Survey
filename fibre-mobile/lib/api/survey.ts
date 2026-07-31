// ── Survey API Client ─────────────────────────────────────────────────────
// Connects the React Native app to the Django survey backend endpoints.
// All endpoints are prefixed with /api/survey/
//
// Backend endpoints:
//   GPS:      /api/survey/gps-traces/       GET/POST
//             /api/survey/gps-traces/<id>/   GET/PATCH
//             /api/survey/gps-traces/<id>/points/  POST (batch)
//   Trenches: /api/survey/trenches/          GET/POST
//             /api/survey/trenches/<id>/      GET/PATCH
//   Assets:   /api/survey/assets/            GET/POST
//   Risks:    /api/survey/risks/             GET/POST
//             /api/survey/risks/<id>/         GET/PATCH
//   Hazards:  /api/survey/hazards/           GET/POST
//   Evidence: /api/survey/evidence/          GET/POST
//   Changes:  /api/survey/changes/           GET/POST
//   Status:   /api/survey/status/            GET/POST
//   Sync:     /api/survey/sync/              GET/POST
//             /api/survey/sync/process/      POST

import { apiFetch } from './client';
import type {
  GPSTrace,
  GPSPoint,
  TrenchSurveyData,
  ExistingAssetData,
  RiskAssessmentData,
  HazardData,
  FieldEvidenceData,
  SurveyChangeData,
  SurveyStatusData,
  BackendSyncQueueItem,
  PaginatedResponse,
  PaginationParams,
  SurveyFeatureData,
} from '../utils/types';

// ── Helpers ───────────────────────────────────────────────────────────────
function buildQuery(params: object): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
}

// ── GPS Traces ────────────────────────────────────────────────────────────

export async function listGPSTraces(
  params?: PaginationParams & { date_from?: string; date_to?: string; search?: string }
): Promise<PaginatedResponse<GPSTrace>> {
  return apiFetch(`/api/survey/gps-traces/${buildQuery(params ?? {})}`);
}

export async function createGPSTrace(data: {
  project?: string;
  started_at?: string;
}): Promise<GPSTrace> {
  return apiFetch('/api/survey/gps-traces/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getGPSTrace(traceId: string): Promise<GPSTrace> {
  return apiFetch(`/api/survey/gps-traces/${traceId}/`);
}

export async function updateGPSTrace(
  traceId: string,
  data: { ended_at?: string; total_distance_m?: number }
): Promise<GPSTrace> {
  return apiFetch(`/api/survey/gps-traces/${traceId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function batchCreateGPSPoints(
  traceId: string,
  points: Omit<GPSPoint, 'id' | 'trace'>[]
): Promise<GPSPoint[]> {
  return apiFetch(`/api/survey/gps-traces/${traceId}/points/`, {
    method: 'POST',
    body: JSON.stringify(points),
  });
}

// ── Trench Surveys ────────────────────────────────────────────────────────

export async function listTrenchSurveys(
  params?: PaginationParams & { feature?: string; trench_type?: string; surface_type?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<TrenchSurveyData>> {
  return apiFetch(`/api/survey/trenches/${buildQuery(params ?? {})}`);
}

export async function createTrenchSurvey(
  data: Omit<TrenchSurveyData, 'id' | 'engineer' | 'engineer_name' | 'created_at' | 'updated_at'>
): Promise<TrenchSurveyData> {
  return apiFetch('/api/survey/trenches/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTrenchSurvey(
  trenchId: string,
  data: Partial<TrenchSurveyData>
): Promise<TrenchSurveyData> {
  return apiFetch(`/api/survey/trenches/${trenchId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── Existing Assets ───────────────────────────────────────────────────────

export async function listExistingAssets(
  params?: PaginationParams & { asset_type?: string; condition?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<ExistingAssetData>> {
  return apiFetch(`/api/survey/assets/${buildQuery(params ?? {})}`);
}

export async function createExistingAsset(
  data: Omit<ExistingAssetData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>
): Promise<ExistingAssetData> {
  return apiFetch('/api/survey/assets/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Risk Assessments ─────────────────────────────────────────────────────

export async function listRiskAssessments(
  params?: PaginationParams & { feature?: string; category?: string; severity?: string; status?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<RiskAssessmentData>> {
  return apiFetch(`/api/survey/risks/${buildQuery(params ?? {})}`);
}

export async function createRiskAssessment(
  data: Omit<RiskAssessmentData, 'id' | 'engineer' | 'engineer_name' | 'created_at' | 'updated_at'>
): Promise<RiskAssessmentData> {
  return apiFetch('/api/survey/risks/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRiskAssessment(
  riskId: string,
  data: Partial<RiskAssessmentData>
): Promise<RiskAssessmentData> {
  return apiFetch(`/api/survey/risks/${riskId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── Hazards ───────────────────────────────────────────────────────────────

export async function listHazards(
  params?: PaginationParams & { hazard_type?: string; is_active?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<HazardData>> {
  return apiFetch(`/api/survey/hazards/${buildQuery(params ?? {})}`);
}

export async function createHazard(
  data: Omit<HazardData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>
): Promise<HazardData> {
  return apiFetch('/api/survey/hazards/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Field Evidence ────────────────────────────────────────────────────────

export async function listFieldEvidence(
  params?: PaginationParams & { evidence_type?: string; feature?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<FieldEvidenceData>> {
  return apiFetch(`/api/survey/evidence/${buildQuery(params ?? {})}`);
}

export async function createFieldEvidence(
  data: Omit<FieldEvidenceData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>
): Promise<FieldEvidenceData> {
  return apiFetch('/api/survey/evidence/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Survey Changes ────────────────────────────────────────────────────────

export async function listSurveyChanges(
  params?: PaginationParams & { feature?: string; field_name?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<SurveyChangeData>> {
  return apiFetch(`/api/survey/changes/${buildQuery(params ?? {})}`);
}

export async function createSurveyChange(
  data: Omit<SurveyChangeData, 'id' | 'engineer' | 'engineer_name' | 'created_at'>
): Promise<SurveyChangeData> {
  return apiFetch('/api/survey/changes/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Survey Status ─────────────────────────────────────────────────────────

export async function getSurveyStatus(
  params?: PaginationParams & { feature?: string; status?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<SurveyStatusData>> {
  return apiFetch(`/api/survey/status/${buildQuery(params ?? {})}`);
}

export async function updateSurveyStatus(data: {
  feature: string;
  status: string;
  notes?: string;
}): Promise<SurveyStatusData> {
  return apiFetch('/api/survey/status/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Sync Queue ────────────────────────────────────────────────────────────

export async function getSyncQueue(
  params?: PaginationParams & { status?: string; item_type?: string; date_from?: string; date_to?: string }
): Promise<PaginatedResponse<BackendSyncQueueItem>> {
  return apiFetch(`/api/survey/sync/${buildQuery(params ?? {})}`);
}

export async function pushToSyncQueue(
  items: Omit<BackendSyncQueueItem, 'id' | 'engineer' | 'engineer_name' | 'synced_at'>[]
): Promise<BackendSyncQueueItem[]> {
  return apiFetch('/api/survey/sync/', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

export async function processSyncQueue(): Promise<{ processed: number }> {
  return apiFetch('/api/survey/sync/process/', {
    method: 'POST',
  });
}

// ── Survey Features (HLD/Survey Separation) ──────────────────────────────

export async function listSurveyFeatures(
  params?: PaginationParams & {
    project?: string;
    layer_id?: string;
    survey_status?: string;
    sync_status?: string;
    hld_feature?: string;
  }
): Promise<PaginatedResponse<SurveyFeatureData>> {
  return apiFetch(`/api/survey/survey-features/${buildQuery(params ?? {})}`);
}

export async function createSurveyFeature(
  data: Omit<SurveyFeatureData, 'id' | 'engineer' | 'engineer_name' | 'project_name' | 'hld_feature_id' | 'created_at' | 'updated_at'>
): Promise<SurveyFeatureData> {
  return apiFetch('/api/survey/survey-features/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getSurveyFeature(featureId: string): Promise<SurveyFeatureData> {
  return apiFetch(`/api/survey/survey-features/${featureId}/`);
}

export async function updateSurveyFeature(
  featureId: string,
  data: Partial<SurveyFeatureData>
): Promise<SurveyFeatureData> {
  return apiFetch(`/api/survey/survey-features/${featureId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteSurveyFeature(featureId: string): Promise<void> {
  return apiFetch(`/api/survey/survey-features/${featureId}/`, {
    method: 'DELETE',
  });
}

/** Create-or-update by HLD feature reference — the primary endpoint for the mobile app */
export async function upsertSurveyFeature(
  data: {
    original_hld_feature: string;
    project: string;
    layer_id: string;
    layer_name: string;
    survey_geometry: Record<string, unknown>;
    survey_attributes?: Record<string, unknown>;
    original_geometry?: Record<string, unknown> | null;
    original_attributes?: Record<string, unknown> | null;
    change_reason?: string;
  }
): Promise<SurveyFeatureData> {
  return apiFetch('/api/survey/survey-features/upsert/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
