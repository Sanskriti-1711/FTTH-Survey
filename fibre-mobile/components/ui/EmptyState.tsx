import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/stores/theme';
import { useOfflineStore } from '../../lib/stores/offline';
import { Radius, Spacing, StatusColors, Type } from '../../lib/theme/colors';
import { Inbox, CloudOff } from 'lucide-react-native';

// ── EmptyState ────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: colors.primary + '10' }]}>
        {icon ?? <Inbox size={32} color={colors.primary} />}
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      )}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

// ── ConnectionStatus ──────────────────────────────────────────────────────

export function ConnectionStatus() {
  const isOnline = useOfflineStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <View
      style={[styles.offlineBanner, { backgroundColor: StatusColors.flagged.bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessible
    >
      <CloudOff size={16} color={StatusColors.flagged.text} />
      <Text style={[styles.offlineText, { color: StatusColors.flagged.text }]}>
        You're offline. Changes will sync when connected.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
    paddingHorizontal: Spacing.xl,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Type.title.fontSize,
    lineHeight: Type.title.lineHeight,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: Type.body.fontSize,
    lineHeight: Type.body.lineHeight,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  action: { marginTop: Spacing.sm },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  offlineText: {
    fontSize: Type.label.fontSize,
    lineHeight: Type.label.lineHeight,
    fontWeight: '600',
    textAlign: 'center',
  },
});
