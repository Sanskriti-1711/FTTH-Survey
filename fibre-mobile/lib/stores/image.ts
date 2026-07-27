import { create } from 'zustand';
import type { PendingPhoto } from '../utils/types';
import { uploadFeaturePhoto } from '../api/features';

// ── Image Store ───────────────────────────────────────────────────────────

interface ImageState {
  pendingPhotos: PendingPhoto[];
  uploading: boolean;

  addPhoto: (photo: Omit<PendingPhoto, 'uploadStatus' | 'createdAt'>) => void;
  removePhoto: (id: string) => void;
  uploadPhoto: (id: string, featureId: string) => Promise<void>;
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

  uploadPhoto: async (id, featureId) => {
    const photo = get().pendingPhotos.find((p) => p.id === id);
    if (!photo || photo.uploadStatus === 'uploading') return;

    // Mark as uploading
    set((state) => ({
      uploading: true,
      pendingPhotos: state.pendingPhotos.map((p) =>
        p.id === id ? { ...p, uploadStatus: 'uploading' as const } : p
      ),
    }));

    try {
      const result = await uploadFeaturePhoto(featureId, {
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
    } catch {
      set((state) => ({
        uploading: false,
        pendingPhotos: state.pendingPhotos.map((p) =>
          p.id === id ? { ...p, uploadStatus: 'failed' as const } : p
        ),
      }));
    }
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
