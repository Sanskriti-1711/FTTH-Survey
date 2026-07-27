import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore } from '../lib/stores/theme';
import { useImageStore } from '../lib/stores/image';
import { useProjectStore } from '../lib/stores/project';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spacing, Radius } from '../lib/theme/colors';
import { Camera as CameraIcon, Image as ImageIcon, X, Upload, Check, ArrowLeft } from 'lucide-react-native';
import type { PendingPhoto } from '../lib/utils/types';

// ── Camera Screen ─────────────────────────────────────────────────────────

export default function CameraScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { pendingPhotos, addPhoto, removePhoto, uploadPhoto, uploading } = useImageStore();
  const { activeProject } = useProjectStore();
  const [selectedPhoto, setSelectedPhoto] = useState<PendingPhoto | null>(null);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      addPhoto({
        id: `photo_${Date.now()}`,
        localUri: asset.uri,
        projectId: activeProject?.id ?? 'unknown',
        featureId: undefined,
      });
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: false,
      mediaTypes: ['images'],
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      addPhoto({
        id: `photo_${Date.now()}`,
        localUri: asset.uri,
        projectId: activeProject?.id ?? 'unknown',
        featureId: undefined,
      });
    }
  };

  const statusCount = {
    pending: pendingPhotos.filter((p) => p.uploadStatus === 'pending').length,
    uploaded: pendingPhotos.filter((p) => p.uploadStatus === 'uploaded').length,
    failed: pendingPhotos.filter((p) => p.uploadStatus === 'failed').length,
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} stroke={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Photos</Text>
          <View style={styles.badges}>
            {statusCount.pending > 0 && <Badge label={`${statusCount.pending} pending`} bgColor={colors.warning + '20'} color={colors.warning} />}
            {statusCount.failed > 0 && <Badge label={`${statusCount.failed} failed`} bgColor={colors.error + '20'} color={colors.error} />}
            {statusCount.uploaded > 0 && <Badge label={`${statusCount.uploaded} uploaded`} bgColor={colors.success + '20'} color={colors.success} />}
          </View>
        </View>

        {/* Viewport / Gallery */}
        {selectedPhoto ? (
          <View style={styles.preview}>
            <TouchableOpacity
              style={[styles.closePreview, { backgroundColor: colors.overlay }]}
              onPress={() => setSelectedPhoto(null)}
            >
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Image source={{ uri: selectedPhoto.localUri }} style={styles.previewImage} resizeMode="contain" />
            <View style={styles.previewActions}>
              <Button
                title="Delete"
                variant="danger"
                size="sm"
                onPress={() => {
                  removePhoto(selectedPhoto.id);
                  setSelectedPhoto(null);
                }}
              />
            </View>
          </View>
        ) : pendingPhotos.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon={<CameraIcon size={40} stroke={colors.primary} />}
              title="No Photos Yet"
              description="Capture field photos or pick from your gallery"
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {pendingPhotos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                style={styles.gridItem}
                onPress={() => setSelectedPhoto(photo)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: photo.localUri }} style={styles.thumbnail} />
                <View style={styles.thumbnailOverlay}>
                  {photo.uploadStatus === 'uploaded' && (
                    <Check size={16} stroke={colors.success} />
                  )}
                  {photo.uploadStatus === 'failed' && (
                    <X size={16} stroke={colors.error} />
                  )}
                  {photo.uploadStatus === 'uploading' && (
                    <View style={[styles.uploadingDot, { borderColor: colors.warning }]} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Capture Buttons */}
        <View style={styles.captureBar}>
          <TouchableOpacity
            style={[styles.captureBtn, { backgroundColor: colors.surface, borderColor: colors.outline }]}
            onPress={pickFromGallery}
            activeOpacity={0.7}
          >
            <ImageIcon size={22} stroke={colors.textSecondary} />
            <Text style={[styles.captureLabel, { color: colors.textSecondary }]}>Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutterBtn, { backgroundColor: colors.primary }]}
            onPress={takePhoto}
            activeOpacity={0.7}
          >
            <View style={[styles.shutterInner, { borderColor: colors.onPrimary }]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureBtn, { backgroundColor: colors.surface, borderColor: colors.outline }]}
            activeOpacity={0.7}
            onPress={() => {}}
          >
            <Upload size={22} stroke={colors.textSecondary} />
            <Text style={[styles.captureLabel, { color: colors.textSecondary }]}>Upload</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.lg },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: { fontSize: 26, fontWeight: '700', flex: 1 },
  badges: { flexDirection: 'row', gap: Spacing.xs },
  empty: { flex: 1, justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl * 2,
  },
  gridItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  preview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '70%',
    borderRadius: Radius.lg,
  },
  closePreview: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewActions: {
    marginTop: Spacing.lg,
  },
  captureBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  captureBtn: {
    alignItems: 'center',
    gap: 4,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  captureLabel: { fontSize: 12, fontWeight: '500' },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D5CFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
  },
});
