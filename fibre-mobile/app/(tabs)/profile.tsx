import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../lib/stores/theme';
import { useAuthStore } from '../../lib/stores/auth';
import { useOfflineStore } from '../../lib/stores/offline';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Spacing, Radius } from '../../lib/theme/colors';
import {
  User,
  Settings,
  Cloud,
  CloudOff,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Shield,
  HelpCircle,
} from 'lucide-react-native';

// ── Profile Screen ────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useThemeStore((s) => s.colors);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const { user, logout } = useAuthStore();
  const { isOnline, lastSyncAt, isSyncing, pendingSyncCount, setSyncing } = useOfflineStore();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const handleManualSync = () => {
    setSyncing(true);
    // Simulate sync
    setTimeout(() => {
      setSyncing(false);
    }, 2000);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <User size={28} stroke={colors.onPrimary} />
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {user?.full_name ?? 'Engineer'}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
              {user?.email ?? 'Not signed in'}
            </Text>
            <StatusBadge status={user?.role?.toLowerCase() ?? 'engineer'} />
          </View>
        </View>

        {/* Sync Status */}
        <Card title="Sync Status" style={styles.section}>
          <View style={styles.syncRow}>
            <View style={styles.syncInfo}>
              {isOnline ? (
                <Cloud size={20} stroke={colors.success} />
              ) : (
                <CloudOff size={20} stroke={colors.error} />
              )}
              <Text style={[styles.syncText, { color: colors.textPrimary }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            <Text style={[styles.syncLast, { color: colors.textTertiary }]}>
              {lastSyncAt
                ? `Last sync: ${new Date(lastSyncAt).toLocaleTimeString()}`
                : 'Never synced'}
            </Text>
          </View>
          {pendingSyncCount > 0 && (
            <Text style={[styles.pendingText, { color: colors.warning }]}>
              {pendingSyncCount} item{pendingSyncCount !== 1 ? 's' : ''} pending sync
            </Text>
          )}
          <Button
            title={isSyncing ? 'Syncing...' : 'Sync Now'}
            variant="secondary"
            size="sm"
            loading={isSyncing}
            onPress={handleManualSync}
            style={styles.syncBtn}
          />
        </Card>

        {/* Settings */}
        <Card title="Settings" style={styles.section}>
          <TouchableOpacity style={styles.settingRow} onPress={toggleTheme} activeOpacity={0.6}>
            <View style={styles.settingLeft}>
              {resolvedTheme === 'dark' ? (
                <Moon size={20} stroke={colors.textSecondary} />
              ) : (
                <Sun size={20} stroke={colors.textSecondary} />
              )}
              <Text style={[styles.settingText, { color: colors.textPrimary }]}>
                Theme
              </Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={[styles.settingValue, { color: colors.textTertiary }]}>
                {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
              </Text>
              <ChevronRight size={16} stroke={colors.textTertiary} />
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.outlineLight }]} />

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.6}>
            <View style={styles.settingLeft}>
              <Shield size={20} stroke={colors.textSecondary} />
              <Text style={[styles.settingText, { color: colors.textPrimary }]}>Privacy</Text>
            </View>
            <View style={styles.settingRight}>
              <ChevronRight size={16} stroke={colors.textTertiary} />
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.outlineLight }]} />

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.6}>
            <View style={styles.settingLeft}>
              <HelpCircle size={20} stroke={colors.textSecondary} />
              <Text style={[styles.settingText, { color: colors.textPrimary }]}>Help & Support</Text>
            </View>
            <View style={styles.settingRight}>
              <ChevronRight size={16} stroke={colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </Card>

        {/* Sign Out */}
        <Button
          title="Sign Out"
          variant="danger"
          icon={<LogOut size={18} color="#FFFFFF" />}
          onPress={handleLogout}
          style={styles.logoutBtn}
        />

        <Text style={[styles.version, { color: colors.textTertiary }]}>
          Fiber360 v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 18, fontWeight: '600' },
  userEmail: { fontSize: 14 },
  section: { marginBottom: Spacing.lg },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  syncText: { fontSize: 14, fontWeight: '500' },
  syncLast: { fontSize: 12 },
  pendingText: { fontSize: 13, fontWeight: '500', marginBottom: Spacing.md },
  syncBtn: { marginTop: Spacing.sm },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  settingText: { fontSize: 15, fontWeight: '500' },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  settingValue: { fontSize: 13 },
  divider: {
    height: 1,
  },
  logoutBtn: {
    marginTop: Spacing.md,
  },
  version: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
