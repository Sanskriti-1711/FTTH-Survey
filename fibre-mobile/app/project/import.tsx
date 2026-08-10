import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeStore } from '../../lib/stores/theme';
import { useProjectStore } from '../../lib/stores/project';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Spacing, Radius } from '../../lib/theme/colors';
import { ArrowLeft, Upload, FileArchive, CheckCircle, FileText } from 'lucide-react-native';

// ── Project Import Screen ─────────────────────────────────────────────────

export default function ProjectImportScreen() {
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const colors = useThemeStore((s) => s.colors);
  const { importSurveyPackage, activeProject, isLoading, error: storeError } = useProjectStore();

  const [file, setFile] = useState<{ uri: string; name: string; type: string; size?: number } | null>(null);
  const [step, setStep] = useState<'select' | 'uploading' | 'done'>('select');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');  const [toastType, setToastType] = useState<'success' | 'error' | 'warning'>('error');
  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'error') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setFile({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType ?? 'application/zip',
          size: asset.size,
        });
        setStep('select');
      }
    } catch {
      showToast('Failed to pick file');
    }
  };

  // Track which import phase we're in for better UX feedback
  const [importPhase, setImportPhase] = useState<string>('');

  const handleImport = async () => {
    if (!file) {
      showToast('Select a survey package file first');
      return;
    }

    try {
      setStep('uploading');
      setImportPhase('Importing survey package... This may take a moment.');

      await importSurveyPackage(projectId as string ?? '', file);

      setStep('done');
      setImportPhase('');

      // Surface any error the store recorded (e.g. backend validation failure)
      const currentState = useProjectStore.getState();
      if (currentState.error) {
        showToast(currentState.error, 'error');
      } else {
        showToast('Survey package imported successfully!', 'success');
      }
    } catch {
      setStep('select');
      setImportPhase('');
      const storeError = useProjectStore.getState().error;
      showToast(storeError || 'Failed to import package');
    }
  };

  const stepLabel = () => {
    if (importPhase) return importPhase;
    switch (step) {
      case 'done': return `Project "${activeProject?.name ?? 'Imported'}" ready!`;
      default: return 'Ready to import';
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} stroke={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Import Survey Package</Text>
        </View>

        <Card title="Select File" variant="outlined">
          <TouchableOpacity
            style={[
              styles.uploadArea,
              {
                borderColor: file ? colors.success : colors.outline,
                borderStyle: file ? 'solid' : 'dashed',
                backgroundColor: colors.background,
              },
            ]}
            onPress={pickFile}
            activeOpacity={0.7}
          >
            {file ? (
              <View style={styles.fileInfo}>
                <FileArchive size={36} stroke={colors.success} />
                <Text style={[styles.fileName, { color: colors.textPrimary }]}>{file.name}</Text>
                {file.size && (
                  <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </Text>
                )}
                <Text style={[styles.fileChange, { color: colors.primary }]}>
                  Tap to change file
                </Text>
              </View>
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Upload size={36} stroke={colors.textTertiary} />
                <Text style={[styles.uploadLabel, { color: colors.textSecondary }]}>
                  Tap to select a ZIP or GeoPackage file
                </Text>
                <Text style={[styles.uploadHint, { color: colors.textTertiary }]}>
                  Supports .zip and .gpkg files
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Card>

        {/* Progress */}
        {step !== 'select' && (
          <Card title="Import Progress" variant="outlined">
            <View style={styles.progressSection}>
              {step === 'done' ? (
                <View style={[styles.doneRow, { backgroundColor: colors.success + '10' }]}>
                  <CheckCircle size={20} stroke={colors.success} />
                  <Text style={[styles.doneText, { color: colors.success }]}>
                    Package imported successfully
                  </Text>
                </View>
              ) : (
                <View style={styles.inProgressRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                    {stepLabel()}
                  </Text>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Import Guidelines */}
        <Card title="Guidelines" variant="outlined">
          <View style={styles.guidelineRow}>
            <FileText size={16} stroke={colors.textSecondary} />
            <Text style={[styles.guidelineText, { color: colors.textSecondary }]}>
              The ZIP file should contain .geojson files for each layer (objects, polygons, pdps, trenches, etc.).
            </Text>
          </View>
          <View style={styles.guidelineRow}>
            <FileText size={16} stroke={colors.textSecondary} />
            <Text style={[styles.guidelineText, { color: colors.textSecondary }]}>
              .gpkg (GeoPackage) files are also included but require server-side processing.
            </Text>
          </View>
          <View style={styles.guidelineRow}>
            <FileText size={16} stroke={colors.textSecondary} />
            <Text style={[styles.guidelineText, { color: colors.textSecondary }]}>
              Each layer will be parsed into features with all attributes shown in the detail view.
            </Text>
          </View>
          <View style={styles.guidelineRow}>
            <FileText size={16} stroke={colors.textSecondary} />
            <Text style={[styles.guidelineText, { color: colors.textSecondary }]}>
              Supported geometry types: Point, LineString, Polygon.
            </Text>
          </View>
        </Card>
      </View>

      {/* Import Button */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.outline }]}>
        <Button
          title={step === 'done' ? 'View on Map' : 'Import Package'}
          variant="primary"
          size="lg"
          loading={isLoading && step !== 'done'}
          disabled={(isLoading || !file) && step !== 'done'}
          onPress={step === 'done' ? () => router.replace('/map') : handleImport}
        />
      </View>

      <Toast visible={toastVisible} message={toastMsg} type={toastType} onDismiss={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600' },
  uploadArea: {
    borderWidth: 2,
    borderRadius: Radius.lg,
    padding: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPlaceholder: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  uploadLabel: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
  uploadHint: { fontSize: 13 },
  fileInfo: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fileName: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  fileSize: { fontSize: 13 },
  fileChange: { fontSize: 13, fontWeight: '500', marginTop: Spacing.xs },
  progressSection: { gap: Spacing.md },
  progressLabel: { fontSize: 14, fontWeight: '500' },
  inProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  doneText: { fontSize: 14, fontWeight: '500' },
  guidelineRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  guidelineText: { fontSize: 13, flex: 1, lineHeight: 18 },
  bottomBar: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
});
