import { apiFetch } from './client';
import type {
  AssignmentJob,
  AssignmentJobsResponse,
  EngineerStats,
  EngineerActivity,
} from '../utils/types';

// ── Assignments API ───────────────────────────────────────────────────────

export async function listAssignments(params?: {
  project?: string;
  scope?: string;
  assignee?: string;
}): Promise<AssignmentJob[]> {
  const query = new URLSearchParams();
  if (params?.project) query.set('project', params.project);
  if (params?.scope) query.set('scope', params.scope);
  if (params?.assignee) query.set('assignee', params.assignee);
  const qs = query.toString();
  return apiFetch<AssignmentJob[]>(`/api/assignments/${qs ? `?${qs}` : ''}`);
}

export async function getJobsForEngineer(
  engineerId: string,
  params?: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    project?: string;
    scope?: string;
    layer?: string;
  }
): Promise<AssignmentJobsResponse> {
  const query = new URLSearchParams();
  query.set('engineer', engineerId);
  if (params?.page) query.set('page', String(params.page));
  if (params?.page_size) query.set('page_size', String(params.page_size));
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.project) query.set('project', params.project);
  if (params?.scope) query.set('scope', params.scope);
  if (params?.layer) query.set('layer', params.layer);

  return apiFetch<AssignmentJobsResponse>(`/api/assignments/jobs/?${query.toString()}`);
}

export async function getAssignmentSummary(params: {
  project?: string;
  assignee?: string;
}): Promise<{
  project_id?: string;
  counts: { project: number; layer: number; feature: number };
  assignments: {
    project: AssignmentJob[];
    layer: AssignmentJob[];
    feature: AssignmentJob[];
  };
}> {
  const query = new URLSearchParams();
  if (params.project) query.set('project', params.project);
  if (params.assignee) query.set('assignee', params.assignee);
  return apiFetch(`/api/assignments/summary/?${query.toString()}`);
}

// ── Engineer ──────────────────────────────────────────────────────────────

export async function getEngineerStats(
  engineerId: string,
  days?: number
): Promise<EngineerStats> {
  const query = new URLSearchParams();
  query.set('engineer', engineerId);
  if (days) query.set('days', String(days));
  return apiFetch<EngineerStats>(`/api/engineer/stats/?${query.toString()}`);
}

export async function getEngineerActivity(
  engineerId: string,
  days?: number
): Promise<{
  engineer_id: string;
  period_days: number;
  activities: EngineerActivity[];
  total_count: number;
}> {
  const query = new URLSearchParams();
  query.set('engineer', engineerId);
  if (days) query.set('days', String(days));
  return apiFetch(`/api/engineer/activity/?${query.toString()}`);
}
