// ── The survey commit path ────────────────────────────────────────────────
//
// One shared answer to the two questions the field engineer keeps asking:
//
//   1. "What have I changed?"   → summarizeCommit()
//   2. "Is it safe to submit?"  → commitWarning()
//
// The map, the feature screen and the project list all read these, so the
// counts, the wording and the two-tap submit behave identically wherever the
// engineer happens to be standing. No screen may phrase a submit warning on
// its own — that is how the app ended up with 13 differently-named buttons
// that all meant "send my work".

import type { SurveyFeatureData } from './types';

export type CommitSummary = {
  /** Survey features recorded for this project. */
  changes: number;
  /** Recorded on the device, not yet confirmed by the server. */
  pending: number;
  /** The server rejected these — a submit will NOT carry them. */
  failed: number;
  /** Edits an editor still holds locally — nothing has been sent anywhere yet. */
  unsaved: number;
};

export const EMPTY_COMMIT_SUMMARY: CommitSummary = {
  changes: 0,
  pending: 0,
  failed: 0,
  unsaved: 0,
};

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many ?? `${one}s`}`;
}

/**
 * Count the survey features recorded for a project and their sync state.
 *
 * `unsaved` is passed in rather than derived because only the screen knows
 * which editor is holding an open, uncommitted session (a line being moved,
 * a polygon mid-drag, a notes draft).
 */
export function summarizeCommit(
  surveyFeatures: Record<string, SurveyFeatureData[]>,
  unsaved = 0,
): CommitSummary {
  let changes = 0;
  let pending = 0;
  let failed = 0;

  for (const list of Object.values(surveyFeatures)) {
    for (const sf of list) {
      changes += 1;
      if (sf.sync_status === 'pending') pending += 1;
      else if (sf.sync_status === 'failed') failed += 1;
    }
  }

  return { changes, pending, failed, unsaved };
}

export function mergeCommitSummaries(...parts: CommitSummary[]): CommitSummary {
  return parts.reduce<CommitSummary>(
    (acc, p) => ({
      changes: acc.changes + p.changes,
      pending: acc.pending + p.pending,
      failed: acc.failed + p.failed,
      unsaved: acc.unsaved + p.unsaved,
    }),
    { ...EMPTY_COMMIT_SUMMARY },
  );
}

/** The one-line state shown above the commit buttons. */
export function commitSummaryText(summary: CommitSummary): string {
  const bits: string[] = [];

  if (summary.changes > 0) bits.push(plural(summary.changes, 'change'));
  if (summary.pending > 0) bits.push(`${summary.pending} waiting to sync`);
  if (summary.failed > 0) bits.push(`${summary.failed} failed to sync`);
  if (summary.unsaved > 0) bits.push(`${plural(summary.unsaved, 'edit')} not saved`);

  if (bits.length === 0) return 'No survey changes yet';
  return bits.join(' · ');
}

export type CommitWarningTone = 'info' | 'warning' | 'error';

export type CommitWarning = { tone: CommitWarningTone; text: string };

/**
 * The pre-flight check, in the order the engineer must care about it: a change
 * the server rejected is worse than one still in flight, which is worse than
 * one sitting unsaved on the device. Returns null when there is nothing to say.
 *
 * `expectChanges: false` is for callers whose unit of work is smaller than the
 * project (a single feature, a project card) — an empty survey is only
 * suspicious when the engineer means to submit the whole thing.
 */
export function commitWarning(
  summary: CommitSummary,
  opts: { expectChanges?: boolean } = {},
): CommitWarning | null {
  const expectChanges = opts.expectChanges ?? true;

  if (summary.failed > 0) {
    return {
      tone: 'error',
      text: `${plural(summary.failed, 'change')} failed to sync — the planner will not receive ${
        summary.failed === 1 ? 'it' : 'them'
      }.`,
    };
  }

  if (summary.unsaved > 0) {
    return {
      tone: 'warning',
      text: `${plural(summary.unsaved, 'edit')} not saved yet — save before submitting.`,
    };
  }

  if (summary.pending > 0) {
    return {
      tone: 'warning',
      text: `${plural(summary.pending, 'change')} still syncing — they may not reach the planner with this submit.`,
    };
  }

  if (expectChanges && summary.changes === 0) {
    return { tone: 'info', text: 'No survey changes recorded yet — submit anyway?' };
  }

  return null;
}

/** Label for the second tap, so the confirm states exactly what it will send. */
export function commitConfirmLabel(submitLabel: string, summary: CommitSummary): string {
  if (summary.changes > 0) return `Tap again to submit ${plural(summary.changes, 'change')}`;
  return `Tap again to ${submitLabel.toLowerCase()}`;
}
