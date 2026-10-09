// Sleep sessions with their stage segments, and exercises. Replaces the session parts of pulse pipeline/data.ts and
// stage2.ts, queries/{common,sleep,activity,activities}.ts and sources/google/sync.ts. Every write is diff-only.
import type { Db } from "../types";
import { todo } from "./todo";

export type Stage = "awake" | "light" | "deep" | "rem";

/** A whole sleep_sessions row. `day` is the local wake day. */
export type SleepSessionRow = {
  id: string;
  day: string;
  startTs: number;
  endTs: number;
  isMain: boolean;
  processed: boolean;
  stagesStatus: string | null;
  asleepMin: number | null;
  awakeMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  source: string;
};
/** The columns the pipeline loads (pipeline/data.ts:11 `Session`). */
export type Session = Omit<SleepSessionRow, "source">;

export type Segment = { sessionId: string; startTs: number; endTs: number; stage: Stage };

/** A whole exercises row. `day` is the local start day; `type` the Google exercise type. */
export type ExerciseRow = { id: string; day: string; startTs: number; endTs: number; type: string; name: string | null; calories: number | null; distanceM: number | null };
/** The columns the pipeline loads (pipeline/data.ts:28 `Exercise`). */
export type Exercise = Omit<ExerciseRow, "distanceM">;
/** Stored with `source`. */
export type ExerciseWrite = ExerciseRow & { source: string };

export interface SessionsRepo {
  /** Every session ordered by start time, then id in byte order ("C" collation; feeds stage 1's keys and the naps list). pipeline/data.ts:70 */
  readSessions(): Promise<Session[]>;
  /** Every exercise ordered by start time, then id in byte order. pipeline/data.ts:80 */
  readExercises(): Promise<Exercise[]>;
  /** Every segment ordered by start time (the caller groups by session). pipeline/stage2.ts:245 */
  readSegments(): Promise<Segment[]>;
  /** One session's segments by start time. queries/sleep.ts:147 `sessionStages` */
  segmentsOf(sessionId: string): Promise<Segment[]>;
  /** One session by id. queries/sleep.ts:169 `getNap` */
  sessionById(id: string): Promise<SleepSessionRow | null>;
  /** Exercises whose local day is in [from, to], by start time then id. queries/common.ts:300 `exercisesBetween` */
  exercisesBetween(from: string, to: string): Promise<ExerciseRow[]>;
  /** One exercise by id. queries/activity.ts:31 `getActivity` */
  exerciseById(id: string): Promise<ExerciseRow | null>;
  /** True when any exercise is on a day before `day`. queries/activities.ts:20 `getActivities` */
  hasExerciseBefore(day: string): Promise<boolean>;

  /** Upserts sessions keyed on `id`; returns the ids inserted or changed (diff-only). sources/google/sync.ts:400 */
  upsertSleepSessions(rows: SleepSessionRow[]): Promise<string[]>;
  /**
   * Replaces the segments of every listed session whose segments differ from `next` (compared as the ordered
   * (start, end, stage) list) and returns those session ids. Sessions whose segments are equal are not written; the
   * delete and insert of one session happen together. sources/google/sync.ts:331 `segments`
   */
  replaceSegments(sessionIds: string[], next: Segment[]): Promise<string[]>;
  /** Upserts exercises keyed on `id`; returns the ids inserted or changed (diff-only). sources/google/sync.ts:409 */
  upsertExercises(rows: ExerciseWrite[]): Promise<string[]>;
  /**
   * Deletes the sessions (and, by cascade, their segments) whose `end_ts` is in [win.start, win.end) and whose id is
   * not in `returnedIds`; returns the deleted sessions' days. sources/google/sync.ts:350 `prune` (sleep: filtered on end_ts)
   */
  pruneSleepSessions(win: { start: number; end: number }, returnedIds: string[]): Promise<string[]>;
  /** Same for exercises, filtered on `start_ts`; returns the deleted exercises' days. sources/google/sync.ts:350 `prune` (exercise: start_ts) */
  pruneExercises(win: { start: number; end: number }, returnedIds: string[]): Promise<string[]>;

  /** Deletes sleep_sessions, sleep_segments and exercises (a Google account switch). avatar.ts:45 */
  clearSynced(): Promise<void>;
}

export function sessionsRepo(_db: Db): SessionsRepo {
  return {
    readSessions: async () => todo("sessionsRepo.readSessions"),
    readExercises: async () => todo("sessionsRepo.readExercises"),
    readSegments: async () => todo("sessionsRepo.readSegments"),
    segmentsOf: async () => todo("sessionsRepo.segmentsOf"),
    sessionById: async () => todo("sessionsRepo.sessionById"),
    exercisesBetween: async () => todo("sessionsRepo.exercisesBetween"),
    exerciseById: async () => todo("sessionsRepo.exerciseById"),
    hasExerciseBefore: async () => todo("sessionsRepo.hasExerciseBefore"),
    upsertSleepSessions: async () => todo("sessionsRepo.upsertSleepSessions"),
    replaceSegments: async () => todo("sessionsRepo.replaceSegments"),
    upsertExercises: async () => todo("sessionsRepo.upsertExercises"),
    pruneSleepSessions: async () => todo("sessionsRepo.pruneSleepSessions"),
    pruneExercises: async () => todo("sessionsRepo.pruneExercises"),
    clearSynced: async () => todo("sessionsRepo.clearSynced"),
  };
}
