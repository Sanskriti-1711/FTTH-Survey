import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { StatCard } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spacing, Radius } from '../../lib/theme/colors';
import { ClipboardList, ChevronRight } from 'lucide-react-native';
import type { Project, AssignmentJob } from '../../lib/utils/types';
import { getJobsForEngineer } from '../../lib/api/assignments';
import { isSupervisionProject, lldVersionLabel } from '../../lib/api/supervision';

// ── Supervision Tab ───────────────────────────────────────────────────────
// Supervision is its own workspace in the tab bar: a supervision project is a
// project opened from a completed LLD run, and its tasks are assignment jobs.

export default function SupervisionScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUBADMIN';
  const { projects, fetchProjects, error: projectsError } = useProjectStore();
  const [jobs, setJobs] = useState<AssignmentJob[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    await Promise.all([
      fetchProjects(),
      user?.id
        ? getJobsForEngineer(user.id, { page_size: 100 })
            .then((data) => setJobs(data.results))
            .catch(() => setJobs([]))
        : Promise.resolve(),
    ]);
  }, [fetchProjects, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // The engineer sees only projects they hold a job on; an admin sees all.
  const supervisionProjects = useMemo(() => {
    const all = projects.filter(isSupervisionProject);
    if (isAdmin) return all;
    const assigned = new Set((jobs ?? []).map((job) => job.project.id));
    return all.filter((project) => assigned.has(project.id));
  }, [projects, jobs, isAdmin]);

  const jobsByProject = useMemo(() => {
    const map: Record<string, AssignmentJob[]> = {};
    for (const job of jobs ?? []) {
      (map[job.project.id] ??= []).push(job);
    }
    return map;
  }, [jobs]);

  const stats = {
    assigned: supervisionProjects.filter((p) => p.status === 'assigned').length,
    active: supervisionProjects.filter((p) => p.status === 'active' || p.status === 'in_progress')
      .length,
    done: supervisionProjects.filter((p) => p.status === 'accepted' || p.status === 'completed')
      .length,
  };
  const count = supervisionProjects.length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Supervision</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Inspect as-built work against the LLD baseline
          </Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard title="Assigned" value={stats.assigned} color={colors.primary} />
          <View style={styles.statsGap} />
          <StatCard title="Active" value={stats.active} color={colors.success} />
          <View style={styles.statsGap} />
          <StatCard title="Done" value={stats.done} color={colors.warning} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Supervision Tasks
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ClipboardList size={15} stroke={colors.textTertiary} />
            <Text style={[styles.count, { color: colors.textTertiary }]}>{count}</Text>
          </View>
        </View>

        {projectsError && projects.length === 0 ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
              {"Couldn't Load Supervision Tasks"}
            </Text>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {projectsError}
            </Text>
            <Button title="Try Again" variant="secondary" size="sm" onPress={loadData} />
          </View>
        ) : jobs === null && count === 0 ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading your supervision tasks…
            </Text>
          </View>
        ) : count === 0 ? (
          <EmptyState
            title="No Supervision Tasks Yet"
            description="Supervision projects assigned to you from a completed LLD run will appear here."
            action={<Button title="Refresh" variant="secondary" size="sm" onPress={loadData} />}
          />
        ) : (
          supervisionProjects.map((project) => (
            <SupervisionCard
              key={project.id}
              project={project}
              jobs={jobsByProject[project.id] ?? []}
              onPress={() =>
                router.push({
                  pathname: '/supervision/[projectId]',
                  params: { projectId: project.id },
                })
              }
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Supervision Card ──────────────────────────────────────────────────────

function SupervisionCard({
  project,
  jobs,
  onPress,
}: {
  project: Project;
  jobs: AssignmentJob[];
  onPress: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const featureTotal = jobs.reduce((sum, job) => sum + (job.feature_count || 0), 0);

  return (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, supervision, ${lldVersionLabel(project)}, status ${project.status.replace(/_/g, ' ')}`}
    >
      <View style={styles.jobHeader}>
        <View style={styles.jobInfo}>
          <Text style={[styles.jobName, { color: colors.textPrimary }]} numberOfLines={1}>
            {project.name}
          </Text>
          <Text style={[styles.jobMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {lldVersionLabel(project)} · {jobs.length} {jobs.length === 1 ? 'task' : 'tasks'} ·{' '}
            {featureTotal} features
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={project.status} />
          <ChevronRight size={16} stroke={colors.textTertiary} />
        </View>
      </View>
      <View style={styles.jobFooter}>
        <Text style={[styles.jobDate, { color: colors.textTertiary }]}>
          Assigned: {jobs[0] ? new Date(jobs[0].created_at).toLocaleDateString() : '—'}
        </Text>
        <Text style={[styles.jobDate, { color: colors.primary, fontWeight: '700' }]}>
          Inspect in field
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  header: { marginBottom: Spacing.xl },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 2 },
  statsRow: { flexDirection: 'row', marginBottom: Spacing.xl },
  statsGap: { width: Spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  count: { fontSize: 14, fontWeight: '500' },
  loadingCard: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  loadingText: { fontSize: 15, lineHeight: 21 },
  errorTitle: { fontSize: 16, fontWeight: '600' },
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
  jobDate: { fontSize: 12, lineHeight: 16 },
});
