// Sleep sessions with their stage segments, and exercises. Replaces the session parts of pulse pipeline/data.ts and
// stage2.ts, queries/{common,sleep,activity,activities}.ts and sources/google/sync.ts. Every write is diff-only.
import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { exercises, sleepSegments, sleepSessions } from "../schema";
import type { Db } from "../types";
import { atomic, chunks, upsertChanged } from "./sql";

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

export function sessionsRepo(db: Db): SessionsRepo {
  const s = sleepSessions;
  const e = exercises;
  const sg = sleepSegments;
  const sessionCols = { id: s.id, day: s.day, startTs: s.startTs, endTs: s.endTs, isMain: s.isMain, processed: s.processed, stagesStatus: s.stagesStatus, asleepMin: s.asleepMin, awakeMin: s.awakeMin, deepMin: s.deepMin, lightMin: s.lightMin, remMin: s.remMin };
  const exerciseCols = { id: e.id, day: e.day, startTs: e.startTs, endTs: e.endTs, type: e.type, name: e.name, calories: e.calories, distanceM: e.distanceM };
  const segmentCols = { sessionId: sg.sessionId, startTs: sg.startTs, endTs: sg.endTs, stage: sg.stage };

  /** Deletes the rows of `table` with `col` in the window whose id the caller did not get back. Returns their days. */
  function prune(table: typeof s | typeof e, col: SQLiteColumn, win: { start: number; end: number }, returnedIds: string[]): string[] {
    const keep = new Set(returnedIds);
    const held = db.select({ id: table.id, day: table.day }).from(table).where(and(gte(col, win.start), lt(col, win.end))).all();
    const gone = held.filter((r) => !keep.has(r.id));
    if (!gone.length) return [];
    atomic(db, () => {
      for (const part of chunks(gone.map((r) => r.id), 500)) {
        db.delete(table).where(inArray(table.id, part)).run();
        // The cascade does this when foreign keys are on; stating it keeps the repository correct without the pragma.
        if (table === s) db.delete(sg).where(inArray(sg.sessionId, part)).run();
      }
    });
    return gone.map((r) => r.day);
  }

  return {
    // Text tie-breaks sort bytewise: SQLite's default collation is BINARY, pulse's "C".
    async readSessions() {
      return db.select(sessionCols).from(s).orderBy(asc(s.startTs), asc(s.id)).all();
    },
    async readExercises() {
      return db
        .select({ id: e.id, day: e.day, startTs: e.startTs, endTs: e.endTs, type: e.type, name: e.name, calories: e.calories })
        .from(e)
        .orderBy(asc(e.startTs), asc(e.id))
        .all();
    },
    async readSegments() {
      return db.select(segmentCols).from(sg).orderBy(asc(sg.startTs)).all();
    },
    async segmentsOf(sessionId) {
      return db.select(segmentCols).from(sg).where(eq(sg.sessionId, sessionId)).orderBy(asc(sg.startTs)).all();
    },
    async sessionById(id) {
      const [r] = db.select({ ...sessionCols, source: s.source }).from(s).where(eq(s.id, id)).all();
      return r ?? null;
    },
    async exercisesBetween(from, to) {
      return db.select(exerciseCols).from(e).where(and(gte(e.day, from), lte(e.day, to))).orderBy(asc(e.startTs), asc(e.id)).all();
    },
    async exerciseById(id) {
      const [r] = db.select(exerciseCols).from(e).where(eq(e.id, id)).all();
      return r ?? null;
    },
    async hasExerciseBefore(day) {
      return db.select({ id: e.id }).from(e).where(lt(e.day, day)).limit(1).all().length > 0;
    },

    async upsertSleepSessions(rows) {
      return atomic(db, () => upsertChanged(db, s, ["id"], rows)).map((r) => r.id as string);
    },

    async replaceSegments(sessionIds, next) {
      if (!sessionIds.length) return [];
      return atomic(db, () => {
        const held: Segment[] = [];
        for (const part of chunks(sessionIds, 500)) held.push(...db.select(segmentCols).from(sg).where(inArray(sg.sessionId, part)).orderBy(asc(sg.sessionId), asc(sg.startTs)).all());
        const key = (xs: Segment[], id: string) =>
          JSON.stringify(xs.filter((x) => x.sessionId === id).map((x) => [x.startTs, x.endTs, x.stage]).sort((a, b) => (a[0] as number) - (b[0] as number)));
        const changed = new Set<string>();
        for (const id of sessionIds) if (key(held, id) !== key(next, id)) changed.add(id);
        if (!changed.size) return [];
        for (const part of chunks([...changed], 500)) db.delete(sg).where(inArray(sg.sessionId, part)).run();
        for (const part of chunks(next.filter((x) => changed.has(x.sessionId)), 1000)) db.insert(sg).values(part).run();
        return [...changed];
      });
    },

    async upsertExercises(rows) {
      return atomic(db, () => upsertChanged(db, e, ["id"], rows)).map((r) => r.id as string);
    },
    async pruneSleepSessions(win, returnedIds) {
      return prune(s, s.endTs, win, returnedIds);
    },
    async pruneExercises(win, returnedIds) {
      return prune(e, e.startTs, win, returnedIds);
    },

    async clearSynced() {
      atomic(db, () => {
        db.delete(sg).run();
        db.delete(s).run();
        db.delete(e).run();
      });
    },
  };
}
