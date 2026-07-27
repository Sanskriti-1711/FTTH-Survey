import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../lib/stores/theme';
import { useOfflineStore } from '../../lib/stores/offline';
import { Radius, Spacing } from '../../lib/theme/colors';
import { Inbox } from 'lucide-react-native';

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
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineText}>You're offline. Changes will sync when connected.</Text>
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
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  action: { marginTop: Spacing.sm },
  offlineBanner: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
  },
  offlineText: {
    color: '#B45309',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
