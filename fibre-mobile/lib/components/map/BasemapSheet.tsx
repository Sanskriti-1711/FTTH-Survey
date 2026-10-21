// ── Basemap sheet ────────────────────────────────────────────────────────
//
// Three options, one thumb, one tap. The old chooser was a floating panel
// pinned 32 px from the bottom of the screen — exactly where the commit bar
// and the OS navigation gesture live.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius, Spacing, Type } from '../../theme/colors';
import { chromeColors } from '../../theme/chrome';
import MapSheet from './MapSheet';

export interface BasemapOption {
  id: string;
  name: string;
  swatch: string;
  hint: string;
}

interface BasemapSheetProps {
  visible: boolean;
  onClose: () => void;
  options: BasemapOption[];
  value: string;
  onChange: (id: string) => void;
}

export default function BasemapSheet({
  visible,
  onClose,
  options,
  value,
  onChange,
}: BasemapSheetProps) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);

  return (
    <MapSheet
      visible={visible}
      onClose={onClose}
      title="Basemap"
      subtitle="The background under the survey"
      closeLabel="Close the basemap chooser"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            accessibilityRole="radio"
            accessibilityLabel={`Use the ${option.name} basemap`}
            accessibilityState={{ checked: active }}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: chrome.hairline },
              pressed && { backgroundColor: chrome.tile },
            ]}
          >
            <View style={[styles.preview, { backgroundColor: option.swatch }]}>
              {active ? (
                <View style={[styles.check, { backgroundColor: colors.primary }]}>
                  <Check size={15} stroke={colors.onPrimary} strokeWidth={3} />
                </View>
              ) : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.name, { color: colors.textPrimary }]}>{option.name}</Text>
              <Text style={[styles.hint, { color: colors.textTertiary }]} numberOfLines={1}>
                {option.hint}
              </Text>
            </View>
            {active ? (
              <Text style={[styles.activeLabel, { color: colors.primary }]}>Active</Text>
            ) : null}
          </Pressable>
        );
      })}
    </MapSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  preview: {
    width: 56,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  name: { ...Type.bodyStrong },
  hint: { ...Type.meta },
  activeLabel: { ...Type.label },
});
