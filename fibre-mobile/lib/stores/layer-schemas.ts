// ── Layer Schemas & Import Helpers ────────────────────────────────────────
// Layer schemas define the survey data dictionary (read-only fields, editable
// fields, required photos, GPS accuracy, geometry permissions) and are used by
// the form components to render the correct survey forms.
// parseZipToGeojsons handles client-side parsing of survey package ZIPs.

import { Platform } from 'react-native';
import type {
  Layer,
  Feature,
  GeoJSONFeature,
  LayerSchema,
} from '../utils/types';

// ── Helpers ───────────────────────────────────────────────────────────────

const now = new Date();

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

/** Get schema for a layer ID, handling imported prefix + fuzzy keyword matching */
export function getLayerSchema(layerId: string): LayerSchema | null {
  const cleanId = layerId.startsWith('imp-') ? layerId.slice(4) : layerId;
  const direct = LAYER_SCHEMAS[cleanId];
  if (direct) return direct;

  // Fuzzy matching for real-world layer names: final_trenches, feeder_ducts,
  // distribution_cable, garden_trench, service areas/zones, etc.
  const rules: Array<[RegExp, LayerSchema]> = [
    [/trench/i, TRENCH_SCHEMA],
    [/duct/i, DUCT_SCHEMA],
    [/cable/i, CABLE_SCHEMA],
    [/pdp/i, PDP_SCHEMA],
    [/mfg|mdf/i, MFG_SCHEMA],
    [/polygon|zone|area/i, POLYGON_SCHEMA],
    [/object|premis/i, PREMISE_SCHEMA],
  ];
  for (const [re, schema] of rules) {
    if (re.test(cleanId)) return schema;
  }
  return null;
}

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
