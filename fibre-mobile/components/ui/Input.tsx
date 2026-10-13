import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  type TextInputProps,
} from 'react-native';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius, Spacing, Touch, Type } from '../../lib/theme/colors';
import { Eye, EyeOff } from 'lucide-react-native';

// ── Input ─────────────────────────────────────────────────────────────────

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  isPassword?: boolean;
  icon?: React.ReactNode;
  /** Web: renders as HTML `name` attribute on the input element */
  name?: string;
}

export function Input({
  label,
  error,
  hint,
  isPassword,
  icon,
  style,
  ...props
}: InputProps) {
  const colors = useThemeStore((s) => s.colors);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.error
    : focused
    ? colors.primary
    : colors.outline;

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={[styles.label, { color: colors.textPrimary }]} maxFontSizeMultiplier={Type.maxScale}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.inputContainer,
          {
            borderColor,
            backgroundColor: colors.surface,
          },
        ]}
      >
        {icon && <View style={styles.iconLeft}>{icon}</View>}
        <TextInput
          style={[
            styles.input,
            { color: colors.textPrimary },
            icon ? { paddingLeft: 0 } : undefined,
            style as any,
          ]}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={isPassword && !showPassword}
          // A visible label is not a programmatic one: the field carries the
          // label it is drawn under so a screen reader hears it on focus.
          accessibilityLabel={props.accessibilityLabel ?? label}
          accessibilityState={{ disabled: props.editable === false }}
          maxFontSizeMultiplier={Type.maxScale}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.iconRight}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            accessibilityState={{ checked: showPassword }}
          >
            {showPassword ? (
              <EyeOff size={20} color={colors.textSecondary} />
            ) : (
              <Eye size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text
          style={[styles.error, { color: colors.error }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      )}
      {hint && !error && (
        <Text style={[styles.hint, { color: colors.textTertiary }]} maxFontSizeMultiplier={Type.maxScale}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.lg },
  label: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    height: Touch.minHeight,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    lineHeight: 21,
  },
  iconLeft: {
    paddingLeft: Spacing.lg,
  },
  iconRight: {
    width: Touch.minTarget,
    height: Touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  error: {
    fontSize: Type.meta.fontSize,
    lineHeight: Type.meta.lineHeight,
    marginTop: Spacing.xs,
  },
  hint: {
    fontSize: Type.meta.fontSize,
    lineHeight: Type.meta.lineHeight,
    marginTop: Spacing.xs,
  },
});
