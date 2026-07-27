import React from 'react';
import { View, Text, StyleSheet, type ViewProps } from 'react-native';
import { useThemeStore } from '../../lib/stores/theme';
import { Radius, Spacing } from '../../lib/theme/colors';

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
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            )}
            {subtitle && (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
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
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statValue, { color: color ?? colors.primary }]}>{value}</Text>
      <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.statSubtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
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
  const sizeStyles = size === 'sm' ? { paddingH: 8, paddingV: 2, fontSize: 11 } : { paddingH: 12, paddingV: 4, fontSize: 12 };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bgColor ?? colors.primary + '15',
          paddingHorizontal: sizeStyles.paddingH,
          paddingVertical: sizeStyles.paddingV,
          borderRadius: Radius.full,
        },
      ]}
    >
      <Text style={[styles.badgeText, { color: color ?? colors.primary, fontSize: sizeStyles.fontSize }]}>
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
  title: { fontSize: 17, fontWeight: '600', marginBottom: 2 },
  subtitle: { fontSize: 13 },
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
  statValue: { fontSize: 24, fontWeight: '700' },
  statTitle: { fontSize: 12, fontWeight: '500', marginTop: 4, textAlign: 'center' },
  statSubtitle: { fontSize: 10, marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontWeight: '600',
  },
});
