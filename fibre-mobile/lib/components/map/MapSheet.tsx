// ── Map sheet ────────────────────────────────────────────────────────────
//
// One bottom sheet for every secondary surface on the map screen (tools,
// layers, basemap, the feature list). The map screen used to grow a panel
// wherever there was room; the sheet gives every one of them the same
// entry, the same close gesture, and the same thumb-height position.
//
// Deliberately not a Modal: the map is a full-screen route with no tab bar,
// so an absolutely-positioned overlay is enough, keeps the camera alive
// underneath, and behaves the same on react-native-web.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeStore } from '../../stores/theme';
import { Radius, Spacing, Touch, Type } from '../../theme/colors';
import { Elevation, Layout, chromeColors } from '../../theme/chrome';

interface MapSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** One quiet line under the title — state, not instructions. */
  subtitle?: string;
  children: React.ReactNode;
  /** Rendered under the scroll area, above the safe-area inset. */
  footer?: React.ReactNode;
  /** Fraction of the window the sheet may occupy. */
  maxHeightRatio?: number;
  /** Accessible label for the dimmed backdrop. */
  closeLabel?: string;
}

export default function MapSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeightRatio = 0.82,
  closeLabel = 'Close panel',
}: MapSheetProps) {
  const colors = useThemeStore((s) => s.colors);
  const resolved = useThemeStore((s) => s.resolved);
  const chrome = chromeColors(colors, resolved);
  const { height: windowHeight } = useWindowDimensions();

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      // The transform is the only animated property, so the native driver is
      // safe on device; web has no native driver and runs it on the JS thread.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, progress]);

  if (!visible) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 0],
  });

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: chrome.scrim, opacity: progress },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          Elevation.sheet,
          {
            backgroundColor: chrome.panel,
            maxHeight: Math.round(windowHeight * maxHeightRatio),
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: chrome.handle }]} />

        <View style={[styles.header, { borderBottomColor: chrome.hairline }]}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.close,
              { backgroundColor: pressed ? chrome.tile : 'transparent' },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          >
            <X size={22} stroke={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>

        {footer ? (
          <View style={[styles.footer, { borderTopColor: chrome.hairline }]}>{footer}</View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 60,
  },
  sheet: {
    borderTopLeftRadius: Layout.sheetRadius,
    borderTopRightRadius: Layout.sheetRadius,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.md,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...Type.title },
  subtitle: { ...Type.meta },
  close: {
    width: Touch.minTarget,
    height: Touch.minTarget,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
