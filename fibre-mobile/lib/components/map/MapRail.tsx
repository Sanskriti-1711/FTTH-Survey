// ── Map rail ─────────────────────────────────────────────────────────────
//
// Four controls the map itself needs, stacked at the right edge where the
// thumb sits when the phone is held one-handed:
//
//   +   zoom in        (also covers desktop mouse users)
//   −   zoom out
//   ▤   layers
//   ⌖   frame the survey area
//
// The previous build relied on maplibre-gl's default NavigationControl,
// which renders 29 px buttons — half the field minimum and impossible
// through a glove. It also had no way back to the project extent.

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Layers, Maximize2, Minus, Plus } from 'lucide-react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius } from '../../theme/colors';
import { Elevation, Layout, chromeColors } from '../../theme/chrome';

interface MapRailProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenLayers: () => void;
  onFrameRegion: () => void;
  layersOpen: boolean;
  locked?: boolean;
}

export default function MapRail({
  onZoomIn,
  onZoomOut,
  onOpenLayers,
  onFrameRegion,
  layersOpen,
  locked = false,
}: MapRailProps) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);

  return (
    <View
      style={[
        styles.rail,
        Elevation.float,
        { backgroundColor: chrome.panel, borderColor: chrome.hairline },
      ]}
    >
      <RailButton
        label="Zoom in"
        hairline={chrome.hairline}
        onPress={onZoomIn}
        icon={<Plus size={22} stroke={colors.textPrimary} />}
      />
      <RailButton
        label="Zoom out"
        hairline={chrome.hairline}
        onPress={onZoomOut}
        icon={<Minus size={22} stroke={colors.textPrimary} />}
      />
      <RailButton
        label="Show layers"
        hairline={chrome.hairline}
        onPress={onOpenLayers}
        active={layersOpen}
        tint={colors.primary}
        icon={
          <Layers
            size={21}
            stroke={layersOpen ? colors.primary : colors.textSecondary}
          />
        }
      />
      <RailButton
        label="Frame the survey area"
        hairline={chrome.hairline}
        last
        onPress={onFrameRegion}
        disabled={locked}
        icon={
          <Maximize2
            size={20}
            stroke={locked ? chrome.muted : colors.textSecondary}
          />
        }
      />
    </View>
  );
}

function RailButton({
  label,
  icon,
  onPress,
  hairline,
  active = false,
  tint,
  disabled = false,
  last = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  hairline: string;
  active?: boolean;
  tint?: string;
  disabled?: boolean;
  last?: boolean;
}) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={2}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.btn,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
        active && { backgroundColor: (tint ?? colors.primary) + '12' },
        pressed && !disabled && { backgroundColor: chrome.tile },
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  btn: {
    width: Layout.control,
    height: Layout.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
