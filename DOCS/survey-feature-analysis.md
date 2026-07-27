# FTTH Survey App — Feature Analysis & Implementation Roadmap

> **Generated:** July 25, 2026  
> **Context:** Cross-referencing the comprehensive FTTH Survey Data Dictionary against the current React Native (Expo) codebase  
> **Goal:** Identify what's already built, what's feasible, and how to implement remaining features

---

## 1. Executive Summary

The current codebase (`fibre-mobile/`) has a solid architectural foundation:

| Area | Status |
|---|---|
| **Map rendering** (MapLibre) | ✅ Fully working — native + web with loading/error/empty states |
| **GeoJSON import** (ZIP parsing) | ✅ Fully working — JSZip client-side extraction |
| **Layer management** | ✅ Layer visibility toggle, grouped legend, pin-anchored popups |
| **Survey modules** (Trench, Risk, Hazard, Evidence, Status) | 🟡 API + store layer done; UI forms exist in Survey Editor; NOT yet wired to the map-tap→editor flow |
| **Feature detail/editor** (`feature/[featureId].tsx`) | 🟡 Read-only property display + field_measurements edit form exists; limited to schema-driven fields |
| **Offline support** | 🟡 Store exists but uses demo toggle; real NetInfo integration was started |
| **Sync queue** | 🟡 Backend API + store exists; demo mode fully functional |
| **Geometry editing** (drag-drop) | ❌ Not implemented at all |
| **Layer-specific data dictionaries** | ❌ Only generic `FieldSchemaField[]`; no per-layer rich schemas with dropdowns, read-only markers, mandatory flags, photo requirements, GPS validation |

**Key Gap:** The app currently treats all features generically. The requirements document defines 10+ distinct layers, each with 10–30 layer-specific fields, unique validation rules, photo requirements, and geometry editing permissions. None of this is implemented.

---

## 2. Current Architecture Overview

### 2.1 Data Flow

```
Backend (Django)
  ↓ GeoJSON (ZIP upload or API)
React Native (Expo)
  ↓ JSZip parsing → `projectGeojsons: Record<string, GeoJSONFeature[]>`
MapLibreMap component
  ↓ `buildMapLayerData()` → `MapLayerData[]` → rendered as circles/lines/fills
User taps feature → popup → "Open Details" → `feature/[featureId].tsx`
  ↓ `FieldSchemaField[]` → dynamic form → `updateFieldMeasurements()`
Save → API (or demo store)
```

### 2.2 Key Files

| File | Role |
|---|---|
| `lib/utils/types.ts` | All TypeScript interfaces (Feature, Layer, TrenchSurveyData, etc.) |
| `lib/stores/survey.ts` | Zustand store for all survey modules |
| `lib/stores/map.ts` | Zustand store for map layers & selected feature |
| `lib/stores/project.ts` | Project store + GeoJSON import |
| `lib/stores/offline.ts` | Offline/connectivity state |
| `lib/stores/demo-data.ts` | All demo data, ZIP parsing, `simulateImport()` |
| `lib/api/survey.ts` | REST client for survey backend |
| `lib/api/features.ts` | REST client for feature CRUD |
| `lib/components/MapLibreMap.tsx` | Cross-platform map component |
| `lib/components/MapLegend.tsx` | Layer panel with grouped collapsible headers |
| `lib/components/MapFeaturePopup.tsx` | Pin-anchored feature info popup |
| `app/(tabs)/map.tsx` | Main map screen |
| `app/(tabs)/survey/index.tsx` | Survey Editor screen (list + detail + modules) |
| `app/feature/[featureId].tsx` | Feature detail/editor screen |

---

## 3. Layer-by-Layer Gap Analysis

### 3.1 OBJECT / PREMISE LAYER

| Requirement | Current State | Feasibility | Implementation Approach |
|---|---|---|---|
| **Read-only:** Premise ID, Customer ID, Address, Building Name, Original Coords, Polygon ID, Planned PDP, Planned Fibre Route | ❌ All properties treated equally | ✅ Easy | Extend `FieldSchemaField.type` with `'readonly'` — already exists in types but not enforced in UI |
| **Editable:** Household Count, Business Count, Building Type, Access Type, Occupancy Status, Wayleave Required, Existing Fibre/Copper/Pole/Underground, Survey Notes | 🟡 Generic `field_measurements` JSON — no typed editing | ✅ Easy | Create `PremiseFormData` interface; build a dedicated `<PremiseEditor>` component |
| **Dropdowns:** Building Type (9 options), Access Type (5 options), Occupancy (4 options), Existing Network (5 options) | 🟡 `FieldSchemaField.options` exists but only used generically | ✅ Easy | Define `PREMISE_SCHEMA` with all dropdowns; the existing `field_schema` rendering in `feature/[featureId].tsx` already supports `type: 'select'` |
| **Mandatory Photos:** Front View, Access Point, Existing Utility Entry | ❌ No photo requirement system | 🟡 Medium | Add `requiredPhotos: string[]` to schema; add validation before submit |
| **GPS Validation:** Within 3m of actual building | ❌ No GPS validation | 🟡 Medium | Requires `expo-location` + haversine distance check |
| **Geometry:** Move point, Add/Delete premises | ❌ No geometry editing | 🔴 Complex | See Section 5 below |

**Verdict:** ~60% implementable in Phase 1. The dropdowns and read-only fields are straightforward. Photo requirements and GPS validation are Phase 2. Geometry editing is Phase 3.

---

### 3.2 POLYGON LAYER (Service Areas)

| Requirement | Current State | Feasibility | Implementation Approach |
|---|---|---|---|
| **Editable:** Boundary, Area Name, Priority, Deployment Phase, Homes Passed, Survey Notes | 🟡 Generic form only | ✅ Easy | Create `POLYGON_SCHEMA` with dedicated fields |
| **Geometry:** Split/Merge/Move/Add/Delete Polygon | ❌ | 🔴 Complex | Requires Turf.js for split/merge operations + MapLibre GL Draw |
| **Validation:** No overlaps, no gaps, every premise in one polygon | ❌ | 🟡 Medium | Turf.js spatial queries (`@turf/boolean-overlap`, `@turf/boolean-point-in-polygon`) |

**Verdict:** Form editing is Phase 1. Geometry operations are Phase 3 (complex GIS logic). Validation can be Phase 2.

---

### 3.3 PDP LAYER

| Requirement | Current State | Feasibility | Implementation Approach |
|---|---|---|---|
| **Editable:** Mounting Type, Capacity, Power Available, Existing Cabinet, Pole Number, Chamber ID, Survey Notes | 🟡 Generic | ✅ Easy | Create `PDP_SCHEMA` with dropdowns (Pole/Wall/Cabinet/Chamber/Indoor) |
| **Status:** Suitable/Blocked/Unsafe/No Space | ❌ No status per PDP | ✅ Easy | Add `pdp_status` field to schema |
| **Geometry:** Move PDP (max radius configurable) | ❌ | 🟡 Medium | MapLibre GL Draw drag with radius constraint |
| **Mandatory Photos:** Location, Nearby Pole, Cabinet, Power Source | ❌ | 🟡 Medium | Same photo requirement system as premises |

**Verdict:** ~70% implementable in Phase 1. Geometry move is Phase 2.

---

### 3.4 MFG LAYER

| Requirement | Current State | Feasibility | Implementation Approach |
|---|---|---|---|
| **Editable:** Location Status, Power Availability, Existing Cabinet | ❌ No MFG layer at all | ✅ Easy | Add `mfg` to `LAYER_COLORS`, `LAYER_NAMES`, `DEMO_GEOJSON_FEATURES`, and `DEFAULT_LAYER_GROUPS` |
| **Geometry:** Relocate MFG, Capture GPS | ❌ | 🟡 Medium | Point drag + GPS capture button |
| **Photos Required:** 360°, Power Source, Road Access | ❌ | 🟡 Medium | Photo requirement system |

**Verdict:** The MFG layer doesn't exist yet but is trivial to add. ~80% in Phase 1.

---

### 3.5 TRENCH LAYER (Most Important)

| Requirement | Current State | Feasibility | Implementation Approach |
|---|---|---|---|
| **Construction Type:** 11 types (New Trench through Wall Route) | ✅ Already implemented in `survey/index.tsx` — `TRENCH_TYPES` constant with 11 types | ✅ Done | Already exists |
| **Surface Type:** Road/Footpath/Grass/Concrete/Private Land | 🟡 Partially — `surface_type` field in `TrenchSurveyData` but only free text | ✅ Easy | Convert to dropdown with 5 options |
| **Ownership:** Public/Private/Utility | ❌ Missing from schema | ✅ Easy | Add to `TrenchSurveyData` and form |
| **Crossings:** Road/Rail/River (boolean) | ✅ Already in `TrenchSurveyData` as booleans | ✅ Done | Already exists |
| **Blocked/Reuse Possible:** booleans | ❌ Missing | ✅ Easy | Add fields |
| **Estimated Depth/Width:** mm | ✅ Already as `depth_mm`, `width_mm` | ✅ Done | Already exists |
| **Geometry:** Move vertices, Split/Merge/Delete trench, Draw bypass | ❌ | 🔴 Complex | MapLibre GL Draw + Turf.js `@turf/line-split`, `@turf/line-chunk` |
| **Topology validation:** must remain connected | ❌ | 🔴 Complex | Requires network topology analysis |
| **Mandatory Photos:** Start/Middle/End/Crossing/Obstruction | ❌ | 🟡 Medium | Photo requirement system |

**Verdict:** Trench is the best-implemented layer (~50%). Remaining attributes are mostly adding fields to the existing form. Geometry editing and topology validation are the hardest parts.

---

### 3.6 DUCT LAYER

| Requirement | Current State | Feasibility | Implementation Approach |
|---|---|---|---|
| **Duct Type:** Single/Twin/Quad | ❌ No duct layer | ✅ Easy | Add to layer config, create `DUCT_SCHEMA` |
| **Existing/Reuse:** booleans | ❌ | ✅ Easy | Add fields |
| **Condition:** 5 options | ❌ | ✅ Easy | Dropdown |
| **Occupied/Spare Capacity:** 0/25/50/75/100% | ❌ | ✅ Easy | Dropdown |
| **Geometry:** Move/Split/Extend | ❌ | 🔴 Complex | Same as trench geometry |

**Verdict:** Layer creation + form is Phase 1 (~90% implementable). Geometry is Phase 3.

---

### 3.7 CABLE LAYER

| Requirement | Current State | Feasibility | Implementation Approach |
|---|---|---|---|
| **Cable Type:** Feeder/Distribution/Drop | ❌ No cable layer | ✅ Easy | Add to layer config |
| **Cable Size:** 12F/24F/48F/96F/144F | ❌ | ✅ Easy | Dropdown |
| **Slack Required/Length:** boolean + number | ❌ | ✅ Easy | Fields |
| **Protection:** Duct/Pole/Wall | ❌ | ✅ Easy | Dropdown |
| **Geometry:** Modify path | ❌ | 🟡 Medium | LineString vertex drag |
| **Validation:** Cable must terminate correctly | ❌ | 🔴 Complex | Topology check |

**Verdict:** ~85% in Phase 1. Termination validation is Phase 2.

---

### 3.8 Summary Table

| Layer | Form Fields | Dropdowns | Photos | GPS Validation | Geometry Edit | Overall |
|---|---|---|---|---|---|---|
| **Premises** | 🟡 60% | 🟡 50% | ❌ 0% | ❌ 0% | ❌ 0% | **40%** |
| **Polygons** | 🟡 50% | 🟡 30% | ❌ 0% | N/A | ❌ 0% | **25%** |
| **PDP** | 🟡 40% | 🟡 40% | ❌ 0% | ❌ 0% | ❌ 0% | **25%** |
| **MFG** | ❌ 0% | ❌ 0% | ❌ 0% | ❌ 0% | ❌ 0% | **0%** |
| **Trench** | ✅ 70% | ✅ 60% | ❌ 0% | N/A | ❌ 0% | **45%** |
| **Duct** | ❌ 0% | ❌ 0% | ❌ 0% | N/A | ❌ 0% | **0%** |
| **Cable** | ❌ 0% | ❌ 0% | ❌ 0% | N/A | ❌ 0% | **0%** |

---

## 4. Cross-Cutting Features Analysis

### 4.1 Risk Management

| Requirement | Current State | Feasibility |
|---|---|---|
| Risk Category (Traffic/Utilities/Environmental/Property/Safety/Permit) | ✅ `RISK_CATEGORIES` in `survey/index.tsx` — 16 categories | ✅ Done |
| Severity (Low/Medium/High/Critical) | ✅ `SEVERITY_LEVELS` — dropdown in form | ✅ Done |
| Likelihood (Rare/Possible/Likely/Certain) | ✅ `PROBABILITY_LEVELS` — dropdown | ✅ Done |
| Mitigation (free text) | ✅ Text input in form | ✅ Done |
| Status (Open/Closed/Accepted) | ✅ In `RiskAssessmentData` type + API | ✅ Done |
| Multiple risks per feature | ✅ `saveRisk()` is per-feature, can be called multiple times | ✅ Done |

**Verdict:** Risk management is **fully implemented** in the survey store and UI. ✅

---

### 4.2 Hazards

| Requirement | Current State | Feasibility |
|---|---|---|
| Hazard types (12 options) | ✅ `HAZARD_TYPES` — 12 pre-defined hazards | ✅ Done |
| Mitigation templates (12 options) | ✅ `MITIGATION_TEMPLATES` — dropdown | ✅ Done |
| Notes (free text) | ✅ Text input | ✅ Done |
| Multiple hazards per feature | ✅ Supported | ✅ Done |

**Verdict:** Hazard recording is **fully implemented**. ✅

---

### 4.3 Field Evidence

| Requirement | Current State | Feasibility |
|---|---|---|
| Unlimited Photos | 🟡 `useImageStore` exists with `addPhoto()`, `uploadPhoto()` — but limited to feature photo, not general evidence | 🟡 Medium |
| Videos | ❌ Not supported | 🟡 Medium — requires `expo-camera` video mode |
| Voice Notes | ❌ Not supported | 🟡 Medium — requires `expo-av` |
| PDF Attachments | ❌ Not supported | 🟡 Medium — requires `expo-document-picker` |
| Sketches | ❌ Not supported | 🔴 Complex — requires canvas component |
| Measurements | 🟡 Generic `field_measurements` exists | ✅ Easy |
| Engineer Notes | ✅ `notes` field in `TrenchSurveyData` + `comparison_notes` in `Feature` | ✅ Done |
| GPS Track | ✅ `GPSTrace` system fully implemented | ✅ Done |
| Timestamp | ✅ Auto-captured | ✅ Done |
| Weather | ✅ `weather` field in `FieldEvidenceData` | ✅ Done |

**Verdict:** Core evidence (notes, measurements, GPS, timestamp, weather) is done. Photo upload is partially done. Video, voice, PDF, and sketches need new `expo-*` package integrations (Phase 2–3).

---

### 4.4 Quality Assurance (Survey Status)

| Requirement | Current State | Feasibility |
|---|---|---|
| Status flow: Not Started → Visited → Verified → Modified → Needs Review → Rejected → Approved → Completed | ✅ `SURVEY_STATUS_FLOW` in `survey/index.tsx` — all 8 statuses | ✅ Done |
| Reviewer / Approval Date / Review Comments | 🟡 In `SurveyStatusData` type has `notes`, but no `reviewer`/`approval_date` fields | ✅ Easy — add fields to type + API |
| Status update UI | ✅ `handleUpdateStatus()` in survey editor | ✅ Done |

**Verdict:** QA status flow is **implemented** (90%). Reviewer tracking is a small addition.

---

### 4.5 Change History (Version Control)

| Requirement | Current State | Feasibility |
|---|---|---|
| Feature ID, Changed Field, Old/New Value, Engineer, Timestamp, GPS Location, Reason | ✅ `SurveyChangeData` type has all these fields | ✅ Done |
| API for creating/listing changes | ✅ `surveyApi.createSurveyChange()` + `listSurveyChanges()` | ✅ Done |
| Auto-capture on every edit | ❌ Currently manual — only via `saveChange()` | 🟡 Medium — needs middleware/hook wrapping all edit operations |

**Verdict:** The data model and API are **100% ready**. The automatic change capture (wrapping every edit) is the remaining piece.

---

### 4.6 Audit Fields (Created By, Modified By, etc.)

| Requirement | Current State | Feasibility |
|---|---|---|
| Created By / Modified By / Created Date / Modified Date | ✅ All Django models auto-handle these | ✅ Done (backend) |
| GPS Accuracy / Device ID / Survey Version | ❌ Not captured on frontend | ✅ Easy — `expo-device` + `expo-location` |

**Verdict:** Backend handles it. Frontend missing GPS accuracy and device ID capture — trivial addition.

---

## 5. Drag-and-Drop / Geometry Editing Analysis

### 5.1 Current State

The app has **zero geometry editing capability**. Features are rendered as read-only shapes. When a user taps a feature, they get a popup with info, but cannot move, reshape, split, merge, or delete any geometry.

### 5.2 What's Needed

For **point features** (Premises, PDP, MFG):
- Drag to new location
- Auto-update coordinates in GeoJSON
- Trigger property recalculations (e.g., distance to nearest PDP)

For **line features** (Trenches, Ducts, Cables):
- Drag individual vertices
- Add/delete vertices
- Split a line into two segments
- Merge two connected lines
- Draw a bypass (new segment between two points)

For **polygon features** (Service Areas):
- Drag boundary vertices
- Split polygon
- Merge adjacent polygons
- Add/delete polygons

### 5.3 Technical Approach

**Option A: MapLibre GL Draw** (Recommended for Web)
- Library: `@mapbox/mapbox-gl-draw` (works with MapLibre)
- Provides: drawing tools, vertex editing, selection, snapping
- Limitation: Only works on web platform, NOT on React Native

**Option B: Custom Gesture Handler** (Required for Mobile)
- Library: `react-native-gesture-handler` + `react-native-reanimated`
- Approach: Overlay draggable markers for points, vertex circles for lines
- Much more work but works on both platforms

**Option C: Hybrid** (Recommended)
- Use MapLibre GL Draw on web
- Use custom gesture-based editing on native
- Abstract behind a `<GeometryEditor>` component

### 5.4 Property Recalculation on Drag

When a feature's geometry changes, dependent properties must auto-update:
- Trench length → recalculate `length_m`
- Premise moved → check distance to PDP, auto-assign
- Polygon boundary moved → recalculate `area_sqm`, `homes_passed`

This requires:
1. Turf.js for spatial calculations (`@turf/length`, `@turf/area`, `@turf/distance`, `@turf/boolean-point-in-polygon`)
2. A `recalculateProperties(featureId, newGeometry)` function
3. Trigger on drag-end event

### 5.5 Verdict

| Feature | Complexity | Timeline |
|---|---|---|
| Point drag (Premises, PDP, MFG) | 🟡 Medium | Phase 2 (2-3 weeks) |
| Line vertex edit (Trenches, Ducts, Cables) | 🔴 Hard | Phase 3 (4-6 weeks) |
| Polygon boundary edit | 🔴 Hard | Phase 3 (4-6 weeks) |
| Split/Merge operations | 🔴 Hard | Phase 3+ (6-8 weeks) |
| Auto-recalculate properties on drag | 🟡 Medium | Phase 2-3 |

**Recommendation:** Start with point drag in Phase 2. It's the most impactful (engineers often need to correct premise locations) and the least complex.

---

## 6. Offline & Sync Analysis

### 6.1 Current State

| Component | Status |
|---|---|
| `useOfflineStore` | Exists with `isOnline`, `pendingSyncCount`, `isSyncing` |
| Connectivity detection | 🟡 Uses `connectivitySource: 'demo'` — real NetInfo was started but not completed |
| Sync queue | ✅ `BackendSyncQueueItem` type + `surveyApi.pushToSyncQueue()` + `processSyncQueue()` |
| Offline edits | 🟡 Demo mode saves locally but doesn't use the sync queue for replay |

### 6.2 What's Missing

1. **Real NetInfo integration:** Replace `connectivitySource: 'demo'` with `@react-native-community/netinfo`
2. **Offline-first write pattern:** All edits → local SQLite (or AsyncStorage) → sync queue → server when online
3. **Conflict resolution:** If two engineers edit the same feature offline, need merge strategy
4. **Background sync:** Periodic sync when app is backgrounded

### 6.3 Recommendation

Use **WatermelonDB** or **expo-sqlite** for local persistence:
- Every edit writes to local DB first
- A sync worker reads from local DB and pushes to server
- On successful push, mark as synced
- On conflict, flag for manual review

---

## 7. Implementation Roadmap

### Phase 1: Layer Data Dictionaries & Forms (Now — 2 weeks)

**Goal:** Every layer has a complete, typed form with dropdowns, read-only fields, and mandatory markers.

| Task | Effort |
|---|---|
| Define `PremiseFormData`, `PolygonFormData`, `PDPFormData`, `MFGFormData`, `TrenchFormData` (extended), `DuctFormData`, `CableFormData` TypeScript interfaces | 1 day |
| Create `PREMISE_SCHEMA`, `POLYGON_SCHEMA`, `PDP_SCHEMA`, `MFG_SCHEMA`, `DUCT_SCHEMA`, `CABLE_SCHEMA` in `demo-data.ts` | 2 days |
| Build `<LayerEditor>` component that renders the correct form based on `layer_name` | 2 days |
| Add MFG, Duct, Cable layers to `LAYER_COLORS`, `LAYER_NAMES`, `DEFAULT_LAYER_GROUPS`, demo data | 1 day |
| Wire map-tap → popup "Open Details" → `<LayerEditor>` with correct schema | 1 day |
| Add photo requirement system (`requiredPhotos: string[]` + validation) | 2 days |
| Add reviewer/approval_date to `SurveyStatusData` | 0.5 day |
| Auto-capture change history on every edit (middleware wrapper) | 1 day |

### Phase 2: Point Geometry Editing & GPS Validation (3-4 weeks)

| Task | Effort |
|---|---|
| Implement point drag for Premises, PDP, MFG (custom gesture handler) | 2 weeks |
| Auto-recalculate properties on drag-end (Turf.js) | 3 days |
| GPS validation for premises (within 3m) | 2 days |
| Real NetInfo integration | 1 day |
| Capture GPS accuracy + device ID on every edit | 1 day |
| Local SQLite persistence for offline edits | 3 days |

### Phase 3: Line/Polygon Geometry Editing (6-8 weeks)

| Task | Effort |
|---|---|
| Line vertex editing (MapLibre GL Draw on web + custom on native) | 3 weeks |
| Split/Merge/Extend operations (Turf.js) | 2 weeks |
| Bypass drawing (new line segment) | 1 week |
| Polygon boundary editing | 2 weeks |
| Topology validation (connectedness checks) | 1 week |
| Video/Voice/PDF/Sketch evidence capture | 2 weeks |

---

## 8. Technical Recommendations

### 8.1 New Dependencies Needed

| Package | Purpose | Phase |
|---|---|---|
| `@turf/turf` | Spatial calculations (length, area, distance, point-in-polygon, line-split) | Phase 2 |
| `@mapbox/mapbox-gl-draw` | Web geometry editing tools | Phase 3 |
| `react-native-gesture-handler` (already have?) | Drag gestures for mobile geometry editing | Phase 2 |
| `@react-native-community/netinfo` | Real connectivity detection | Phase 2 |
| `expo-sqlite` or `@nozbe/watermelondb` | Local offline persistence | Phase 2 |
| `expo-device` | Device ID capture | Phase 2 |
| `expo-av` | Voice note recording | Phase 3 |
| `expo-document-picker` | PDF attachment upload | Phase 3 |

### 8.2 Architecture Improvements

1. **Unified schema system:** Replace generic `FieldSchemaField[]` with a layer-aware system:
   ```typescript
   interface LayerSchema {
     layerName: string;
     readOnlyFields: string[];
     editableFields: EditableField[];
     requiredPhotos: string[];
     gpsValidation?: { maxDistanceM: number };
     geometryPermissions: GeometryPermission[];
     dropdowns: Record<string, DropdownOption[]>;
   }
   ```

2. **Edit middleware:** Wrap all `save*()` calls in `survey.ts` with automatic change logging:
   ```typescript
   async function withChangeLog<T>(
     featureId: string,
     fieldName: string,
     oldValue: unknown,
     newValue: unknown,
     saveFn: () => Promise<T>
   ): Promise<T> {
     const result = await saveFn();
     await saveChange({ feature: featureId, field_name: fieldName, old_value: oldValue, new_value: newValue, reason: 'User edit' });
     return result;
   }
   ```

3. **Offline-first write pattern:**
   ```
   User edits → Local SQLite → Sync queue → (when online) → Server
   ```

4. **Feature-level versioning:** Add `version: number` to every feature. Increment on each edit. Server rejects stale versions.

---

## 9. Summary: What Can Be Implemented NOW

### ✅ Can Be Implemented Immediately (Phase 1 — No new dependencies needed)

| # | Feature | Effort |
|---|---|---|
| 1 | Complete layer schemas with all dropdowns for all 7 layers (Premises, Polygons, PDP, MFG, Trench, Duct, Cable) | ~3 days |
| 2 | Read-only vs editable field distinction in UI | ~1 day |
| 3 | Layer-specific forms (dynamic based on `layer_name`) | ~2 days |
| 4 | Photo requirement system (mark required photos, validate before submit) | ~2 days |
| 5 | Add missing MFG, Duct, Cable layers to map/config | ~1 day |
| 6 | Auto-capture change history on every edit | ~1 day |
| 7 | Add `reviewer` and `approval_date` to `SurveyStatusData` | ~0.5 day |
| 8 | Wire map-tap popup → "Open Details" → correct layer editor | ~1 day |
| 9 | Surface type dropdown, ownership dropdown for Trench | ~0.5 day |
| 10 | GPS accuracy + device ID capture on edits | ~1 day |

### 🟡 Can Be Implemented in Phase 2 (Needs new packages)

| # | Feature |
|---|---|
| 11 | Point drag (Premises, PDP, MFG) |
| 12 | GPS validation (within 3m of building) |
| 13 | Auto-recalculate length/area on geometry change |
| 14 | Real NetInfo connectivity detection |
| 15 | Local SQLite persistence for offline edits |

### 🔴 Phase 3 (Complex — significant effort)

| # | Feature |
|---|---|
| 16 | Line vertex editing (Trenches, Ducts, Cables) |
| 17 | Split/Merge/Extend operations |
| 18 | Bypass drawing |
| 19 | Polygon boundary editing |
| 20 | Topology validation |
| 21 | Video, voice, PDF, sketch evidence |

---

## 10. Conclusion

The codebase has an excellent foundation. The map, layer management, import flow, and survey modules are all working. The gap is in:

1. **Layer-specific data dictionaries** — currently everything is generic
2. **Geometry editing** — completely absent; the most requested feature ("drag and drop")
3. **Photo/evidence requirements** — no structured validation
4. **Offline persistence** — demo toggle only

**Recommended first action:** Implement Phase 1 (layer schemas + forms). This gives engineers rich, layer-specific editing forms immediately. Then tackle point dragging in Phase 2 for the highest-impact geometry editing.

---

*Report prepared for the FTTH Survey App development team.*
