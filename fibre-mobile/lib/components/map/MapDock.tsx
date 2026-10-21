// ── Map dock ─────────────────────────────────────────────────────────────
//
// The five actions that matter in the field, always in the same place, all
// inside the thumb arc:
//
//   Locate · Draw trench · Add point · Undo · More
//
// This replaces a "+" FAB that unfolded into eight labelled rows (Undo, Add
// Point, Draw Trench, Survey Changes, View, Basemap, Move, My Location)
// stacked up the right edge of the map. Opening it covered the map; closing
// it hid the actions. Undo and locate now cost no taps at all, and the
// remaining four live in the sheet behind "More".

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Crosshair,
  MapPin,
  Spline,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius, Spacing, Touch, Type } from '../../theme/colors';
import { Elevation, Layout, chromeColors } from '../../theme/chrome';

interface MapDockProps {
  onLocate: () => void;
  following: boolean;
  onDrawTrench: () => void;
  drawActive: boolean;
  onAddPoint: () => void;
  addActive: boolean;
  onUndo: () => void;
  undoCount: number;
  onOpenTools: () => void;
  toolsOpen: boolean;
  /** Review isolation: the survey is read-only. */
  locked?: boolean;
}

export default function MapDock({
  onLocate,
  following,
  onDrawTrench,
  drawActive,
  onAddPoint,
  addActive,
  onUndo,
  undoCount,
  onOpenTools,
  toolsOpen,
  locked = false,
}: MapDockProps) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);

  const creationLocked = locked;

  return (
    <View
      style={[
        styles.bar,
        Elevation.float,
        { backgroundColor: chrome.panel, borderTopColor: chrome.hairline },
      ]}
    >
      <DockItem
        label="Locate"
        icon={<Crosshair size={22} stroke={following ? colors.primary : colors.textSecondary} />}
        active={following}
        tint={colors.primary}
        onPress={onLocate}
        accessibilityLabel={
          following ? 'Following your location. Stop following' : 'Centre the map on my location'
        }
        accessibilityState={{ selected: following }}
      />

      <DockItem
        label="Draw"
        icon={
          <Spline
            size={22}
            stroke={drawActive ? colors.secondaryText : creationLocked ? chrome.muted : colors.textSecondary}
          />
        }
        active={drawActive}
        tint={colors.secondary}
        tintInk={colors.secondaryText}
        onPress={onDrawTrench}
        disabled={creationLocked}
        accessibilityLabel="Draw a new trench line on the map"
        accessibilityState={{ selected: drawActive, disabled: creationLocked }}
      />

      <DockItem
        label="Add"
        icon={
          <MapPin
            size={22}
            stroke={addActive ? colors.primary : creationLocked ? chrome.muted : colors.textSecondary}
          />
        }
        active={addActive}
        tint={colors.primary}
        onPress={onAddPoint}
        disabled={creationLocked}
        accessibilityLabel="Add a point to the survey"
        accessibilityState={{ selected: addActive, disabled: creationLocked }}
      />

      <DockItem
        label="Undo"
        icon={
          <Undo2
            size={22}
            stroke={undoCount > 0 ? colors.textSecondary : chrome.muted}
          />
        }
        badge={undoCount > 0 ? (undoCount > 99 ? '99+' : String(undoCount)) : undefined}
        onPress={onUndo}
        disabled={undoCount === 0}
        accessibilityLabel={
          undoCount > 0 ? `Undo, ${undoCount} available` : 'Undo, nothing to undo'
        }
        accessibilityState={{ disabled: undoCount === 0 }}
      />

      <DockItem
        label="More"
        icon={
          <SlidersHorizontal
            size={22}
            stroke={toolsOpen ? colors.primary : colors.textSecondary}
          />
        }
        active={toolsOpen}
        tint={colors.primary}
        onPress={onOpenTools}
        accessibilityLabel="Open the tools menu"
        accessibilityState={{ expanded: toolsOpen }}
      />
    </View>
  );
}

function DockItem({
  label,
  icon,
  onPress,
  active = false,
  tint = '#0D5CFF',
  tintInk,
  badge,
  disabled = false,
  accessibilityLabel,
  accessibilityState,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  active?: boolean;
  tint?: string;
  tintInk?: string;
  badge?: string;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; expanded?: boolean };
}) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);
  const ink = disabled ? chrome.muted : active ? tintInk ?? tint : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [
        styles.item,
        active && { backgroundColor: tint + '14' },
        pressed && !disabled && { backgroundColor: chrome.tile },
        disabled && { opacity: 0.55 },
      ]}
    >
      <View style={styles.iconWrap}>
        {icon}
        {badge ? (
          <View style={[styles.badge, { backgroundColor: tint, borderColor: chrome.panel }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Layout.dock,
    paddingHorizontal: Spacing.xs,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    height: Layout.dockItem,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: Touch.minWidth,
  },
  iconWrap: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  label: { ...Type.meta, fontSize: 13, fontWeight: '600' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
