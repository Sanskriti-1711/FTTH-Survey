// ── View mode switch ─────────────────────────────────────────────────────
//
// HLD / Survey / Overlay is a reading of the same map, so it belongs on the
// map, not in a menu. It stays at the top centre because it is a mode, and
// modes are the one thing a thumb can reach for at the far edge.
//
// 36 px tall instead of 44: three segments across 390 px get 118 px each,
// which is plenty for a dot and a word, and the map keeps the difference.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius, Spacing, Type } from '../../theme/colors';
import { Elevation, chromeColors } from '../../theme/chrome';

export type ViewMode = 'hld' | 'survey' | 'overlay';

const MODES: Array<{ key: ViewMode; label: string; dot: string; fill: string; ink: string }> = [
  { key: 'hld', label: 'HLD', dot: '#0D5CFF', fill: '#0D5CFF', ink: '#FFFFFF' },
  { key: 'survey', label: 'Survey', dot: '#FF8C00', fill: '#FF8C00', ink: '#1F2937' },
  { key: 'overlay', label: 'Overlay', dot: '#7C3AED', fill: '#7C3AED', ink: '#FFFFFF' },
];

interface ViewModeSwitchProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Review isolation hides the switch — there is nothing to switch to. */
  hidden?: boolean;
}

export default function ViewModeSwitch({ value, onChange, hidden = false }: ViewModeSwitchProps) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);

  if (hidden) return null;

  return (
    <View
      style={[
        styles.track,
        Elevation.float,
        { backgroundColor: chrome.panel, borderColor: chrome.hairline },
      ]}
      accessibilityRole="tablist"
    >
      {MODES.map((mode) => {
        const active = value === mode.key;
        return (
          <Pressable
            key={mode.key}
            onPress={() => onChange(mode.key)}
            accessibilityRole="tab"
            accessibilityLabel={`${mode.label} view`}
            accessibilityState={{ selected: active }}
            style={[
              styles.seg,
              { backgroundColor: active ? mode.fill : colors.surface },
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: active ? mode.ink : mode.dot, opacity: active ? 0.9 : 1 },
              ]}
            />
            <Text style={[styles.label, { color: active ? mode.ink : colors.textSecondary }]}>
              {mode.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    height: 38,
    padding: 3,
    gap: 2,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  seg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  dot: { width: 7, height: 7, borderRadius: Radius.full },
  label: { ...Type.label },
});
