// ── Tools sheet ──────────────────────────────────────────────────────────
//
// The map's secondary actions, grouped by what the engineer is trying to
// do rather than by what the code calls them:
//
//   Review  — the changes recorded so far
//   Edit    — move a feature, undo
//   Map     — layers, basemap, list view, frame the area
//
// Every row is a 56 px target with its state on the right, so the sheet
// answers "what will this do and what is it now" before the tap.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ChevronRight,
  Layers,
  List,
  Maximize2,
  Move,
  Satellite,
} from 'lucide-react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius, Spacing, Type } from '../../theme/colors';
import { chromeColors } from '../../theme/chrome';
import MapSheet from './MapSheet';

interface ToolsSheetProps {
  visible: boolean;
  onClose: () => void;
  changeCount: number;
  layerCount: number;
  visibleLayerCount: number;
  basemapName: string;
  moveActive: boolean;
  online: boolean;
  locked?: boolean;
  onOpenChanges: () => void;
  onToggleMove: () => void;
  onOpenLayers: () => void;
  onOpenBasemap: () => void;
  onOpenList: () => void;
  onFrameRegion: () => void;
}

export default function ToolsSheet({
  visible,
  onClose,
  changeCount,
  layerCount,
  visibleLayerCount,
  basemapName,
  moveActive,
  online,
  locked = false,
  onOpenChanges,
  onToggleMove,
  onOpenLayers,
  onOpenBasemap,
  onOpenList,
  onFrameRegion,
}: ToolsSheetProps) {
  return (
    <MapSheet
      visible={visible}
      onClose={onClose}
      title="Tools"
      subtitle={online ? undefined : 'Offline — work is saved on this device'}
      closeLabel="Close the tools menu"
    >
      <Section label="Your work" />
      <Row
        icon={<Layers size={20} stroke="#0D5CFF" />}
        label="Survey changes"
        hint={changeCount === 0 ? 'Nothing recorded yet' : 'Review what you have recorded'}
        value={changeCount === 0 ? 'None' : String(changeCount)}
        onPress={onOpenChanges}
        disabled={changeCount === 0}
      />

      <Section label="Edit the map" />
      <Row
        icon={<Move size={20} stroke="#0D5CFF" />}
        label="Move features"
        hint={moveActive ? 'On — drag a feature to reposition it' : 'Reposition a point or shape'}
        value={moveActive ? 'On' : 'Off'}
        onPress={onToggleMove}
        disabled={locked}
      />
      <Row
        icon={<Maximize2 size={20} stroke="#0D5CFF" />}
        label="Frame the survey area"
        hint="Zoom out to the whole project"
        onPress={onFrameRegion}
      />

      <Section label="Map" />
      <Row
        icon={<Layers size={20} stroke="#0D5CFF" />}
        label="Layers"
        hint={`${visibleLayerCount} of ${layerCount} layers shown`}
        onPress={onOpenLayers}
      />
      <Row
        icon={<Satellite size={20} stroke="#0D5CFF" />}
        label="Basemap"
        hint="Satellite, streets, terrain"
        value={basemapName}
        onPress={onOpenBasemap}
      />
      <Row
        icon={<List size={20} stroke="#0D5CFF" />}
        label="List view"
        hint="Search and open every feature"
        onPress={onOpenList}
      />
    </MapSheet>
  );
}

function Section({ label }: { label: string }) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <Text style={[styles.section, { color: colors.textTertiary }]} accessibilityRole="header">
      {label.toUpperCase()}
    </Text>
  );
}

function Row({
  icon,
  label,
  hint,
  value,
  onPress,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: chrome.hairline },
        pressed && !disabled && { backgroundColor: chrome.tile },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: chrome.tile }]}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text style={[styles.rowHint, { color: colors.textTertiary }]} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.value, { color: colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={18} stroke={colors.iconMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    ...Type.label,
    letterSpacing: 0.7,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 60,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { ...Type.bodyStrong },
  rowHint: { ...Type.meta },
  value: { ...Type.label, maxWidth: 96, textAlign: 'right' },
});
