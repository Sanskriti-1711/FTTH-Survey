import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
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
import { Spacing, Radius, StatusColors, type StatusKey } from '../../lib/theme/colors';
import { ClipboardList, ChevronRight } from 'lucide-react-native';
import type { Project, AssignmentJob } from '../../lib/utils/types';
import { getAssignmentJob, getJobsForEngineer } from '../../lib/api/assignments';
import { isSupervisionProject, lldVersionLabel } from '../../lib/api/supervision';

// ── Supervision Tab ───────────────────────────────────────────────────────
// Supervision is its own workspace in the tab bar. A task is one assigned
// span — a feature-scope job — so opening it shows only that geometry, never
// the whole project. Project and layer jobs keep the project view.

type SpanStatus = 'assigned' | 'active' | 'submitted' | 'redo' | 'approved';

export default function SupervisionScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUBADMIN';
  const { projects, fetchProjects, error: projectsError } = useProjectStore();
  const [jobs, setJobs] = useState<AssignmentJob[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openingSpanId, setOpeningSpanId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SpanStatus | 'all'>('all');

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

  const supervisionProjectIds = useMemo(
    () => new Set(projects.filter(isSupervisionProject).map((project) => project.id)),
    [projects],
  );

  // A span task is either the backend's span-scope job (one row per
  // chamber-to-chamber span) or a legacy feature-scope job. Project/layer jobs
  // still appear below because they cover more than one span.
  const spanTasks = useMemo(
    () =>
      (jobs ?? []).filter((job) => {
        if (!supervisionProjectIds.has(job.project.id)) return false;
        if (job.scope === 'span') return true;
        return job.scope === 'feature' && Boolean(job.feature);
      }),
    [jobs, supervisionProjectIds],
  );

  const projectAssignments = useMemo(() => {
    const projectIds = new Set(
      (jobs ?? [])
        .filter((job) => job.scope !== 'feature' && job.scope !== 'span')
        .map((job) => job.project.id),
    );
    return supervisionProjects.filter((project) => projectIds.has(project.id));
  }, [jobs, supervisionProjects]);

  const projectById = useMemo(() => {
    const map: Record<string, Project> = {};
    for (const project of projects) map[project.id] = project;
    return map;
  }, [projects]);

  const spanStatus = (job: AssignmentJob): SpanStatus => {
    const status = job.scope === 'span' ? job.status : job.feature?.status ?? job.status;
    if (status === 'pending') return 'assigned';
    if (status === 'under_review') return 'submitted';
    if (status === 'redo') return 'redo';
    if (status === 'approved') return 'approved';
    return 'active';
  };

  const openSpanJob = useCallback(
    async (job: AssignmentJob) => {
      if (openingSpanId) return;
      setOpeningSpanId(job.id);
      try {
        const detail = await getAssignmentJob(job.id);
        const featureIds = detail.covered_feature_ids ?? [];
        const firstFeatureId = featureIds[0];
        if (!firstFeatureId) throw new Error('This span has no components to inspect.');
        router.push({
          pathname: '/supervision/feature/[featureId]',
          params: {
            featureId: firstFeatureId,
            projectId: job.project.id,
            spanId: detail.span_id ?? job.span?.id ?? '',
            spanFeatureCount: String(featureIds.length),
          },
        });
      } catch (err) {
        Alert.alert(
          'Could not open span',
          err instanceof Error ? err.message : 'Try refreshing your supervision tasks.',
        );
      } finally {
        setOpeningSpanId(null);
      }
    },
    [openingSpanId],
  );

  // Same workflow chips as the Survey tab: engineers filter their span queue.
  const filterChips: { key: SpanStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'active', label: 'Active' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'redo', label: 'Redo' },
  ];

  const filteredSpanTasks =
    statusFilter === 'all'
      ? spanTasks
      : spanTasks.filter((job) => spanStatus(job) === statusFilter);

  const activeFilterLabel =
    filterChips.find((c) => c.key === statusFilter)?.label ?? 'matching';

  const stats = {
    assigned: spanTasks.filter((job) => spanStatus(job) === 'assigned').length,
    active: spanTasks.filter((job) => spanStatus(job) === 'active').length,
    done: spanTasks.filter((job) => spanStatus(job) === 'approved').length,
  };
  const count = spanTasks.length;

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
            Span Tasks
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ClipboardList size={15} stroke={colors.textTertiary} />
            <Text style={[styles.count, { color: colors.textTertiary }]}>{count}</Text>
          </View>
        </View>

        {count > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            style={{ marginBottom: Spacing.md }}
          >
            {filterChips.map((chip) => {
              const isActive = statusFilter === chip.key;
              const chipCount =
                chip.key === 'all'
                  ? count
                  : spanTasks.filter((job) => spanStatus(job) === chip.key).length;
              const chipColor =
                chip.key === 'all'
                  ? colors.primary
                  : (StatusColors[chip.key as StatusKey]?.dot ?? colors.primary);
              const isEmpty = chip.key !== 'all' && chipCount === 0;
              return (
                <TouchableOpacity
                  key={chip.key}
                  onPress={() => setStatusFilter(chip.key)}
                  disabled={isEmpty}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: isActive ? chipColor : colors.textTertiary + '55',
                      backgroundColor: isActive ? chipColor : 'transparent',
                      opacity: isEmpty ? 0.45 : 1,
                    },
                  ]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${chip.label} supervision tasks, ${chipCount}`}
                  accessibilityState={{ selected: isActive, disabled: isEmpty }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isActive ? colors.onPrimary : colors.textSecondary },
                    ]}
                  >
                    {chip.label}
                    {chipCount > 0 ? ` (${chipCount})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {projectsError && projects.length === 0 && count === 0 ? (
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
        ) : count === 0 && projectAssignments.length === 0 ? (
          <EmptyState
            title="No Supervision Tasks Yet"
            description="Spans assigned to you from a completed LLD run will appear here."
            action={<Button title="Refresh" variant="secondary" size="sm" onPress={loadData} />}
          />
        ) : (
          <>
            {count > 0 && filteredSpanTasks.length === 0 ? (
              <EmptyState
                title={`No ${activeFilterLabel} Span Tasks`}
                description="Nothing matches this status filter yet"
                action={
                  <Button
                    title="Show All Tasks"
                    variant="secondary"
                    size="sm"
                    onPress={() => setStatusFilter('all')}
                  />
                }
              />
            ) : (
              filteredSpanTasks.map((job) => (
                <SpanTaskCard
                  key={job.id}
                  job={job}
                  project={projectById[job.project.id]}
                  status={spanStatus(job)}
                  opening={openingSpanId === job.id}
                  onPress={() => {
                    if (job.scope === 'span') {
                      void openSpanJob(job);
                      return;
                    }
                    router.push({
                      pathname: '/supervision/feature/[featureId]',
                      params: { featureId: job.feature?.id ?? '', projectId: job.project.id },
                    });
                  }}
                />
              ))
            )}

            {projectAssignments.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    Project & layer assignments
                  </Text>
                  <Text style={[styles.count, { color: colors.textTertiary }]}>
                    {projectAssignments.length}
                  </Text>
                </View>
                {projectAssignments.map((project) => (
                  <SupervisionCard
                    key={project.id}
                    project={project}
                    jobs={(jobs ?? []).filter(
                      (job) => job.project.id === project.id && job.scope !== 'feature',
                    )}
                    onPress={() =>
                      router.push({
                        pathname: '/supervision/[projectId]',
                        params: { projectId: project.id },
                      })
                    }
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Span Task Card ────────────────────────────────────────────────────────

function SpanTaskCard({
  job,
  project,
  status,
  opening,
  onPress,
}: {
  job: AssignmentJob;
  project?: Project;
  status: SpanStatus;
  opening: boolean;
  onPress: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const feature = job.feature;
  const isSpan = job.scope === 'span';
  if (!isSpan && !feature) return null;

  const spanId = isSpan ? job.span?.id ?? job.span_id ?? '' : '';
  const shortId = (isSpan ? spanId : feature?.id ?? '').slice(-8);
  const title = isSpan
    ? `Span ${spanId || shortId}`
    : `${feature?.layer_name ?? 'Assigned'} span`;
  const componentCount = job.span?.feature_count ?? job.feature_count ?? 0;
  const badgeStatus = isSpan ? job.status : feature?.status ?? job.status;

  return (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${job.project.name}, status ${status}`}
    >
      <View style={styles.jobHeader}>
        <View style={styles.jobInfo}>
          <Text style={[styles.jobName, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.jobMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {job.project.name}
          </Text>
          <Text style={[styles.jobDate, { color: colors.textTertiary }]} numberOfLines={1}>
            {project ? `${lldVersionLabel(project)} · ` : ''}
            {isSpan ? `${componentCount} components · span ${shortId}` : `span ${shortId}`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={badgeStatus} />
          <ChevronRight size={16} stroke={colors.textTertiary} />
        </View>
      </View>
      <View style={styles.jobFooter}>
        <Text style={[styles.jobDate, { color: colors.textTertiary }]}>
          Assigned: {new Date(job.created_at).toLocaleDateString()}
        </Text>
        <Text style={[styles.jobDate, { color: colors.primary, fontWeight: '700' }]}>
          {opening ? 'Opening…' : 'Inspect span'}
        </Text>
      </View>
    </TouchableOpacity>
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },
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
