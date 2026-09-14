/**
 * GPSQualityBadge (Tier-1 A2) — visual indicator of the current fix quality.
 *
 * Green  — within the layer's accuracy requirement
 * Amber  — exceeds it (warn) or accuracy unknown
 * Red    — reject-grade; capture will be blocked unless overridden
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { gradeGpsAccuracy, type GPSQuality } from '../utils/gps-quality';

const COLORS: Record<GPSQuality['grade'], string> = {
  ok: '#10B981',
  warn: '#F59E0B',
  reject: '#DC2626',
};

export function GPSQualityBadge({
  accuracyM,
  requiredM,
  compact = false,
}: {
  accuracyM: number | null | undefined;
  requiredM: number | null | undefined;
  /** Compact = dot only (for toolbars); full = pill with label */
  compact?: boolean;
}) {
  const q = gradeGpsAccuracy(accuracyM, requiredM);
  const color = COLORS[q.grade];

  if (compact) {
    return (
      <View
        accessibilityLabel={`GPS quality ${q.grade}`}
        style={[compactStyles.dot, { backgroundColor: color }]}
      />
    );
  }

  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {q.label}
      </Text>
    </View>
  );
}

const compactStyles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 11, fontWeight: '600' },
});

export default GPSQualityBadge;
