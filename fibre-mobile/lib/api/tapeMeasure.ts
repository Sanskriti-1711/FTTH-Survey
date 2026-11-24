import { ApiError, apiFetch } from './client';
import { updateFieldMeasurements } from './features';
import { getSupervisionFeature } from './supervision';
import type { AiElementType } from '../utils/element-type';
import { positiveNumber } from '../utils/spanInspection';

// ── Tape measurement API ──────────────────────────────────────────────────
//
// A tape is its own scale, so this path needs no known-size reference: the
// backend OCRs the printed numbers and returns the distance between the
// outermost ones. It writes nothing — the result fills the inspection form as
// an `actual_*` reading, which the engineer checks against the tape before
// saving.

export interface TapeDimensionOption {
  id: string;
  label: string;
  /** `field_measurements` key the reading lands in. */
  key: string;
  unit: 'mm' | 'm';
}

// Mirrors supervision/tape_measure.py: the dimensions the tape can be laid
// against, per element. The field keys are the form's as-built fields.
export const TAPE_DIMENSIONS: Record<AiElementType, TapeDimensionOption[]> = {
  trench: [
    { id: 'depth', label: 'Depth', key: 'actual_depth_mm', unit: 'mm' },
    { id: 'width', label: 'Width', key: 'actual_width_mm', unit: 'mm' },
    { id: 'length', label: 'Length', key: 'measured_length_m', unit: 'm' },
  ],
  duct: [
    { id: 'outer_diameter', label: 'Outer diameter', key: 'actual_outer_diameter_mm', unit: 'mm' },
    { id: 'installed_depth', label: 'Installed depth', key: 'actual_installed_depth_mm', unit: 'mm' },
  ],
  cable: [
    { id: 'outer_diameter', label: 'Outer diameter', key: 'actual_outer_diameter_mm', unit: 'mm' },
  ],
  chamber: [
    { id: 'opening', label: 'Opening', key: 'actual_chamber_opening_mm', unit: 'mm' },
    { id: 'depth', label: 'Depth', key: 'actual_chamber_depth_mm', unit: 'mm' },
  ],
  pole: [
    { id: 'height', label: 'Height', key: 'actual_pole_height_mm', unit: 'mm' },
    { id: 'diameter', label: 'Base diameter', key: 'actual_pole_diameter_mm', unit: 'mm' },
  ],
};

export interface TapeReading {
  /** The number printed on the blade, in `unit`. */
  value: number;
  unit: string;
  /** Position along the blade, 0–1. */
  x: number;
  confidence: number;
}

export interface TapeMeasurement {
  key: string;
  label: string;
  value: number;
  unit: string;
  confidence: number;
}

/**
 * The server's framing verdict: was the blade's printed ladder legible, evenly
 * spaced and wholly inside the photo? False means the photo cannot be measured
 * and the engineer should reframe and shoot again.
 */
export interface TapeFraming {
  ok: boolean;
  verdict: string;
  message: string;
  detail?: {
    glyphs?: number;
    ladder?: number;
    pitch_px?: number | null;
    evenness?: number | null;
    covers?: number | null;
  } | null;
}

export interface TapeMeasurementResult {
  measurement: TapeMeasurement | null;
  readings: TapeReading[];
  unit: string;
  notes: string;
  photo_id: string | null;
  engine: string;
  framing?: TapeFraming | null;
}

/** Where the number came from, kept on the record so a reviewer can tell. */
export type TapeSource = 'tape_ocr' | 'tape_typed';

/**
 * The reading the engineer typed off the blade, or null when what they typed is
 * not a positive number. This is the path for photos no engine can read, so a
 * blank field or a stray character must not become a measurement.
 */
export function typedTapeReading(
  option: TapeDimensionOption,
  text: string
): TapeMeasurement | null {
  const value = positiveNumber(text);
  if (value === null) return null;
  return {
    key: option.key,
    label: option.label,
    value,
    unit: option.unit,
    // Typed by the engineer who is holding the tape: no OCR uncertainty.
    confidence: 1,
  };
}

// OCR runs tesseract on the server, which takes a few seconds on a laptop and
// up to a minute on a loaded 0.1-CPU host. Without a deadline a request that
// never answers leaves the button on "Reading…" for good.
const TAPE_TIMEOUT_MS = 120_000;

/** POST /api/features/{id}/tape-measurements/ — read the tape, never persist. */
export async function measureTape(
  featureId: string,
  input: { photoId: string; elementType: AiElementType; dimension: string }
): Promise<TapeMeasurementResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAPE_TIMEOUT_MS);
  try {
    return await apiFetch(`/api/features/${featureId}/tape-measurements/`, {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        photo_id: input.photoId,
        element_type: input.elementType,
        dimension: input.dimension,
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(
        'The tape read took too long. Keep two printed numbers on the blade in the frame, avoid glare, and try again.',
        0
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Write a reading into the span's `actual_*` field, tagged with the photo it
 * came from. Shared by the photo screen and the live viewfinder so a reading
 * saved from either place is recorded identically.
 */
export async function fillTapeReading(input: {
  featureId: string;
  projectId: string;
  measurement: TapeMeasurement;
  readings: TapeReading[];
  photoId: string | null;
  source: TapeSource;
}): Promise<void> {
  const { feature } = await getSupervisionFeature(input.projectId, input.featureId);
  const merged = withTapeReading(
    (feature.field_measurements ?? {}) as Record<string, unknown>,
    input.measurement,
    input.photoId,
    input.readings,
    input.source
  );
  await updateFieldMeasurements(input.featureId, merged, feature.comparison_notes ?? '');
}

/**
 * Write the reading as its `actual_*` field, tagged with the photo and the two
 * numbers it came from so a reviewer can retrace it.
 */
export function withTapeReading(
  saved: Record<string, unknown>,
  measurement: TapeMeasurement | null,
  photoId: string | null,
  readings: TapeReading[],
  source: TapeSource = 'tape_ocr'
): Record<string, unknown> {
  if (!measurement) return { ...saved };
  const first = readings[0];
  const last = readings[readings.length - 1];
  return {
    ...saved,
    [measurement.key]: {
      value: measurement.value,
      unit: measurement.unit,
      label: measurement.label,
      source,
      confidence: measurement.confidence,
      photo_id: photoId,
      ...(first && last
        ? { tape: { from: first.value, to: last.value, unit: first.unit } }
        : {}),
    },
  };
}
