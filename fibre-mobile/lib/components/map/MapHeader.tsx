// ── Map header ───────────────────────────────────────────────────────────
//
// 56 px, one line of project name, one quiet line of state. The old header
// carried a logo, a two-line title block and three icon buttons across a
// 390 px screen, so the project name truncated at "UI-Brownfield-Verify -
// S…" and the icons sat at the edge of the thumb.
//
// The name is allowed to shrink instead: on the map the project you are
// surveying is the single most important piece of context.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, List, Map as MapIcon, SlidersHorizontal } from 'lucide-react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius, Spacing, Touch, Type } from '../../theme/colors';
import { Layout, chromeColors } from '../../theme/chrome';

interface MapHeaderProps {
  title: string;
  subtitle?: string;
  /** `false` while offline — the dot turns amber and the label says so. */
  online?: boolean;
  /** In list mode the switch brings the map back instead of opening the list. */
  listMode?: boolean;
  onBack: () => void;
  onOpenList: () => void;
  onOpenTools: () => void;
}

export default function MapHeader({
  title,
  subtitle,
  online = true,
  listMode = false,
  onBack,
  onOpenList,
  onOpenTools,
}: MapHeaderProps) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);

  const dot = online ? colors.success : colors.warning;

  return (
    <View style={[styles.bar, { backgroundColor: chrome.panel, borderBottomColor: chrome.hairline }]}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: chrome.tile }]}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Back to my projects"
      >
        <ArrowLeft size={22} stroke={colors.textPrimary} />
      </Pressable>

      <View style={styles.titleWrap}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text style={[styles.meta, { color: colors.textTertiary }]} numberOfLines={1}>
            {subtitle ?? 'Survey map'}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onOpenList}
        style={({ pressed }) => [
          styles.iconBtn,
          listMode && { backgroundColor: chrome.activeTile },
          pressed && { backgroundColor: chrome.tile },
        ]}
        accessibilityRole="button"
        accessibilityLabel={listMode ? 'Show map view' : 'Show list view'}
        accessibilityState={{ selected: listMode }}
      >
        {listMode ? (
          <MapIcon size={21} stroke={colors.primary} />
        ) : (
          <List size={21} stroke={colors.textSecondary} />
        )}
      </Pressable>

      <Pressable
        onPress={onOpenTools}
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: chrome.tile }]}
        accessibilityRole="button"
        accessibilityLabel="More map options"
      >
        <SlidersHorizontal size={21} stroke={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: Layout.header,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  iconBtn: {
    width: Touch.minTarget,
    height: Touch.minTarget,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, minWidth: 0, paddingHorizontal: 2, gap: 1 },
  title: { ...Type.bodyStrong },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: Radius.full },
  meta: { ...Type.meta, flexShrink: 1 },
});
