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
import { StatCard } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import CommitBar from '../../lib/components/CommitBar';
import { Spacing, Radius, StatusColors, Touch, Type, type StatusKey } from '../../lib/theme/colors';
import { Camera, Upload, Bell, ChevronRight } from 'lucide-react-native';
import type { Project } from '../../lib/utils/types';
import type { ReviewAction } from '../../lib/api/projects';

// ── Home Screen ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUBADMIN';
  const { projects, fetchProjects, acceptSurveyCopy, submitSurveyCopy, reviewSurveyProject } = useProjectStore();
  const [refreshing, setRefreshing] = useState(false);
  // The first fetch decides between "no projects" and "not loaded yet". A
  // 390 px phone showed "No Projects Yet" over a project list that arrived a
  // moment later, which reads as data loss.
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Project['status'] | 'all'>('all');

  const loadData = useCallback(async () => {
    try {
      await fetchProjects();
    } finally {
      setLoadingProjects(false);
    }
  }, [fetchProjects]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Status counts derived from the single "My Projects" list — the separate
  // assignments feed is gone, the flags on the cards are the source of truth.
  const activeAssignments = projects.filter(
    (p) => p.status === 'active' || p.status === 'assigned' || p.status === 'redo'
  ).length;
  const completedToday = projects.filter(
    (p) => p.status === 'accepted' || p.status === 'completed'
  ).length;
  const pendingSubmissions = projects.filter(
    (p) => p.status === 'submitted' || p.status === 'under_review' || p.status === 'reviewed'
  ).length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Admins: surface projects that need their attention first (submitted →
  // under review → reviewed), so the review queue is never buried by newer
  // projects. Engineers keep the plain newest-first ordering.
  const visibleProjects = isAdmin
    ? [...projects].sort((a, b) => {
        const rank = (p: Project) =>
          ['submitted', 'under_review', 'reviewed'].includes(p.status) ? 0 : p.status === 'redo' ? 1 : 2;
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
    : projects;

  // Role-aware filter chips — engineers filter their workflow, admins their queue.
  const filterChips: { key: Project['status'] | 'all'; label: string }[] = isAdmin
    ? [
        { key: 'all', label: 'All' },
        { key: 'submitted', label: 'Submitted' },
        { key: 'under_review', label: 'Under Review' },
        { key: 'reviewed', label: 'Reviewed' },
        { key: 'accepted', label: 'Accepted' },
        { key: 'redo', label: 'Redo' },
      ]
    : [
        { key: 'all', label: 'All' },
        { key: 'assigned', label: 'Assigned' },
        { key: 'active', label: 'Active' },
        { key: 'submitted', label: 'Submitted' },
        { key: 'redo', label: 'Redo' },
      ];

  const filteredProjects =
    statusFilter === 'all'
      ? visibleProjects
      : visibleProjects.filter((p) => p.status === statusFilter);

  const activeFilterLabel =
    filterChips.find((c) => c.key === statusFilter)?.label ?? 'matching';

  // Auto-reset the filter to 'all' when the filtered list becomes empty.
  // This handles the case where an action (accept, submit, review) removes
  // the last project matching the current filter.
  useEffect(() => {
    if (statusFilter !== 'all' && filteredProjects.length === 0) {
      setStatusFilter('all');
    }
  }, [statusFilter, filteredProjects.length]);

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
              accessibilityRole="button"
              accessibilityLabel="Open my profile"
            >
              <Bell size={20} stroke={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick stats — three numbers, one row, no cards competing with the
            project list for attention. */}
        <View style={styles.statsRow}>
          <StatCard title="Active" value={activeAssignments} color={colors.primary} />
          <View style={styles.statsGap} />
          <StatCard title="Done" value={completedToday} color={colors.success} />
          <View style={styles.statsGap} />
          <StatCard title="Pending" value={pendingSubmissions} color={colors.warning} />
        </View>

        {/* My Projects */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            My Projects
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/project/import')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Import a new project"
          >
            <Text style={[styles.seeAll, { color: colors.primary }]}>+ New</Text>
          </TouchableOpacity>
        </View>

        {/* Status filter chips — only useful once there are projects to filter */}
        {projects.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={{ marginBottom: Spacing.md }}
        >
          {filterChips.map((chip) => {
            const isActive = statusFilter === chip.key;
            const count =
              chip.key === 'all'
                ? projects.length
                : projects.filter((p) => p.status === chip.key).length;
            const chipColor =
              chip.key === 'all' ? colors.primary : (StatusColors[chip.key as StatusKey]?.dot ?? colors.primary);
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setStatusFilter(chip.key)}
                style={[
                  styles.filterChip,
                  {
                    borderColor: isActive ? chipColor : colors.textTertiary + '55',
                    backgroundColor: isActive ? chipColor : 'transparent',
                  },
                ]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Show ${chip.label} projects, ${count}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isActive ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {chip.label}
                  {count > 0 ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        )}

        {loadingProjects && projects.length === 0 ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading your projects…
            </Text>
          </View>
        ) : projects.length === 0 ? (
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
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title={`No ${activeFilterLabel} Projects`}
            description="Nothing matches this status filter yet"
          />
        ) : (
          filteredProjects.map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              isAdmin={isAdmin}
              onPress={() => {
                // Engineers must accept an assigned project before working on it.
                // Admins may open any project (review + inspect).
                if (!isAdmin && proj.status === 'assigned') return;
                useProjectStore.getState().setActiveProject(proj);
                router.push('/map');
              }}
              onAccept={() => acceptSurveyCopy(proj.id).then(() => loadData())}
              onSubmit={() => submitSurveyCopy(proj.id).then(() => loadData())}
              onReview={(action) => reviewSurveyProject(proj.id, action).then(() => loadData())}
            />
          ))
        )}


        {/* Quick actions — two tiles instead of a full-width orange block that
            pushed the project list off the first screen. */}
        <Text style={[styles.sectionTitle, styles.actionsTitle, { color: colors.textPrimary }]}>
          Quick actions
        </Text>
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickTile, { backgroundColor: colors.secondary }]}
            onPress={() => router.push('/camera')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
          >
            {/* Never white on the identity orange — it is 2.33:1. */}
            <Camera size={24} color={colors.onSecondary} />
            <Text style={[styles.quickLabel, { color: colors.onSecondary }]}>Photo</Text>
            <Text style={[styles.quickHint, { color: colors.onSecondary }]}>Capture site evidence</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickTile,
              { backgroundColor: colors.surface, borderColor: colors.outlineLight },
            ]}
            onPress={() => router.push('/project/import')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Import a survey package"
          >
            <Upload size={24} stroke={colors.primary} />
            <Text style={[styles.quickLabel, { color: colors.textPrimary }]}>Import</Text>
            <Text style={[styles.quickHint, { color: colors.textTertiary }]}>ZIP or GeoPackage</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Project Card ───────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isAdmin = false,
  onPress,
  onAccept,
  onSubmit,
  onReview,
}: {
  project: import('../../lib/utils/types').Project;
  isAdmin?: boolean;
  onPress: () => void;
  onAccept?: () => void;
  onSubmit?: () => void;
  onReview?: (action: ReviewAction) => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const [confirmingAction, setConfirmingAction] = useState<ReviewAction | null>(null);

  // Engineer actions: accept on first assignment, submit when work is done.
  const showAccept = !isAdmin && !!onAccept && project.status === 'assigned';
  const showSubmit = !isAdmin && !!onSubmit && (project.status === 'active' || project.status === 'redo');

  // Admin review actions — shown only to sub-admins on review-able statuses.
  const reviewActions: { label: string; action: ReviewAction; color: string; confirm?: boolean }[] = [];
  if (isAdmin && onReview) {
    if (project.status === 'submitted') {
      reviewActions.push({ label: 'Start Review', action: 'start_review', color: colors.primary });
    }
    if (project.status === 'under_review') {
      reviewActions.push({ label: 'Mark Reviewed', action: 'reviewed', color: colors.success });
      reviewActions.push({ label: 'Request Redo', action: 'redo', color: StatusColors.redo.dot, confirm: true });
    }
    if (project.status === 'reviewed') {
      reviewActions.push({ label: 'Accept Project', action: 'accept', color: colors.success });
      reviewActions.push({ label: 'Request Redo', action: 'redo', color: StatusColors.redo.dot, confirm: true });
    }
    if (project.status === 'accepted') {
      reviewActions.push({ label: 'Mark Completed', action: 'complete', color: colors.primary, confirm: true });
    }
  }

  const handleReviewPress = (e: any, btn: { action: ReviewAction; confirm?: boolean }) => {
    e.stopPropagation();
    // Destructive actions require a second tap to confirm.
    if (btn.confirm) {
      if (confirmingAction === btn.action) {
        setConfirmingAction(null);
        onReview?.(btn.action);
      } else {
        setConfirmingAction(btn.action);
      }
      return;
    }
    setConfirmingAction(null);
    onReview?.(btn.action);
  };

  return (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, ${project.region || 'Field Survey'}, status ${project.status.replace(/_/g, ' ')}`}
    >
      <View style={styles.jobHeader}>
        <View style={styles.jobInfo}>
          <Text style={[styles.jobName, { color: colors.textPrimary }]} numberOfLines={1}>
            {project.name}
          </Text>
          <Text style={[styles.jobMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {project.region || 'Field Survey'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={project.status} />
          <ChevronRight size={16} stroke={colors.textTertiary} />
        </View>
      </View>
      {showAccept && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onAccept();
          }}
          style={{
            marginTop: 10,
            minHeight: Touch.minTarget,
            justifyContent: 'center',
            borderRadius: 8,
            alignItems: 'center',
            backgroundColor: colors.primary,
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Accept this survey project"
        >
          <Text style={{ color: colors.onPrimary, fontSize: Type.label.fontSize, fontWeight: '700' }}>
            Accept Survey Project
          </Text>
        </TouchableOpacity>
      )}
      {/* The card's submit IS the commit bar, so the confirm and the wording
          are the same here as on the map — this button is only a shortcut for
          engineers who finish a job without opening the map last. */}
      {showSubmit && onSubmit && (
        <View style={{ marginTop: 10 }}>
          <CommitBar
            variant="card"
            onSubmit={onSubmit}
            submitLabel={project.status === 'redo' ? 'Resubmit survey' : 'Submit survey'}
            showSummary={false}
            expectChanges={false}
          />
        </View>
      )}
      {reviewActions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {reviewActions.map((btn) => (
            <TouchableOpacity
              key={btn.action}
              onPress={(e) => handleReviewPress(e, btn)}
              style={{
                flex: 1,
                minHeight: Touch.minTarget,
                justifyContent: 'center',
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: confirmingAction === btn.action ? colors.warning : btn.color,
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={
                confirmingAction === btn.action ? `${btn.label}, tap again to confirm` : btn.label
              }
            >
              <Text style={{ color: colors.onPrimary, fontSize: Type.label.fontSize, fontWeight: '700' }}>
                {confirmingAction === btn.action ? 'Tap again to confirm' : btn.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.jobFooter}>
        <Text style={[styles.jobDate, { color: colors.textTertiary }]}>
          Created: {new Date(project.created_at).toLocaleDateString()}
        </Text>
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
    width: Touch.minTarget,
    height: Touch.minTarget,
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
  importLinkText: { fontSize: Type.label.fontSize, lineHeight: Type.label.lineHeight, fontWeight: '600' },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  importInfo: { flex: 1 },
  importLabel: { fontSize: 14, fontWeight: '500' },
  importDesc: { fontSize: Type.meta.fontSize, lineHeight: Type.meta.lineHeight, marginTop: 2 },
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
  actionsTitle: { marginTop: Spacing.xl, marginBottom: Spacing.sm },
  quickRow: { flexDirection: 'row', gap: Spacing.md },
  quickTile: {
    flex: 1,
    minHeight: 104,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: Spacing.lg,
    justifyContent: 'flex-start',
    gap: 2,
  },
  quickLabel: { ...Type.title, marginTop: 6 },
  quickHint: { ...Type.meta },
  loadingCard: { borderRadius: Radius.lg, padding: Spacing.lg },
  loadingText: { ...Type.body },
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
  jobDate: { fontSize: Type.meta.fontSize, lineHeight: Type.meta.lineHeight },
});
