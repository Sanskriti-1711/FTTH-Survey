# Fiber360 Android – UI/UX & Architecture Design

> **Scope:** First design the Android app interface and architecture. A follow-up step will wire it to the Django backend through a dedicated `survey` app.

> **Last Updated:** July 24, 2026 — Appendix added mapping the current React Native codebase to the Android design.

---

## 1. Overview

The existing backend (`fiber-backend`) already supports users, projects, features, assignments, and FTTH HLD pipelines. The previous mobile front-end was React Native (see `report.md`). This document defines a clean, native Android re-design that reuses the existing backend as much as possible, adds a small `survey` Django app for mobile-optimized sync, and targets modern Android tooling.

### High-level Architecture

```
┌─────────────────────────────────────┐
│         Android (Kotlin)            │
│  ───────────────────────────────┐  │
│  │  Jetpack Compose UI           │  │
│  │  MVVM + StateFlow             │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Room DB (offline source)     │  │
│  │  WorkManager sync queue       │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │ REST / JWT
┌──────────────▼──────────────────────┐
│        Django Backend               │
│  users, projects, assignments,    │
│  ftth_hld  +  NEW survey app      │
└─────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| UI Framework | Jetpack Compose | Declarative, dynamic forms, Material 3 |
| Architecture | MVVM + Clean Architecture | Testable, scalable |
| State | StateFlow / Compose State | Reactive, lifecycle-safe |
| Dependency Injection | Hilt | Standard Android DI |
| Networking | Retrofit + OkHttp | Type-safe REST, easy interceptors |
| Local DB | Room + SQLite | Offline-first, strong queries |
| Background Sync | WorkManager + ConnectivityManager | Reliable queued sync |
| Maps | MapLibre Native Android | No Google Play Services dependency, GIS-friendly |
| Geo/GIS | GeoPackage Android, Proj4J | Parse `.gpkg` / ZIP survey packages |
| Camera | CameraX + MediaStore | Robust photo capture |
| Auth | EncryptedSharedPreferences + JWT | Secure token storage |

---

## 3. Navigation Architecture

### 3.1 Top-Level Navigation

Standard Material 3 bottom navigation bar with 4 destinations:

| Tab | Route | Purpose |
|-----|-------|---------|
| **Home** | `main/home` | Dashboard, stats, active assignments, sync status |
| **Survey** | `main/survey` | Assigned projects → layers → features |
| **Map** | `main/map` | Geospatial view of current assignment |
| **Profile** | `main/profile` | User info, settings, manual sync, logout |

### 3.2 Nested Navigation Graphs

```
AuthNavGraph
 └── LoginScreen
        │
        ▼
   MainTabGraph
    ├── HomeScreen
    ├── SurveyNavGraph
    │    ├── ProjectListScreen
    │    ├── ProjectDetailScreen
    │    ├── LayerDetailScreen
    │    ├── FeatureDetailScreen
    │    ├── CameraScreen
    │    └── PhotoGalleryScreen
    ├── MapNavGraph
    │    └── MapScreen
    └── ProfileNavGraph
         ├── ProfileScreen
         ├── SettingsScreen
         └── SyncQueueScreen
```

### 3.3 Navigation Actions

* Bottom nav always visible inside `MainTabGraph`.
* Tapping a feature on the map opens a bottom sheet, then navigates to `FeatureDetailScreen`.
* Camera is launched from `FeatureDetailScreen`; captured photo is returned and attached to the feature.

---

## 4. Screen Inventory & Specifications

### 4.1 Authentication

#### `LoginScreen`
*   **Purpose:** Authenticate field engineers.
*   **Layout:**
    *   Centered logo/app name at top.
    *   Email `OutlinedTextField`.
    *   Password `OutlinedTextField` with visibility toggle.
    *   Primary "Login" button (full width, min height 56 dp).
    *   Offline/demo mode toggle (for testing without backend).
*   **Validation:** Email format, non-empty password.
*   **API:** `POST /api/users/login/`
*   **On Success:** Store JWT (access/refresh), persist user, navigate to `MainTabGraph`, trigger initial sync.

---

### 4.2 Home

#### `HomeScreen`
*   **Purpose:** Daily dashboard and quick entry points.
*   **Sections (vertical scroll):**
    1.  **Header:** Greeting + current date + network/sync badge.
    2.  **Connection Status Card:** Online/offline, last sync time, pending items count.
    3.  **Quick Stats Row:** Active assignments, completed today, pending submissions.
    4.  **Quick Actions:** Large icon buttons for "Start Survey" and "Capture Photo".
    5.  **Active Assignments List:** Top 3–5 assigned projects/layers with progress.
    6.  **Recent Activity:** Latest feature status changes (local + server).
*   **API:** `GET /api/assignments/jobs/?engineer={id}`, then cached in Room.

---

### 4.3 Survey

#### `ProjectListScreen`
*   **Purpose:** Show all projects assigned to the logged-in engineer.
*   **Layout:** Search bar + filter chips (`All`, `Project`, `Layer`, `Feature`) + lazy list of cards.
*   **Card Content:**
    *   Project name, region, scope badge (`Project` / `Layer` / `Feature`).
    *   Progress bar and status counts.
    *   Assigned date.
*   **Actions:** Tap card → `ProjectDetailScreen` (or `LayerDetailScreen` / `FeatureDetailScreen` depending on scope).

#### `ProjectDetailScreen`
*   **Purpose:** Overview of a single project and its layers.
*   **Layout:**
    *   Header: Project name, status badge, total completion.
    *   Layer list (grouped by `layer_name`).
    *   Each layer shows count, status distribution, last update.
*   **Actions:** Tap layer → `LayerDetailScreen`.

#### `LayerDetailScreen`
*   **Purpose:** List all features in a layer.
*   **Layout:**
    *   Sticky header with layer name and status summary.
    *   Filter chips: `All`, `Pending`, `Assigned`, `Under Review`, `Redo`, `Approved`.
    *   Lazy vertical list of feature items.
*   **Feature Item:**
    *   Identifier / label from `properties`.
    *   Status badge.
    *   Thumbnail if photo exists.
    *   Tap → `FeatureDetailScreen`.

#### `FeatureDetailScreen`
*   **Purpose:** Core field form for a single feature.
*   **Layout (vertical scroll):**
    *   Header: Feature label + status badge + layer name.
    *   **Read-only Reference Card:** Display key `properties` (e.g., pole height, cable type).
    *   **Dynamic Form:** Generated from `field_schema` or `field_measurements`.
    *   **Notes:** Multiline `OutlinedTextField` for `comparison_notes`.
    *   **Photo Section:** Grid of thumbnails + "Add Photo" button.
    *   **Action Bar (sticky bottom):**
        *   Secondary: "Save Draft".
        *   Primary: "Mark Complete" (submits for review).
        *   Tertiary: "Flag / Redo".
*   **Survey Modules (expandable cards):**
    *   Trench Classification (11 trench types, depth/width, crossings, toggles, notes)
    *   Risk Assessment (16 categories, severity/probability 4-level selectors, mitigation text)
    *   Hazard Register (11 hazard types, 12 mitigation templates)
    *   Field Evidence (photo/measure/note, description, weather conditions)
    *   Survey Status & Notes (8-step status flow, field notes, flag)
*   **APIs:**
    *   `GET /api/projects/{project_id}/features/{feature_id}/`
    *   `PATCH /api/features/{feature_id}/field-measurements/`
    *   `POST /api/features/{feature_id}/upload-photo/` (multipart)
    *   `POST /api/features/submit/`
    *   Survey module endpoints under `/api/survey/`

---

### 4.4 Map

#### `MapScreen`
*   **Purpose:** Visualize assigned features and current location.
*   **Layout:**
    *   Full-screen MapLibre map.
    *   Floating action buttons (bottom-right): My Location, Layer Toggle, Basemap Switcher.
    *   Bottom sheet for selected feature details.
*   **Layers:**
    *   Project boundary / layer polygons (GeoJSON from microservice or local GeoPackage).
    *   Feature pins colored by status.
    *   User location puck.
*   **Interactions:**
    *   Tap pin → show bottom sheet with feature summary + "Open" button.
    *   Long-press → optional manual GPS override (stored as `field_measurements.gps`).
*   **Dual View Modes:** Map view + List view with layer filter chips and feature cards.

---

### 4.5 Camera / Photos

#### `CameraScreen`
*   **Purpose:** Capture photos linked to a feature or project.
*   **Layout:**
    *   Full CameraX preview.
    *   Shutter button at bottom center.
    *   Thumbnail of last capture (bottom-left).
    *   Optional flash toggle.
*   **Output:** Save to local storage, attach to feature, queue for upload.

#### `PhotoGalleryScreen`
*   **Purpose:** Browse and manage captured photos.
*   **Layout:**
    *   Filter chips: `All`, `Pending Upload`, `Uploaded`.
    *   Grid of photos with upload status icon.
    *   Tap to preview fullscreen; swipe to delete.

---

### 4.6 Profile & Settings

#### `ProfileScreen`
*   **Purpose:** User account and app controls.
*   **Sections:**
    *   User card (name, email, role).
    *   Sync status card with "Sync Now" button.
    *   Settings list: Theme, Offline maps, About, Logout.

#### `SyncQueueScreen`
*   **Purpose:** Inspect pending uploads and retry failures.
*   **Layout:** List of queued operations with type, feature ID, timestamp, status, and retry button.

---

## 5. Design System

### 5.1 Color Palette (Material 3)

| Token | Light Theme | Dark Theme | Usage |
|-------|-------------|------------|-------|
| Primary | `#0D5CFF` | `#5C9CFF` | Buttons, active nav, links |
| On Primary | `#FFFFFF` | `#001B3D` | Text on primary |
| Secondary | `#FF8C00` | `#FFB347` | Accent, warnings, highlights |
| Background | `#F7F9FC` | `#121212` | Screen background |
| Surface | `#FFFFFF` | `#1E1E1E` | Cards, sheets |
| Error | `#DC2626` | `#FF6B6B` | Redo / validation errors |
| Success | `#16A34A` | `#4ADE80` | Approved / completed |
| Warning | `#F59E0B` | `#FACC15` | Under review / pending sync |
| On Surface | `#1F2937` | `#F3F4F6` | Primary text |
| Outline | `#D1D5DB` | `#4B5563` | Borders/dividers |

### 5.2 Typography

| Style | Font | Size | Weight | Usage |
|-------|------|------|--------|-------|
| Display Large | Roboto | 32sp | 700 | Splash / login title |
| Headline Medium | Roboto | 24sp | 600 | Screen titles |
| Title Large | Roboto | 18sp | 600 | Card titles |
| Body Large | Roboto | 16sp | 400 | Form labels, body text |
| Body Medium | Roboto | 14sp | 400 | Metadata, captions |
| Label Large | Roboto | 14sp | 500 | Buttons, badges |

### 5.3 Spacing & Shape

*   **Screen padding:** 16dp
*   **Card corner radius:** 12dp
*   **Card padding:** 16dp
*   **List item spacing:** 12dp
*   **Button min height:** 56dp (field-friendly)
*   **Touch target:** minimum 48dp × 48dp

### 5.4 Status Badges

| Backend Status | Badge Color | Icon |
|----------------|-------------|------|
| `pending` | Gray | `Pending` |
| `assigned` | Blue | `Assignment` |
| `under_review` | Amber | `Visibility` |
| `approved` | Green | `CheckCircle` |
| `redo` | Red | `Replay` |

---

## 6. Component Library

| Component | Purpose |
|-----------|---------|
| `F360Button` | Primary/Secondary/Tertiary buttons with 56dp height |
| `F360TextField` | `OutlinedTextField` wrapper with validation |
| `StatusBadge` | Colored chip for feature/assignment status |
| `ProgressCard` | Card with progress bar and status counts |
| `FeatureListItem` | Row showing feature label, status, thumbnail |
| `DynamicForm` | Renders fields from `field_schema` JSON |
| `PhotoGrid` | Grid of thumbnails with upload state |
| `SyncBanner` | Inline banner for offline/pending sync |
| `EmptyState` | Illustrated empty state for empty lists |
| `MapPin` | Custom MapLibre marker by status |
| `StatCard` | Inline stat display with value and title |
| `Toast` | Animated slide-in notification (4 types) |
| `ModuleCard` | Expandable card for survey sub-modules |

---

## 7. Data Model & API Mapping

### 7.1 Room Entities (Offline Source)

```kotlin
@Entity
data class LocalUser(
    @PrimaryKey val id: String,
    val email: String,
    val fullName: String,
    val role: String,
    val accessToken: String,
    val refreshToken: String
)

@Entity
data class LocalProject(
    @PrimaryKey val id: String,
    val name: String,
    val description: String,
    val region: String,
    val status: String,
    val standardCompletion: Double,
    val lastActivityAt: Instant?
)

@Entity
data class LocalFeature(
    @PrimaryKey val id: String,
    val projectId: String,
    val layerId: String,
    val layerName: String,
    val propertiesJson: String,
    val fieldSchemaJson: String,
    val fieldMeasurementsJson: String,
    val comparisonNotes: String,
    val status: String,
    val photoUrl: String?,
    val submittedAt: Instant?,
    val approvedAt: Instant?,
    val updatedAt: Instant,
    val isDirty: Boolean = false
)

@Entity
data class LocalPhoto(
    @PrimaryKey val id: String,
    val featureId: String,
    val localUri: String,
    val remoteUrl: String?,
    val uploadStatus: String, // pending / uploading / uploaded / failed
    val createdAt: Instant
)

@Entity
data class SyncQueueItem(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String, // feature_update, photo_upload, submit
    val entityId: String,
    val payloadJson: String,
    val status: String, // pending / in_progress / failed
    val retryCount: Int = 0,
    val createdAt: Instant
)

// ── Survey Module Entities ───────────────────────────────────────────────

@Entity
data class LocalGpsTrace(
    @PrimaryKey val id: String,
    val engineer: String,
    val project: String?,
    val startedAt: String,
    val endedAt: String?,
    val totalDistanceM: Double?,
    val pointCount: Int,
    val isDirty: Boolean = false
)

@Entity
data class LocalTrenchSurvey(
    @PrimaryKey val id: String,
    val feature: String,
    val trenchType: String,
    val depthMm: Int?,
    val widthMm: Int?,
    val surfaceType: String?,
    val roadCrossing: Boolean = false,
    val footpathCrossing: Boolean = false,
    val railCrossing: Boolean = false,
    val riverCrossing: Boolean = false,
    val privateProperty: Boolean = false,
    val trafficSensitive: Boolean = false,
    val permitRequired: Boolean = false,
    val notes: String,
    val isDirty: Boolean = false
)

@Entity
data class LocalRiskAssessment(
    @PrimaryKey val id: String,
    val feature: String,
    val category: String,
    val severity: String,  // low, medium, high, critical
    val probability: String, // rare, possible, likely, certain
    val mitigation: String,
    val notes: String,
    val status: String, // open, closed, accepted, escalated
    val isDirty: Boolean = false
)

@Entity
data class LocalHazard(
    @PrimaryKey val id: String,
    val feature: String?,
    val hazardType: String,
    val mitigationTemplate: String?,
    val notes: String,
    val isActive: Boolean = true,
    val isDirty: Boolean = false
)

@Entity
data class LocalFieldEvidence(
    @PrimaryKey val id: String,
    val feature: String?,
    val evidenceType: String, // photo, video, voice_note, measurement, document, sketch
    val description: String,
    val weather: String,
    val latitude: Double?,
    val longitude: Double?,
    val isDirty: Boolean = false
)

@Entity
data class LocalSurveyStatus(
    @PrimaryKey val id: String,
    val feature: String,
    val status: String, // not_started, visited, verified, modified, needs_review, rejected, approved, completed
    val notes: String,
    val isDirty: Boolean = false
)
```

### 7.2 Existing Backend Endpoints Used

| Screen | Method | Endpoint | Purpose |
|--------|--------|----------|---------|
| Login | POST | `/api/users/login/` | JWT auth |
| Home/Projects | GET | `/api/assignments/jobs/?engineer={id}` | List assignments |
| Project Detail | GET | `/api/projects/{id}/layers/` | Layer summary |
| Layer Detail | GET | `/api/projects/{id}/layers/{layer_id}/` | Features in layer |
| Feature Detail | GET | `/api/projects/{id}/features/{feature_id}/` | Feature + GeoJSON |
| Feature Save | PATCH | `/api/features/{id}/field-measurements/` | Save form data |
| Photo Upload | POST | `/api/features/{id}/upload-photo/` | Upload photo |
| Feature Submit | POST | `/api/features/submit/` | Submit for review |
| Feature Approve | POST | `/api/features/approve/` | Approve features |
| Feature Reject | POST | `/api/features/reject/` | Reject with reason |
| Project Import | POST | `/api/projects/{id}/import/upload/` | Upload GeoPackage |
| Project Import | POST | `/api/projects/{id}/import/discover/` | Discover layers |
| Project Import | POST | `/api/projects/{id}/import/import/` | Execute import |
| Project Import | POST | `/api/projects/{id}/import/status/` | Check import progress |
| Project Complete | GET | `/api/projects/{id}/completion/` | Completion %

### 7.3 Proposed New `survey` Django App Endpoints

To reduce mobile chatter and enable offline-first sync, add a `survey` app:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/survey/sync/?since={timestamp}` | Full engineer payload (assignments, features, schemas, status) |
| POST | `/api/survey/sync/` | Batch upload offline changes |
| POST | `/api/survey/features/{id}/submit/` | Submit a single feature for review |
| POST | `/api/survey/features/bulk-submit/` | Submit multiple features at once |
| GET/POST | `/api/survey/gps-traces/` | List/create GPS traces |
| GET/POST | `/api/survey/trenches/` | List/create trench surveys |
| GET/POST | `/api/survey/risks/` | List/create risk assessments |
| GET/POST | `/api/survey/hazards/` | List/create hazards |
| GET/POST | `/api/survey/evidence/` | List/create field evidence |
| GET/POST | `/api/survey/status/` | Get/update survey status |
| POST | `/api/survey/sync/process/` | Process pending sync items |

This new app can delegate to existing models (`projects.Feature`, `assignments.AssignmentJob`) while keeping mobile-specific logic isolated.

---

## 8. Offline-First UX

1. **Single Source of Truth:** UI observes Room via Kotlin `Flow`.
2. **Optimistic Writes:** User actions save immediately to Room and enqueue a `SyncQueueItem`.
3. **Sync Engine:**
    *   `SyncWorker` runs on app launch, when online, and on demand.
    *   Processes `SyncQueueItem`s in order: feature updates first, then photos.
    *   Exponential backoff on failure.
4. **Conflict Handling:** Last-write-wins from the mobile device for field data; backend is authoritative for assignment status.
5. **Indication:** Persistent sync badge on Profile tab and snackbar/banner when actions are queued.

---

## 9. Accessibility & Field Considerations

*   **Contrast:** All text meets WCAG 4.5:1.
*   **Touch:** Buttons 56dp tall, all tappable areas ≥ 48dp.
*   **Sunlight legibility:** High-contrast mode toggle; avoid thin fonts.
*   **Haptics:** Confirm photo capture, GPS fix, and feature completion.
*   **Dark mode:** Full support via Material 3 dynamic color and dark theme.
*   **Tablet support:** Two-pane layouts for Project → Layer → Feature lists.

---

## 10. Implementation Phases

| Phase | Deliverable |
|-------|-------------|
| 1. Foundation | Android project setup, theme, navigation, DI, base components |
| 2. Auth & Sync | Login, JWT storage, Room entities, sync worker, dashboard |
| 3. Survey Flow | Project/layer/feature lists, dynamic form, detail screen with 5 survey modules |
| 4. Map & Camera | MapLibre integration, camera capture, photo gallery, basemap switching |
| 5. Backend `survey` app | New Django app, bulk sync endpoints, survey module endpoints |
| 6. Polish | Offline edge cases, tablet layout, QA |

---

## 11. Open Questions

1. Should the Android app support the **FTTH HLD pipeline submission** (upload Excel + roads, run pipeline), or only consume existing survey packages?
2. Is **Google Play Services** available on target devices, or must the app remain fully Play Services-free?
3. Should the app support **biometric login** in addition to email/password?
4. Which **Android minimum SDK** is required? (Recommended: API 26 / Android 8.0)

---

## Appendix: Current React Native Feature Mapping

The following table maps each existing React Native screen/structure to the corresponding Android design counterpart, based on the comprehensive codebase scan (`DOCS/report.md`).

| RN Screen | Android Screen | Key Differences / Notes |
|-----------|---------------|----------------------|
| `login.tsx` | `LoginScreen` | RN has inline register toggle + demo mode button. Android should add biometric option. |
| `home.tsx` | `HomeScreen` | RN has Quick Import card, 8 tabs. Android should add Recent Activity section & real NetInfo. |
| `survey/index.tsx` (list) | `ProjectListScreen` + `LayerDetailScreen` | RN combines list + detail in one file (780+ lines). Android should split into proper MVVM. |
| `survey/index.tsx` (detail) | `FeatureDetailScreen` | RN has 5 expandable survey modules (trench, risk, hazard, evidence, status). Android should use Compose `LazyColumn` with expandable cards. |
| `feature/[featureId].tsx` | `FeatureDetailScreen` (alt) | RN duplicate of survey detail. Android should have a single canonical `FeatureDetailScreen`. |
| `project/[projectId].tsx` | `ProjectDetailScreen` | RN shows layers with per-layer progress. Android should add per-feature status filtering. |
| `project/import.tsx` | `ImportScreen` | RN has client-side ZIP parsing via `jszip`. Android should use native GeoPackage Android library. |
| `map.tsx` | `MapScreen` | RN map is web-only (CDN MapLibre GL). Android must use MapLibre Native Android. RN has basemap switcher + layer panel + bottom sheet + dual list view. |
| `camera.tsx` | `CameraScreen` | RN uses `expo-image-picker`. Android should use CameraX for smoother integration. |
| `gps.tsx` | `GPSTraceScreen` | RN has Start/Pause/Stop, Haversine distance calc, trace log. Android should implement as `WorkManager` foreground service. |
| `sync.tsx` | `SyncQueueScreen` | RN sync is simulated (mock progress). Android should use real `WorkManager` + `SyncWorker`. |
| `offline.tsx` | `StorageScreen` | RN has manual online/offline toggle. Android should use `ConnectivityManager` listeners. |
| `profile.tsx` | `ProfileScreen` + `SettingsScreen` | RN has theme toggle, sync controls, logout. Android should add offline maps settings. |
| `gallery.tsx` | `PhotoGalleryScreen` | RN partially implemented. Android should implement fully with Room-backed photos. |
| `export.tsx` | `ExportScreen` | RN partially implemented. Android should generate reports locally. |

### RN Store → Android Repository Mapping

| RN Zustand Store | Android Equivalent | Data |
|-----------------|-------------------|------|
| `auth.ts` | `AuthRepository` + `DataStore` | User, JWT tokens, session |
| `project.ts` | `ProjectRepository` + Room `LocalProject` | Projects, assignments, GeoJSON layers |
| `survey.ts` | `SurveyRepository` + multiple Room entities | Features, GPS traces, trenches, risks, hazards, evidence, statuses |
| `map.ts` | `MapRepository` | Map state, layer visibility, selected feature |
| `image.ts` | `PhotoRepository` + Room `LocalPhoto` | Photo queue, upload status |
| `offline.ts` | `ConnectivityObserver` | Online/offline state, sync status |
| `theme.ts` | `ThemeManager` (Material 3 Dynamic Colors) | Light/dark theme, mode |

### Key Observations for Android Port

1. **Room replaces Zustand** for all persistent data (7+ entities needed)
2. **WorkManager replaces simulated sync** for reliable background uploads
3. **MapLibre Native** must replace the web-only `MapLibreMap.tsx` component
4. **CameraX** replaces `expo-image-picker` for camera capture
5. **5 survey modules** (trench, risk, hazard, evidence, status) should be Compose `@Composable` functions with their own ViewModels
6. **Dynamic form rendering** from `field_schema` JSON maps naturally to Compose's dynamic UI
7. **8-tab navigation** in RN can be consolidated to 4 bottom tabs (Home, Survey, Map, Profile) with nested nav graphs for secondary screens
8. **Demo mode** should be available in Android for testing without backend

---

*This design is ready for review. Once approved, the next step is to generate the Android project structure and start implementing Phase 1.*
