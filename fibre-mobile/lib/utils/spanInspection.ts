import type { Feature } from './types';

// ── Span inspection ───────────────────────────────────────────────────────
//
// The supervision form is a site record for one chamber-to-chamber span, not
// a free-form measurement sheet. These are the fields the field team fills in:
// span metadata, the LLD checks, the as-built capture and the construction
// checks. They are stored beside the other readings in `field_measurements`
// (the existing `{key: {value}}` shape) so no separate table is needed.

export type CheckValue = 'pass' | 'fail' | '';

export interface InspectionCheck {
  key: string;
  label: string;
}

export const LLD_CHECKS: InspectionCheck[] = [
  { key: 'check_lld_trench_available', label: 'Trench available in approved LLD' },
  { key: 'check_route_matches_alignment', label: 'Route matches approved alignment' },
  { key: 'check_span_matches_drawing', label: 'Span ID matches drawing' },
  { key: 'check_start_matches_design', label: 'Start location matches design' },
  { key: 'check_end_matches_design', label: 'End location matches design' },
  { key: 'check_trench_length_matches_lld', label: 'Trench length matches LLD' },
];

export const CONSTRUCTION_CHECKS: InspectionCheck[] = [
  { key: 'check_trench_depth_standard', label: 'Trench depth as per standard' },
  { key: 'check_trench_width_standard', label: 'Trench width as per standard' },
  { key: 'check_straight_alignment', label: 'Straight alignment maintained' },
  { key: 'check_no_utility_damage', label: 'No utility damage' },
  { key: 'check_warning_tape', label: 'Warning tape installed' },
  { key: 'check_trace_wire', label: 'Trace wire installed' },
  { key: 'check_backfilling', label: 'Backfilling completed' },
  { key: 'check_compaction', label: 'Compaction completed' },
  { key: 'check_surface_reinstated', label: 'Surface reinstated' },
  { key: 'check_safety_barricading', label: 'Safety barricading provided' },
];

export const TRENCH_TYPES = ['Open', 'HDD', 'Garden', 'Footpath', 'Road Crossing'] as const;

export const SPAN_DETAIL_KEYS = [
  'inspection_project_id',
  'inspection_span_id',
  'inspection_sub_span_id',
  'inspection_trench_id',
  'inspection_inspector_name',
  'inspection_date',
  'inspection_gps_start',
  'inspection_gps_end',
] as const;

export const FIELD_CAPTURE_KEYS = [
  'start_gps',
  'end_gps',
  'measured_length_m',
  'actual_depth_mm',
  'actual_width_mm',
  'trench_type',
  'surface_type',
  'existing_utilities',
  'utility_distance',
  'joint_pit_locations',
] as const;

export const NUMERIC_INSPECTION_KEYS = [
  'measured_length_m',
  'actual_depth_mm',
  'actual_width_mm',
] as const;

export const CHECK_KEYS = [...LLD_CHECKS, ...CONSTRUCTION_CHECKS].map((check) => check.key);

export interface SpanInspectionState {
  values: Record<string, string>;
  checks: Record<string, CheckValue>;
}

export interface SpanInspectionSeedInput {
  feature: Feature;
  projectId: string;
  inspectorName: string;
  /** The span id carried by a span-scope assignment, when there is one. */
  spanId?: string;
}

function readingText(entry: unknown): string {
  if (entry && typeof entry === 'object' && 'value' in entry) {
    const value = (entry as { value: unknown }).value;
    return value === null || value === undefined ? '' : String(value);
  }
  return entry === null || entry === undefined ? '' : String(entry);
}

function firstProp(props: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = props[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  // GPKG/GeoJSON attributes are not consistently cased between exports.
  const lower = new Map(Object.entries(props).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function collectCoords(geometry: unknown, out: [number, number][]): void {
  if (!geometry || typeof geometry !== 'object') return;
  const g = geometry as { coordinates?: unknown };
  if (!Array.isArray(g.coordinates)) return;
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(g.coordinates);
}

function formatCoord(coord: [number, number]): string {
  return `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Great-circle length of the design geometry, in metres. */
function geometryLengthMeters(geometry: unknown): number {
  const coords: [number, number][] = [];
  collectCoords(geometry, coords);
  if (coords.length < 2) return 0;

  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_008.8;
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    const [lng1, lat1] = coords[index - 1];
    const [lng2, lat2] = coords[index];
    const dLat = radians(lat2 - lat1);
    const dLng = radians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

export function seedSpanInspection({
  feature,
  projectId,
  inspectorName,
  spanId = '',
}: SpanInspectionSeedInput): SpanInspectionState {
  const saved = (feature.field_measurements ?? {}) as Record<string, unknown>;
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const read = (key: string, fallback = '') => readingText(saved[key]) || fallback;

  const coords: [number, number][] = [];
  collectCoords(feature.geometry ?? null, coords);
  const startPoint = coords[0] ? formatCoord(coords[0]) : '';
  const endPoint = coords[coords.length - 1] ? formatCoord(coords[coords.length - 1]) : '';
  const calculatedLength = geometryLengthMeters(feature.geometry ?? null);

  const featureSpanId =
    spanId ||
    firstProp(props, ['SPAN_ID', 'span_id', 'TRENCH_ID', 'trench_id', 'PARENT_TRENCH']);
  const trenchId =
    firstProp(props, ['TRENCH_ID', 'trench_id', 'TRENCHID']) || featureSpanId;

  const values: Record<string, string> = {
    inspection_project_id: read('inspection_project_id', projectId),
    inspection_span_id: read('inspection_span_id', featureSpanId),
    inspection_sub_span_id: read(
      'inspection_sub_span_id',
      firstProp(props, ['SUB_SPAN_ID', 'SUBSPAN_ID', 'SUB_SPAN', 'SPAN_INDEX']),
    ),
    inspection_trench_id: read('inspection_trench_id', trenchId),
    inspection_inspector_name: read('inspection_inspector_name', inspectorName),
    inspection_date: read('inspection_date', new Date().toISOString().slice(0, 10)),
    inspection_gps_start: read('inspection_gps_start', startPoint),
    inspection_gps_end: read('inspection_gps_end', endPoint),
    start_gps: read('start_gps', startPoint),
    end_gps: read('end_gps', endPoint),
    measured_length_m: read(
      'measured_length_m',
      calculatedLength > 0 ? formatNumber(calculatedLength) : '',
    ),
    actual_depth_mm: read('actual_depth_mm'),
    actual_width_mm: read('actual_width_mm'),
    trench_type: read(
      'trench_type',
      firstProp(props, ['TRENCH_TYPE', 'CONSTRUCTION_TYPE', 'TYPE']),
    ),
    surface_type: read('surface_type', firstProp(props, ['SURFACE_TYPE', 'SURFACE'])),
    existing_utilities: read(
      'existing_utilities',
      firstProp(props, ['EXISTING_UTILITIES', 'UTILITIES']),
    ),
    utility_distance: read('utility_distance'),
    joint_pit_locations: read('joint_pit_locations'),
  };

  const checks: Record<string, CheckValue> = {};
  for (const check of [...LLD_CHECKS, ...CONSTRUCTION_CHECKS]) {
    const value = readingText(saved[check.key]);
    checks[check.key] = value === 'pass' || value === 'fail' ? value : '';
  }

  return { values, checks };
}

/** Merge the inspection fields into the feature's saved measurement map. */
export function applySpanInspection(
  saved: Record<string, unknown>,
  values: Record<string, string>,
  checks: Record<string, CheckValue>,
): Record<string, unknown> {
  const next = { ...saved };
  for (const key of [...SPAN_DETAIL_KEYS, ...FIELD_CAPTURE_KEYS, ...CHECK_KEYS]) {
    delete next[key];
  }

  for (const [key, raw] of Object.entries(values)) {
    const value = raw.trim();
    if (!value) continue;
    if ((NUMERIC_INSPECTION_KEYS as readonly string[]).includes(key)) {
      next[key] = { value: Number(value) };
    } else {
      next[key] = { value };
    }
  }

  for (const [key, check] of Object.entries(checks)) {
    if (check) next[key] = { value: check };
  }

  return next;
}

export function inspectionProgress(
  values: Record<string, string>,
  checks: Record<string, CheckValue>,
): number {
  const filledValues = Object.values(values).filter((value) => value.trim() !== '').length;
  const answeredChecks = Object.values(checks).filter(Boolean).length;
  return filledValues + answeredChecks;
}
