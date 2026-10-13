// Incremental stage 2 (Pulse-only; halo's stage 2 replays every day). Stage 2 is a fold, oldest day first, and day D's
// scores read only days up to D + 1 (tonight's sleep: Energy Bank, Stress). So the fold as it stood before day C,
// together with the rows already stored for the days before C, is what a full replay would give again, as long as no
// input of a day up to C + 1 changed. Each run keeps that fold for a day near the end, in memory, with a key per day of
// that day's inputs; the next run starts from it when the keys match, and replays every day otherwise.
//
// ponytail: kept in memory per Store, so the first run after a launch (and a headless background run) replays every
// day; persist the fold if those runs matter.
import type { Store } from "@/data/store";
import { addDays } from "@/lib/time";
import { type Data, sha } from "./data";
import type { Fold, Inputs } from "./scores";
import { type PipelineOptions, SCORING_VERSION } from "./types";

/** The fold is kept as it stood before this many days from the end: covers the sync window and recent journal edits. */
export const CHECKPOINT_DAYS = 14;

type Checkpoint = { key: string; last: string; day: string; fold: Fold; days: Map<string, string> };
const checkpoints = new WeakMap<Store, Checkpoint>();

/** Drops the Store's checkpoint, so the next run replays every day (tests). */
export const dropCheckpoint = (store: Store) => checkpoints.delete(store);

/** The fold as it stands, for `keep` once the run has written everything. */
export const snapshot = (f: Fold) => clone(f);

/** A deep copy of the fold's plain objects and arrays; anything else in it would not copy, so it throws. */
function clone<T>(v: T): T {
  if (v == null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (Object.getPrototypeOf(v) !== Object.prototype) throw new Error("checkpoint: the fold holds a non-plain object");
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T;
}

/** What stage 2 reads for one day, as a key: its daily row, sessions with their stages, workouts, stage 1 row and journal. */
function dayKeys(data: Data, inputs: Inputs, journal: Map<string, unknown[]>) {
  return new Map(
    data.days.map((d) => {
      const c = inputs.cached.get(d);
      const sessions = (data.sessionsByDay.get(d) ?? []).map((s) => [s, inputs.segments.get(s.id) ?? null]);
      const parts = [data.metrics.get(d) ?? null, sessions, data.exercisesByDay.get(d) ?? [], c ? [c.s1, c.activities, c.sessionRhr] : null, journal.get(d) ?? []];
      return [d, sha(JSON.stringify(parts))];
    }),
  );
}

/**
 * Where stage 2 can start: the kept day and a copy of the fold before it, or day 0 and a fresh fold. `rerun` are the days
 * stage 1 redid, whose per-minute series may have changed. Clears the checkpoint: `keep` sets the next one.
 */
export function resume(store: Store, data: Data, inputs: Inputs, journal: Map<string, unknown[]>, opts: PipelineOptions, rerun: string[]) {
  const key = sha(JSON.stringify([SCORING_VERSION, opts, data.first]));
  const keys = dayKeys(data, inputs, journal);
  const cp = checkpoints.get(store);
  checkpoints.delete(store);
  const at = cp ? data.days.indexOf(cp.day) : -1;
  // Up to C + 1: day C − 1 reads day C's sessions as tonight's sleep; one spare day beyond.
  const upTo = cp && addDays(cp.day, 2);
  const ok =
    cp &&
    at >= 0 &&
    cp.key === key &&
    data.last >= cp.last &&
    !rerun.some((d) => d <= upTo!) &&
    data.days.every((d) => d > upTo! || keys.get(d) === cp.days.get(d));
  const keepAt = Math.max(0, data.days.length - CHECKPOINT_DAYS);
  const keep = (fold: Fold) => checkpoints.set(store, { key, last: data.last, day: data.days[keepAt], fold, days: keys });
  return { start: ok ? at : 0, fold: ok ? clone(cp.fold) : null, keepAt, keep };
}
