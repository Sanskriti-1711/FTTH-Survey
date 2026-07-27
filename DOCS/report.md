# Fiber360 Mobile – Full Functional Code Scan & Architecture Report

> **Generated:** July 24, 2026  
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
│   ├── map.tsx             # Interactive map + list view + FABs
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
| **Basemap Switcher** | FAB opens panel with 3 presets: Streets (OpenFreeMap), Satellite (ESRI), Light (MapLibre demo) |
| **Layer Panel** | FAB opens list of all layers with visibility toggles (eye/eye-off) |
| **Feature Interaction** | Tap feature on map → bottom sheet with name, layer, status, "Open Details" button |
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
| Actions | `fetchProjects()`, `fetchAssignments()`, `setActiveProject()`, `importSurveyPackage()`, `addDemoProject()`, `setProjectGeojsons()` |

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
| Actions | 30+ actions: `fetchLayers()`, `fetchLayerFeatures()`, `fetchFeatureDetail()`, `updateFieldMeasurements()`, `submitFeatures()`, plus CRUD for GPS, trenches, assets, risks, hazards, evidence, changes, statuses, sync queue |

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
A web-only component that loads MapLibre GL JS from CDN:
- Dynamically loads CSS + JS from unpkg CDN
- Renders vector layers (GeoJSON sources): circles for points, lines for LineStrings, fills+outlines for Polygons
- Feature click handler → bottom sheet with detail navigation
- Hover cursor pointer on features
- Fly-to animation on selected feature
- Basemap style switching
- 3 built-in basemaps: Streets (OpenFreeMap Liberty), Satellite (ESRI), Light (MapLibre Demo)
- Loading and error states

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
Defines 30+ TypeScript interfaces for all API responses, store data, and survey entities:
- **Core:** `User`, `Project`, `Feature`, `Layer`, `AssignmentJob`, `GeoJSONFeature`, `FieldSchemaField`
- **Survey:** `GPSTrace`, `GPSPoint`, `TrenchSurveyData`, `ExistingAssetData`, `RiskAssessmentData`, `HazardData`, `FieldEvidenceData`, `SurveyChangeData`, `SurveyStatusData`
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

**Upload Flow (Photos):**
1. User captures photo via camera or gallery picker
2. `addPhoto()` adds to `pendingPhotos` with status `'pending'`
3. `uploadPhoto()` sets status to `'uploading'`, calls API, sets `'uploaded'` or `'failed'`
4. `retryFailed()` re-attempts all failed uploads
5. `clearUploaded()` removes successfully uploaded photos from the queue

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
| `(tabs)/map.tsx` | ~530 | Map + list view |
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
| `project.ts` | ~180 | Projects & assignments |
| `survey.ts` | ~430 | Comprehensive survey data |
| `map.ts` | ~70 | Map layers & selection |
| `image.ts` | ~100 | Photo queue & upload |
| `offline.ts` | ~50 | Network & sync status |
| `theme.ts` | ~45 | Theme mode & colors |
| `demo-data.ts` | ~420 | Mock data & ZIP parsing |

### API (`lib/api/`)
| File | Lines | Purpose |
|------|-------|---------|
| `client.ts` | ~100 | HTTP client, auth tokens, refresh |
| `auth.ts` | ~35 | Auth endpoints |
| `projects.ts` | ~105 | Project/layer/import endpoints |
| `features.ts` | ~80 | Feature measurement & submission |
| `assignments.ts` | ~70 | Assignment & engineer stats |
| `survey.ts` | ~200 | Survey module endpoints (14+ endpoints) |

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
| `MapLibreMap.tsx` | ~380 | Web map component with CDN loading |

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
| **No Local Persistence** | All state is in-memory (Zustand); data is lost on app restart unless synced to API |
| **Map is Web-Only** | `MapLibreMap.tsx` uses CDN-loaded MapLibre GL JS; native MapLibre RN (`@maplibre/maplibre-react-native`) is installed but not wired |
| **Sync is Simulated** | `SyncScreen` uses mock progress; no real WorkManager/background sync |
| **Offline Store is Simulated** | `useOfflineStore` has manual toggle; no `NetInfo` listener wired |
| **Demo Data Dependencies** | Most screens have hardcoded fallbacks to demo data when not in demo mode |
| **Inline Styling** | Heavy use of `StyleSheet.create` per component; no centralized design tokens beyond colors/spacing/radius |
| **Feature Detail Duplication** | Standalone `feature/[featureId].tsx` and survey detail view in `survey/index.tsx` overlap significantly |
| **No Loading Skeleton** | Only `ActivityIndicator` spinner for loading states |
| **Gallery Truncated** | `gallery.tsx` and `gallery/[featureId].tsx` have truncated implementations |
| **Export Screen** | `export.tsx` is partially implemented |
| **TypeScript Strictness** | Several `as any` casts and `as unknown` type assertions throughout |

---

*This report was generated by scanning all source files in `fibre-mobile/` on July 24, 2026. It covers 40+ source files across screens, stores, API clients, components, and configuration.*
