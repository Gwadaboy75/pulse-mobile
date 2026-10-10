// The two-stage recompute (KTD6). Stage 1 (stage1.ts) reads the heavy per-sample tables for the days
// whose inputs changed and caches per-day results; stage 2 (stage2.ts, scorers in scores.ts) folds
// every day, oldest first, over daily rows and those cached results. Every value for day D depends
// only on D and earlier days, except where a feature is defined over the evening that follows (Energy
// Bank stops at tonight's bedtime, Stress leaves out tonight's sleep), so adding a later night never
// changes an earlier day's scores.
//
// Determinism: the same database gives byte-identical daily_scores, and writes only touch rows whose
// JSON differs, so an unchanged recompute writes nothing.
import type { Repos, Store } from "../data/repos";
import { load } from "./data";
import { stage1 } from "./stage1";
import { stage2 } from "./stage2";
import { type PipelineOptions, SCORING_VERSION } from "./types";

export * from "./types";

/** What the last run did, for tests and logs. */
export const lastRun = { stage1Days: [] as string[], stage2Days: 0, ms: 0, stage1Ms: 0, stage2Ms: 0 };

/**
 * The sync's hook: recompute when a source changed something, a day is dirty, or the version moved. `getProfile` is
 * pulse's profile.ts `getProfile` (max HR resolved, with the time zone), read only when there is work to do.
 */
export async function recomputeIfNeeded(
  store: Store,
  changed: boolean,
  getProfile: () => Promise<(PipelineOptions["profile"] & { timeZone: string }) | null>,
): Promise<void> {
  if (!changed && !(await needsRecompute(store))) return;
  // Scores need age and sex: before onboarding, sync keeps importing and scoring waits.
  const profile = await getProfile();
  if (!profile) return;
  await recompute(store, { timeZone: profile.timeZone, profile });
  console.info(`[pipeline] recomputed in ${lastRun.ms} ms (stage 1: ${lastRun.stage1Days.length} days, stage 2: ${lastRun.stage2Days} days)`);
}

/** A dirty day, a row from another scoring version, or a newest daily row not yet scored. */
export const needsRecompute = (store: Repos): Promise<boolean> => store.scores.needsRecompute(SCORING_VERSION);

/** Runs both stages. The caller never overlaps runs. */
export async function recompute(store: Store, opts: PipelineOptions) {
  const t0 = performance.now();
  const data = await load(store, opts);
  if (!data) {
    Object.assign(lastRun, { stage1Days: [], stage2Days: 0, ms: Math.round(performance.now() - t0), stage1Ms: 0, stage2Ms: 0 });
    return lastRun;
  }
  const t1 = performance.now();
  lastRun.stage1Days = await stage1(store, data, opts);
  const t2 = performance.now();
  const s2 = await stage2(store, data, opts, lastRun.stage1Days);
  const t3 = performance.now();
  Object.assign(lastRun, { stage2Days: s2.days, stage1Ms: Math.round(t2 - t1), stage2Ms: Math.round(t3 - t2), ms: Math.round(t3 - t0) });
  return lastRun;
}
