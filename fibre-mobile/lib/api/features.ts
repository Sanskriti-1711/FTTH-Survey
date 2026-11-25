import { Platform } from 'react-native';
import { apiFetch } from './client';
import { photoFormPart } from './form';
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
  form.append('photo', photoFormPart(photo));

  return apiFetch(`/api/features/${featureId}/upload-photo/`, {
    method: 'POST',
    body: form,
    isFormData: true,
  });
}

/** One photo in an HLD feature's site gallery (supervision FeaturePhoto). */
export interface FeaturePhotoData {
  id: string;
  project_id: string;
  url: string;
  description: string;
  uploaded_by: string | null;
  uploaded_at: string;
  order: number;
}

/** GET /api/features/{id}/photos/ — the full site-photo gallery. */
export async function getFeaturePhotos(featureId: string): Promise<{
  count: number;
  /** null means the span has no photo-count limit. */
  max_photos: number | null;
  results: FeaturePhotoData[];
}> {
  return apiFetch(`/api/features/${featureId}/photos/`);
}

/**
 * DELETE /api/features/{id}/photos/{photo_id}/ — remove one photo from the
 * gallery. Uploads made by the tape/AI measurement screens land here too, so
 * this is also how an engineer drops a photo a reading left behind.
 */
export async function deleteFeaturePhoto(
  featureId: string,
  photoId: string
): Promise<{ detail: string; count: number }> {
  return apiFetch(`/api/features/${featureId}/photos/${photoId}/`, {
    method: 'DELETE',
  });
}

/**
 * POST /api/features/{id}/photos/ — append one or more photos to the gallery.
 * The legacy upload-photo route only replaces the single `Feature.photo` column,
 * so repeated captures of the same feature would overwrite each other.
 */
export async function uploadFeaturePhotoToGallery(
  featureId: string,
  photo: { uri: string; name: string; type: string }
): Promise<{
  count: number;
  /** null means the span has no photo-count limit. */
  max_photos: number | null;
  uploaded: FeaturePhotoData[];
}> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // On web the picker gives a blob:/data: URI. Appending the native
    // {uri, name, type} shape sends "[object Object]" and the server rejects
    // the upload with "No photos provided". Send the actual bytes instead.
    const blob = await (await fetch(photo.uri)).blob();
    form.append('photos', blob, photo.name);
  } else {
    form.append('photos', photoFormPart(photo));
  }

  return apiFetch(`/api/features/${featureId}/photos/`, {
    method: 'POST',
    body: form,
    isFormData: true,
  });
}
