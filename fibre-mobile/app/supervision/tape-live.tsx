import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, Ruler } from 'lucide-react-native';

import { Button } from '../../components/ui/Button';
import {
  elementLabel,
  elementTypeFromName,
  uploadMeasurementPhoto,
} from '../../lib/api/aiMeasure';
import {
  fillTapeReading,
  measureTape,
  TAPE_DIMENSIONS,
  type TapeMeasurementResult,
} from '../../lib/api/tapeMeasure';
import { frameGuide, readTapeFrame, type LiveFrameResult } from '../../lib/api/tapeLive';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius, Spacing, Type } from '../../lib/theme/colors';
import { notify } from '../../lib/utils/dialog';

// ── Live tape reading ─────────────────────────────────────────────────────
//
// The camera stays open and the reading appears over the viewfinder, so the
// engineer can see what the tape says before pressing the shutter rather than
// after uploading. Each frame is answered by the same server reader the stored
// photo goes through — the overlay is not a second, cheaper guess that could
// disagree with the reading on the record.
//
// That also sets the pace: one frame is one full read, so the loop is slower
// than a camera frame and only ever has one request in flight. The next frame
// is scheduled when the last one comes back, because a fixed timer stacks
// requests behind a slow read and puts a number on screen that belongs to a
// frame the camera left seconds ago. The shutter takes a full-resolution photo
// and reads *that*, which is what gets saved.

const POLL_MS = 1800;
// A reading older than this is marked as such: the engineer has probably moved
// the phone since, and an unmarked stale number is a number they might trust.
const STALE_MS = 12_000;

export default function TapeLiveScreen() {
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
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const busyRef = useRef(false);

  const detected = elementTypeFromName(layer);
  const dimension = detected ? TAPE_DIMENSIONS[detected][0]?.id ?? 'depth' : 'depth';
  const elementType = detected ?? 'trench';

  const [live, setLive] = useState<LiveFrameResult | null>(null);
  const [liveAt, setLiveAt] = useState(0);
  const [pollError, setPollError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [result, setResult] = useState<TapeMeasurementResult | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [saving, setSaving] = useState(false);
  // The last number the reader actually locked, kept across the frames that
  // refuse. A number that vanishes every other frame reads as broken even when
  // every read is honest, and the crew is watching this while they line the
  // clip up — the number has to be there to settle onto.
  const [kept, setKept] = useState<{ mm: number; at: number } | null>(null);

  // The frame loop. `takePictureAsync` is the only way to get pixels out of the
  // preview, so a "stream" here is a still every POLL_MS with the previous one
  // finished — never two at once, which is what would make the overlay lag the
  // camera by more than one read.
  useEffect(() => {
    if (!permission?.granted || paused) return;
    let cancelled = false;

    const tick = async () => {
      if (busyRef.current || cancelled || !cameraRef.current) return;
      busyRef.current = true;
      try {
        // Silent: this still is the poller's, not the engineer's. CameraX
        // plays its shutter sound for every capture, so without this the
        // phone clicks at the crew every couple of seconds while they are
        // lining the tape up. The deliberate "Take photo" keeps its sound as
        // confirmation; only the automatic frames are muted.
        const shot = await cameraRef.current.takePictureAsync({
          quality: 0.35,
          skipProcessing: true,
          shutterSound: false,
        });
        if (!shot?.uri || cancelled) return;
        const next = await readTapeFrame(shot.uri, elementType, dimension);
        if (cancelled) return;
        setLive(next);
        setLiveAt(Date.now());
        setPollError(null);
        if (next.clip.usable && next.clip.reading_mm !== null) {
          setKept({ mm: next.clip.reading_mm, at: Date.now() });
        }
      } catch (error) {
        if (!cancelled) {
          setPollError(
            error instanceof Error ? error.message : 'The live reading stopped answering.'
          );
        }
      } finally {
        busyRef.current = false;
      }
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      const started = Date.now();
      await tick();
      if (cancelled) return;
      timer = setTimeout(run, Math.max(0, POLL_MS - (Date.now() - started)));
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [permission?.granted, paused, elementType, dimension]);

  const capture = async () => {
    if (!cameraRef.current || measuring) return;
    if (!featureId) {
      notify(
        'Open this from a span',
        'A tape reading belongs to the span it measures. Open the viewfinder from the span record.'
      );
      return;
    }
    setPaused(true);
    setMeasuring(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!shot?.uri) throw new Error('The camera did not return a photo.');
      setCaptured(shot.uri);
      const photoId = await uploadMeasurementPhoto(featureId, {
        uri: shot.uri,
        name: `tape-${Date.now()}.jpg`,
        type: 'image/jpeg',
      });
      setResult(await measureTape(featureId, { photoId, elementType, dimension }));
    } catch (error) {
      notify(
        'Could not read the tape',
        error instanceof Error ? error.message : 'The tape-reading service did not answer.'
      );
    } finally {
      setMeasuring(false);
    }
  };

  const fill = async () => {
    if (!result?.measurement || saving) return;
    setSaving(true);
    try {
      await fillTapeReading({
        featureId,
        projectId,
        measurement: result.measurement,
        readings: result.readings,
        photoId: result.photo_id,
        source: 'tape_ocr',
      });
      notify(
        'Form filled',
        `${result.measurement.label} is ${result.measurement.value} ${result.measurement.unit}. Check it against the tape and save the inspection.`
      );
      router.back();
    } catch (error) {
      notify(
        'Could not fill the form',
        error instanceof Error ? error.message : 'The span record could not be updated.'
      );
    } finally {
      setSaving(false);
    }
  };

  const stale = live !== null && Date.now() - liveAt > STALE_MS;
  const usable = Boolean(live?.clip.usable);
  // A best-effort reading is still shown — that is the number the crew asked
  // for — but never in the green of a confirmed one.
  const low = Boolean(usable && live?.clip.low_confidence);
  const guide = frameGuide(live);
  // Amber, not green: a kept number is what the blade said a moment ago, not
  // what this frame says, and the two must not look alike.
  const keptAge = kept ? Math.max(0, Math.round((Date.now() - kept.at) / 1000)) : 0;
  const keptTone = usable && !low ? '#34D399' : kept || low ? '#FBBF24' : '#F8FAFC';

  if (!permission) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>
          Camera permission needed
        </Text>
        <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
          The live reading needs the camera preview to show what the reader sees.
        </Text>
        <Button title="Allow camera" onPress={requestPermission} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.roundButton}
            accessibilityRole="button"
            accessibilityLabel="Back to tape measurement"
          >
            <ArrowLeft size={22} stroke="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Live tape reading</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {spanId ? `Span ${spanId}` : layer || 'Point at the blade and the clip'}
            </Text>
          </View>
          {detected ? (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{elementLabel(detected)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.spacer} pointerEvents="none" />

        <View style={styles.bottomPanel}>
          <View style={styles.readingRow}>
            <Text style={[styles.reading, { color: keptTone }]}>
              {usable
                ? `${low ? '~' : ''}${live?.clip.reading_mm} mm`
                : kept
                  ? `${kept.mm} mm`
                  : '—'}
            </Text>
            {measuring || (busyRef.current && !live) ? (
              <ActivityIndicator color="#FFFFFF" style={{ marginLeft: Spacing.md }} />
            ) : null}
          </View>

          <Text style={styles.stageLine}>
            {usable && low
              ? 'best effort — the blade was not fully confirmed'
              : usable && live?.clip.label
                ? `at the clip face · ${live.clip.divisions_to_face} div past ${live.clip.label.value}`
              : kept
                ? `last good ${keptAge}s ago · ${live?.clip.stage === 'blade' ? 'no tape in this frame' : `refused at ${live?.clip.stage}`}`
                : live?.clip.stage
                  ? live.clip.stage === 'blade'
                    ? 'no tape in this frame'
                    : `refused at ${live.clip.stage}`
                  : 'looking for the tape'}
          </Text>

          <Text style={styles.guide} numberOfLines={3}>
            {pollError ?? guide}
          </Text>

          <Text style={styles.meta}>
            {live
              ? `${stale ? 'stale — ' : ''}read in ${live.elapsed_ms} ms · next frame when this one returns`
              : 'one full server read per frame'}
          </Text>

          {captured && result ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Ruler size={16} stroke="#FFFFFF" />
                <Text style={styles.resultTitle}>
                  {result.measurement
                    ? `Photo reads ${result.measurement.value} ${result.measurement.unit}`
                    : 'The photo could not be read'}
                </Text>
              </View>
              <Text style={styles.resultNote} numberOfLines={3}>
                {result.measurement
                  ? result.notes
                  : result.framing && !result.framing.ok
                    ? result.framing.message
                    : result.notes}
              </Text>
              {result.measurement ? (
                <Button
                  title={saving ? 'Filling…' : `Fill ${result.measurement.label.toLowerCase()}`}
                  onPress={fill}
                  loading={saving}
                  style={{ marginTop: Spacing.md }}
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.shutterRow}>
            <TouchableOpacity
              style={[styles.shutter, { borderColor: '#FFFFFF' }]}
              onPress={capture}
              disabled={measuring}
              accessibilityRole="button"
              accessibilityLabel="Take the photo and read it"
            >
              {measuring ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={[styles.shutterInner, { backgroundColor: colors.primary }]} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  permissionTitle: { ...Type.title, textAlign: 'center' },
  permissionText: { ...Type.body, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  titleBlock: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#CBD5F5', fontSize: 12, marginTop: 2 },
  typeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(13,92,255,0.85)',
  },
  typeBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  spacer: { flex: 1 },
  bottomPanel: {
    backgroundColor: 'rgba(8,12,24,0.86)',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  readingRow: { flexDirection: 'row', alignItems: 'center' },
  reading: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  stageLine: { color: '#CBD5F5', fontSize: 13 },
  guide: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', lineHeight: 20, marginTop: Spacing.xs },
  meta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  resultTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1 },
  resultNote: { color: '#CBD5F5', fontSize: 12, marginTop: Spacing.xs, lineHeight: 16 },
  shutterRow: { alignItems: 'center', marginTop: Spacing.md },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 52, height: 52, borderRadius: 26 },
});
