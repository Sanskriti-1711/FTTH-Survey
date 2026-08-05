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
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore } from '../lib/stores/theme';
import { useImageStore } from '../lib/stores/image';
import { useProjectStore } from '../lib/stores/project';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spacing, Radius } from '../lib/theme/colors';
import { Camera as CameraIcon, Image as ImageIcon, X, Upload, Check, ArrowLeft, Link2 } from 'lucide-react-native';
import { PhotoFeaturePicker } from '../lib/components/PhotoFeaturePicker';
import type { PendingPhoto } from '../lib/utils/types';

// ── Camera Screen ─────────────────────────────────────────────────────────

export default function CameraScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { pendingPhotos, addPhoto, removePhoto, uploadPhoto, attachPhoto, uploading } = useImageStore();
  const { activeProject } = useProjectStore();
  // featureId passed via route param (from feature detail / survey forms)
  const { featureId } = useLocalSearchParams<{ featureId?: string }>();
  const [selectedPhoto, setSelectedPhoto] = useState<PendingPhoto | null>(null);
  // Photo currently being linked to a feature via the picker
  const [attachPhotoTarget, setAttachPhotoTarget] = useState<PendingPhoto | null>(null);
  // id of the photo currently uploading via the attach flow (scoped per photo)
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null);

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
      const id = `photo_${Date.now()}`;
      addPhoto({
        id,
        localUri: asset.uri,
        projectId: activeProject?.id ?? 'unknown',
        featureId,
      });
      // If opened from a feature, upload immediately so the photo is attached
      if (featureId) {
        uploadPhoto(id, featureId);
      }
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
      const id = `photo_${Date.now()}`;
      addPhoto({
        id,
        localUri: asset.uri,
        projectId: activeProject?.id ?? 'unknown',
        featureId,
      });
      if (featureId) {
        uploadPhoto(id, featureId);
      }
    }
  };

  // ── Upload all pending/failed photos that are tied to a feature ────────
  const handleUploadAll = async () => {
    const toUpload = pendingPhotos.filter(
      (p) => p.featureId && p.uploadStatus !== 'uploaded' && p.uploadStatus !== 'uploading'
    );
    if (toUpload.length === 0) {
      Alert.alert(
        'Nothing to upload',
        featureId
          ? 'All photos for this feature are already uploaded.'
          : 'All photos are already uploaded. Tap a photo and use “Attach to Feature” to link un-attached photos.'
      );
      return;
    }
    for (const p of toUpload) {
      if (p.featureId) {
        await uploadPhoto(p.id, p.featureId);
      }
    }
    Alert.alert('Upload complete', `${toUpload.length} photo${toUpload.length === 1 ? '' : 's'} uploaded.`);
  };

  const statusCount = {
    pending: pendingPhotos.filter((p) => p.uploadStatus === 'pending').length,
    uploaded: pendingPhotos.filter((p) => p.uploadStatus === 'uploaded').length,
    failed: pendingPhotos.filter((p) => p.uploadStatus === 'failed').length,
  };

  // ── Attach a local photo to a chosen feature (picker callback) ────────
  const handleAttachSelect = async (targetFeatureId: string, label: string) => {
    const photo = attachPhotoTarget ?? selectedPhoto;
    setAttachPhotoTarget(null);
    if (!photo) return;
    setAttachBusyId(photo.id);
    try {
      const ok = await attachPhoto(photo.id, targetFeatureId);
      // Refresh the preview so the status badge updates immediately
      setSelectedPhoto((prev) =>
        prev && prev.id === photo.id
          ? {
              ...prev,
              featureId: targetFeatureId,
              uploadStatus: ok ? 'uploaded' : 'failed',
            }
          : prev
      );
      if (ok) {
        Alert.alert('Photo attached', `Photo linked to ${label} and uploaded.`);
      } else {
        Alert.alert('Upload failed', 'The photo was linked to the feature, but the upload failed. Tap Upload to retry.');
      }
    } catch {
      Alert.alert('Upload failed', 'The photo was linked locally, but the upload failed. Tap Upload to retry.');
    } finally {
      setAttachBusyId(null);
    }
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

        {/* Guidance when opened from Home (no feature context) */}
        {!featureId && (
          <View style={[styles.noFeatureNotice, { backgroundColor: colors.warning + '14', borderColor: colors.warning + '55' }]}>
            <CameraIcon size={16} stroke={colors.warning} />
            <Text style={[styles.noFeatureText, { color: colors.textSecondary }]}>
              Photos taken here are stored on this device. Tap a photo, then “Attach to Feature” to link it to an HLD feature and upload it.
            </Text>
          </View>
        )}

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
            <View style={styles.previewInfo}>
              {selectedPhoto.featureId ? (
                <Text style={[styles.previewAttached, { color: colors.success }]} numberOfLines={1}>
                  ✓ Attached to feature {selectedPhoto.featureId.slice(-6)}
                </Text>
              ) : (
                <Text style={[styles.previewAttached, { color: colors.textTertiary }]}>
                  Not attached to a feature yet
                </Text>
              )}
            </View>
            <View style={styles.previewActions}>
              {!selectedPhoto.featureId && (
                <Button
                  title="Attach to Feature"
                  variant="secondary"
                  size="sm"
                  icon={<Link2 size={16} stroke={colors.primary} />}
                  loading={attachBusyId === selectedPhoto.id}
                  onPress={() => setAttachPhotoTarget(selectedPhoto)}
                />
              )}
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
                {/* Unattached badge — photos with no feature link (e.g. from Home) */}
                {!photo.featureId && (
                  <View style={[styles.thumbnailBadge, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
                    <Link2 size={13} stroke={colors.textTertiary} />
                  </View>
                )}
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

        {/* Feature picker — attach a local photo to an HLD feature */}
        <PhotoFeaturePicker
          visible={attachPhotoTarget !== null}
          onClose={() => setAttachPhotoTarget(null)}
          onSelect={handleAttachSelect}
        />

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
            onPress={handleUploadAll}
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
    gap: Spacing.md,
    width: '100%',
  },
  previewInfo: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  previewAttached: {
    fontSize: 13,
    fontWeight: '500',
  },
  thumbnailBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  noFeatureNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noFeatureText: { flex: 1, fontSize: 13, lineHeight: 18 },
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
