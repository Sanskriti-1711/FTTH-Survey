import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Text, TouchableOpacity, View } from 'react-native';

// ── Toast ─────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  onDismiss: () => void;
  duration?: number;
}

const toastColors: Record<ToastType, { bg: string; text: string }> = {
  success: { bg: '#16A34A', text: '#FFFFFF' },
  error: { bg: '#DC2626', text: '#FFFFFF' },
  warning: { bg: '#F59E0B', text: '#1F2937' },
  info: { bg: '#0D5CFF', text: '#FFFFFF' },
};

export function Toast({ visible, message, type = 'info', onDismiss, duration = 3000 }: ToastProps) {
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
    >
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      <TouchableOpacity onPress={hide} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={[styles.dismiss, { color: colors.text }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  message: { flex: 1, fontSize: 14, fontWeight: '500' },
  dismiss: { fontSize: 16, fontWeight: '700', marginLeft: 12 },
});
