// ── What a failed request should say ───────────────────────────────────────
//
// The server always says why it refused a request, and the app used to throw
// that away. `apiFetch` built its message from the status alone, so every
// rejection read "Request failed with status 400" — a wrong password was
// indistinguishable from a dead endpoint, and the sign-in screen (the first
// thing an engineer meets on site) looked like a crash.
//
// The bodies are DRF's, and all four shapes are in use here:
//
//   {"non_field_errors": ["Invalid credentials"]}          login (400)
//   {"detail": "Given token not valid for any token type"}  an expired token
//   {"feature": ["Invalid pk \"443c…\" - object does not exist."]}
//   {"items": [{"name": ["This field is required."]}]}      nested serializer
//
// This module is deliberately free of React Native imports so it can be tested
// by `npm test` (node --test runs the TypeScript source directly).

/** The message shown when the body carries nothing usable. */
export function fallbackMessage(status: number): string {
  return `Request failed with status ${status}`;
}

/** Keys that name the error itself rather than one of its fields. */
const WHOLE_BODY_KEYS = ['detail', 'non_field_errors', 'message', 'error'];

const MAX_LENGTH = 240;

/** How deep to walk a nested serializer's error tree before giving up. */
const MAX_DEPTH = 4;

/**
 * The server's own reason for a failed request, or the status when the body
 * carries none.
 *
 * Field errors keep their field name (`feature: Invalid pk …`) because the
 * useful part of a validation error is which field the server rejected.
 */
export function apiErrorMessage(data: unknown, status: number): string {
  return describe(data) || fallbackMessage(status);
}

function describe(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > MAX_DEPTH) return '';

  if (typeof value === 'string') return clean(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => describe(item, depth + 1))
      .filter(Boolean)
      .join(' ');
  }

  if (typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;

  // `detail` and `non_field_errors` describe the request as a whole; anything
  // else in the body is a per-field complaint.
  for (const key of WHOLE_BODY_KEYS) {
    const whole = describe(record[key], depth + 1);
    if (whole) return whole;
  }

  return Object.entries(record)
    .map(([field, detail]) => {
      const text = describe(detail, depth + 1);
      return text ? `${field}: ${text}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * One message, on one line, and short enough to read in a toast.
 *
 * An HTML body (a proxy's 502 page, a platform's error page) is not a message,
 * so it falls through to the status instead of being shown as markup.
 */
function clean(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (!flat || flat.startsWith('<') || flat.startsWith('{') || flat.startsWith('[')) return '';
  if (flat.length <= MAX_LENGTH) return flat;
  return `${flat.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
}
