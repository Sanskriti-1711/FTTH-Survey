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
import { Input } from '../../components/ui/Input';
import {
  AI_ELEMENT_TYPES,
  elementLabel,
  elementTypeFromName,
  uploadMeasurementPhoto,
  type AiElementType,
} from '../../lib/api/aiMeasure';
import {
  measureTape,
  TAPE_DIMENSIONS,
  typedTapeReading,
  withTapeReading,
  type TapeMeasurement,
  type TapeMeasurementResult,
  type TapeReading,
  type TapeSource,
} from '../../lib/api/tapeMeasure';
import { updateFieldMeasurements } from '../../lib/api/features';
import { getSupervisionFeature } from '../../lib/api/supervision';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius, Spacing, Type } from '../../lib/theme/colors';
import { notify } from '../../lib/utils/dialog';

// ── Tape measurement (OCR) ────────────────────────────────────────────────
//
// The tape is the scale. Photograph the blade running across the dimension
// (or along it, for length): the backend reads the printed numbers and returns
// the distance between the outermost two. Nothing is written there — this
// screen fills the span form with the reading as Actual Depth / Width / Length,
// which the engineer confirms against the tape and saves.

interface Capture {
  uri: string;
  name: string;
  type: string;
}

export default function TapeMeasureScreen() {
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
  const detected = elementTypeFromName(layer);
  const [elementType, setElementType] = useState<AiElementType | null>(detected);
  const options = elementType ? TAPE_DIMENSIONS[elementType] : [];
  const [dimension, setDimension] = useState<string>(options[0]?.id ?? 'depth');
  const [photo, setPhoto] = useState<Capture | null>(null);
  const [result, setResult] = useState<TapeMeasurementResult | null>(null);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [typed, setTyped] = useState('');

  const selected = options.find((option) => option.id === dimension) ?? options[0];

  const keepCapture = (asset: ImagePicker.ImagePickerAsset) => {
    setPhoto({
      uri: asset.uri,
      name: asset.fileName ?? `tape-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
    setResult(null);
  };

  const capture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      notify('Permission needed', 'Camera permission is required to photograph the tape.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: false });
    if (!picked.canceled && picked.assets?.[0]) keepCapture(picked.assets[0]);
  };

  const pickFromGallery = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      allowsEditing: false,
      mediaTypes: ['images'],
    });
    if (!picked.canceled && picked.assets?.[0]) keepCapture(picked.assets[0]);
  };

  const runRead = async () => {
    if (!photo || !elementType || !selected || reading) return;
    if (!featureId) {
      notify(
        'Open this from a span',
        'A tape reading belongs to the span it measures. Open this screen from the span record.'
      );
      return;
    }
    setReading(true);
    try {
      const photoId = await uploadMeasurementPhoto(featureId, photo);
      setResult(
        await measureTape(featureId, {
          photoId,
          elementType,
          dimension: selected.id,
        })
      );
    } catch (err) {
      notify(
        'Could not read the tape',
        err instanceof Error ? err.message : 'The tape-reading service did not answer.'
      );
    } finally {
      setReading(false);
    }
  };

  // The photo's reading and the typed one land in the same place — the span's
  // actual_* field — tagged with which of the two produced it.
  const applyReading = async (
    measurement: TapeMeasurement,
    readings: TapeReading[],
    photoId: string | null,
    source: TapeSource
  ) => {
    if (applying) return;
    if (!featureId || !projectId) {
      notify(
        'Open this from a span',
        'A tape reading belongs to the span it measures. Open this screen from the span record.'
      );
      return;
    }
    setApplying(true);
    try {
      const { feature } = await getSupervisionFeature(projectId, featureId);
      const merged = withTapeReading(
        (feature.field_measurements ?? {}) as Record<string, unknown>,
        measurement,
        photoId,
        readings,
        source
      );
      await updateFieldMeasurements(featureId, merged, feature.comparison_notes ?? '');
      notify(
        'Form filled',
        `${measurement.label} is ${measurement.value} ${measurement.unit}. Check it against the tape and save the inspection.`
      );
      router.back();
    } catch (err) {
      notify(
        'Could not fill the form',
        err instanceof Error ? err.message : 'The span record could not be updated.'
      );
    } finally {
      setApplying(false);
    }
  };

  const fillForm = () => {
    if (!result?.measurement) return;
    void applyReading(result.measurement, result.readings, result.photo_id, 'tape_ocr');
  };

  const typedMeasurement = selected ? typedTapeReading(selected, typed) : null;

  const fillTyped = () => {
    if (!typedMeasurement) return;
    void applyReading(typedMeasurement, [], null, 'tape_typed');
  };

  const readingsText = result?.readings.length
    ? result.readings.map((row) => `${row.value} ${row.unit}`).join(' → ')
    : '';

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
            <Text style={[styles.title, { color: colors.textPrimary }]}>Tape measurement</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {spanId ? `Span ${spanId}` : layer || 'Read the numbers off the tape'}
            </Text>
          </View>
        </View>

        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={[styles.captureCard, { backgroundColor: colors.surface }]}>
            <Camera size={32} stroke={colors.primary} />
            <Text style={[styles.captureTitle, { color: colors.textPrimary }]}>No photo yet</Text>
            <Text style={[styles.captureText, { color: colors.textSecondary }]}>
              Lay the tape across the depth or width (or along the length) and keep at least two
              printed numbers in the frame. The digits are the scale, so nothing else is needed.
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
              {elementLabel(detected)} — read from the span layer name.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              What did you photograph?
            </Text>
            <View style={styles.chipRow}>
              {AI_ELEMENT_TYPES.map((type) => {
                const isSelected = elementType === type.id;
                return (
                  <TouchableOpacity
                    key={type.id}
                    onPress={() => {
                      setElementType(type.id);
                      setDimension(TAPE_DIMENSIONS[type.id][0]?.id ?? 'depth');
                      setResult(null);
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: isSelected ? colors.primary : colors.textTertiary + '55',
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${type.label} tape measurement`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? colors.onPrimary : colors.textSecondary },
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

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          What is the tape measuring?
        </Text>
        <View style={styles.chipRow}>
          {options.map((option) => {
            const isSelected = option.id === selected?.id;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => {
                  setDimension(option.id);
                  setResult(null);
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: isSelected ? colors.primary : colors.textTertiary + '55',
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${option.label} from the tape`}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: isSelected ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {photo && elementType && selected ? (
          <Button
            title={reading ? 'Reading…' : 'Read the tape'}
            icon={
              reading ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Ruler size={18} stroke={colors.onPrimary} />
              )
            }
            onPress={runRead}
            style={{ marginBottom: Spacing.xl }}
          />
        ) : null}

        {result ? (
          <View style={[styles.resultCard, { backgroundColor: colors.surface }]}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>
                {result.measurement ? 'Tape reading' : 'No reading'}
              </Text>
              {result.measurement ? (
                <Text style={[styles.resultValue, { color: colors.primary }]}>
                  {result.measurement.value} {result.measurement.unit}
                </Text>
              ) : null}
            </View>

            {readingsText ? (
              <Text style={[styles.readings, { color: colors.textSecondary }]}>
                Read: {readingsText}
              </Text>
            ) : null}

            <View style={styles.noteRow}>
              <AlertTriangle size={14} stroke={colors.warning} />
              <Text style={[styles.noteText, { color: colors.textSecondary }]}>{result.notes}</Text>
            </View>

            {result.measurement && featureId ? (
              <Button
                title={applying ? 'Filling…' : `Fill ${result.measurement.label.toLowerCase()}`}
                variant="secondary"
                onPress={fillForm}
                loading={applying}
                style={{ marginTop: Spacing.md }}
              />
            ) : null}
          </View>
        ) : (
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            {photo
              ? 'Read the tape to see what the printed numbers say.'
              : 'Photograph the tape, or type the number you read off it.'}
          </Text>
        )}

        <View style={[styles.typedCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>
            Type the reading
          </Text>
          <Text style={[styles.typedText, { color: colors.textSecondary }]}>
            {result && !result.measurement
              ? 'The photo could not be read. Read the blade yourself and enter the number.'
              : 'Read the blade yourself and enter the number.'}
          </Text>
          <Input
            label={selected ? `${selected.label} (${selected.unit})` : 'Reading'}
            value={typed}
            onChangeText={setTyped}
            keyboardType="decimal-pad"
            placeholder={selected?.unit === 'm' ? '0.00' : '0'}
            hint={selected ? undefined : 'Choose what you photographed first.'}
            returnKeyType="done"
          />
          <Button
            title={
              typedMeasurement && selected
                ? `Fill ${selected.label.toLowerCase()} with ${typedMeasurement.value} ${selected.unit}`
                : 'Fill the form'
            }
            variant="secondary"
            disabled={!typedMeasurement}
            loading={applying}
            onPress={fillTyped}
          />
        </View>
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
    marginBottom: Spacing.lg,
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
  resultCard: { borderRadius: Radius.lg, padding: Spacing.lg },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  resultTitle: { ...Type.title, flex: 1 },
  resultValue: { ...Type.display },
  readings: { ...Type.meta, marginTop: Spacing.sm },
  noteRow: {
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
  typedCard: { borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.xl },
  typedText: { ...Type.meta, marginTop: Spacing.xs, marginBottom: Spacing.md },
});
