import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type TouchableOpacityProps,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useThemeStore } from '../../lib/stores/theme';
import { Colors, Radius, Touch } from '../../lib/theme/colors';

// ── Button ────────────────────────────────────────────────────────────────

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = true,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const colors = useThemeStore((s) => s.colors);

  const variantStyles: Record<string, { bg: string; text: string; border?: string }> = {
    primary: { bg: colors.primary, text: colors.onPrimary },
    secondary: {
      bg: 'transparent',
      text: colors.primary,
      border: colors.primary,
    },
    tertiary: { bg: 'transparent', text: colors.textSecondary },
    danger: { bg: colors.error, text: '#FFFFFF' },
  };

  const sizeStyles: Record<string, { height: number; fontSize: number; paddingH: number }> = {
    sm: { height: 40, fontSize: 13, paddingH: 16 },
    md: { height: Touch.minHeight, fontSize: 15, paddingH: 24 },
    lg: { height: 64, fontSize: 17, paddingH: 32 },
  };

  const vs = variantStyles[variant];
  const ss = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        {
          backgroundColor: isDisabled ? colors.outlineLight : vs.bg,
          borderColor: vs.border ?? 'transparent',
          borderWidth: vs.border ? 1.5 : 0,
          height: ss.height,
          paddingHorizontal: ss.paddingH,
          width: fullWidth ? '100%' : undefined,
          opacity: isDisabled ? 0.5 : 1,
        },
        style as ViewStyle,
      ]}
      disabled={isDisabled}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={vs.text} size="small" />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text
            style={[
              styles.text,
              { color: vs.text, fontSize: ss.fontSize },
              icon ? { marginLeft: 8 } : undefined,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
