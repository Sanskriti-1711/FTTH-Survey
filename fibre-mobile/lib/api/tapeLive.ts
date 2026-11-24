import { apiFetch } from './client';
import { photoFormPart } from './form';

// ── Live viewfinder ───────────────────────────────────────────────────────
//
// The overlay is not a second opinion. A frame goes to the same reader the
// stored photo goes through, so the number shown while framing is the number
// the capture would produce — and a refusal comes back with the stage that
// caused it, exactly as it would on capture.

export interface LiveClipReading {
  usable: boolean;
  reason: string | null;
  stage: string | null;
  reading_mm: number | null;
  unit: string | null;
  reference_face: [number, number] | null;
  label: { value: number; text: string; x_px: number } | null;
  divisions_to_face: number | null;
  blade_confirmed: boolean;
  tape_angle_deg: number | null;
}

export interface LiveFraming {
  ok: boolean;
  verdict: string;
  message: string;
}

export interface LiveFrameResult {
  clip: LiveClipReading;
  framing: LiveFraming | null;
  elapsed_ms: number;
}

// One frame may sit behind a couple of other people's photos on a shared host,
// so the poller waits — but not forever, or the overlay would hang on a frame
// the network dropped.
const FRAME_TIMEOUT_MS = 60_000;

/** POST /api/tape/frame/ — the reader's verdict on one viewfinder frame. */
export async function readTapeFrame(
  uri: string,
  elementType: string,
  dimension: string
): Promise<LiveFrameResult> {
  const form = new FormData();
  // Expo's fetch builds the multipart body in JavaScript and rejects React
  // Native's `{ uri, name, type }` part with "Unsupported FormDataPart
  // implementation" — the error the viewfinder was showing on every frame,
  // which meant no frame ever reached the server and no number could appear.
  // The File-backed part the photo uploads use is the one it accepts.
  form.append('frame', photoFormPart({ uri, name: 'frame.jpg', type: 'image/jpeg' }));
  form.append('element_type', elementType);
  form.append('dimension', dimension);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FRAME_TIMEOUT_MS);
  try {
    return await apiFetch<LiveFrameResult>('/api/tape/frame/', {
      method: 'POST',
      body: form,
      isFormData: true,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** The one line the engineer can act on, from a refusal and the framing check. */
export function frameGuide(result: LiveFrameResult | null): string {
  if (!result) return 'Point the camera at the tape';
  if (result.clip.usable) return 'Hold still — the clip is read';
  if (!result.clip.blade_confirmed) {
    return 'Blade not confirmed — fill the frame with the tape, flat to the camera';
  }
  if (result.framing && !result.framing.ok) return result.framing.message;
  return result.clip.reason ?? 'No reading yet';
}
