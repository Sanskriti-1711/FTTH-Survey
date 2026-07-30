# Fiber360 Mobile – Full Functional Code Scan & Architecture Report

> **Generated:** July 24, 2026  
> **Last Updated:** July 30, 2026 — Phases 1-3 + Move Mode + Delete Section
> **Scope:** Complete audit of `fibre-mobile/` — the React Native (Expo) field-survey frontend  
> **Stack:** React Native 0.86 / Expo SDK 57 / TypeScript 6.0 / Zustand 5 / MapLibre GL

---

## 1. Product Overview

**Fiber360 Mobile** is a React Native application for FTTH (Fiber-to-the-Home) field engineers. It allows surveyors to:

- Log in and manage their assigned projects
- Import survey packages (ZIP/GeoPackage) from the backend
- View project layers on an interactive MapLibre map
- Inspect individual features (premises, trenches, PDPs, service areas) and complete dynamic survey forms
- Capture field photos linked to features
- Record GPS traces for tracking field movements
- Classify trenches, assess risks, register hazards, and log field evidence
- Push survey data and photos back to the backend synchronously
- **Edit features contextually** — tap a feature → popup → Edit → contextual toolbar with only relevant tools
- **Add new points** with a dedicated FAB → fill in all survey fields in a comprehensive form
- **Move line vertices** — select a line, enter Move Mode, drag individual vertex handles, save as survey edit
- **Delete line sections** — select start/end vertices on a line, remove the section between them, remaining geometry saved as survey feature
- **Separate HLD from Survey edits** — original HLD features (blue, read-only) are never modified; engineer edits create separate Survey Features (orange, editable) that reference the original

The app ships with a **demo mode** that provides full functionality without a backend.

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | React Native (Expo) | 0.86.0 / SDK 57 |
| Language | TypeScript | 6.0 |
| Routing | `expo-router` (file-based) | 4.x |
| State Management | Zustand | 5.x |
| Icons | `lucide-react-native` | 1.25 |
| Map | `@maplibre/maplibre-react-native` + CDN MapLibre GL (web) | 11.0 / 4.7.1 |
| HTTP Client | Native `fetch` + custom `apiFetch` wrapper | — |
| Secure Storage | `expo-secure-store` | — |
| Image Picker | `expo-image-picker` | — |
| Document Picker | `expo-document-picker` | — |
| Location | `expo-location` | — |
| Zip Parser | `jszip` (client-side in browser) | 3.10 |
| Proj4 | Coordinate transforms | 2.12 |
| Reanimated / Gestures | `react-native-reanimated` + `react-native-gesture-handler` | 4.5 / 2.32 |
| SVG | `react-native-svg` | 15.15 |
| MMKV | Fast key-value store | 3.2 |
| NetInfo | Network detection | 12.0 |

---

## 3. Application Routing (expo-router)

```
Root (_layout.tsx)
├── Loading: blue splash screen (5s timeout safety)
├── (auth)/
│   └── login.tsx          # Sign in, Register, Demo mode
├── (tabs)/
│   ├── home.tsx            # Dashboard
│   ├── survey/_layout.tsx  # Survey stack
│   │   └── index.tsx       # Survey list + feature detail with 5 survey modules
│   ├── map.tsx             # Interactive map + list view + FABs + contextual editing
│   ├── camera.tsx          # Photo capture & gallery
│   ├── gps.tsx             # GPS tracker with trace recording
│   ├── offline.tsx         # Offline storage management
│   ├── sync.tsx            # Upload queue management
│   └── profile.tsx         # User profile, theme, sync, logout
├── feature/[featureId].tsx  # Standalone feature detail form
├── project/[projectId].tsx  # Project detail with layers
├── project/import.tsx       # GeoPackage/ZIP import wizard
├── gallery.tsx              # Global photo gallery
├── gallery/[featureId].tsx  # Feature-specific photos
└── export.tsx               # Export survey data
```

---

## 4. Screen-by-Screen Functional Breakdown

### 4.1 Authentication — `app/(auth)/login.tsx`

| Feature | Details |
|---------|---------|
| **Sign In** | Email + password; validates email format; stores JWT via `expo-secure-store`; calls `POST /api/users/login/` |
| **Register** | Email + password + full name; auto-logs in after success; calls `POST /api/users/` |
| **Demo Mode** | Sets a mock user in Zustand; bypasses all API calls; routes directly to tabs |
| **Session Restore** | On app launch, `RootLayout` calls `restoreSession()` which loads stored token and validates via refresh endpoint (3s timeout fallback) |
| **Logout** | Clears tokens and resets Zustand stores |
| **UX** | Logo, tagline, animated inputs; toast notifications for errors |

### 4.2 Home Dashboard — `app/(tabs)/home.tsx`

| Feature | Details |
|---------|---------|
| **Header** | Greeting (time-based), user name, demo badge, notification bell icon |
| **Quick Stats** | Active jobs, completed, pending (3 `StatCard`s) |
| **Quick Actions** | Survey, Photo, Map — large touch targets |
| **Quick Import** | Card with "Select File to Import" button linking to `/project/import` |
| **Active Assignments** | Up to 5 assignment cards with project name, scope, feature count, status badge, progress bar, assigned date, and tap navigation |
| **Pull-to-Refresh** | Refreshes assignments, projects, and demo layers |

### 4.3 Survey Editor — `app/(tabs)/survey/index.tsx`

The most feature-rich screen. Has two views: **List** and **Detail**.

#### List View
| Feature | Details |
|---------|---------|
| **Search** | Filter features by layer name, properties, or ID |
| **Layer Filter Chips** | Horizontal scrollable chip list: "All Layers" + per-layer chips |
| **Stats Bar** | Total features, done count, pending count |
| **Feature List** | Color-coded layer dots, ID, coordinates, key properties, status badge; left border color by status |
| **Pull-to-Refresh** | Reloads demo/API data |

#### Detail View — 5 Survey Modules
| Module | Inputs | API Store Actions |
|--------|--------|------------------|
| **🏗️ Trench Classification** | Trench type grid (11 types), depth/width (mm), surface type chips, crossing toggles (road/footpath/rail/river), property toggles (private/traffic/permit), notes | `saveTrenchSurvey()` |
| **⚠️ Risk Assessment** | Category grid (16 categories + custom), severity (4 levels), probability (4 levels), mitigation text, notes | `saveRisk()` |
| **🚧 Hazards** | Hazard type grid (11 hazards), mitigation template grid (12 templates), notes | `saveHazard()` |
| **📸 Field Evidence** | Evidence type quick-add (Photo/Measure/Note), description, weather chips (5 conditions) | `saveEvidence()` |
| **📋 Survey Status** | 8-step status flow progress indicator (not_started → completed), field notes, status action buttons | `updateStatus()` |
| **Sticky Bottom Bar** | Save Draft / Flag / Submit — always visible at bottom of scroll | |

**State:** All modules managed via local `useState` in the component; saved via `useSurveyStore` API calls (with demo mode fallback).

### 4.4 Map — `app/(tabs)/map.tsx`

| Feature | Details |
|---------|---------|
| **MapLibre GL** | Full-screen interactive map loaded via CDN (web only; native uses `@maplibre/maplibre-react-native`). Centers on Oakwood Estate demo area |
| **Dual View** | Toggle between map and list view via header buttons |
| **Layer Rendering** | Point (circles), LineString (lines), Polygon (fills + outlines) — color-coded per layer type |
| **HLD/Survey Dual Rendering** | HLD features render in **blue** (read-only), Survey features in **orange** (editable). Display mode toggle cycles: HLD only → Survey only → Overlay (both) |
| **Basemap Switcher** | FAB opens panel with 3 presets: Streets (OpenFreeMap), Satellite (ESRI), Light (MapLibre demo) |
| **Layer Panel** | FAB opens list of all layers with visibility toggles (eye/eye-off) |
| **Feature Interaction** | Tap feature on map → popup with name, layer, status, "Open Details" + **Edit** button |
| **Contextual Editing** | Tap Edit → contextual toolbar appears showing only tools relevant to the feature's geometry type (Point: Drag+Delete+Done; **Line: Move+Save+Del Section+placeholder**; Polygon: Delete+placeholder). Tap Done to exit editing. |
| **Add Point FAB** | Dedicated 📍 FAB toggles Add Point mode → tap map to create new point → SurveyForm slides up with all editable fields |
| **Undo FAB** | Always visible ↩️ button with count badge — undo any survey edit (drag, vertex move, property change, point creation) |
| **Line Move Mode** | Select a line → toolbar → **Move** button → vertex handles appear on the line → drag individual vertices → orange preview line updates in real-time → **Save** persists via `upsertSurveyFeature`/`updateSurveyFeature` as a `modified` survey edit. Undo supported via `pushUndo` with `surveyUndo` entries. Works on ALL LineString layers: trenches, ducts, cables, feeder_trench, distribution_trench, garden_trench, final_trenches, feeder_ducts, distribution_ducts, feeder_cable, distribution_cable (and all `imp-` prefixed imported variants). **HLD geometry is never touched.** |
| **Delete Section** | Select a line → toolbar → **Del Section** button (🪓) → tap the line near a vertex (clicks snap to nearest vertex within ~50m threshold) → tap near a second vertex → **Confirm** button appears → removes the section between the two vertices → remaining geometry saved as a survey feature via `upsertSurveyFeature`/`updateSurveyFeature`. Uses click-to-snap approach on the existing feature click handler — **no MapLibreMap changes**, avoiding map breakage. Step indicator in toolbar ("select end" → "confirm"). Confirm button label changes to "Confirm" at step 2. HLD unchanged. Clean exit via ✕ or empty area click. |
| **Display Mode Toggle FAB** | Cycles 🔵 (HLD only) → 🟠 (Survey only) → 🔀 (Overlay both) |
| **List View** | Filter chips + FlatList of features with status badges, geometry type badges, key measurements, "Open Feature" button |
| **Imported Data Merge** | Merges demo data + imported GeoJSON features (prefixed with `imp-`) with distinct colors (red/orange/pink/teal) |
| **Follow User** | FAB to toggle user location following |
| **GPS Location** | User location displayed as an optional tracked point (from `expo-location`) |

### 4.5 Camera — `app/(tabs)/camera.tsx`

| Feature | Details |
|---------|---------|
| **Capture** | `expo-image-picker` camera launch |
| **Gallery Pick** | Image library picker |
| **Photo Grid** | 3-column grid of thumbnails with upload status overlays (check/X/uploading) |
| **Preview** | Full-screen photo preview with delete action |
| **Status Badges** | Header shows counts: pending, failed, uploaded |
| **Capture Bar** | Gallery button + large shutter button + Upload button at bottom |

### 4.6 GPS Tracker — `app/(tabs)/gps.tsx`

| Feature | Details |
|---------|---------|
| **Location Permission** | Requests foreground location on mount |
| **Live Coordinates** | Shows latitude, longitude, accuracy (±m), altitude, timestamp |
| **Accuracy Color** | ≤5m green, ≤15m yellow, >15m red |
| **Trace Recording** | Start/Pause/Resume/Stop with 2s interval, 3m distance threshold |
| **Stats** | Points captured, total distance (Haversine km), status (Active/Paused/Idle) |
| **Trace Log** | Shows last 10 points with coordinates, accuracy, timestamp, highlight for latest |

### 4.7 Offline Storage — `app/(tabs)/offline.tsx`

| Feature | Details |
|---------|---------|
| **Network Status** | Toggle online/offline simulation; banner shows connection state |
| **Storage Stats** | Estimated MB on device, pending sync count, failed count |
| **Sync Queue** | Lists pending photos with filename, timestamp, linked feature, upload status |
| **Cached Projects** | Shows locally cached projects with region and status |
| **Last Sync** | Timestamp display |

### 4.8 Sync — `app/(tabs)/sync.tsx`

| Feature | Details |
|---------|---------|
| **Stats** | Pending count, synced count, failed count |
| **Progress Bar** | Overall sync progress |
| **Upload Queue** | Lists all sync items (photos + project data) with status icons, size, type, mini progress bar for in-progress |
| **Sync Controls** | "Sync All Now" button, "Retry Failed" button |
| **Bandwidth Info** | Upload (MB pending) / Download (projects cached) |

### 4.9 Profile — `app/(tabs)/profile.tsx`

| Feature | Details |
|---------|---------|
| **User Card** | Avatar, name, email, role badge |
| **Sync Status** | Online/offline indicator, last sync time, pending count, "Sync Now" button |
| **Settings** | Theme toggle (light/dark), Privacy, Help & Support |
| **Sign Out** | Confirmation alert → clears token and redirects to login |
| **Version** | v1.0.0 |

### 4.10 Feature Detail (Standalone) — `app/feature/[featureId].tsx`

| Feature | Details |
|---------|---------|
| **Data Loading** | API or demo mode (feature ID prefix `demo-`) |
| **Header** | Layer name + status badge + back button |
| **GPS Bar** | Shows feature coordinates from GeoJSON |
| **Reference Properties** | Read-only card showing all `properties` key-value pairs |
| **Dynamic Form** | Renders `field_schema` fields: text, number, select (chips), boolean (toggle), readonly, textarea |
| **Notes** | Multiline text input for comparison notes |
| **Photos** | "Add Photo" button linking to camera; shows if photo exists |
| **Sticky Bottom Bar** | Save Draft / Flag / Submit (with confirmation alert) |

### 4.11 Project Detail — `app/project/[projectId].tsx`

| Feature | Details |
|---------|---------|
| **Header** | Project name, region, status badge |
| **Overall Progress** | Approved/total features with progress bar |
| **Quick Actions** | "View on Map" and "Survey Tab" buttons |
| **Layers List** | Each layer shows name, feature count, per-layer progress bar, status breakdown (done/pending/redo) |

### 4.12 Project Import — `app/project/import.tsx`

| Feature | Details |
|---------|---------|
| **File Picker** | `expo-document-picker` for ZIP/GeoPackage files |
| **Upload Area** | Dashed border drop zone; shows file name and size when selected |
| **Import Progress** | Animated progress bar through stages: uploading, discovering, importing, done |
| **Guidelines** | Info card with import instructions |
| **Bottom Action** | "Import Package" button → triggers store's `importSurveyPackage()` |
| **Demo Fallback** | If no file selected or parse fails, imports `IMPORT_GEOJSON_FEATURES` (Riverside dataset) |

### 4.13 Gallery — `app/gallery.tsx` & `app/gallery/[featureId].tsx`

| Feature | Details |
|---------|---------|
| **Global Gallery** | All photos across all projects |
| **Feature Gallery** | Filtered to a specific feature |
| **Header** | Title + camera icon link |
| **Grid** | 3-column photo grid |

### 4.14 Export — `app/export.tsx`

| Feature | Details |
|---------|---------|
| **Survey Data** | Shows completed, pending, and flagged feature counts |
| **Export Options** | "Export Survey Data" button (generates JSON), "Share Report" button |
| **Progress** | Export progress animation |

---

## 5. State Management — Zustand Stores

### 5.1 Auth Store — `lib/stores/auth.ts`
| Slice | Details |
|-------|---------|
| `user` | Current user or null |
| `token` | JWT access token |
| `isLoading` | Login/register loading state |
| `isRestoring` | Session restore in progress (controls splash) |
| `demoMode` | When true, bypasses all API calls |
| Actions | `login()`, `register()`, `logout()`, `restoreSession()`, `setDemoMode()`, `clearError()` |

### 5.2 Project Store — `lib/stores/project.ts`
| Slice | Details |
|-------|---------|
| `projects` | All projects fetched from API or demo |
| `activeProject` | Currently selected/imported project |
| `assignments` | Assignment jobs for the engineer |
| `stats` | Aggregate assignment statistics |
| `projectGeojsons` | GeoJSON features keyed by layer ID (for imported data) |
| `projectLayers` | Layer metadata for the imported project |
| Actions | `fetchProjects()`, `fetchAssignments()`, `setActiveProject()`, `importSurveyPackage()`, `addDemoProject()`, `setProjectGeojsons()`, `syncFeatureEdit()` |

### 5.3 Survey Store — `lib/stores/survey.ts`
The largest store. Manages:
| Slice | Details |
|-------|---------|
| `layers` | Project layers |
| `features` | Features grouped by layer ID |
| `selectedFeature` | Currently viewed feature |
| `gpsTraces` | GPS trace records |
| `trenchSurveys` | Trench classification records |
| `assets` | Existing asset records |
| `riskAssessments` | Risk assessment records |
| `hazards` | Hazard records |
| `evidence` | Field evidence records |
| `changes` | Survey change log |
| `statuses` | Survey status records |
| `syncQueue` | Backend sync queue items |
| `surveyPointGeometries` | Tracks point move history: compositeKey → { hldCoords (original HLD), surveyCoords (current), layerId } |
| Actions | 30+ actions: `fetchLayers()`, `fetchLayerFeatures()`, `fetchFeatureDetail()`, `updateFieldMeasurements()`, `submitFeatures()`, `recordPointMove()`, plus CRUD for GPS, trenches, assets, risks, hazards, evidence, changes, statuses, sync queue |

### 5.3a Survey Features Store — `lib/stores/survey-features.ts` *(NEW — Phase 2)*
Manages HLD/Survey separation — the core of the architecture refactor.
| Slice | Details |
|-------|---------|
| `surveyFeatures` | SurveyFeatureData[] keyed by layer_id — engineer edits stored separately from HLD |
| `displayMode` | `'hld'` \| `'survey'` \| `'overlay'` — controls which layers render on the map |
| `isLoaded` | Whether survey features have been fetched for the active project |
| Actions | `fetchSurveyFeatures(projectId)`, `upsertSurveyFeature(hldFeatureId, ...)`, `updateSurveyFeature(id, ...)`, `deleteSurveyFeature(id, ...)`, `setDisplayMode(mode)`, `clearSurveyFeatures()`, `surveyFeaturesToGeoJSON(layerId)`, `getSurveyFeatureForHld(hldFeatureId)` |
| **Color Scheme** | `SURVEY_COLOR = '#FF8C00'` (orange) for survey features; `HLD_COLOR_OVERRIDE = '#2563EB'` (blue) for HLD in overlay mode |

**Architecture (Git-like model):**
```
HLD (Blue)      = Original branch  → read-only, never modified by engineer
Survey (Orange)  = Working branch   → engineer edits stored separately
Planner          = Merge request    → future: compare HLD vs Survey for approval
```

### 5.4 Map Store — `lib/stores/map.ts`
| Slice | Details |
|-------|---------|
| `layers` | Map layer visibility & metadata |
| `selectedFeatureId` | Currently selected feature on the map |
| `selectedFeaturePopup` | Popup data for the bottom sheet |
| `userLocation` | Current GPS coordinates |
| `followUser` | Whether map follows user location |
| Actions | `setLayers()`, `toggleLayer()`, `selectFeature()`, `setUserLocation()`, `setFollowUser()`, `loadDemoLayers()` |

### 5.5 Image Store — `lib/stores/image.ts`
| Slice | Details |
|-------|---------|
| `pendingPhotos` | Array of photos with upload status |
| `uploading` | Whether a photo is currently uploading |
| Actions | `addPhoto()`, `removePhoto()`, `uploadPhoto()`, `retryFailed()`, `clearUploaded()` |

### 5.6 Offline Store — `lib/stores/offline.ts`
| Slice | Details |
|-------|---------|
| `isOnline` | Simulated connection status |
| `pendingSyncCount` | Number of items awaiting sync |
| `lastSyncAt` | Timestamp of last sync |
| `isSyncing` | Whether sync is in progress |
| Actions | `setOnline()`, `setPendingCount()`, `incrementPending()`, `decrementPending()`, `setSyncing()`, `setLastSync()` |

### 5.7 Theme Store — `lib/stores/theme.ts`
| Slice | Details |
|-------|---------|
| `mode` | 'light' \| 'dark' \| 'system' |
| `resolved` | 'light' \| 'dark' |
| `colors` | Full `ThemeColors` object |
| Actions | `setMode()`, `toggleTheme()` |

### 5.8 Demo Data — `lib/stores/demo-data.ts`
Provides comprehensive mock data for all features:
- 3 demo projects (Oakwood Estate, Riverside Business Park, Greenfield Village)
- 12+ sample features across 4 layers (PREMISES, SERVICE_AREAS, PDP, TRENCH)
- 4 demo GeoJSON layers with realistic coordinates (London area)
- `IMPORT_GEOJSON_FEATURES` — a second dataset ~300m southeast for visual distinction
- 4 demo assignments with different scope (project/layer/feature)
- Engineer stats with daily breakdown
- Engineer activity log
- `parseZipToGeojsons()` — client-side ZIP parser using `jszip` for browser
- `simulateImport()` — creates a new shifted dataset on each import call
- `shiftFeatures()` — utility to offset all coordinates for unique visuals

---

## 6. API Layer — `lib/api/`

### 6.1 API Client — `lib/api/client.ts`
| Function | Details |
|----------|---------|
| `apiFetch<T>()` | Generic fetch wrapper with JWT Bearer auth, auto-refresh on 401, error handling |
| `saveTokens()` | Persists access + refresh tokens to `expo-secure-store` |
| `clearTokens()` | Removes all stored tokens |
| `loadStoredToken()` | Loads access token from secure store |
| `refreshAccessToken()` | Calls `POST /api/users/token/refresh/` to rotate the token |

### 6.2 Auth API — `lib/api/auth.ts`
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/users/login/` | POST | Email/password login → returns `LoginResponse` |
| `/api/users/` | POST | Register new user |
| `/api/users/engineers/` | GET | List engineers (admin) |
| `/api/users/{id}/` | DELETE | Remove user (admin) |
| `/api/users/token/refresh/` | POST | Refresh JWT token |

### 6.3 Projects API — `lib/api/projects.ts`
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/` | GET/POST | List all / create project |
| `/api/projects/latest/` | GET | Latest projects |
| `/api/projects/{id}/` | GET | Single project detail |
| `/api/projects/{id}/layers/` | GET | Layers for a project |
| `/api/projects/{id}/layers/{layerId}/` | GET | Layer detail + features |
| `/api/projects/{id}/features/{featureId}/` | GET | Feature + GeoJSON detail |
| `/api/projects/{id}/import/upload/` | POST | Upload GeoPackage file |
| `/api/projects/{id}/import/discover/` | POST | Discover layers in uploaded package |
| `/api/projects/{id}/import/import/` | POST | Execute import |
| `/api/projects/{id}/import/status/` | POST | Check import progress |
| `/api/projects/{id}/completion/` | GET | Project completion percentage |

### 6.4 Features API — `lib/api/features.ts`
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/features/{id}/field-measurements/` | PATCH | Save form data for a feature |
| `/api/features/submit/` | POST | Submit features for review |
| `/api/features/approve/` | POST | Approve features (reviewer) |
| `/api/features/reject/` | POST | Reject features with reason |
| `/api/features/{id}/upload-photo/` | POST | Upload photo (multipart) |

### 6.5 Assignments API — `lib/api/assignments.ts`
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/assignments/` | GET | List assignments with filters |
| `/api/assignments/jobs/` | GET | Engineer's jobs with pagination/search |
| `/api/assignments/summary/` | GET | Assignment summary counts |
| `/api/engineer/stats/` | GET | Engineer performance stats |
| `/api/engineer/activity/` | GET | Engineer activity log |

### 6.6 Survey API — `lib/api/survey.ts`
Comprehensive API client for the Django `survey` backend app:
| Endpoint Category | Endpoints | Purpose |
|-------------------|-----------|---------|
| **GPS Traces** | `/api/survey/gps-traces/` | List/create GPS traces |
| | `/api/survey/gps-traces/{id}/` | Get/update trace |
| | `/api/survey/gps-traces/{id}/points/` | Batch create GPS points |
| **Trenches** | `/api/survey/trenches/` | List/create trench surveys |
| **Assets** | `/api/survey/assets/` | List/create existing assets |
| **Risks** | `/api/survey/risks/` | List/create/update risk assessments |
| **Hazards** | `/api/survey/hazards/` | List/create hazards |
| **Evidence** | `/api/survey/evidence/` | List/create field evidence |
| **Changes** | `/api/survey/changes/` | List/create survey changes |
| **Status** | `/api/survey/status/` | Get/update survey status |
| **Sync** | `/api/survey/sync/` | List/push sync queue items |
| | `/api/survey/sync/process/` | Process pending sync items |
| **Survey Features** *(NEW)* | `/api/survey/survey-features/` | List/create survey features |
| | `/api/survey/survey-features/{id}/` | Get/update/delete survey feature |
| | `/api/survey/survey-features/upsert/` | Create-or-update by HLD feature reference |

All survey endpoints support pagination, date filtering, and various query parameters.

---

## 7. UI Component Library — `components/ui/`

| Component | File | Features |
|-----------|------|----------|
| **Button** | `Button.tsx` | 4 variants (primary/secondary/tertiary/danger), 3 sizes (sm/md/lg with 56dp min height), loading spinner, icon support, full-width by default |
| **Input** | `Input.tsx` | Label, error, hint, icon, password visibility toggle, focus ring animation |
| **Card** | `Card.tsx` | 3 variants (default/outlined/elevated), header with title+subtitle+headerRight |
| **StatCard** | `Card.tsx` | Inline stat display with value, title, subtitle, custom color |
| **Badge** | `Card.tsx` | Small/md pill badge with custom colors |
| **StatusBadge** | `StatusBadge.tsx` | Colored badge + dot based on status key; maps to `StatusColors` palette |
| **ProgressBar** | `StatusBadge.tsx` | Animated fill bar with optional percentage label, custom height |
| **EmptyState** | `EmptyState.tsx` | Icon, title, description, optional action slot |
| **ConnectionStatus** | `EmptyState.tsx` | Offline banner (not wired to store) |
| **Toast** | `Toast.tsx` | Animated slide-in notification; 4 types (success/error/warning/info); auto-dismiss |

### MapLibreMap — `lib/components/MapLibreMap.tsx`
A cross-platform component (web via CDN, native via `@maplibre/maplibre-react-native`):
- Dynamically loads CSS + JS from unpkg CDN (web)
- Renders vector layers (GeoJSON sources): circles for points, lines for LineStrings, fills+outlines for Polygons
- Feature click handler with empty-area click detection (for drawing)
- Point drag support with PanResponder (native) / mousedown+mousemove (web)
- Vertex drag support for LineString editing
- Hover cursor pointer on features
- Fly-to animation on selected feature
- Basemap style switching with 3 built-in basemaps
- Loading, error, timeout, and empty states

### GeometryEditor — `lib/components/GeometryEditor.tsx` *(Updated — Phase 1)*
Contextual editing toolbar that replaces the old multi-mode floating toolbar:
- **Two modes:** viewing (compact) and editing (contextual)
- **Editing mode** shows only tools relevant to the selected feature's geometry type:
  - Point: Drag toggle + Delete + Done
  - LineString: Delete + placeholder for Split/Merge/Draw/Vertices (custom rules coming)
  - Polygon: Delete + placeholder for Vertices (custom rules coming)
- Animated slide-in entrance with spring easing
- Exports `EditingFeature` interface and `GeometryMode` type

### MapFeaturePopup — `lib/components/MapFeaturePopup.tsx` *(Updated — Phase 1)*
Pin-anchored popup overlay for feature info:
- Shows feature name, layer name, status badge
- Read-only properties from layer schema (HLD reference data)
- Editable properties from layer schema (survey fields)
- **Edit button** (NEW) — triggers contextual editing mode via `onStartEdit` callback
- **featureGeometryType** prop (NEW) — passed to determine which tools to show

### SurveyForm — `lib/components/SurveyForm.tsx` *(NEW — Phase 3)*
A comprehensive survey form overlay that replaces NewPointForm. Combines all survey editing modules in one collapsible form:

| Section | What the Engineer Fills In |
|---------|---------------------------|
| **Survey Details** | Editable fields from layer schema (text, number, select, boolean, textarea) — pre-filled from feature properties |
| **Trench Classification** | 11 trench types (grid with icons), depth/width inputs, surface type chips (Asphalt/Concrete/Paving/Earth/Grass), 7 crossing toggles, notes |
| **Risk Assessment** | 16 risk categories, severity levels (low/medium/high/critical), probability levels (rare/possible/likely/certain), mitigation text, notes |
| **Hazards** | 11 hazard types, 12 mitigation templates, hazard notes |
| **Field Evidence** | Photo/Measure/Note buttons, observation description, weather chips (Sunny/Cloudy/Rain/Fog/Wind) |
| **Survey Status** | 7 status options (visited→verified→modified→needs_review→rejected→approved→completed), field notes, flag button |
| **Change History** | Recent survey changes display |

Key features:
- All sections are **collapsible** — only one open at a time, keeping the form compact
- **Animated slide-in** entrance with spring easing
- **Toast notifications** auto-dismiss after 2.5s
- **Pre-filled values** — editable fields populated from existing feature properties
- **Trench-aware** — Trench Classification section only shows for trench/line layers
- **NEW badge** — shows for newly added points vs editing existing features
- All saves go through `useSurveyStore` — trench/risk/hazard/evidence/status saved to backend

### NewPointForm — `lib/components/NewPointForm.tsx` *(Deprecated — replaced by SurveyForm)*
The original point creation form with editable fields only. Has been replaced by the more comprehensive SurveyForm which includes all survey sections. The file is kept for reference but is no longer imported by `map.tsx`.

### FeatureSurveySections — `lib/components/FeatureSurveySections.tsx`
Reusable component with all survey editing modules (trench, risk, hazard, evidence, status). Used by `feature/[featureId].tsx` detail screen. The patterns from this component were reused in the new SurveyForm.

### LayerEditor — `lib/components/LayerEditor.tsx`
Layer schema viewer showing read-only and editable fields for a selected layer, with field type rendering (text, number, select, boolean, textarea).

### LineSelectionToolbar — `lib/components/LineSelectionToolbar.tsx` *(Updated — July 2026)*
Bottom toolbar that appears when a line feature is selected on the map:
- **Active actions:** Move (toggles vertex drag mode with orange preview line), **Del Section** (enabled — enters vertex selection mode for section removal), Save (persists temporary geometry to survey-features store)
- **Placeholder actions:** Split, Draw Alt, Change Type, Delete Feature, Continue (disabled, labeled "Soon")
- **Undo** button with count badge
- Orange highlight border when Move Mode or Delete Section mode is active
- Delete Section step indicator: 0=ready, 1=select end, 2=confirm (re-pressing button at step 2 confirms deletion)
- Hint text changes per active mode: Move hints for dragging, Del Section hints for vertex tap selection
- Animated slide-up entrance with spring easing
- Header shows feature name, layer name, geometry type, active mode indicator

### MapLegend — `lib/components/MapLegend.tsx`
Map legend overlay showing layer colors, names, and feature counts.

---

## 8. Constants & Configuration — `lib/utils/`

### `lib/utils/constants.ts`
| Constant | Value | Purpose |
|----------|-------|---------|
| `API_BASE_URL` | `http://192.168.1.100:8000` (dev) / `https://api.fibre360.com` (prod) | Backend URL |
| `MICROSERVICE_BASE_URL` | `https://fiber-import.zeabur.app` | Import microservice |
| `APP_NAME` | `Fiber360` | App display name |
| `SYNC_INTERVAL_MS` | 300,000 (5 min) | Auto-sync interval |
| `LOCATION_INTERVAL_MS` | 10,000 (10s) | GPS polling rate |
| `MAX_PHOTO_SIZE_MB` | 10 | Photo size limit |
| `PAGE_SIZE` | 20 | API pagination size |
| `FEATURE_STATUSES` | pending, assigned, under_review, approved, redo | Valid feature statuses |
| `PROJECT_STATUSES` | draft, in_progress, active, completed, archived | Valid project statuses |

### `lib/utils/types.ts`
Defines 35+ TypeScript interfaces for all API responses, store data, and survey entities:
- **Core:** `User`, `Project`, `Feature`, `Layer`, `AssignmentJob`, `GeoJSONFeature`, `FieldSchemaField`
- **Survey:** `GPSTrace`, `GPSPoint`, `TrenchSurveyData`, `ExistingAssetData`, `RiskAssessmentData`, `HazardData`, `FieldEvidenceData`, `SurveyChangeData`, `SurveyStatusData`
- **HLD/Survey Separation (NEW):** `SurveyFeatureData` (id, original_hld_feature, survey_geometry, survey_attributes, survey_status, version_number, sync_status, etc.), `LayerDisplayMode` ('hld' \| 'survey' \| 'overlay')
- **Infrastructure:** `PendingPhoto`, `SyncQueueItem`, `BackendSyncQueueItem`, `EngineerStats`, `EngineerActivity`
- **Pagination:** `PaginatedResponse<T>`, `PaginationParams`
- **Navigation:** `RootStackParamList`

---

## 9. Theme System — `lib/theme/colors.ts`

| Token Set | Details |
|-----------|---------|
| **Color Palette** | 14 tokens per theme: primary, secondary, background, surface, error, success, warning, textPrimary/Secondary/Tertiary, outline/outlineLight, overlay |
| **Themes** | Light (`#0D5CFF` primary) and Dark (`#5C9CFF` primary) |
| **Spacing** | xs(4) → xxl(32) — 7 levels |
| **Border Radius** | sm(6), md(12), lg(16), xl(24), full(9999) |
| **Touch Targets** | minHeight=56dp, minWidth=48dp — field-friendly |
| **Status Colors** | 11 statuses: pending, assigned, under_review, approved, redo, in_progress, complete, flagged, uploaded, uploading, failed — each with bg/text/dot colors |

---

## 10. Data Flow Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Screens     │────▶│  Zustand     │────▶│  API Client      │
│  (app/*.tsx) │◀────│  Stores      │◀────│  (lib/api/*.ts)  │
└─────────────┘     └──────┬───────┘     └───────┬──────────┘
                           │                     │
                           │                     ▼
                           │              ┌──────────────┐
                           │              │  Django REST  │
                           │              │  Backend      │
                           │              │  (Zeabur PG)  │
                           │              └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Demo Data   │
                    │  (lib/stores │
                    │  /demo-data  │
                    │  .ts)        │
                    └──────────────┘
```

**Demo Mode Flow:** When `demoMode === true`, all store actions skip API calls and use demo data directly (either from `demo-data.ts` or by creating mock objects inline).

**Import Flow (Demo Mode):**
1. User taps "Import Package" on `/project/import`
2. `importSurveyPackage()` is called in project store
3. Attempts client-side ZIP parse via `jszip` (browser only)
4. If parse fails, falls back to `simulateImport()` which returns `IMPORT_GEOJSON_FEATURES` (Riverside dataset)
5. Features shifted on each subsequent import for visual distinction
6. Project, layers, and GeoJSON features stored in Zustand
7. Map screen automatically picks up new `projectGeojsons`

**Editing Flow (Phase 1-3):**
1. User taps a feature on the map → popup appears with info + **Edit** button
2. Tap Edit → `handleStartEdit()` sets `editingFeature` state, enters editing mode
3. Contextual toolbar appears showing tools for the feature's geometry type
4. For new points: tap 📍 FAB → tap map → SurveyForm slides up with all 7 sections
5. SurveyForm saves editable fields via `onSave` → updates GeoJSON + syncs to backend
6. Trench/risk/hazard/evidence/status sections save via `useSurveyStore` API calls
7. Tap Done → exits editing mode, returns to viewing

**HLD/Survey Separation Flow (Phase 2):**
1. On project load, `fetchSurveyFeatures()` loads all survey features from backend
2. HLD features render in blue (read-only), survey features in orange (editable)
3. Display mode toggle: 🔵 HLD only → 🟠 Survey only → 🔀 Overlay (both)
4. In overlay mode, engineer sees what Planning proposed (blue) vs what they modified (orange)

---

## 11. File Inventory (All Source Files)

### Screens (`app/`)
| File | Lines | Purpose |
|------|-------|---------|
| `_layout.tsx` | ~55 | Root: splash, session restore, stack navigation |
| `index.tsx` | 6 | Root redirect to `/login` |
| `(auth)/_layout.tsx` | 10 | Auth stack layout |
| `(auth)/login.tsx` | ~190 | Login/register/demo entry |
| `(tabs)/_layout.tsx` | ~85 | Tab bar with 8 tabs |
| `(tabs)/home.tsx` | ~290 | Dashboard |
| `(tabs)/survey/_layout.tsx` | 10 | Survey stack layout |
| `(tabs)/survey/index.tsx` | ~780 | Survey editor (largest screen) |
| `(tabs)/map.tsx` | ~2350 | Map + list view + Move Mode + Delete Section + contextual editing + FABs + SurveyForm |
| `(tabs)/camera.tsx` | ~230 | Photo capture |
| `(tabs)/gps.tsx` | ~290 | GPS tracker |
| `(tabs)/offline.tsx` | ~230 | Offline management |
| `(tabs)/sync.tsx` | ~270 | Sync queue |
| `(tabs)/profile.tsx` | ~210 | Profile/settings |
| `feature/[featureId].tsx` | ~400 | Standalone feature detail |
| `project/[projectId].tsx` | ~230 | Project detail |
| `project/import.tsx` | ~240 | Survey package import |
| `gallery.tsx` | ~80 | Photo gallery |
| `gallery/[featureId].tsx` | ~70 | Feature-specific gallery |
| `export.tsx` | ~170 | Export screen |

### Stores (`lib/stores/`)
| File | Lines | Purpose |
|------|-------|---------|
| `auth.ts` | ~120 | Auth state & session |
| `project.ts` | ~392 | Projects & assignments |
| `survey.ts` | ~574 | Comprehensive survey data + point move tracking |
| `survey-features.ts` | ~210 | **NEW** — HLD/Survey separation store |
| `map.ts` | ~67 | Map layers & selection |
| `image.ts` | ~100 | Photo queue & upload |
| `offline.ts` | ~50 | Network & sync status |
| `theme.ts` | ~45 | Theme mode & colors |
| `demo-data.ts` | ~490 | Mock data & ZIP parsing |

### API (`lib/api/`)
| File | Lines | Purpose |
|------|-------|---------|
| `client.ts` | ~168 | HTTP client, auth tokens, refresh |
| `auth.ts` | ~35 | Auth endpoints |
| `projects.ts` | ~185 | Project/layer/import endpoints |
| `features.ts` | ~80 | Feature measurement & submission |
| `assignments.ts` | ~70 | Assignment & engineer stats |
| `survey.ts` | ~310 | Survey module endpoints (20+ endpoints including survey-features) |

### UI Components (`components/ui/`)
| File | Lines | Purpose |
|------|-------|---------|
| `Button.tsx` | ~90 | Multi-variant button |
| `Input.tsx` | ~110 | Text input with validation |
| `Card.tsx` | ~160 | Card, StatCard, Badge |
| `StatusBadge.tsx` | ~80 | Status indicators & progress bar |
| `EmptyState.tsx` | ~70 | Empty state placeholder |
| `Toast.tsx` | ~90 | Animated notifications |

### Library Components (`lib/components/`)
| File | Lines | Purpose |
|------|-------|---------|
| `MapLibreMap.tsx` | ~2109 | Cross-platform map component with CDN loading, drag, vertex editing |
| `GeometryEditor.tsx` | ~350 | Contextual editing toolbar (per geometry type) |
| `MapFeaturePopup.tsx` | ~200 | Feature popup with Edit button |
| `SurveyForm.tsx` | ~700 | **NEW** — Comprehensive survey form (7 collapsible sections) |
| `NewPointForm.tsx` | ~400 | Deprecated — replaced by SurveyForm |
| `FeatureSurveySections.tsx` | ~550 | Survey modules for feature detail screen |
| `LayerEditor.tsx` | ~430 | Layer schema viewer with editable/read-only fields |
| `MapLegend.tsx` | ~120 | Map legend overlay |

### Config
| File | Purpose |
|------|---------|
| `package.json` | Dependencies & scripts (typecheck, android, ios, web) |
| `app.json` | Expo config, permissions, plugins |
| `tsconfig.json` | TypeScript configuration |
| `babel.config.js` | Babel/Expo config |
| `metro.config.js` | Metro bundler config |
| `android/` | Native Android project files (kotlin, manifests, resources) |

---

## 12. Known Gaps & Observations

| Issue | Details |
|-------|---------|
| **No Unit/Integration Tests** | No test files found anywhere in the project |
| **No Local Persistence** | All state is in-memory (Zustand); survey edits are lost on app restart unless synced to API. AsyncStorage persistence planned for Phase 4 |
| **Map is Web-Only** | `MapLibreMap.tsx` uses CDN-loaded MapLibre GL JS; native MapLibre RN (`@maplibre/maplibre-react-native`) is installed but not fully wired |
| **Sync is Simulated** | `SyncScreen` uses mock progress; no real WorkManager/background sync |
| **Offline Store is Simulated** | `useOfflineStore` has manual toggle; no `NetInfo` listener wired |
| **Demo Data Dependencies** | Most screens have hardcoded fallbacks to demo data when not in demo mode |
| **Inline Styling** | Heavy use of `StyleSheet.create` per component; no centralized design tokens beyond colors/spacing/radius |
| **Feature Detail Duplication** | Standalone `feature/[featureId].tsx` and survey detail view in `survey/index.tsx` overlap significantly |
| **No Loading Skeleton** | Only `ActivityIndicator` spinner for loading states |
| **Gallery Truncated** | `gallery.tsx` and `gallery/[featureId].tsx` have truncated implementations |
| **Export Screen** | `export.tsx` is partially implemented |
| **TypeScript Strictness** | Several `as any` casts and `as unknown` type assertions throughout |
| **Delete Section — not split-aware** | Deleting a middle section creates ONE survey feature with remaining vertices, which connects the two disconnected segments with a straight line. The requirement says disconnected segments should become independent Survey Features.

---

## 13. HLD/Survey Separation Architecture (Phases 1-3)

### Design Principle

The HLD generated by the Planning Platform is the **source of truth** and MUST NEVER be modified by the survey engineer. Instead, every edit creates or updates a separate **Survey Feature** that references the original HLD feature.

Think of it like Git:
- **HLD** = Original branch (read-only, blue styling)
- **Survey** = Working branch (editable, orange styling)
- **Planner** = Merge request (future: compare HLD vs Survey for approval)

### Phase 1 — Backend SurveyFeature Model

**New Django model:** `SurveyFeature` in `survey/models.py`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID PK | Unique identifier |
| `original_hld_feature` | FK → projects.Feature (SET_NULL) | Frozen link to original HLD feature |
| `project` | FK → projects.Project | Project reference |
| `engineer` | FK → users.User | Engineer who made the edit |
| `layer_id` / `layer_name` | CharField | Layer identification |
| `original_geometry` | JSONField (frozen) | Geometry from HLD — never changes |
| `original_attributes` | JSONField (frozen) | Attributes from HLD — never changes |
| `survey_geometry` | JSONField | Engineer-edited geometry |
| `survey_attributes` | JSONField | Engineer-edited attributes |
| `survey_status` | CharField (7 choices) | new/modified/removed/pending_review/rejected/approved/completed |
| `version_number` | PositiveIntegerField | Auto-increments on edit |
| `sync_status` | CharField (3 choices) | pending/synced/failed |
| `change_reason` | TextField | Why the engineer made this change |

**API Endpoints (all under `/api/survey/`):**
| Method | Route | Purpose |
|--------|-------|--------|
| GET | `/survey-features/` | List survey features (filter by project, layer, status) |
| POST | `/survey-features/` | Create a new survey feature |
| GET | `/survey-features/{id}/` | Retrieve a single survey feature |
| PATCH | `/survey-features/{id}/` | Update geometry/attributes (auto version bump + NEW→MODIFIED) |
| DELETE | `/survey-features/{id}/` | Remove a survey feature |
| POST | `/survey-features/upsert/` | Create-or-update by HLD feature reference |

**Migration:** `0002_surveyfeature.py` — purely additive (creates new table only, no existing tables modified)

### Phase 2 — Frontend Store + Dual-Layer Rendering

**New Zustand store:** `lib/stores/survey-features.ts`
- Fetches survey features from backend on project load
- `displayMode` toggle: `'hld'` (blue only) → `'survey'` (orange only) → `'overlay'` (both)
- `surveyFeaturesToGeoJSON(layerId)` — converts survey features to GeoJSON for map rendering
- `getSurveyFeatureForHld(hldFeatureId)` — finds if a survey feature exists for a given HLD feature
- `upsertSurveyFeature()` — creates or updates a survey feature via the backend upsert endpoint

**Map rendering in `map.tsx`:**
- HLD layers rendered with `effectiveLayerColors` (blue in overlay mode, normal otherwise)
- Survey layers rendered as separate `MapLayerData[]` with `SURVEY_COLOR = '#FF8C00'` (orange)
- In `'survey'` mode, HLD layers are hidden (`hldLayers = []`)
- In `'overlay'` mode, both HLD (blue) + Survey (orange) are visible simultaneously
- Display mode toggle FAB: 🔵 → 🟠 → 🔀

### Phase 3 — Enhanced SurveyForm

**New component:** `lib/components/SurveyForm.tsx` (replaces `NewPointForm`)

A comprehensive survey form overlay with 7 collapsible sections:
1. **Survey Details** — editable fields from layer schema
2. **Trench Classification** — 11 trench types, dimensions, surface, crossings
3. **Risk Assessment** — 16 categories, severity, probability, mitigation
4. **Hazards** — 11 hazard types, 12 mitigation templates
5. **Field Evidence** — photo/measure/note, description, weather
6. **Survey Status** — 7 status options, field notes, flag
7. **Change History** — recent survey changes

**Key difference from before:**
- **Before:** Adding a point showed only editable fields (NewPointForm). Editing a feature required navigating to the detail screen for trench/risk/hazard sections.
- **After:** Adding a point OR editing an existing feature both show the full SurveyForm with all 7 sections in one overlay — the engineer can fill in survey details, classify the trench, assess risks, record hazards, log evidence, and update status without leaving the map.

### Contextual Editing Toolbar (Phase 1 Frontend)

**Editing Principle:**
```
Viewing → tap feature → popup shows Info + [Edit]
    ↓ Tap Edit
Editing → contextual toolbar (tools for that geometry type)
    ↓ Tap Done
Viewing → back to normal
```

The old multi-mode floating toolbar (split, merge, draw, edit vertices, add point, delete) was replaced with a **contextual toolbar** that shows only tools relevant to the selected feature's geometry type. This eliminates the "huge toolbar" problem and makes editing more intuitive.

### Backend CRUD Test Results
All endpoints verified with authenticated requests:
| Test | Result |
|------|--------|
| Create survey feature | ✅ HTTP 201, `survey_status: new`, `version: 1` |
| Get detail | ✅ HTTP 200 |
| Patch update (attributes) | ✅ HTTP 200, `version: 2`, `survey_status: modified` |
| Delete | ✅ HTTP 204 |
| Get after delete | ✅ HTTP 404 |
| Django system check | ✅ 0 issues |

### Production Database Safety
- Migration `0002_surveyfeature` is **purely additive** — creates new `survey_surveyfeature` table only
- **HLD `features` table:** 34,469 rows — **untouched**, zero modifications
- **All existing survey tables:** untouched
- **Only data modification:** password reset for `engineer@fibre360.com` (per user request)

---

## 14. Git Commit History (Phases 1-3 + Recent)

| Phase | Repo | Commit | Description |
|-------|------|--------|-------------|
| Phase 1 | `fibre-backend` | `44a0a9f` | SurveyFeature model + migration + API endpoints |
| Phase 2 | `FTTH-Survey` | `3599011` | Frontend HLD/Survey store + dual-layer rendering |
| Phase 3 | `FTTH-Survey` | `57ce26c` | Enhanced SurveyForm with hazard + field info sections |
| Pre-Phase | `FTTH-Survey` | `03ceacb` | Contextual editing toolbar + NewPointForm + Undo/Add Point FABs |
| Move Mode | `FTTH-Survey` | `c345013` | Move Mode with vertex drag + orange preview layer + save/undo via SurveyFeatures store |
| Delete Section | `FTTH-Survey` | _(uncommitted)_ | Delete Section: click-to-snap vertex selection + section removal + survey feature creation. No MapLibreMap changes.

---

*This report was generated by scanning all source files in `fibre-mobile/` on July 24, 2026, and updated on July 28, 2026 with Phases 1-3 (HLD/Survey Separation, Contextual Editing, Enhanced SurveyForm). It covers 45+ source files across screens, stores, API clients, components, and configuration.*
