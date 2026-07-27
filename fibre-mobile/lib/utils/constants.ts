// ── App Constants ────────────────────────────────────────────────────────

// Change this to your actual backend URL
// For local dev: http://localhost:8000 (Django on same machine)
// For LAN:       http://YOUR_IP:8000 (other devices on network)
// For cloud:     https://your-domain.com
export const API_BASE_URL =
  process.env.NODE_ENV !== 'production'
    ? 'http://localhost:8000'
    : 'https://api.fibre360.com';

export const MICROSERVICE_BASE_URL = 'https://fiber-import.zeabur.app';

export const APP_NAME = 'Fiber360';

export const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const LOCATION_INTERVAL_MS = 10_000;    // 10 seconds
export const MAX_PHOTO_SIZE_MB = 10;
export const PAGE_SIZE = 20;

export const FEATURE_STATUSES = [
  'pending',
  'assigned',
  'under_review',
  'approved',
  'redo',
] as const;

export const PROJECT_STATUSES = [
  'draft',
  'in_progress',
  'active',
  'completed',
  'archived',
] as const;

export const SCOPE_OPTIONS = [
  { label: 'Project', value: 'project' },
  { label: 'Layer', value: 'layer' },
  { label: 'Feature', value: 'feature' },
] as const;
