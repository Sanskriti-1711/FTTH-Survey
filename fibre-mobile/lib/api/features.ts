import { apiFetch } from './client';
import type { Feature } from '../utils/types';

// ── Features API ──────────────────────────────────────────────────────────

export async function updateFieldMeasurements(
  featureId: string,
  fieldMeasurements: Record<string, unknown>,
  comparisonNotes?: string
): Promise<{
  id: string;
  field_measurements: Record<string, unknown>;
  comparison_notes: string;
  updated_at: string;
}> {
  return apiFetch(`/api/features/${featureId}/field-measurements/`, {
    method: 'PATCH',
    body: JSON.stringify({
      field_measurements: fieldMeasurements,
      comparison_notes: comparisonNotes ?? '',
    }),
  });
}

export async function submitFeatures(
  featureIds: string[],
  engineerId: string
): Promise<{
  submitted_count: number;
  feature_ids: string[];
  new_status: string;
  status_display: string;
}> {
  return apiFetch('/api/features/submit/', {
    method: 'POST',
    body: JSON.stringify({ feature_ids: featureIds, engineer: engineerId }),
  });
}

export async function approveFeatures(
  featureIds: string[],
  reviewerId: string,
  notes?: string
): Promise<{
  approved_count: number;
  feature_ids: string[];
  new_status: string;
  status_display: string;
}> {
  return apiFetch('/api/features/approve/', {
    method: 'POST',
    body: JSON.stringify({ feature_ids: featureIds, reviewer: reviewerId, notes }),
  });
}

export async function rejectFeatures(
  featureIds: string[],
  reviewerId: string,
  rejectionReason?: string
): Promise<{
  rejected_count: number;
  feature_ids: string[];
  new_status: string;
  status_display: string;
}> {
  return apiFetch('/api/features/reject/', {
    method: 'POST',
    body: JSON.stringify({
      feature_ids: featureIds,
      reviewer: reviewerId,
      rejection_reason: rejectionReason,
    }),
  });
}

export async function uploadFeaturePhoto(
  featureId: string,
  photo: { uri: string; name: string; type: string }
): Promise<{
  id: string;
  photo_url: string;
  uploaded_at: string;
}> {
  const form = new FormData();
  form.append('photo', {
    uri: photo.uri,
    name: photo.name,
    type: photo.type,
  } as unknown as Blob);

  return apiFetch(`/api/features/${featureId}/upload-photo/`, {
    method: 'POST',
    body: form,
    isFormData: true,
  });
}
