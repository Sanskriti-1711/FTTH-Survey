import { create } from 'zustand';
import type { PendingPhoto } from '../utils/types';
import { uploadFeaturePhoto } from '../api/features';
import { uploadSurveyFeaturePhoto } from '../api/survey';
import { useSurveyFeaturesStore } from './survey-features';

// ── Photo upload endpoint routing ────────────────────────────────────────
// The backend has TWO photo endpoints:
//   /api/features/{id}/upload-photo/            → HLD features only
//   /api/survey/survey-features/{id}/upload-photo/ → survey features (incl.
//                                                    engineer-created points)
// A featureId that matches a SurveyFeature id goes to the survey endpoint;
// everything else (HLD features) goes to the HLD endpoint.
function isSurveyFeatureId(featureId: string): boolean {
  const all = useSurveyFeaturesStore.getState().surveyFeatures;
  for (const list of Object.values(all)) {
    if (list.some((sf) => sf.id === featureId)) return true;
  }
  return false;
}

// ── Image Store ───────────────────────────────────────────────────────────

interface ImageState {
  pendingPhotos: PendingPhoto[];
  uploading: boolean;

  addPhoto: (photo: Omit<PendingPhoto, 'uploadStatus' | 'createdAt'>) => void;
  removePhoto: (id: string) => void;
  /** Uploads a photo to a feature. Resolves true on success, false on failure. */
  uploadPhoto: (id: string, featureId: string) => Promise<boolean>;
  /**
   * Link a local-only photo to an HLD feature, then upload it.
   * Resolves: true = uploaded, false = upload failed.
   */
  attachPhoto: (id: string, featureId: string) => Promise<boolean>;
  retryFailed: () => Promise<void>;
  clearUploaded: () => void;
}

export const useImageStore = create<ImageState>((set, get) => ({
  pendingPhotos: [],
  uploading: false,

  addPhoto: (photo) =>
    set((state) => ({
      pendingPhotos: [
        ...state.pendingPhotos,
        {
          ...photo,
          uploadStatus: 'pending',
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  removePhoto: (id) =>
    set((state) => ({
      pendingPhotos: state.pendingPhotos.filter((p) => p.id !== id),
    })),

  uploadPhoto: async (id, featureId): Promise<boolean> => {
    const photo = get().pendingPhotos.find((p) => p.id === id);
    // Already uploaded → treat as success (idempotent). Already uploading →
    // let the in-flight attempt finish; report false so callers don't double-alert.
    if (!photo) return false;
    if (photo.uploadStatus === 'uploaded') return true;
    if (photo.uploadStatus === 'uploading') return false;

    // Mark as uploading (also persist the feature link so retryFailed works
    // for photos attached later via the picker).
    set((state) => ({
      uploading: true,
      pendingPhotos: state.pendingPhotos.map((p) =>
        p.id === id ? { ...p, featureId, uploadStatus: 'uploading' as const } : p
      ),
    }));

    try {
      const result = isSurveyFeatureId(featureId)
        ? await uploadSurveyFeaturePhoto(featureId, {
            uri: photo.localUri,
            name: `photo_${id}.jpg`,
            type: 'image/jpeg',
          })
        : await uploadFeaturePhoto(featureId, {
            uri: photo.localUri,
            name: `photo_${id}.jpg`,
            type: 'image/jpeg',
          });

      set((state) => ({
        uploading: false,
        pendingPhotos: state.pendingPhotos.map((p) =>
          p.id === id
            ? { ...p, uploadStatus: 'uploaded' as const, remoteUrl: result.photo_url }
            : p
        ),
      }));
      return true;
    } catch {
      set((state) => ({
        uploading: false,
        pendingPhotos: state.pendingPhotos.map((p) =>
          p.id === id ? { ...p, uploadStatus: 'failed' as const } : p
        ),
      }));
      return false;
    }
  },

  attachPhoto: async (id, featureId): Promise<boolean> => {
    // Link the local photo to the chosen HLD feature, then upload it.
    set((state) => ({
      pendingPhotos: state.pendingPhotos.map((p) =>
        p.id === id
          ? { ...p, featureId, uploadStatus: 'pending' as const }
          : p
      ),
    }));
    return get().uploadPhoto(id, featureId);
  },


  retryFailed: async () => {
    const failed = get().pendingPhotos.filter((p) => p.uploadStatus === 'failed');
    for (const photo of failed) {
      if (photo.featureId) {
        await get().uploadPhoto(photo.id, photo.featureId);
      }
    }
  },

  clearUploaded: () =>
    set((state) => ({
      pendingPhotos: state.pendingPhotos.filter((p) => p.uploadStatus !== 'uploaded'),
    })),
}));
