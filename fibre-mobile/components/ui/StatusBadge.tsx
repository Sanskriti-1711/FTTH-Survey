import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusColors, type StatusKey, Radius } from '../../lib/theme/colors';

// ── StatusBadge ───────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const key = (status in StatusColors ? status : 'pending') as StatusKey;
  const colors = StatusColors[key];

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <Text style={[styles.text, { color: colors.text }]}>
        {status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
      </Text>
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
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.progressWrapper}>
      <View style={[styles.track, { height }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${clamped * 100}%`,
              height,
              backgroundColor: color ?? (clamped >= 1 ? StatusColors.approved.dot : '#0D5CFF'),
              borderRadius: height / 2,
            },
          ]}
        />
      </View>
      {showLabel && (
        <Text style={styles.label}>{Math.round(clamped * 100)}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    fontSize: 12,
    fontWeight: '600',
  },
  progressWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 36,
    textAlign: 'right',
  },
});
