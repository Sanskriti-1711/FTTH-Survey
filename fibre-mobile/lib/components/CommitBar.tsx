// ── Commit Bar ─────────────────────────────────────────────────────────────
//
// THE commit path. Every screen that can finish survey work shows this one bar,
// in the same place, with the same two-tap submit — so the engineer learns it
// once and never hunts for the button that means "send my work".
//
// It replaces the per-screen scatter of Save Draft / Submit / Done / Save
// Changes affordances on the screens where submission actually happens.
//
// Two design decisions worth keeping:
//
//   • Two taps, not a modal. Alert.alert is a no-op on React Native Web, so a
//     modal confirm silently disappears in the browser build — the engineer
//     taps Submit and nothing happens. Two taps work identically on every
//     platform, take the same time through gloves, and show the counts first.
//
//   • The counts are on screen before the tap, not inside a dialog after it.
//     A field engineer deciding whether to submit needs the state (how many
//     changes, how many still syncing, anything unsaved) while standing there,
//     not in a modal they have to dismiss.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { CheckCircle, ChevronRight, AlertTriangle } from 'lucide-react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius, Touch, StatusColors } from '../theme/colors';
import {
  EMPTY_COMMIT_SUMMARY,
  commitConfirmLabel,
  commitSummaryText,
  commitWarning,
  type CommitSummary,
  type CommitWarningTone,
} from '../utils/commit';

/** How long the armed (second-tap) state stays live before resetting. */
const ARM_TIMEOUT_MS = 5000;

interface CommitBarProps {
  /** The single submit action. Resolve when the request has settled. */
  onSubmit: () => void | Promise<void>;
  /** Optional save for work this screen holds but has not committed yet. */
  onSave?: () => void | Promise<void>;
  summary?: CommitSummary;
  /** Overrides the derived one-line state for screens with a smaller unit of work. */
  summaryText?: string;
  saveLabel?: string;
  submitLabel?: string;
  /** Replaces the buttons once the work is already with the planner. */
  submittedLabel?: string;
  /** Opens the survey changes list — makes the state line tappable. */
  onReviewChanges?: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Whole-project submits warn on an empty survey; smaller units of work do not. */
  expectChanges?: boolean;
  /** Hide the state line (e.g. on a project card with no counts loaded yet). */
  showSummary?: boolean;
  variant?: 'bar' | 'card';
  /** Lets a caller stack something above the bar without overlapping it. */
  onLayout?: (event: LayoutChangeEvent) => void;
}

const TONE_COLORS: Record<CommitWarningTone, string> = {
  info: '#1D4ED8',
  // amber-700 — the raw warning colour is only ~2:1 on white, unusable in sun
  warning: StatusColors.flagged.text,
  error: StatusColors.failed.text,
};

export default function CommitBar({
  onSubmit,
  onSave,
  summary = EMPTY_COMMIT_SUMMARY,
  summaryText,
  saveLabel = 'Save',
  submitLabel = 'Submit survey',
  submittedLabel,
  onReviewChanges,
  busy = false,
  disabled = false,
  expectChanges = true,
  showSummary = true,
  variant = 'bar',
  onLayout,
}: CommitBarProps) {
  const colors = useThemeStore((s) => s.colors);
  const [armed, setArmed] = useState(false);

  // The confirm state is a promise the engineer can walk away from: if they
  // don't take the second tap quickly, the bar quietly returns to normal
  // instead of leaving a primed, irreversible button under a thumb.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  // Any change in what would be submitted cancels a primed confirm — the
  // second tap must always describe the work it actually sends.
  useEffect(() => {
    setArmed(false);
  }, [summary.changes, summary.pending, summary.failed, summary.unsaved]);

  const warning = commitWarning(summary, { expectChanges });
  const stateText = summaryText ?? commitSummaryText(summary);
  const isSubmitted = Boolean(submittedLabel);
  const isBlocked = disabled || busy || isSubmitted;

  const handlePress = useCallback(async (event?: GestureResponderEvent) => {
    // The bar is rendered inside pressable cards on the project list; without
    // this a tap on Submit would also open the project underneath it.
    event?.stopPropagation?.();
    if (isBlocked) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    await onSubmit();
  }, [armed, isBlocked, onSubmit]);

  const handleSave = useCallback(async (event?: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (disabled || busy || !onSave) return;
    await onSave();
  }, [busy, disabled, onSave]);

  // The state line carries the severity before the tap: a rejected change must
  // look wrong from across the site, not only inside the confirm.
  const stateColor =
    summary.failed > 0
      ? TONE_COLORS.error
      : summary.unsaved > 0 || summary.pending > 0
        ? TONE_COLORS.warning
        : colors.textSecondary;

  const submitText = armed ? commitConfirmLabel(submitLabel, summary) : submitLabel;
  const submitBg = isSubmitted
    ? colors.outlineLight
    : armed
      ? colors.warning
      : disabled
        ? colors.outlineLight
        : colors.primary;
  const submitFg = isSubmitted || disabled ? colors.textSecondary : armed ? '#1F2937' : colors.onPrimary;

  return (
    <View
      onLayout={onLayout}
      style={
        variant === 'card'
          ? [styles.card, { backgroundColor: colors.surface, borderColor: colors.outline }]
          : [styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.outlineLight }]
      }
    >
      {/* Status area. Fixed height on purpose: the pre-flight warning replaces
          the state line in place instead of pushing the button down. An
          earlier build inserted the warning above the buttons, which moved
          Submit between the first and second tap — the second tap then landed
          on the row above and the engineer submitted nothing. */}
      {showSummary && (
        <View style={styles.statusArea}>
          {armed && !isSubmitted ? (
            <View style={styles.warningRow}>
              <AlertTriangle
                size={14}
                stroke={warning ? TONE_COLORS[warning.tone] : colors.textSecondary}
              />
              <Text
                style={[
                  styles.warningText,
                  { color: warning ? TONE_COLORS[warning.tone] : colors.textSecondary },
                ]}
                numberOfLines={2}
                accessibilityLiveRegion="polite"
              >
                {warning?.text ?? 'This sends every recorded change to the planner.'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.stateRow}
              onPress={onReviewChanges}
              disabled={!onReviewChanges}
              activeOpacity={onReviewChanges ? 0.6 : 1}
              accessibilityRole={onReviewChanges ? 'button' : 'text'}
              accessibilityLabel={onReviewChanges ? `${stateText}. Review changes` : stateText}
            >
              <Text style={[styles.stateText, { color: stateColor }]} numberOfLines={1}>
                {stateText}
              </Text>
              {onReviewChanges ? <ChevronRight size={16} stroke={colors.textSecondary} /> : null}
            </TouchableOpacity>
          )}
        </View>
      )}

      {isSubmitted ? (
        <View style={styles.submittedRow}>
          <CheckCircle size={18} stroke={StatusColors.completed.text} />
          <Text style={[styles.submittedText, { color: colors.textPrimary }]} numberOfLines={1}>
            {submittedLabel}
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          {onSave ? (
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                { backgroundColor: colors.background, borderColor: colors.outline },
              ]}
              onPress={handleSave}
              disabled={disabled || busy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={saveLabel}
              accessibilityState={{ disabled: disabled || busy }}
            >
              <Text style={[styles.buttonText, { color: colors.textPrimary }]} numberOfLines={1}>
                {saveLabel}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.button,
              styles.submitButton,
              { backgroundColor: submitBg, opacity: disabled ? 0.5 : 1 },
            ]}
            onPress={handlePress}
            disabled={disabled || busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={submitText}
            accessibilityState={{ disabled: disabled || busy, busy }}
          >
            {busy ? (
              <ActivityIndicator color={submitFg} size="small" />
            ) : (
              <Text style={[styles.buttonText, { color: submitFg }]} numberOfLines={1}>
                {submitText}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
  },
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  // Two 12px lines + a little air. Constant whether the state line or the
  // pre-flight warning is showing.
  statusArea: { height: 34, justifyContent: 'center' },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    minHeight: 32,
  },
  stateText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingBottom: 4,
  },
  warningText: { fontSize: 12, fontWeight: '600', flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  button: {
    height: Touch.minHeight,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  saveButton: { borderWidth: 1, minWidth: 96 },
  submitButton: { flex: 1 },
  buttonText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  submittedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    height: Touch.minHeight,
  },
  submittedText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
