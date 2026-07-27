// ── Demo / Mock Data ──────────────────────────────────────────────────────
// This provides realistic sample data so the app works fully without a backend.

import { Platform } from 'react-native';
import type {
  Project,
  Layer,
  Feature,
  AssignmentJob,
  GeoJSONFeature,
  FieldSchemaField,
  LayerSchema,
  EngineerStats,
  EngineerActivity,
  AssignmentJobsResponse,
} from '../utils/types';

// ── Helpers ───────────────────────────────────────────────────────────────

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

// ── Sample Projects ───────────────────────────────────────────────────────

export const DEMO_PROJECTS: Project[] = [
  {
    id: 'demo-proj-1',
    name: 'Oakwood Estate FTTH',
    description: 'FTTH survey for Oakwood residential estate - 248 premises',
    region: 'North London',
    status: 'in_progress',
    standard_completion: 65,
    created_at: daysAgo(14),
    updated_at: daysAgo(1),
    last_activity_at: daysAgo(0),
  },
  {
    id: 'demo-proj-2',
    name: 'Riverside Business Park',
    description: 'Commercial FTTH deployment - 12 buildings',
    region: 'Southampton',
    status: 'active',
    standard_completion: 30,
    created_at: daysAgo(7),
    updated_at: daysAgo(2),
    last_activity_at: daysAgo(1),
  },
  {
    id: 'demo-proj-3',
    name: 'Greenfield Village Phase 2',
    description: 'New build FTTH for 450 homes',
    region: 'Oxfordshire',
    status: 'completed',
    standard_completion: 100,
    created_at: daysAgo(60),
    updated_at: daysAgo(30),
    last_activity_at: daysAgo(30),
  },
];

// ── Complete Layer Schemas (Phase 1 — Survey Data Dictionaries) ─────────
// Each schema defines: read-only fields, editable fields with dropdowns,
// mandatory photos, GPS accuracy requirements, and geometry editing permissions.
// These are used by the <LayerEditor> component to render the correct form.

// --- PREMISES / OBJECT LAYER ---
export const PREMISE_SCHEMA: LayerSchema = {
  layerName: 'PREMISES',
  layerId: 'objects',
  readOnlyFields: [
    { key: 'premise_id', label: 'Premise ID' },
    { key: 'customer_id', label: 'Customer ID' },
    { key: 'address', label: 'Address' },
    { key: 'building_name', label: 'Building Name' },
    { key: 'original_lng', label: 'Original Longitude', type: 'number' },
    { key: 'original_lat', label: 'Original Latitude', type: 'number' },
    { key: 'polygon_id', label: 'Planned Polygon' },
    { key: 'planned_pdp', label: 'Planned PDP' },
    { key: 'planned_fibre_route', label: 'Planned Fibre Route' },
  ],
  editableFields: [
    { key: 'household_count', label: 'Household Count', type: 'number', required: true, unit: 'units' },
    { key: 'business_count', label: 'Business Count', type: 'number', unit: 'units' },
    { key: 'building_type', label: 'Building Type', type: 'select', required: true, options: [
      { label: 'Detached', value: 'detached' },
      { label: 'Semi Detached', value: 'semi_detached' },
      { label: 'Terraced', value: 'terraced' },
      { label: 'Apartment', value: 'apartment' },
      { label: 'Commercial', value: 'commercial' },
      { label: 'Industrial', value: 'industrial' },
      { label: 'Mixed Use', value: 'mixed_use' },
      { label: 'School', value: 'school' },
      { label: 'Hospital', value: 'hospital' },
    ]},
    { key: 'access_type', label: 'Access Type', type: 'select', required: true, options: [
      { label: 'Easy', value: 'easy' },
      { label: 'Restricted', value: 'restricted' },
      { label: 'Private', value: 'private' },
      { label: 'Locked', value: 'locked' },
      { label: 'No Access', value: 'no_access' },
    ]},
    { key: 'occupancy_status', label: 'Occupancy Status', type: 'select', options: [
      { label: 'Occupied', value: 'occupied' },
      { label: 'Vacant', value: 'vacant' },
      { label: 'Under Construction', value: 'under_construction' },
      { label: 'Demolished', value: 'demolished' },
    ]},
    { key: 'wayleave_required', label: 'Wayleave Required', type: 'boolean' },
    { key: 'existing_fibre', label: 'Existing Fibre', type: 'boolean' },
    { key: 'existing_copper', label: 'Existing Copper', type: 'boolean' },
    { key: 'existing_pole_feed', label: 'Existing Pole Feed', type: 'boolean' },
    { key: 'existing_underground_feed', label: 'Existing Underground Feed', type: 'boolean' },
    { key: 'survey_notes', label: 'Survey Notes', type: 'textarea', placeholder: 'Access issues, special requirements...' },
  ],
  requiredPhotos: ['Front View', 'Access Point', 'Existing Utility Entry'],
  gpsAccuracyM: 3,
  allowGeometryEdit: true,
};

// --- SERVICE AREAS / POLYGON LAYER ---
export const POLYGON_SCHEMA: LayerSchema = {
  layerName: 'SERVICE_AREAS',
  layerId: 'polygons',
  readOnlyFields: [
    { key: 'polygon_id', label: 'Polygon ID' },
    { key: 'original_area_sqm', label: 'Original Area (sq m)', type: 'number' },
  ],
  editableFields: [
    { key: 'area_name', label: 'Area Name', type: 'text', required: true },
    { key: 'boundary_description', label: 'Boundary Description', type: 'textarea', placeholder: 'Describe updated boundary...' },
    { key: 'priority', label: 'Priority', type: 'select', options: [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
      { label: 'Critical', value: 'critical' },
    ]},
    { key: 'deployment_phase', label: 'Deployment Phase', type: 'text', placeholder: 'Phase 1, Phase 2...' },
    { key: 'homes_passed', label: 'Homes Passed', type: 'number', unit: 'homes' },
    { key: 'density', label: 'Density', type: 'select', options: [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ]},
    { key: 'survey_notes', label: 'Survey Notes', type: 'textarea', placeholder: 'Boundary changes, gaps...' },
  ],
  requiredPhotos: [],
  gpsAccuracyM: null,
  allowGeometryEdit: true,
};

// --- PDP LAYER ---
export const PDP_SCHEMA: LayerSchema = {
  layerName: 'PDP',
  layerId: 'pdps',
  readOnlyFields: [
    { key: 'pdp_id', label: 'PDP ID' },
  ],
  editableFields: [
    { key: 'mounting_type', label: 'Mounting Type', type: 'select', required: true, options: [
      { label: 'Pole', value: 'pole' },
      { label: 'Wall', value: 'wall' },
      { label: 'Cabinet', value: 'cabinet' },
      { label: 'Chamber', value: 'chamber' },
      { label: 'Indoor', value: 'indoor' },
    ]},
    { key: 'capacity', label: 'Capacity', type: 'number', unit: 'ports' },
    { key: 'power_available', label: 'Power Available', type: 'boolean' },
    { key: 'existing_cabinet', label: 'Existing Cabinet', type: 'text', placeholder: 'Cabinet ID / reference...' },
    { key: 'pole_number', label: 'Pole Number', type: 'text' },
    { key: 'chamber_id', label: 'Chamber ID', type: 'text' },
    { key: 'pdp_status', label: 'Status', type: 'select', required: true, options: [
      { label: 'Suitable', value: 'suitable' },
      { label: 'Blocked', value: 'blocked' },
      { label: 'Unsafe', value: 'unsafe' },
      { label: 'No Space', value: 'no_space' },
    ]},
    { key: 'survey_notes', label: 'Survey Notes', type: 'textarea', placeholder: 'Mounting details, access...' },
  ],
  requiredPhotos: ['Location', 'Nearby Pole', 'Cabinet', 'Power Source'],
  gpsAccuracyM: 3,
  allowGeometryEdit: true,
};

// --- MFG LAYER ---
export const MFG_SCHEMA: LayerSchema = {
  layerName: 'MFG',
  layerId: 'mfg',
  readOnlyFields: [],
  editableFields: [
    { key: 'location_status', label: 'Location Status', type: 'select', required: true, options: [
      { label: 'Suitable', value: 'suitable' },
      { label: 'Blocked', value: 'blocked' },
      { label: 'Private Property', value: 'private_property' },
      { label: 'Unsafe', value: 'unsafe' },
      { label: 'Requires Permission', value: 'requires_permission' },
    ]},
    { key: 'power_availability', label: 'Power Available', type: 'boolean' },
    { key: 'existing_cabinet', label: 'Existing Cabinet', type: 'boolean' },
    { key: 'survey_notes', label: 'Survey Notes', type: 'textarea', placeholder: 'Location details...' },
  ],
  requiredPhotos: ['360° View', 'Power Source', 'Road Access'],
  gpsAccuracyM: 5,
  allowGeometryEdit: true,
};

// --- TRENCH LAYER (expanded) ---
export const TRENCH_SCHEMA: LayerSchema = {
  layerName: 'TRENCH',
  layerId: 'trenches',
  readOnlyFields: [
    { key: 'planned_length_m', label: 'Planned Length (m)', type: 'number' },
    { key: 'planned_route', label: 'Planned Route' },
  ],
  editableFields: [
    { key: 'construction_type', label: 'Construction Type', type: 'select', required: true, options: [
      { label: 'New Trench', value: 'new_trench' },
      { label: 'Existing Trench', value: 'existing_trench' },
      { label: 'Existing Duct', value: 'existing_duct' },
      { label: 'Existing Fibre', value: 'existing_fibre_route' },
      { label: 'Existing Openreach Duct', value: 'existing_openreach_duct' },
      { label: 'Existing Virgin Duct', value: 'existing_virgin_duct' },
      { label: 'Micro Trench', value: 'micro_trench' },
      { label: 'HDD Bore', value: 'hdd_bore' },
      { label: 'Mole Plough', value: 'mole_plough' },
      { label: 'Pole Route', value: 'pole_route' },
      { label: 'Wall Route', value: 'wall_route' },
    ]},
    { key: 'surface_type', label: 'Surface Type', type: 'select', options: [
      { label: 'Road', value: 'road' },
      { label: 'Footpath', value: 'footpath' },
      { label: 'Grass', value: 'grass' },
      { label: 'Concrete', value: 'concrete' },
      { label: 'Private Land', value: 'private_land' },
    ]},
    { key: 'ownership', label: 'Ownership', type: 'select', options: [
      { label: 'Public', value: 'public' },
      { label: 'Private', value: 'private' },
      { label: 'Utility', value: 'utility' },
    ]},
    { key: 'road_crossing', label: 'Road Crossing', type: 'boolean' },
    { key: 'rail_crossing', label: 'Rail Crossing', type: 'boolean' },
    { key: 'river_crossing', label: 'River Crossing', type: 'boolean' },
    { key: 'blocked', label: 'Blocked', type: 'boolean' },
    { key: 'reuse_possible', label: 'Reuse Possible', type: 'boolean' },
    { key: 'estimated_depth_mm', label: 'Estimated Depth', type: 'number', unit: 'mm' },
    { key: 'estimated_width_mm', label: 'Estimated Width', type: 'number', unit: 'mm' },
    { key: 'traffic_sensitive', label: 'Traffic Sensitive', type: 'boolean' },
    { key: 'permit_required', label: 'Permit Required', type: 'boolean' },
    { key: 'survey_notes', label: 'Survey Notes', type: 'textarea', placeholder: 'Site conditions, obstructions...' },
  ],
  requiredPhotos: ['Start', 'Middle', 'End', 'Crossing', 'Obstruction'],
  gpsAccuracyM: null,
  allowGeometryEdit: true,
};

// --- DUCT LAYER ---
export const DUCT_SCHEMA: LayerSchema = {
  layerName: 'DUCT',
  layerId: 'ducts',
  readOnlyFields: [],
  editableFields: [
    { key: 'duct_type', label: 'Duct Type', type: 'select', required: true, options: [
      { label: 'Single', value: 'single' },
      { label: 'Twin', value: 'twin' },
      { label: 'Quad', value: 'quad' },
    ]},
    { key: 'existing', label: 'Existing', type: 'boolean' },
    { key: 'reuse', label: 'Reuse', type: 'boolean' },
    { key: 'condition', label: 'Condition', type: 'select', options: [
      { label: 'Excellent', value: 'excellent' },
      { label: 'Good', value: 'good' },
      { label: 'Damaged', value: 'damaged' },
      { label: 'Blocked', value: 'blocked' },
      { label: 'Collapsed', value: 'collapsed' },
    ]},
    { key: 'occupied', label: 'Occupied', type: 'boolean' },
    { key: 'spare_capacity', label: 'Spare Capacity', type: 'select', options: [
      { label: '0%', value: '0' },
      { label: '25%', value: '25' },
      { label: '50%', value: '50' },
      { label: '75%', value: '75' },
      { label: '100%', value: '100' },
    ]},
    { key: 'survey_notes', label: 'Survey Notes', type: 'textarea', placeholder: 'Duct condition notes...' },
  ],
  requiredPhotos: [],
  gpsAccuracyM: null,
  allowGeometryEdit: true,
};

// --- CABLE LAYER ---
export const CABLE_SCHEMA: LayerSchema = {
  layerName: 'CABLE',
  layerId: 'cables',
  readOnlyFields: [],
  editableFields: [
    { key: 'cable_type', label: 'Cable Type', type: 'select', required: true, options: [
      { label: 'Feeder', value: 'feeder' },
      { label: 'Distribution', value: 'distribution' },
      { label: 'Drop', value: 'drop' },
    ]},
    { key: 'cable_size', label: 'Cable Size', type: 'select', required: true, options: [
      { label: '12F', value: '12f' },
      { label: '24F', value: '24f' },
      { label: '48F', value: '48f' },
      { label: '96F', value: '96f' },
      { label: '144F', value: '144f' },
    ]},
    { key: 'slack_required', label: 'Slack Required', type: 'boolean' },
    { key: 'slack_length_m', label: 'Slack Length', type: 'number', unit: 'm' },
    { key: 'protection', label: 'Protection', type: 'select', options: [
      { label: 'Duct', value: 'duct' },
      { label: 'Pole', value: 'pole' },
      { label: 'Wall', value: 'wall' },
    ]},
    { key: 'survey_notes', label: 'Survey Notes', type: 'textarea', placeholder: 'Cable path notes...' },
  ],
  requiredPhotos: [],
  gpsAccuracyM: null,
  allowGeometryEdit: true,
};

/** Master lookup table: layerId → LayerSchema */
export const LAYER_SCHEMAS: Record<string, LayerSchema> = {
  objects: PREMISE_SCHEMA,
  polygons: POLYGON_SCHEMA,
  pdps: PDP_SCHEMA,
  mfg: MFG_SCHEMA,
  trenches: TRENCH_SCHEMA,
  ducts: DUCT_SCHEMA,
  cables: CABLE_SCHEMA,
  // Handle imported layers by stripping imp- prefix
};

/** Get schema for a layer ID, handling imported prefix */
export function getLayerSchema(layerId: string): LayerSchema | null {
  const cleanId = layerId.startsWith('imp-') ? layerId.slice(4) : layerId;
  return LAYER_SCHEMAS[cleanId] ?? null;
}

// ── Oakwood Estate Demo Data ──────────────────────────────────────────────

const OAKWOOD_BASE_LAT = 51.5900;
const OAKWOOD_BASE_LNG = -0.1100;

export const DEMO_GEOJSON_FEATURES: Record<string, GeoJSONFeature[]> = {
  objects: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG, OAKWOOD_BASE_LAT] }, properties: { address: '10 Oakwood Ave', building_type: 'house', household_count: 4, access_type: 'pole' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.002, OAKWOOD_BASE_LAT + 0.001] }, properties: { address: '12 Oakwood Ave', building_type: 'house', household_count: 3, access_type: 'underground' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.004, OAKWOOD_BASE_LAT + 0.002] }, properties: { address: '14 Oakwood Ave', building_type: 'mdu', household_count: 12, access_type: 'pole' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.001, OAKWOOD_BASE_LAT - 0.001] }, properties: { address: '5 Oakwood Close', building_type: 'house', household_count: 5, access_type: 'existing_fibre' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.003, OAKWOOD_BASE_LAT - 0.001] }, properties: { address: '7 Oakwood Close', building_type: 'business', household_count: 8, access_type: 'existing_copper' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.005, OAKWOOD_BASE_LAT + 0.001] }, properties: { address: '20 Oakwood Ave', building_type: 'house', household_count: 3, access_type: 'pole' } },
  ],
  polygons: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[OAKWOOD_BASE_LNG - 0.002, OAKWOOD_BASE_LAT - 0.002], [OAKWOOD_BASE_LNG + 0.007, OAKWOOD_BASE_LAT - 0.002], [OAKWOOD_BASE_LNG + 0.007, OAKWOOD_BASE_LAT + 0.004], [OAKWOOD_BASE_LNG - 0.002, OAKWOOD_BASE_LAT + 0.004], [OAKWOOD_BASE_LNG - 0.002, OAKWOOD_BASE_LAT - 0.002]]] }, properties: { name: 'Oakwood Estate Service Area', area_sqm: 45000, density: 'medium' } },
  ],
  pdps: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.003, OAKWOOD_BASE_LAT + 0.001] }, properties: { name: 'PDP-01', mounting: 'pole_mounted', ports_total: 24, ports_used: 12 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.0005, OAKWOOD_BASE_LAT - 0.0005] }, properties: { name: 'PDP-02', mounting: 'cabinet', ports_total: 48, ports_used: 8 } },
  ],
  trenches: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[OAKWOOD_BASE_LNG, OAKWOOD_BASE_LAT], [OAKWOOD_BASE_LNG + 0.002, OAKWOOD_BASE_LAT + 0.001], [OAKWOOD_BASE_LNG + 0.004, OAKWOOD_BASE_LAT + 0.002]] }, properties: { name: 'Main Trench A', length_m: 320, trench_type: 'new_trench', depth_mm: 450, width_mm: 300 } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[OAKWOOD_BASE_LNG + 0.001, OAKWOOD_BASE_LAT - 0.001], [OAKWOOD_BASE_LNG + 0.003, OAKWOOD_BASE_LAT - 0.001], [OAKWOOD_BASE_LNG + 0.005, OAKWOOD_BASE_LAT + 0.001]] }, properties: { name: 'Lateral Trench B', length_m: 180, trench_type: 'existing_duct', depth_mm: 600, width_mm: 200 } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[OAKWOOD_BASE_LNG + 0.003, OAKWOOD_BASE_LAT + 0.001], [OAKWOOD_BASE_LNG + 0.002, OAKWOOD_BASE_LAT - 0.001]] }, properties: { name: 'Cross Connect C', length_m: 85, trench_type: 'hdd_bore', depth_mm: 1200, width_mm: 100 } },
  ],
  mfg: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.001, OAKWOOD_BASE_LAT + 0.0015] }, properties: { name: 'MFG-01', location_status: 'suitable', power_availability: true, existing_cabinet: false } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [OAKWOOD_BASE_LNG + 0.0035, OAKWOOD_BASE_LAT - 0.0015] }, properties: { name: 'MFG-02', location_status: 'requires_permission', power_availability: true, existing_cabinet: true } },
  ],
  ducts: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[OAKWOOD_BASE_LNG + 0.002, OAKWOOD_BASE_LAT + 0.001], [OAKWOOD_BASE_LNG + 0.003, OAKWOOD_BASE_LAT + 0.001], [OAKWOOD_BASE_LNG + 0.004, OAKWOOD_BASE_LAT + 0.002]] }, properties: { name: 'Duct Run D1', duct_type: 'twin', existing: false, condition: 'good', length_m: 160 } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[OAKWOOD_BASE_LNG + 0.0005, OAKWOOD_BASE_LAT - 0.0005], [OAKWOOD_BASE_LNG + 0.002, OAKWOOD_BASE_LAT - 0.001]] }, properties: { name: 'Duct Run D2', duct_type: 'single', existing: true, condition: 'damaged', length_m: 90 } },
  ],
  cables: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[OAKWOOD_BASE_LNG + 0.003, OAKWOOD_BASE_LAT + 0.001], [OAKWOOD_BASE_LNG + 0.001, OAKWOOD_BASE_LAT], [OAKWOOD_BASE_LNG, OAKWOOD_BASE_LAT - 0.001]] }, properties: { name: 'Feeder Cable F1', cable_type: 'feeder', cable_size: '48f', length_m: 380, protection: 'duct' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[OAKWOOD_BASE_LNG + 0.001, OAKWOOD_BASE_LAT], [OAKWOOD_BASE_LNG + 0.004, OAKWOOD_BASE_LAT - 0.001]] }, properties: { name: 'Distribution Cable D1', cable_type: 'distribution', cable_size: '24f', length_m: 220, protection: 'pole' } },
  ],
};

// ── Imported Dataset (shifted coords so user can visually see the import) ─
// These features are ~300m south-east of Oakwood, creating a visually distinct cluster.

const IMPORT_BASE_LAT = 51.5860;
const IMPORT_BASE_LNG = -0.1050;

export const IMPORT_GEOJSON_FEATURES: Record<string, GeoJSONFeature[]> = {
  objects: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [IMPORT_BASE_LNG, IMPORT_BASE_LAT] }, properties: { address: '1 Riverside', building_type: 'house', household_count: 3, access_type: 'pole', imported: true } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [IMPORT_BASE_LNG + 0.003, IMPORT_BASE_LAT + 0.002] }, properties: { address: '2 Riverside', building_type: 'house', household_count: 5, access_type: 'underground', imported: true } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [IMPORT_BASE_LNG + 0.005, IMPORT_BASE_LAT] }, properties: { address: 'Riverside Flats', building_type: 'mdu', household_count: 18, access_type: 'existing_fibre', imported: true } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [IMPORT_BASE_LNG + 0.002, IMPORT_BASE_LAT - 0.002] }, properties: { address: 'The Shops', building_type: 'business', household_count: 6, access_type: 'pole', imported: true } },
  ],
  polygons: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[IMPORT_BASE_LNG - 0.002, IMPORT_BASE_LAT - 0.002], [IMPORT_BASE_LNG + 0.007, IMPORT_BASE_LAT - 0.002], [IMPORT_BASE_LNG + 0.007, IMPORT_BASE_LAT + 0.003], [IMPORT_BASE_LNG - 0.002, IMPORT_BASE_LAT + 0.003], [IMPORT_BASE_LNG - 0.002, IMPORT_BASE_LAT - 0.002]]] }, properties: { name: 'Riverside Service Area', area_sqm: 28000, density: 'high', imported: true } },
  ],
  pdps: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [IMPORT_BASE_LNG + 0.003, IMPORT_BASE_LAT + 0.001] }, properties: { name: 'PDP-R1', mounting: 'wall_mounted', ports_total: 32, ports_used: 8, imported: true } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [IMPORT_BASE_LNG + 0.001, IMPORT_BASE_LAT - 0.001] }, properties: { name: 'PDP-R2', mounting: 'cabinet', ports_total: 64, ports_used: 4, imported: true } },
  ],
  trenches: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[IMPORT_BASE_LNG, IMPORT_BASE_LAT], [IMPORT_BASE_LNG + 0.003, IMPORT_BASE_LAT + 0.001], [IMPORT_BASE_LNG + 0.005, IMPORT_BASE_LAT]] }, properties: { name: 'Riverside Main', length_m: 280, trench_type: 'new_trench', depth_mm: 500, width_mm: 300, imported: true } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[IMPORT_BASE_LNG + 0.002, IMPORT_BASE_LAT - 0.001], [IMPORT_BASE_LNG + 0.005, IMPORT_BASE_LAT]] }, properties: { name: 'Riverside Link', length_m: 120, trench_type: 'existing_duct', depth_mm: 600, width_mm: 200, imported: true } },
  ],
  mfg: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [IMPORT_BASE_LNG + 0.002, IMPORT_BASE_LAT + 0.001] }, properties: { name: 'MFG-R1', location_status: 'blocked', power_availability: false, existing_cabinet: true, imported: true } },
  ],
  ducts: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[IMPORT_BASE_LNG + 0.001, IMPORT_BASE_LAT + 0.001], [IMPORT_BASE_LNG + 0.004, IMPORT_BASE_LAT + 0.001]] }, properties: { name: 'Duct R-D1', duct_type: 'quad', existing: false, condition: 'good', length_m: 200, imported: true } },
  ],
  cables: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[IMPORT_BASE_LNG + 0.002, IMPORT_BASE_LAT + 0.001], [IMPORT_BASE_LNG + 0.004, IMPORT_BASE_LAT]] }, properties: { name: 'Drop Cable R-D1', cable_type: 'drop', cable_size: '12f', length_m: 150, protection: 'duct', imported: true } },
  ],
};

// Build layers from GeoJSON features (for imported/parsed data)
export function buildLayersFromGeojsons(geojsons: Record<string, GeoJSONFeature[]>): Layer[] {
  return Object.entries(geojsons).map(([layerId, features]) => ({
    layer_id: layerId,
    layer_name: layerId.toUpperCase(),
    feature_count: features.length,
    status_counts: { pending: 0, assigned: features.length, under_review: 0, approved: 0, redo: 0 },
    last_feature_update: now.toISOString(),
  }));
}

// Build features from GeoJSON features (for imported/parsed data)
export function buildFeaturesFromGeojsons(
  geojsons: Record<string, GeoJSONFeature[]>
): Record<string, Feature[]> {
  const result: Record<string, Feature[]> = {};
  for (const [layerId, features] of Object.entries(geojsons)) {
    result[layerId] = features.map((gf, i) => ({
      id: `imp-feat-${layerId}-${i + 1}`,
      layer_name: layerId.toUpperCase(),
      layer_id: layerId,
      properties: gf.properties as Record<string, unknown>,
      field_schema: null,
      field_measurements: null,
      comparison_notes: '',
      status: 'assigned' as const,
      photo_url: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }));
  }
  return result;
}

// ── Demo Feature List ─────────────────────────────────────────────────────

export const DEMO_FEATURES: Record<string, Feature[]> = {
  objects: DEMO_GEOJSON_FEATURES.objects.map((gf, i) => ({
    id: `demo-feat-obj-${i + 1}`, layer_name: 'PREMISES', layer_id: 'objects',
    properties: gf.properties as Record<string, unknown>, field_schema: PREMISE_SCHEMA.editableFields,
    field_measurements: { household_count: (gf.properties as any).household_count ?? 1, building_type: (gf.properties as any).building_type ?? 'detached' },
    comparison_notes: '', status: i < 3 ? 'approved' : i < 5 ? 'under_review' : 'assigned',
    photo_url: null, created_at: daysAgo(10), updated_at: daysAgo(1),
  } as Feature)),
  polygons: DEMO_GEOJSON_FEATURES.polygons.map((gf, i) => ({
    id: `demo-feat-poly-${i + 1}`, layer_name: 'SERVICE_AREAS', layer_id: 'polygons',
    properties: gf.properties as Record<string, unknown>,
    field_schema: POLYGON_SCHEMA.editableFields,
    field_measurements: { area_name: (gf.properties as any).name, density: (gf.properties as any).density ?? 'medium' },
    comparison_notes: '', status: 'approved', photo_url: null,
    created_at: daysAgo(10), updated_at: daysAgo(2),
  } as Feature)),
  pdps: DEMO_GEOJSON_FEATURES.pdps.map((gf, i) => ({
    id: `demo-feat-pdp-${i + 1}`, layer_name: 'PDP', layer_id: 'pdps',
    properties: gf.properties as Record<string, unknown>, field_schema: PDP_SCHEMA.editableFields,
    field_measurements: { mounting_type: (gf.properties as any).mounting ?? 'pole', capacity: (gf.properties as any).ports_total },
    comparison_notes: '', status: i === 0 ? 'approved' : 'pending', photo_url: null,
    created_at: daysAgo(8), updated_at: daysAgo(1),
  } as Feature)),
  trenches: DEMO_GEOJSON_FEATURES.trenches.map((gf, i) => ({
    id: `demo-feat-trench-${i + 1}`, layer_name: 'TRENCH', layer_id: 'trenches',
    properties: gf.properties as Record<string, unknown>, field_schema: TRENCH_SCHEMA.editableFields,
    field_measurements: { construction_type: (gf.properties as any).trench_type ?? 'new_trench', estimated_depth_mm: (gf.properties as any).depth_mm ?? 450, estimated_width_mm: (gf.properties as any).width_mm ?? 300 },
    comparison_notes: '', status: i === 0 ? 'under_review' : i === 1 ? 'approved' : 'assigned',
    photo_url: null, created_at: daysAgo(7), updated_at: daysAgo(0),
  } as Feature)),
  mfg: DEMO_GEOJSON_FEATURES.mfg.map((gf, i) => ({
    id: `demo-feat-mfg-${i + 1}`, layer_name: 'MFG', layer_id: 'mfg',
    properties: gf.properties as Record<string, unknown>, field_schema: MFG_SCHEMA.editableFields,
    field_measurements: { location_status: (gf.properties as any).location_status ?? 'suitable' },
    comparison_notes: '', status: 'assigned', photo_url: null,
    created_at: daysAgo(5), updated_at: daysAgo(1),
  } as Feature)),
  ducts: DEMO_GEOJSON_FEATURES.ducts.map((gf, i) => ({
    id: `demo-feat-duct-${i + 1}`, layer_name: 'DUCT', layer_id: 'ducts',
    properties: gf.properties as Record<string, unknown>, field_schema: DUCT_SCHEMA.editableFields,
    field_measurements: { duct_type: (gf.properties as any).duct_type ?? 'single' },
    comparison_notes: '', status: i === 0 ? 'approved' : 'assigned', photo_url: null,
    created_at: daysAgo(5), updated_at: daysAgo(1),
  } as Feature)),
  cables: DEMO_GEOJSON_FEATURES.cables.map((gf, i) => ({
    id: `demo-feat-cable-${i + 1}`, layer_name: 'CABLE', layer_id: 'cables',
    properties: gf.properties as Record<string, unknown>, field_schema: CABLE_SCHEMA.editableFields,
    field_measurements: { cable_type: (gf.properties as any).cable_type ?? 'feeder', cable_size: (gf.properties as any).cable_size ?? '48f' },
    comparison_notes: '', status: 'assigned', photo_url: null,
    created_at: daysAgo(5), updated_at: daysAgo(1),
  } as Feature)),
};

// ── Demo Layers ───────────────────────────────────────────────────────────

export const DEMO_LAYERS: Layer[] = [
  { layer_id: 'objects', layer_name: 'PREMISES', feature_count: DEMO_FEATURES.objects.length, status_counts: { pending: 0, assigned: 1, under_review: 1, approved: 3, redo: 0 }, last_feature_update: daysAgo(0) },
  { layer_id: 'polygons', layer_name: 'SERVICE_AREAS', feature_count: DEMO_FEATURES.polygons.length, status_counts: { pending: 0, assigned: 0, under_review: 0, approved: 1, redo: 0 }, last_feature_update: daysAgo(2) },
  { layer_id: 'pdps', layer_name: 'PDP', feature_count: DEMO_FEATURES.pdps.length, status_counts: { pending: 1, assigned: 0, under_review: 0, approved: 1, redo: 0 }, last_feature_update: daysAgo(1) },
  { layer_id: 'trenches', layer_name: 'TRENCH', feature_count: DEMO_FEATURES.trenches.length, status_counts: { pending: 0, assigned: 1, under_review: 1, approved: 1, redo: 0 }, last_feature_update: daysAgo(0) },
  { layer_id: 'mfg', layer_name: 'MFG', feature_count: DEMO_FEATURES.mfg.length, status_counts: { pending: 0, assigned: DEMO_FEATURES.mfg.length, under_review: 0, approved: 0, redo: 0 }, last_feature_update: daysAgo(1) },
  { layer_id: 'ducts', layer_name: 'DUCT', feature_count: DEMO_FEATURES.ducts.length, status_counts: { pending: 0, assigned: DEMO_FEATURES.ducts.length, under_review: 0, approved: 1, redo: 0 }, last_feature_update: daysAgo(1) },
  { layer_id: 'cables', layer_name: 'CABLE', feature_count: DEMO_FEATURES.cables.length, status_counts: { pending: 0, assigned: DEMO_FEATURES.cables.length, under_review: 0, approved: 0, redo: 0 }, last_feature_update: daysAgo(1) },
];

// ── Demo Assignments ──────────────────────────────────────────────────────

export const DEMO_ASSIGNMENTS: AssignmentJob[] = [
  { id: 'demo-assign-1', project: { id: 'demo-proj-1', name: 'Oakwood Estate FTTH' }, scope: 'project', scope_display: 'Full Project', assignee: { id: 'demo-user', email: 'demo@fibre360.com', full_name: 'Demo Engineer' }, feature_count: 15, status: 'assigned', status_display: 'Assigned', created_at: daysAgo(5) },
  { id: 'demo-assign-2', project: { id: 'demo-proj-1', name: 'Oakwood Estate FTTH' }, scope: 'layer', scope_display: 'Layer: TRENCH', assignee: { id: 'demo-user', email: 'demo@fibre360.com', full_name: 'Demo Engineer' }, feature_count: 3, status: 'under_review', status_display: 'Under Review', created_at: daysAgo(3) },
  { id: 'demo-assign-3', project: { id: 'demo-proj-1', name: 'Oakwood Estate FTTH' }, scope: 'feature', scope_display: 'Feature: PDP-02', assignee: { id: 'demo-user', email: 'demo@fibre360.com', full_name: 'Demo Engineer' }, feature_count: 1, status: 'pending', status_display: 'Pending', feature: { id: 'demo-feat-pdp-2', status: 'pending', layer_id: 'pdps', layer_name: 'PDP' }, created_at: daysAgo(1) },
  { id: 'demo-assign-4', project: { id: 'demo-proj-2', name: 'Riverside Business Park' }, scope: 'project', scope_display: 'Full Project', assignee: { id: 'demo-user', email: 'demo@fibre360.com', full_name: 'Demo Engineer' }, feature_count: 4, status: 'assigned', status_display: 'Assigned', created_at: daysAgo(2) },
];

export const DEMO_STATS = { total: DEMO_ASSIGNMENTS.length, under_review: 1, approved: 0, redo: 0, pending: 1, assigned: 2 };

// ── Helper to get feature detail ──────────────────────────────────────────

export function getDemoFeatureDetail(featureId: string): {
  feature: Feature;
  geojson: GeoJSONFeature;
} {
  for (const [layerId, features] of Object.entries(DEMO_FEATURES)) {
    const feature = features.find((f) => f.id === featureId);
    if (feature) {
      const geojsonList = DEMO_GEOJSON_FEATURES[layerId];
      const idx = features.indexOf(feature);
      return { feature, geojson: geojsonList[idx] ?? geojsonList[0] };
    }
  }
  return { feature: DEMO_FEATURES.objects[0], geojson: DEMO_GEOJSON_FEATURES.objects[0] };
}

// ── Get all features flattened for map ────────────────────────────────────

export function getDemoAllFeatures(): { feature: Feature; geojson: GeoJSONFeature }[] {
  const result: { feature: Feature; geojson: GeoJSONFeature }[] = [];
  for (const [layerId, features] of Object.entries(DEMO_FEATURES)) {
    const geojsons = DEMO_GEOJSON_FEATURES[layerId] ?? [];
    features.forEach((feature, i) => {
      result.push({ feature, geojson: geojsons[i] ?? geojsons[0] });
    });
  }
  return result;
}

// ── Engineer Stats & Activity ─────────────────────────────────────────────

export const DEMO_ENGINEER_STATS: EngineerStats = {
  engineer_id: 'demo-user', period_days: 30,
  overall: { total: 24, approved: 18, under_review: 3, redo: 1, assigned: 2, pending: 0, approval_rate: 0.75 },
  daily_breakdown: [
    { date: daysAgo(6), updated: 4, approved: 3 },
    { date: daysAgo(5), updated: 6, approved: 5 },
    { date: daysAgo(4), updated: 3, approved: 2 },
    { date: daysAgo(3), updated: 5, approved: 4 },
    { date: daysAgo(2), updated: 2, approved: 2 },
    { date: daysAgo(1), updated: 4, approved: 2 },
  ],
};

export const DEMO_ENGINEER_ACTIVITIES: EngineerActivity[] = [
  { type: 'feature_update', timestamp: daysAgo(0), project: { id: 'demo-proj-1', name: 'Oakwood Estate FTTH' }, feature: { id: 'demo-feat-trench-1', layer_name: 'TRENCH', status: 'under_review', status_display: 'Under Review' } },
  { type: 'feature_update', timestamp: daysAgo(1), project: { id: 'demo-proj-1', name: 'Oakwood Estate FTTH' }, feature: { id: 'demo-feat-obj-4', layer_name: 'PREMISES', status: 'under_review', status_display: 'Under Review' } },
  { type: 'assignment', timestamp: daysAgo(2), project: { id: 'demo-proj-2', name: 'Riverside Business Park' } },
];

// ── Parse zip file client-side ───────────────────────────────────────────
// Uses jszip to extract GeoJSON files from a zip archive.
// On native (iOS/Android) uses expo-file-system (fetch doesn't support file://).
// On web uses fetch (blob:/http: URIs).

/** Read a local file URI into an ArrayBuffer (cross-platform) */
async function readFileAsArrayBuffer(fileUri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    // Web: fetch works with blob:/http: protocols
    const response = await fetch(fileUri);
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  // Native: use expo-file-system to read as base64, then convert to ArrayBuffer
  const FileSystem = require('expo-file-system');
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert base64 to ArrayBuffer
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function parseZipToGeojsons(
  fileUri: string
): Promise<Record<string, GeoJSONFeature[]> | null> {
  if (!fileUri || fileUri.trim() === '') {
    console.log('[parseZipToGeojsons] No file URI provided, skipping zip parse');
    return null;
  }

  try {
    const JSZip = (await import('jszip')).default;
    console.log('[parseZipToGeojsons] Reading file...', fileUri.substring(0, 60));

    const arrayBuffer = await readFileAsArrayBuffer(fileUri);
    console.log('[parseZipToGeojsons] Loaded', (arrayBuffer.byteLength / 1024).toFixed(1), 'KB');

    const zip = await JSZip.loadAsync(arrayBuffer);
    const zipFileNames = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
    console.log('[parseZipToGeojsons] ZIP contains', zipFileNames.length, 'files:', zipFileNames.slice(0, 10));

    const geojsonLayers: Record<string, GeoJSONFeature[]> = {};
    let fileCount = 0;

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      if (!filename.endsWith('.geojson') && !filename.endsWith('.json')) {
        console.log('[parseZipToGeojsons] Skipping non-JSON file:', filename);
        continue;
      }

      try {
        const content = await file.async('string');
        const parsed = JSON.parse(content);

        const layerName = filename
          .replace(/\.(geojson|json)$/i, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_');

        if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
          geojsonLayers[layerName] = parsed.features;
          console.log(`[parseZipToGeojsons] ✓ ${layerName}: ${parsed.features.length} features (FeatureCollection)`);
          fileCount++;
        } else if (parsed.type === 'Feature') {
          geojsonLayers[layerName] = [parsed];
          console.log(`[parseZipToGeojsons] ✓ ${layerName}: 1 feature (single Feature)`);
          fileCount++;
        } else if (typeof parsed.type === 'string') {
          // Might be a geometry object or custom GeoJSON
          console.warn(`[parseZipToGeojsons] ⚠ Skipping ${filename}: unsupported GeoJSON type "${parsed.type}"`);
        } else {
          // Try to extract features from an array or object
          const features = Array.isArray(parsed) ? parsed : parsed.features ?? [parsed];
          if (features.length > 0) {
            geojsonLayers[layerName] = features.filter(
              (f: any) => f && f.type === 'Feature' && f.geometry
            );
            if (geojsonLayers[layerName].length > 0) {
              console.log(`[parseZipToGeojsons] ✓ ${layerName}: ${geojsonLayers[layerName].length} features (extracted)`);
              fileCount++;
            }
          }
        }
      } catch (parseErr) {
        console.error(`[parseZipToGeojsons] ✗ Failed to parse ${filename}:`, parseErr);
      }
    }

    if (fileCount === 0) {
      console.warn('[parseZipToGeojsons] No GeoJSON features found in any files');
      return null;
    }

    const totalFeatures = Object.values(geojsonLayers).reduce((sum, f) => sum + f.length, 0);
    console.log(`[parseZipToGeojsons] ✅ Extracted ${totalFeatures} features across ${fileCount} layers`);
    return geojsonLayers;
  } catch (err) {
    console.error('[parseZipToGeojsons] Fatal error:', err);
    return null;
  }
}

// ── Simulate import ───────────────────────────────────────────────────────

let importedFeatureCount = 0;

export function simulateImport(): {
  project: Project;
  layers: Layer[];
  features: Record<string, Feature[]>;
  geojsons: Record<string, GeoJSONFeature[]>;
} {
  importedFeatureCount++;
  const count = importedFeatureCount;

  // First import uses the distinct Riverside dataset
  // Subsequent imports cycle between shifted versions
  const geojsons = count === 1
    ? IMPORT_GEOJSON_FEATURES
    : (count % 2 === 0
        ? shiftFeatures(DEMO_GEOJSON_FEATURES, 0.008, -0.005)
        : shiftFeatures(DEMO_GEOJSON_FEATURES, -0.006, 0.007));

  return {
    project: {
      id: `demo-imported-${count}`,
      name: `Imported Survey #${count}`,
      description: `Survey package imported on ${now.toLocaleDateString()}`,
      region: count === 1 ? 'Riverside' : 'Field Survey',
      status: 'active',
      standard_completion: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_activity_at: now.toISOString(),
    },
    layers: buildLayersFromGeojsons(geojsons),
    features: buildFeaturesFromGeojsons(geojsons),
    geojsons,
  };
}

// Shift all feature coordinates by a given offset (for unique visual datasets)
function shiftFeatures(
  features: Record<string, GeoJSONFeature[]>,
  lngShift: number,
  latShift: number
): Record<string, GeoJSONFeature[]> {
  const result: Record<string, GeoJSONFeature[]> = {};
  for (const [key, feats] of Object.entries(features)) {
    result[key] = feats.map((f) => ({
      ...f,
      geometry: shiftGeometry(f.geometry, lngShift, latShift),
      properties: { ...f.properties, shifted: true },
    }));
  }
  return result;
}

function shiftGeometry(
  geom: { type: string; coordinates: unknown },
  lngShift: number,
  latShift: number
): { type: string; coordinates: unknown } {
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates as [number, number];
    return { type: 'Point', coordinates: [lng + lngShift, lat + latShift] };
  }
  if (geom.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: (geom.coordinates as [number, number][]).map(([lng, lat]) => [lng + lngShift, lat + latShift]),
    };
  }
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: (geom.coordinates as [number, number][][]).map((ring) =>
        ring.map(([lng, lat]) => [lng + lngShift, lat + latShift])
      ),
    };
  }
  return geom;
}
