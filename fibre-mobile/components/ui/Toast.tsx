import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Type, Spacing, Radius, Touch } from '../../lib/theme/colors';

// ── Toast ─────────────────────────────────────────────────────────────────
//
// Every colour pair here is contrast-checked: white on #047857 (5.48), white
// on #B91C1C (6.47), #1F2937 on #F59E0B (6.83). Amber keeps the identity
// colour with dark text rather than white text, which would be 2.15:1.

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  onDismiss: () => void;
  duration?: number;
}

const toastColors: Record<ToastType, { bg: string; text: string }> = {
  success: { bg: '#047857', text: '#FFFFFF' },
  error: { bg: '#B91C1C', text: '#FFFFFF' },
  warning: { bg: '#F59E0B', text: '#1F2937' },
  info: { bg: '#0D5CFF', text: '#FFFFFF' },
};

export function Toast({ visible, message, type = 'info', onDismiss, duration = 4000 }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        hide();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const hide = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  if (!visible) return null;

  const colors = toastColors[type];

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.bg, opacity, transform: [{ translateY }] },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessible
    >
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      <TouchableOpacity
        onPress={hide}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss message"
      >
        <X size={20} color={colors.text} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  message: {
    flex: 1,
    fontSize: Type.body.fontSize,
    lineHeight: Type.body.lineHeight,
    fontWeight: '500',
  },
  dismiss: {
    width: Touch.minTarget,
    height: Touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
});
