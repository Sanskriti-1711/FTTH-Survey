import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/stores/theme';
import { StatusColors, type StatusKey, Radius, Type, Spacing } from '../../lib/theme/colors';

// ── StatusBadge ───────────────────────────────────────────────────────────
//
// Status is carried by a word AND a dot, never by colour alone — the word is
// what a screen reader announces and what a colour-blind engineer reads.

export function StatusBadge({ status }: { status: string }) {
  const key = (status in StatusColors ? status : 'pending') as StatusKey;
  const colors = StatusColors[key];
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <View
      style={[styles.badge, { backgroundColor: colors.bg }]}
      accessible
      accessibilityLabel={`Status: ${label}`}
    >
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

// ── ProgressBar ───────────────────────────────────────────────────────────

export function ProgressBar({
  progress,
  height = 8,
  color,
  showLabel,
}: {
  progress: number; // 0–1
  height?: number;
  color?: string;
  showLabel?: boolean;
}) {
  const colors = useThemeStore((s) => s.colors);
  const clamped = Math.max(0, Math.min(1, progress));
  const pct = Math.round(clamped * 100);

  return (
    <View
      style={styles.progressWrapper}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.track, { height, backgroundColor: colors.outlineLight }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${clamped * 100}%`,
              height,
              backgroundColor: color ?? (clamped >= 1 ? colors.success : colors.primary),
              borderRadius: height / 2,
            },
          ]}
        />
      </View>
      {showLabel && (
        <Text style={[styles.label, { color: colors.textTertiary }]} maxFontSizeMultiplier={Type.maxScale}>
          {pct}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  text: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
  },
  progressWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  track: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 4,
  },
  label: {
    fontSize: Type.meta.fontSize,
    lineHeight: Type.meta.lineHeight,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
});
