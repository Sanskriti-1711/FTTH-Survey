// ── API Types ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'SUBADMIN' | 'ENGINEER';
  created_by: string | null;
  created_at: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  region: string;
  status:
    | 'draft'
    | 'in_progress'
    | 'assigned'
    | 'active'
    | 'submitted'
    | 'under_review'
    | 'reviewed'
    | 'accepted'
    | 'redo'
    | 'completed'
    | 'archived';
  standard_completion: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
}

export interface Feature {
  id: string;
  layer_name: string;
  layer_id: string;
  properties: Record<string, unknown>;
  /** GeoJSON geometry object (returned from backend) */
  geometry?: Record<string, unknown> | null;
  field_schema: FieldSchemaField[] | null;
  field_measurements: Record<string, unknown> | null;
  comparison_notes: string;
  status: 'pending' | 'assigned' | 'under_review' | 'approved' | 'redo';
  photo_url: string | null;
  /** UUID of the user who last edited this feature */
  edited_by?: string | null;
  /** ISO timestamp of the last edit */
  edited_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldSchemaField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'readonly' | 'gps' | 'textarea';
  required?: boolean;
  options?: { label: string; value: string }[];
  unit?: string;
  placeholder?: string;
  /** If true, the field is read-only and cannot be edited by the survey engineer */
  readOnly?: boolean;
}

/** Complete layer schema definition — replaces flat FieldSchemaField[] with richer metadata */
export interface LayerSchema {
  layerName: string;
  layerId: string;
  /** Fields that are displayed but NOT editable (generated from HLD) */
  readOnlyFields: { key: string; label: string; type?: string; unit?: string }[];
  /** Fields that the survey engineer can edit */
  editableFields: FieldSchemaField[];
  /** Human-readable names of mandatory photos for this layer */
  requiredPhotos: string[];
  /** GPS accuracy requirement in metres (null = no requirement) */
  gpsAccuracyM?: number | null;
  /** Whether geometry editing is allowed */
  allowGeometryEdit?: boolean;
}

// ── Layer-Specific Form Data Interfaces ───────────────────────────────────

export interface PremiseFormData {
  // Read-only (from HLD)
  premise_id: string;
  customer_id: string;
  address: string;
  building_name: string;
  original_lng: number;
  original_lat: number;
  polygon_id: string;
  planned_pdp: string;
  planned_fibre_route: string;
  // Editable
  household_count: number;
  business_count: number;
  building_type: string;
  access_type: string;
  occupancy_status: string;
  wayleave_required: boolean;
  existing_fibre: boolean;
  existing_copper: boolean;
  existing_pole_feed: boolean;
  existing_underground_feed: boolean;
  survey_notes: string;
}

export interface PolygonFormData {
  // Read-only
  polygon_id: string;
  // Editable
  boundary_description: string;
  area_name: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  deployment_phase: string;
  homes_passed: number;
  survey_notes: string;
}

export interface PDPFormData {
  // Read-only
  pdp_id: string;
  // Editable
  mounting_type: string;
  capacity: number;
  power_available: boolean;
  existing_cabinet: string;
  pole_number: string;
  chamber_id: string;
  pdp_status: string;
  survey_notes: string;
}

export interface MFGFormData {
  // Editable
  location_status: string;
  power_availability: boolean;
  existing_cabinet: boolean;
  survey_notes: string;
}

export interface TrenchFormData {
  construction_type: string;
  surface_type: string;
  ownership: string;
  road_crossing: boolean;
  rail_crossing: boolean;
  river_crossing: boolean;
  blocked: boolean;
  reuse_possible: boolean;
  estimated_depth_mm: number;
  estimated_width_mm: number;
  traffic_sensitive: boolean;
  permit_required: boolean;
  survey_notes: string;
}

export interface DuctFormData {
  duct_type: string;
  existing: boolean;
  reuse: boolean;
  condition: string;
  occupied: boolean;
  spare_capacity: number;
  survey_notes: string;
}

export interface CableFormData {
  cable_type: string;
  cable_size: string;
  slack_required: boolean;
  slack_length_m: number;
  protection: string;
  survey_notes: string;
}

export interface Layer {
  layer_id: string;
  layer_name: string;
  feature_count: number;
  status_counts: {
    pending: number;
    assigned: number;
    under_review: number;
    approved: number;
    redo: number;
  };
  last_feature_update: string | null;
}

export interface AssignmentJob {
  id: string;
  project: { id: string; name: string; status?: string };
  scope: 'project' | 'layer' | 'feature';
  scope_display: string;
  assignee: { id: string; email: string; full_name: string };
  feature_count: number;
  status: string;
  status_display: string;
  created_at: string;
  feature?: {
    id: string;
    status: string;
    layer_id: string;
    layer_name: string;
  };
}

export interface AssignmentJobsResponse {
  count: number;
  page: number;
  page_size: number;
  results: AssignmentJob[];
  stats: {
    total: number;
    under_review: number;
    approved: number;
    redo: number;
    pending: number;
    assigned: number;
  };
}

export interface EngineerStats {
  engineer_id: string;
  period_days: number;
  overall: {
    total: number;
    approved: number;
    under_review: number;
    redo: number;
    assigned: number;
    pending: number;
    approval_rate: number;
  };
  daily_breakdown: { date: string; updated: number; approved: number }[];
}

export interface EngineerActivity {
  type: 'assignment' | 'feature_update';
  timestamp: string;
  project: { id: string; name: string };
  feature?: {
    id: string;
    layer_name: string;
    status: string;
    status_display: string;
  };
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown[];
  };
  properties: Record<string, unknown>;
}

export interface LayerFieldConfig {
  project_id: string;
  layer_id: string;
  schema: FieldSchemaField[];
}

// ── Navigation Types ─────────────────────────────────────────────────────

export type RootStackParamList = {
  '(auth)': undefined;
  '(tabs)': undefined;
  map: undefined;
  'feature/[featureId]': { featureId: string };
  'project/import': { projectId: string };
  gallery: undefined;
  'gallery/[featureId]': { featureId: string };
  export: undefined;
};

// ── Store Types ───────────────────────────────────────────────────────────

export interface PendingPhoto {
  id: string;
  localUri: string;
  featureId?: string;
  projectId: string;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
  createdAt: string;
  remoteUrl?: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'feature_update' | 'photo_upload' | 'submit';
  entityId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'failed';
  retryCount: number;
  createdAt: string;
}

// ── Survey Types ─────────────────────────────────────────────────────────

export interface GPSTrace {
  id: string;
  engineer: string;
  project?: string | null;
  started_at: string;
  ended_at?: string | null;
  total_distance_m?: number | null;
  point_count: number;
  points?: GPSPoint[];
}

export interface GPSPoint {
  id: string;
  trace?: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  timestamp: string;
  order: number;
}

export interface TrenchSurveyData {
  id: string;
  engineer: string;
  engineer_name?: string;
  feature: string;
  trench_type: string;
  construction_method?: string | null;
  depth_mm?: number | null;
  width_mm?: number | null;
  surface_type?: string | null;
  road_crossing: boolean;
  footpath_crossing: boolean;
  rail_crossing: boolean;
  river_crossing: boolean;
  private_property: boolean;
  traffic_sensitive: boolean;
  permit_required: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ExistingAssetData {
  id: string;
  engineer: string;
  engineer_name?: string;
  feature?: string | null;
  asset_type: string;
  condition: string;
  latitude: number;
  longitude: number;
  description: string;
  created_at: string;
}

export interface RiskAssessmentData {
  id: string;
  engineer: string;
  engineer_name?: string;
  feature?: string | null;
  trench_survey?: string | null;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'rare' | 'possible' | 'likely' | 'certain';
  mitigation: string;
  notes: string;
  status: 'open' | 'closed' | 'accepted' | 'escalated';
  created_at: string;
  updated_at: string;
}

export interface HazardData {
  id: string;
  engineer: string;
  engineer_name?: string;
  feature?: string | null;
  hazard_type: string;
  mitigation_template?: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
}

export interface FieldEvidenceData {
  id: string;
  engineer: string;
  engineer_name?: string;
  feature?: string | null;
  evidence_type: 'photo' | 'video' | 'voice_note' | 'measurement' | 'document' | 'sketch';
  file?: string | null;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  weather: string;
  captured_at: string;
  created_at: string;
}

export interface SurveyChangeData {
  id: string;
  engineer: string;
  engineer_name?: string;
  feature: string;
  field_name: string;
  old_value?: unknown;
  new_value?: unknown;
  reason: string;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
}

export interface SurveyStatusData {
  id: string;
  engineer: string;
  engineer_name?: string;
  feature: string;
  status: 'not_started' | 'visited' | 'verified' | 'modified' | 'needs_review' | 'rejected' | 'approved' | 'completed';
  notes: string;
  created_at: string;
  updated_at: string;
}

// ── Survey Feature (HLD/Survey Separation) ───────────────────────────────

/** A survey-engineer copy of an HLD feature. The HLD remains read-only. */
export interface SurveyFeatureData {
  id: string;
  /** UUID of the original HLD feature (null for engineer-created points) */
  original_hld_feature: string | null;
  /** Read-only convenience field (same as original_hld_feature) */
  hld_feature_id: string | null;
  project: string;
  project_name?: string;
  engineer: string;
  engineer_name?: string;
  layer_id: string;
  layer_name: string;
  /** Frozen geometry from the HLD feature — never changes */
  original_geometry: Record<string, unknown> | null;
  /** Frozen attributes from the HLD feature — never changes */
  original_attributes: Record<string, unknown> | null;
  /** Engineer-edited geometry */
  survey_geometry: Record<string, unknown>;
  /** Engineer-edited attributes */
  survey_attributes: Record<string, unknown>;
  /** Evidence photo URL (backed by the survey-feature photo endpoint) */
  photo_url?: string | null;
  survey_status: 'new' | 'modified' | 'removed' | 'pending_review' | 'rejected' | 'approved' | 'completed';
  version_number: number;
  sync_status: 'pending' | 'synced' | 'failed';
  change_reason: string;
  created_at: string;
  updated_at: string;
}

/** Display mode for the map: HLD only, Survey only, or overlay */
export type LayerDisplayMode = 'hld' | 'survey' | 'overlay';

// ── Pagination ───────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

export interface BackendSyncQueueItem {
  id: string;
  engineer: string;
  engineer_name?: string;
  item_type: 'feature_update' | 'photo_upload' | 'gps_trace' | 'risk_assessment' | 'hazard' | 'trench_classification';
  entity_id: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'synced' | 'failed';
  retry_count: number;
  error_message: string;
  created_at: string;
  synced_at?: string | null;
}
