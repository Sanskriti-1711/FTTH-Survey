import { apiFetch } from './client';
import { uploadFeaturePhotoToGallery } from './features';
import type { AiElementType } from '../utils/element-type';

// ── AI measurements API ───────────────────────────────────────────────────
//
// The backend proposes dimensions from one photo; it never writes them.
// `basis` says where the numbers come from — the approved design, the standard
// catalogue, or a known-size object visible in the photo. Only the last is a
// measurement, and even that is an estimate until someone tapes it.

// The element reading lives in utils so it can be tested without React Native;
// re-exported here because the estimate flow is what consumes it.
export {
  AI_ELEMENT_TYPES,
  elementLabel,
  elementTypeFromName,
} from '../utils/element-type';
export type { AiElementType } from '../utils/element-type';

export interface AiEstimate {
  /** `field_measurements` key the value lands in, always `estimated_*`. */
  key: string;
  label: string;
  value: number;
  unit: string;
  /** 0–1. Capped low unless a scale reference was visible. */
  confidence: number;
}

export type AiEstimateBasis = 'plan' | 'catalogue' | 'reference';

export interface AiMeasurementResult {
  basis: AiEstimateBasis;
  estimates: AiEstimate[];
  notes: string;
  photo_id: string | null;
}

/** POST /api/features/{id}/ai-measurements/ — propose, never persist. */
export async function estimateFromPhoto(
  featureId: string,
  input: { photoId: string; elementType: AiElementType }
): Promise<AiMeasurementResult> {
  return apiFetch(`/api/features/${featureId}/ai-measurements/`, {
    method: 'POST',
    body: JSON.stringify({ photo_id: input.photoId, element_type: input.elementType }),
  });
}

/**
 * Store the capture in the span gallery first, so the estimate stays tied to
 * the exact bytes it was made from (`FeaturePhoto` keeps the sha256).
 */
export async function uploadMeasurementPhoto(
  featureId: string,
  photo: { uri: string; name: string; type: string }
): Promise<string> {
  const result = await uploadFeaturePhotoToGallery(featureId, photo);
  const stored = result.uploaded?.[0];
  if (!stored) throw new Error('The photo was not stored. Try again.');
  return stored.id;
}

/** Tag applied estimates so the form can tell them from a tape reading. */
export function withEstimates(
  saved: Record<string, unknown>,
  estimates: AiEstimate[],
  photoId: string | null
): Record<string, unknown> {
  const next = { ...saved };
  for (const estimate of estimates) {
    next[estimate.key] = {
      value: estimate.value,
      unit: estimate.unit,
      label: estimate.label,
      source: 'ai',
      confidence: estimate.confidence,
      photo_id: photoId,
    };
  }
  return next;
}

/** Saved `estimated_*` readings, for the form's "AI estimate" note. */
export function savedEstimates(saved: Record<string, unknown> | null): AiEstimate[] {
  const rows: AiEstimate[] = [];
  for (const [key, entry] of Object.entries(saved ?? {})) {
    if (!key.startsWith('estimated_')) continue;
    if (!entry || typeof entry !== 'object') continue;
    const value = (entry as { value?: unknown }).value;
    if (typeof value !== 'number') continue;
    const stored = String((entry as { label?: unknown }).label ?? '').trim();
    rows.push({
      key,
      label:
        stored ||
        key
          .replace(/^estimated_/, '')
          .replace(/_mm$/, '')
          .replace(/_/g, ' '),
      value,
      unit: String((entry as { unit?: unknown }).unit ?? 'mm'),
      confidence: Number((entry as { confidence?: unknown }).confidence ?? 0),
    });
  }
  return rows;
}
