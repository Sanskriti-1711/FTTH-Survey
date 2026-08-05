import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { useAuthStore } from '../../lib/stores/auth';
import { useProjectStore } from '../../lib/stores/project';
import { useOfflineStore } from '../../lib/stores/offline';
import { Card, StatCard } from '../../components/ui/Card';
import { StatusBadge, ProgressBar } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spacing, Radius } from '../../lib/theme/colors';
import {
  Map,
  Camera,
  ClipboardList,
  Upload,
  Bell,
  ChevronRight,
  FileArchive,
  Eye,
} from 'lucide-react-native';
import type { AssignmentJob } from '../../lib/utils/types';

// ── Home Screen ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();
  const { projects, assignments, stats, fetchAssignments, fetchProjects } = useProjectStore();
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (user?.id) {
      await fetchAssignments(user.id);
      await fetchProjects();
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const completedToday = stats?.approved ?? 0;
  const pendingSubmissions = stats?.under_review ?? 0;
  const activeAssignments = assignments?.length ?? 0;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>
              {getGreeting()},
            </Text>
            <Text style={[styles.name, { color: colors.textPrimary }]}>
              {user?.full_name ?? 'Engineer'}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.surface }]}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Bell size={20} stroke={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <StatCard
            title="Active Jobs"
            value={activeAssignments}
            color={colors.primary}
          />
          <View style={styles.statsGap} />
          <StatCard
            title="Completed"
            value={completedToday}
            color={colors.success}
          />
          <View style={styles.statsGap} />
          <StatCard
            title="Pending"
            value={pendingSubmissions}
            color={colors.warning}
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/(tabs)/survey')}
            activeOpacity={0.8}
          >
            <ClipboardList size={24} stroke={colors.onPrimary} />
            <Text style={[styles.actionText, { color: colors.onPrimary }]}>Survey</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
            onPress={() => router.push('/camera')}
            activeOpacity={0.8}
          >
            <Camera size={24} color="#FFFFFF" />
            <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline }]}
            onPress={() => router.push('/(tabs)/map')}
            activeOpacity={0.8}
          >
            <Map size={24} stroke={colors.primary} />
            <Text style={[styles.actionText, { color: colors.textPrimary }]}>Map</Text>
          </TouchableOpacity>
        </View>

        {/* Import Survey Package */}
        <Card
          title="Quick Import"
          variant="outlined"
          headerRight={
            <TouchableOpacity
              style={[styles.importLink, { backgroundColor: colors.primary + '10' }]}
              onPress={() => router.push('/project/import')}
            >
              <Upload size={14} stroke={colors.primary} />
              <Text style={[styles.importLinkText, { color: colors.primary }]}>Import</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.importRow}>
            <FileArchive size={20} stroke={colors.textSecondary} />
            <View style={styles.importInfo}>
              <Text style={[styles.importLabel, { color: colors.textPrimary }]}>
                Upload Survey Package
              </Text>
              <Text style={[styles.importDesc, { color: colors.textSecondary }]}>
                Import ZIP or GeoPackage to start surveying
              </Text>
            </View>
            <ChevronRight size={18} stroke={colors.textTertiary} />
          </View>
          <Button
            title="Select File to Import"
            variant="secondary"
            size="sm"
            icon={<Upload size={14} stroke={colors.primary} />}
            onPress={() => router.push('/project/import')}
            style={{ marginTop: Spacing.sm }}
          />
        </Card>

        {/* My Projects */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            My Projects
          </Text>
          <TouchableOpacity onPress={() => router.push('/project/import')}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>+ New</Text>
          </TouchableOpacity>
        </View>

        {projects.length === 0 ? (
          <EmptyState
            title="No Projects Yet"
            description="Import a survey package to get started"
            action={
              <Button
                title="Import Survey Package"
                variant="secondary"
                size="sm"
                onPress={() => router.push('/project/import')}
              />
            }
          />
        ) : (
          projects.slice(0, 5).map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              onPress={() => {
                useProjectStore.getState().setActiveProject(proj);
                router.push('/(tabs)/map');
              }}
            />
          ))
        )}

        {/* Active Assignments */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Active Assignments
          </Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/survey')}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>

        {assignments.length === 0 ? (
          <EmptyState
            title="No Active Assignments"
            description="Your assigned survey jobs will appear here"
            action={
              <Button
                title="Go to Surveys"
                variant="secondary"
                size="sm"
                onPress={() => router.push('/(tabs)/survey')}
              />
            }
          />
        ) : (
          assignments.slice(0, 5).map((job) => (
            <AssignmentCard
              key={job.id}
              job={job}
              onPress={() => {
                if (job.scope === 'feature' && job.feature) {
                  router.push(`/feature/${job.feature.id}?projectId=${job.project.id}`);
                } else {
                  router.push(`/project/${job.project.id}`);
                }
              }}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Project Card ───────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onPress,
}: {
  project: import('../../lib/utils/types').Project;
  onPress: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);

  const statusColor = {
    draft: colors.textTertiary,
    in_progress: colors.warning,
    active: colors.success,
    completed: colors.primary,
    archived: colors.textTertiary,
  }[project.status] ?? colors.textTertiary;

  return (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.jobHeader}>
        <View style={styles.jobInfo}>
          <Text style={[styles.jobName, { color: colors.textPrimary }]} numberOfLines={1}>
            {project.name}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 }}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.jobMeta, { color: colors.textSecondary }]}>
              {project.status.replace('_', ' ')} · {project.region}
            </Text>
          </View>
        </View>
        <ChevronRight size={16} stroke={colors.textTertiary} />
      </View>
      <View style={styles.jobFooter}>
        <Text style={[styles.jobDate, { color: colors.textTertiary }]}>
          Created: {new Date(project.created_at).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Assignment Card ───────────────────────────────────────────────────────

function AssignmentCard({
  job,
  onPress,
}: {
  job: AssignmentJob;
  onPress: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);

  const progress =
    job.feature_count > 0
      ? (job.status === 'approved' ? 1 : job.status === 'under_review' ? 0.75 : job.status === 'assigned' ? 0.25 : 0)
      : 0;

  return (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.jobHeader}>
        <View style={styles.jobInfo}>
          <Text style={[styles.jobName, { color: colors.textPrimary }]} numberOfLines={1}>
            {job.project.name}
          </Text>
          <Text style={[styles.jobMeta, { color: colors.textSecondary }]}>
            {job.scope_display} · {job.feature_count} feature{job.feature_count !== 1 ? 's' : ''}
          </Text>
        </View>
        <StatusBadge status={job.status} />
      </View>

      <ProgressBar progress={progress} showLabel />

      <View style={styles.jobFooter}>
        <Text style={[styles.jobDate, { color: colors.textTertiary }]}>
          Assigned: {new Date(job.created_at).toLocaleDateString()}
        </Text>
        <ChevronRight size={16} stroke={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerLeft: {},
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 14 },
  name: { fontSize: 22, fontWeight: '700' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  importLinkText: { fontSize: 12, fontWeight: '600' },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  importInfo: { flex: 1 },
  importLabel: { fontSize: 14, fontWeight: '500' },
  importDesc: { fontSize: 12, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xl,
  },
  statsGap: { width: Spacing.md },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  actionBtn: {
    flex: 1,
    height: 88,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  actionText: { fontSize: 13, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  seeAll: { fontSize: 14, fontWeight: '500' },
  jobCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  jobInfo: { flex: 1, marginRight: Spacing.md },
  jobName: { fontSize: 16, fontWeight: '600' },
  jobMeta: { fontSize: 13, marginTop: 2 },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  jobDate: { fontSize: 12 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
