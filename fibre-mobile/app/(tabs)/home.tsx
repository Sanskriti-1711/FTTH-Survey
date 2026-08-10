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
import { Card, StatCard } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spacing, Radius, StatusColors, type StatusKey } from '../../lib/theme/colors';
import {
  Camera,
  Upload,
  Bell,
  ChevronRight,
  FileArchive,
} from 'lucide-react-native';
import type { Project } from '../../lib/utils/types';
import type { ReviewAction } from '../../lib/api/projects';

// ── Home Screen ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUBADMIN';
  const { projects, fetchProjects, acceptSurveyCopy, submitSurveyCopy, reviewSurveyProject } = useProjectStore();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Project['status'] | 'all'>('all');

  const loadData = useCallback(async () => {
    await fetchProjects();
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
            style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
            onPress={() => router.push('/camera')}
            activeOpacity={0.8}
          >
            <Camera size={24} color="#FFFFFF" />
            <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Photo</Text>
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
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isActive ? '#FFFFFF' : colors.textSecondary },
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
            paddingVertical: 9,
            borderRadius: 8,
            alignItems: 'center',
            backgroundColor: colors.primary,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
            Accept Survey Project
          </Text>
        </TouchableOpacity>
      )}
      {showSubmit && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onSubmit();
          }}
          style={{
            marginTop: 10,
            paddingVertical: 9,
            borderRadius: 8,
            alignItems: 'center',
            backgroundColor: colors.secondary ?? colors.primary,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
            {project.status === 'redo' ? 'Resubmit Survey' : 'Submit for Review'}
          </Text>
        </TouchableOpacity>
      )}
      {reviewActions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {reviewActions.map((btn) => (
            <TouchableOpacity
              key={btn.action}
              onPress={(e) => handleReviewPress(e, btn)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: confirmingAction === btn.action ? colors.warning : btn.color,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
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
  jobDate: { fontSize: 12 },
});
