import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { AlertTriangle, ArrowLeft, Camera, Image as ImageIcon, Ruler } from 'lucide-react-native';
import { Button } from '../../components/ui/Button';
import {
  AI_ELEMENT_TYPES,
  elementLabel,
  elementTypeFromName,
  estimateFromPhoto,
  uploadMeasurementPhoto,
  withEstimates,
  type AiElementType,
  type AiEstimateBasis,
  type AiMeasurementResult,
} from '../../lib/api/aiMeasure';
import { updateFieldMeasurements } from '../../lib/api/features';
import { getSupervisionFeature } from '../../lib/api/supervision';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius, Spacing, Type } from '../../lib/theme/colors';
import { notify } from '../../lib/utils/dialog';

// ── AI measurements ───────────────────────────────────────────────────────
//
// One photo of one element. The backend proposes dimensions and says where
// they came from: the approved design, the standard catalogue, or a known-size
// object in the frame. Only that last basis measures anything, and even then it
// is an estimate — so this screen applies an `estimated_*` value and never
// touches the tape-measured `actual_*` reading.

const BASIS_LABEL: Record<AiEstimateBasis, string> = {
  plan: 'From the approved design',
  catalogue: 'Standard catalogue size',
  reference: 'Scaled from a known size in the photo',
};

type ConfidenceBand = 'low' | 'medium' | 'high';

// The only confidence cut-offs on this screen: the badge and every row read
// from here so they can never disagree.
function confidenceBand(value: number): ConfidenceBand {
  if (value < 0.5) return 'low';
  if (value < 0.7) return 'medium';
  return 'high';
}

function bandColor(
  colors: { warning: string; primary: string; success: string },
  band: ConfidenceBand
): string {
  return band === 'low' ? colors.warning : band === 'high' ? colors.success : colors.primary;
}

interface Capture {
  uri: string;
  name: string;
  type: string;
}

export default function AiMeasureScreen() {
  // Set when opened from a span, so the estimate belongs to its record. From
  // the supervision tab there is no feature and the estimate action is hidden.
  const params = useLocalSearchParams<{
    spanId?: string;
    layer?: string;
    featureId?: string;
    projectId?: string;
  }>();
  const spanId = String(params.spanId ?? '');
  const layer = String(params.layer ?? '');
  const featureId = String(params.featureId ?? '');
  const projectId = String(params.projectId ?? '');

  const colors = useThemeStore((s) => s.colors);
  // The span's layer names the element, so nobody picks it: a span on
  // `final_trenches` is a trench. The chips stay only as the fallback for a
  // layer whose name says nothing.
  const detected = elementTypeFromName(layer);
  const [photo, setPhoto] = useState<Capture | null>(null);
  const [elementType, setElementType] = useState<AiElementType | null>(detected);
  const [result, setResult] = useState<AiMeasurementResult | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const keepCapture = (asset: ImagePicker.ImagePickerAsset) => {
    setPhoto({
      uri: asset.uri,
      name: asset.fileName ?? `ai-measure-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
    setResult(null);
    setApplied(false);
  };

  const capture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      notify('Permission needed', 'Camera permission is required to capture a measurement photo.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (!picked.canceled && picked.assets?.[0]) keepCapture(picked.assets[0]);
  };

  const pickFromGallery = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: false,
      mediaTypes: ['images'],
    });
    if (!picked.canceled && picked.assets?.[0]) keepCapture(picked.assets[0]);
  };

  const runEstimate = async () => {
    if (!photo || !elementType || estimating) return;
    if (!featureId) {
      notify(
        'Open this from a span',
        'An estimate is stored against the span it belongs to. Open AI measurements from the span screen.'
      );
      return;
    }
    setEstimating(true);
    setApplied(false);
    try {
      const photoId = await uploadMeasurementPhoto(featureId, photo);
      setResult(await estimateFromPhoto(featureId, { photoId, elementType }));
    } catch (err) {
      notify(
        'Could not estimate',
        err instanceof Error ? err.message : 'The measurement service did not answer.'
      );
    } finally {
      setEstimating(false);
    }
  };

  const applyToSpan = async () => {
    if (!result || !featureId || !projectId || applying) return;
    setApplying(true);
    try {
      // Start from what the server holds so readings this screen does not show
      // survive, and keep the inspector's comparison notes.
      const { feature } = await getSupervisionFeature(projectId, featureId);
      const merged = withEstimates(
        (feature.field_measurements ?? {}) as Record<string, unknown>,
        result.estimates,
        result.photo_id
      );
      await updateFieldMeasurements(featureId, merged, feature.comparison_notes ?? '');
      setApplied(true);
      notify('Estimate applied', 'Saved as an AI estimate, not a tape reading.');
    } catch (err) {
      notify(
        'Could not apply',
        err instanceof Error ? err.message : 'The span record could not be updated.'
      );
    } finally {
      setApplying(false);
    }
  };

  const estimates = result?.estimates ?? [];
  // The badge reports the best-supported row. An average would let a catalogue
  // width drag a scaled depth down to "low" while the depth row still says 60%.
  const strongestConfidence = estimates.reduce((best, item) => Math.max(best, item.confidence), 0);
  const band = confidenceBand(strongestConfidence);
  const badgeColor = bandColor(colors, band);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to supervision"
          >
            <ArrowLeft size={22} stroke={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>AI measurements</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {spanId || layer
                ? `${layer || 'Span'}${spanId ? ` · span ${spanId}` : ''}`
                : 'Photograph the element, get its estimated dimensions'}
            </Text>
          </View>
        </View>

        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={[styles.captureCard, { backgroundColor: colors.surface }]}>
            <Camera size={32} stroke={colors.primary} />
            <Text style={[styles.captureTitle, { color: colors.textPrimary }]}>
              No photo yet
            </Text>
            <Text style={[styles.captureText, { color: colors.textSecondary }]}>
              Stand square to the element and fill the frame. Put something of known size beside
              it — a chamber cover, a duct end, a brick — or the numbers are only the design.
            </Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <Button
            title={photo ? 'Retake' : 'Take photo'}
            icon={<Camera size={18} stroke={photo ? colors.primary : colors.onPrimary} />}
            onPress={capture}
            style={styles.actionButton}
          />
          <Button
            title="Gallery"
            variant="secondary"
            icon={<ImageIcon size={18} stroke={colors.primary} />}
            onPress={pickFromGallery}
            style={styles.actionButton}
          />
        </View>

        {detected ? (
          <View style={[styles.detectedRow, { borderColor: colors.outlineLight }]}>
            <Ruler size={15} stroke={colors.textSecondary} />
            <Text style={[styles.detectedText, { color: colors.textSecondary }]}>
              Estimated as {elementLabel(detected)} — read from the span layer name.
            </Text>
          </View>
        ) : (
          <>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          What did you photograph?
        </Text>
        <View style={styles.chipRow}>
          {AI_ELEMENT_TYPES.map((type) => {
            const selected = elementType === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                onPress={() => {
                  setElementType(type.id);
                  setResult(null);
                  setApplied(false);
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: selected ? colors.primary : colors.textTertiary + '55',
                    backgroundColor: selected ? colors.primary : 'transparent',
                  },
                ]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${type.label} measurements`}
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
          </>
        )}

        {photo && elementType ? (
          <Button
            title={estimating ? 'Estimating…' : 'Estimate from this photo'}
            icon={
              estimating ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Ruler size={18} stroke={colors.onPrimary} />
              )
            }
            onPress={runEstimate}
            style={{ marginBottom: Spacing.xl }}
          />
        ) : null}

        {result && estimates.length > 0 ? (
          <View style={[styles.estimateCard, { backgroundColor: colors.surface }]}>
            <View style={styles.estimateHeader}>
              <Ruler size={16} stroke={colors.textSecondary} />
              <Text style={[styles.estimateTitle, { color: colors.textPrimary }]}>
                Estimated dimensions
              </Text>
              <View
                style={[
                  styles.confidenceBadge,
                  { backgroundColor: badgeColor + '20', borderColor: badgeColor + '55' },
                ]}
              >
                <Text style={[styles.confidenceText, { color: badgeColor }]}>
                  {band} {Math.round(strongestConfidence * 100)}%
                </Text>
              </View>
            </View>

            <Text style={[styles.basisText, { color: colors.textSecondary }]}>
              {BASIS_LABEL[result.basis]}
            </Text>

            {estimates.map((item) => {
              const itemColor = bandColor(colors, confidenceBand(item.confidence));
              return (
                <View
                  key={item.key}
                  style={[styles.estimateRow, { borderTopColor: colors.outlineLight }]}
                >
                  <Text style={[styles.estimateLabel, { color: colors.textSecondary }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.estimateValue, { color: colors.textPrimary }]}>
                    {item.value} {item.unit}
                  </Text>
                  <Text style={[styles.estimateConfidence, { color: itemColor }]}>
                    {Math.round(item.confidence * 100)}%
                  </Text>
                </View>
              );
            })}

            <View style={styles.estimateNote}>
              <AlertTriangle size={14} stroke={colors.warning} />
              <Text style={[styles.noteText, { color: colors.textSecondary }]}>
                {result.notes} Applying stores it as an estimate — the Actual Depth and Width
                fields stay yours to tape.
              </Text>
            </View>

            {featureId ? (
              <Button
                title={applied ? 'Applied' : applying ? 'Applying…' : 'Apply to this span'}
                variant="secondary"
                onPress={applyToSpan}
                style={{ marginTop: Spacing.md }}
              />
            ) : null}
          </View>
        ) : (
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            {photo
              ? elementType
                ? 'Request the estimate to see what the photo supports.'
                : 'This span layer does not name an element type — pick one above.'
              : 'Take a photo to estimate this span.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, marginLeft: Spacing.sm },
  title: { ...Type.display },
  subtitle: { ...Type.label, marginTop: 2, fontWeight: '400' },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: Radius.lg,
    backgroundColor: '#F3F4F6',
    marginBottom: Spacing.md,
  },
  captureCard: {
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  captureTitle: { ...Type.title },
  captureText: { ...Type.body, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  actionButton: { flex: 1 },
  sectionTitle: { ...Type.title, marginBottom: Spacing.md },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  detectedText: { ...Type.label, flex: 1, fontWeight: '400' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  chip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  chipText: { ...Type.label },
  estimateCard: { borderRadius: Radius.lg, padding: Spacing.lg },
  estimateHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  estimateTitle: { ...Type.title, flex: 1 },
  basisText: { ...Type.meta, marginTop: 2 },
  confidenceBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  confidenceText: { fontSize: 12, fontWeight: '700' },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    marginTop: Spacing.md,
  },
  estimateLabel: { ...Type.body, flex: 1 },
  estimateValue: { ...Type.bodyStrong, marginRight: Spacing.md },
  estimateConfidence: { fontSize: 12, fontWeight: '600', width: 40, textAlign: 'right' },
  estimateNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  noteText: { ...Type.label, flex: 1, fontWeight: '400' },
  hint: { ...Type.body },
});
