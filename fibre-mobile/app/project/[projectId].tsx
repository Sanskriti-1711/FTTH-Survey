import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge, ProgressBar } from '../../components/ui/StatusBadge';
import { Spacing, Radius } from '../../lib/theme/colors';
import { ArrowLeft, Layers, ChevronRight, Download, Map } from 'lucide-react-native';
import type { Layer, Project } from '../../lib/utils/types';

// ── Project Detail Screen ─────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const colors = useThemeStore((s) => s.colors);

  const [project, setProject] = useState<Project | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const { getProject, getProjectLayers } = await import('../../lib/api/projects');
      const [proj, layerData] = await Promise.all([
        getProject(projectId as string),
        getProjectLayers(projectId as string),
      ]);
      setProject(proj);
      setLayers(layerData.layers);
    } catch {
      // Leave project null — the "Project not found" state handles it
    } finally {
      setLoading(false);
    }
  };

  const handleLayerPress = (layer: Layer) => {
    // Navigate to survey tab with this layer pre-selected
    router.push('/(tabs)/survey');
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>Project not found</Text>
          <Button title="Go Back" variant="secondary" size="sm" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  const totalFeatures = layers.reduce((sum, l) => sum + l.feature_count, 0);
  const approved = layers.reduce((sum, l) => sum + l.status_counts.approved, 0);
  const overallProgress = totalFeatures > 0 ? approved / totalFeatures : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} stroke={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.topInfo}>
            <Text style={[styles.projectTitle, { color: colors.textPrimary }]}>{project.name}</Text>
            <Text style={[styles.projectRegion, { color: colors.textSecondary }]}>
              {project.region || 'No region'}
            </Text>
          </View>
          <StatusBadge status={project.status} />
        </View>

        {/* Overall Progress */}
        <Card>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>Overall Progress</Text>
            <Text style={[styles.progressCount, { color: colors.textSecondary }]}>
              {approved} / {totalFeatures} features
            </Text>
          </View>
          <ProgressBar progress={overallProgress} height={10} showLabel />
        </Card>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <Button
            title="View on Map"
            variant="secondary"
            size="sm"
            icon={<Map size={16} stroke={colors.primary} />}
            onPress={() => router.push('/(tabs)/map')}
            style={{ flex: 1 }}
          />
          <Button
            title="Survey Tab"
            variant="primary"
            size="sm"
            icon={<Layers size={16} stroke={colors.onPrimary} />}
            onPress={() => router.push('/(tabs)/survey')}
            style={{ flex: 1 }}
          />
        </View>

        {/* Layers */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Layers</Text>

        {layers.map((layer) => {
          const layerProgress = layer.feature_count > 0
            ? layer.status_counts.approved / layer.feature_count
            : 0;

          return (
            <TouchableOpacity
              key={layer.layer_id}
              style={[styles.layerCard, { backgroundColor: colors.surface }]}
              activeOpacity={0.7}
              onPress={() => handleLayerPress(layer)}
            >
              <View style={styles.layerHeader}>
                <View style={styles.layerLeft}>
                  <Layers size={16} stroke={colors.primary} />
                  <View style={styles.layerInfo}>
                    <Text style={[styles.layerName, { color: colors.textPrimary }]}>
                      {layer.layer_name}
                    </Text>
                    <Text style={[styles.layerCount, { color: colors.textTertiary }]}>
                      {layer.feature_count} features
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} stroke={colors.textTertiary} />
              </View>

              <View style={styles.layerProgress}>
                <ProgressBar progress={layerProgress} height={6} />
                <View style={styles.layerStats}>
                  <Text style={[styles.layerStatText, { color: colors.success }]}>
                    {layer.status_counts.approved} done
                  </Text>
                  <Text style={[styles.layerStatText, { color: colors.warning }]}>
                    {layer.status_counts.pending} pending
                  </Text>
                  {layer.status_counts.redo > 0 && (
                    <Text style={[styles.layerStatText, { color: colors.error }]}>
                      {layer.status_counts.redo} redo
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topInfo: { flex: 1 },
  projectTitle: { fontSize: 20, fontWeight: '600' },
  projectRegion: { fontSize: 13, marginTop: 2 },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  progressTitle: { fontSize: 14, fontWeight: '500' },
  progressCount: { fontSize: 13 },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  layerCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  layerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  layerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  layerInfo: {},
  layerName: { fontSize: 15, fontWeight: '600' },
  layerCount: { fontSize: 12 },
  layerProgress: {
    gap: Spacing.xs,
  },
  layerStats: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  layerStatText: { fontSize: 12, fontWeight: '500' },
});
