import { create } from 'zustand';
import { DEMO_LAYERS } from './demo-data';

// ── Map Store ─────────────────────────────────────────────────────────────

interface MapLayer {
  id: string;
  name: string;
  visible: boolean;
  featureCount: number;
  geometryType?: 'Point' | 'LineString' | 'Polygon';
}

export interface FeaturePopup {
  id: string;
  name: string;
  layerName: string;
  status: string;
  /** The raw layer ID (e.g., 'objects', 'pdps', 'trenches') for schema lookup */
  layerId?: string;
}

interface MapState {
  layers: MapLayer[];
  selectedFeatureId: string | null;
  selectedFeaturePopup: FeaturePopup | null;
  userLocation: { latitude: number; longitude: number } | null;
  followUser: boolean;

  setLayers: (layers: MapLayer[]) => void;
  toggleLayer: (id: string) => void;
  selectFeature: (featureId: string | null, popup?: FeaturePopup | null) => void;
  setUserLocation: (location: { latitude: number; longitude: number } | null) => void;
  setFollowUser: (follow: boolean) => void;
  loadDemoLayers: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  layers: [],
  selectedFeatureId: null,
  selectedFeaturePopup: null,
  userLocation: null,
  followUser: false,

  setLayers: (layers) => set({ layers }),
  toggleLayer: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })),
  selectFeature: (featureId, popup = null) =>
    set({ selectedFeatureId: featureId, selectedFeaturePopup: popup }),
  setUserLocation: (location) => set({ userLocation: location }),
  setFollowUser: (follow) => set({ followUser: follow }),

  loadDemoLayers: () =>
    set({
      layers: DEMO_LAYERS.map((l) => ({
        id: l.layer_id,
        name: l.layer_name,
        visible: true,
        featureCount: l.feature_count,
        geometryType: l.layer_id === 'trenches' ? 'LineString' : l.layer_id === 'polygons' ? 'Polygon' : 'Point',
      })),
    }),
}));
