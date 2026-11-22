// ── How a project's layer fetch went ──────────────────────────────────────
//
// A supervision project loads one request per layer. When every one of them
// fails, the screen used to draw the same card as a project with no geometry
// ("No mapped features"), so a broken endpoint looked like empty data and
// nobody thought to retry. Judge the batch by layers, and say which it was.
//
// Kept free of React Native imports so `npm test` can run it directly.

export type LayerLoadVerdict = 'ok' | 'partial' | 'failed';

/** Layers failed / total, as one of three states. */
export function layerLoadVerdict(total: number, failed: number): LayerLoadVerdict {
  if (total <= 0 || failed <= 0) return 'ok';
  return failed >= total ? 'failed' : 'partial';
}

/** The sentence for the banner (partial) or the error card (failed). */
export function layerLoadMessage(total: number, failed: number): string {
  const layers = total === 1 ? 'layer' : 'layers';
  if (layerLoadVerdict(total, failed) === 'failed') {
    return `None of this project's ${total} ${layers} loaded. Check the connection and try again.`;
  }
  return `${failed} of ${total} ${layers} failed to load — showing the rest.`;
}
