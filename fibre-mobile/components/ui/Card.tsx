import React from 'react';
import { View, Text, StyleSheet, type ViewProps } from 'react-native';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius, Spacing, Type } from '../../lib/theme/colors';

// ── Card ──────────────────────────────────────────────────────────────────

interface CardProps extends ViewProps {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
  variant?: 'default' | 'outlined' | 'elevated';
}

export function Card({
  title,
  subtitle,
  headerRight,
  children,
  variant = 'default',
  style,
  ...props
}: CardProps) {
  const colors = useThemeStore((s) => s.colors);

  const variantStyles = {
    default: { backgroundColor: colors.surface, shadowOpacity: 0.08 },
    outlined: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, shadowOpacity: 0 },
    elevated: { backgroundColor: colors.surface, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  };

  const vs = variantStyles[variant];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: vs.backgroundColor,
          borderColor: 'borderColor' in vs ? (vs as any).borderColor : 'transparent',
          borderWidth: 'borderWidth' in vs ? (vs as any).borderWidth : 0,
          shadowOpacity: vs.shadowOpacity,
          shadowRadius: 'shadowRadius' in vs ? (vs as any).shadowRadius : 4,
          elevation: 'elevation' in vs ? (vs as any).elevation : 2,
        },
        style as any,
      ]}
      {...props}
    >
      {(title || headerRight) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title && (
              <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={Type.maxScale}>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={Type.maxScale}>
                {subtitle}
              </Text>
            )}
          </View>
          {headerRight}
        </View>
      )}
      {children}
    </View>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}) {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View
      style={[styles.statCard, { backgroundColor: colors.surface }]}
      accessible
      accessibilityLabel={`${value} ${title}${subtitle ? `, ${subtitle}` : ''}`}
    >
      <Text style={[styles.statValue, { color: color ?? colors.primary }]}>{value}</Text>
      <Text style={[styles.statTitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={Type.maxScale}>
        {title}
      </Text>
      {subtitle && (
        <Text style={[styles.statSubtitle, { color: colors.textTertiary }]} maxFontSizeMultiplier={Type.maxScale}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────

export function Badge({
  label,
  color,
  bgColor,
  size = 'md',
}: {
  label: string;
  color?: string;
  bgColor?: string;
  size?: 'sm' | 'md';
}) {
  const colors = useThemeStore((s) => s.colors);
  const padding = size === 'sm' ? { paddingH: Spacing.sm, paddingV: 2 } : { paddingH: Spacing.md, paddingV: Spacing.xs };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bgColor ?? colors.primary + '15',
          paddingHorizontal: padding.paddingH,
          paddingVertical: padding.paddingV,
          borderRadius: Radius.full,
        },
      ]}
    >
      <Text style={[styles.badgeText, { color: color ?? colors.primary }]} maxFontSizeMultiplier={Type.maxScale}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  headerText: { flex: 1 },
  title: { fontSize: Type.title.fontSize, lineHeight: Type.title.lineHeight, fontWeight: '600', marginBottom: 2 },
  subtitle: { fontSize: Type.meta.fontSize, lineHeight: Type.meta.lineHeight },
  statCard: {
    flex: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  statTitle: {
    fontSize: Type.meta.fontSize,
    lineHeight: Type.meta.lineHeight,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  statSubtitle: { fontSize: Type.meta.fontSize, lineHeight: Type.meta.lineHeight, marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
  },
});
