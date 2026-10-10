// What the pipeline computes and caches: daily_scores (stage 1 and stage 2 columns), reports, the one fold checkpoint
// and the dirty-day marks. Replaces the score parts of pulse pipeline/{index,stage1,stage2}.ts, queries/common.ts,
// queries/{home,reports,journal,health,settings}.ts and push.ts. Every write is diff-only.
import { and, asc, count, desc, eq, gt, gte, isNotNull, like, lt, lte, max, min, ne, notInArray, or, sql } from "drizzle-orm";
import { dailyMetrics, dailyScores, foldCheckpoints, intradayDirty, reports } from "../schema";
import type { Db, ReadDb } from "../types";
import { anyDiffers, atomic, chunks, excluded } from "./sql";

// The JSON columns' shapes are pulse's stored types (src/pipeline/types.ts, ported from pulse src/server/pipeline/types.ts).
import type { Report } from "../../core/algorithms/reports";
import type {
  EnergyBankRow,
  FitnessRow,
  HealthMonitorRow,
  HealthspanRow,
  JournalImpactRow,
  RecoveryRow,
  SleepPlannerRow,
  SleepRow,
  Stage1Activity,
  Stage1Day,
  StrainTargetRow,
  StressRow,
  TrainingLoadRow,
} from "../../pipeline/types";

export type Stage1DayJson = Stage1Day;
export type Stage1ActivityJson = Stage1Activity;
export type RecoveryJson = RecoveryRow;
export type SleepJson = SleepRow;
export type TrainingLoadJson = TrainingLoadRow;
export type StrainTargetJson = StrainTargetRow;
export type SleepPlannerJson = SleepPlannerRow;
export type EnergyBankJson = EnergyBankRow;
export type StressJson = StressRow;
export type HealthMonitorJson = HealthMonitorRow;
export type HealthspanJson = HealthspanRow;
export type FitnessJson = FitnessRow;
export type JournalImpactJson = JournalImpactRow;
export type ReportJson = Report;

/** A day's daily_scores row as the queries read it; a column is null until its stage has written it. queries/common.ts:107 `loadDays` */
export type ScoreRow = {
  day: string;
  strain: Stage1DayJson | null;
  activities: Stage1ActivityJson[] | null;
  sessionRhr: number | null;
  recovery: RecoveryJson | null;
  sleep: SleepJson | null;
  trainingLoad: TrainingLoadJson | null;
  strainTarget: StrainTargetJson | null;
  sleepPlanner: SleepPlannerJson | null;
  energyBank: EnergyBankJson | null;
  stress: StressJson | null;
  healthMonitor: HealthMonitorJson | null;
  healthspan: HealthspanJson | null;
  fitness: FitnessJson | null;
};

/** What stage 1 left in a row: its key (`strain.key`) and the version stamp. pipeline/stage1.ts:42 */
export type Stage1Stored = { day: string; scoringVersion: number; key: string | null };

/** Stage 1's write for one day. The version is not stamped (a new row gets 0): stage 2 stamps it. pipeline/stage1.ts:82 */
export type Stage1Write = { day: string; strain: Stage1DayJson; activities: Stage1ActivityJson[]; sessionRhrBpm: number | null };

/** What stage 2 reads back about every scored day. pipeline/stage2.ts:242 `readInputs` */
export type Stage2Input = {
  day: string;
  strain: Stage1DayJson | null;
  activities: Stage1ActivityJson[] | null;
  sessionRhr: number | null;
  recovery: RecoveryJson | null;
  impact: JournalImpactJson | null;
};

/** Stage 2's write for one day: the version stamp and its ten columns plus journal impact. pipeline/stage2.ts:190 */
export type Stage2Write = {
  day: string;
  scoringVersion: number;
  recovery: RecoveryJson;
  sleep: SleepJson;
  trainingLoad: TrainingLoadJson;
  strainTarget: StrainTargetJson;
  sleepPlanner: SleepPlannerJson;
  energyBank: EnergyBankJson;
  stress: StressJson;
  healthMonitor: HealthMonitorJson;
  healthspan: HealthspanJson;
  fitness: FitnessJson;
  journalImpact: JournalImpactJson;
};

/** The fold state after `day`. `fold` stays JSON text exactly as written (journal impact's memo key depends on key order). pipeline/stage2.ts:55 */
export type FoldCheckpoint = { day: string; scoringVersion: number; inputsKey: string; fold: string };

/** Used by the Health wear streak: heart-rate presence and minutes per day, newest first. queries/settings.ts:206 `getWearStreak` */
export type WearDay = { day: string; hrCount: number; hrMinutes: number };

export type ReportKind = "week" | "month";

export interface ScoresRepo {
  // ── Reads for the queries ────────────────────────────────────────────────
  /** The daily_scores rows for days in [from, to]; days without a row are absent. queries/common.ts:112 (the `loadDays` score query) */
  readDays(from: string, to: string): Promise<ScoreRow[]>;
  /** The first scored day. queries/common.ts:196 `firstDay` */
  firstDay(): Promise<string | null>;
  /** The newest scored day on or before `day`, or null. queries/health.ts:56 `lastStored` */
  lastStoredDay(onOrBefore: string): Promise<string | null>;
  /** The newest journal impact on or before `day`. queries/journal.ts:37 `latestImpact` */
  latestJournalImpact(onOrBefore: string): Promise<{ day: string; impact: JournalImpactJson } | null>;
  /** Heart-rate presence per scored day up to `day`, newest first. queries/settings.ts:206 `getWearStreak` */
  wearDays(onOrBefore: string): Promise<WearDay[]>;
  /** Scored days up to `day`. queries/settings.ts:181 `getYourData` */
  countDays(onOrBefore: string): Promise<number>;
  /** The day's Recovery score, or null with none yet. push.ts:77 `notifyRecovery`, push.ts:118 `notifyBrief` */
  recoveryValue(day: string): Promise<number | null>;

  // ── Stage 1 ──────────────────────────────────────────────────────────────
  /** Every stored day's stage-1 key and version. pipeline/stage1.ts:42 */
  stage1Stored(): Promise<Stage1Stored[]>;
  /**
   * Upserts stage 1's columns (strain, activities, session_rhr_bpm) and leaves stage 2's alone; a new row gets
   * scoring_version 0. Diff-only. pipeline/stage1.ts:87
   */
  writeStage1(rows: Stage1Write[]): Promise<void>;

  // ── Stage 2 ──────────────────────────────────────────────────────────────
  /** Stage 1's cached rows, Recovery and stored journal impact for every day. pipeline/stage2.ts:242 */
  readStage2Inputs(): Promise<Stage2Input[]>;
  /**
   * Upserts stage 2's columns and the scoring version. Diff-only: a row whose version and every column already equal
   * the given values is not written (pulse's `is distinct from` over the column tuple), so an unchanged run writes
   * nothing. pipeline/stage2.ts:205
   */
  writeStage2(rows: Stage2Write[]): Promise<void>;
  /** Deletes score rows for days before `first` or after `last`. pipeline/stage2.ts:218 */
  deleteOutside(first: string, last: string): Promise<void>;
  /** Anything to recompute: a dirty day, a row from another scoring version, or the newest daily_metrics day not yet scored. pipeline/index.ts:34 `needsRecompute` */
  needsRecompute(scoringVersion: number): Promise<boolean>;

  // ── Fold checkpoint (one row) ────────────────────────────────────────────
  /** pipeline/stage2.ts:57 `readCheckpoint` (the caller validates version, inputs key and range) */
  readCheckpoint(): Promise<FoldCheckpoint | null>;
  /** Replaces the checkpoint; unchanged when equal. pipeline/stage2.ts:222 */
  writeCheckpoint(c: FoldCheckpoint): Promise<void>;
  /** pipeline/stage2.ts:224 */
  deleteCheckpoint(): Promise<void>;

  // ── Dirty days ───────────────────────────────────────────────────────────
  /** Days to recompute. pipeline/stage1.ts:43 */
  dirtyDays(): Promise<string[]>;
  /** Marks days dirty; a day already marked stays (insert-or-ignore). sources/google/sync.ts:416, 426; actions/journal.ts:57 */
  markDirty(days: string[]): Promise<void>;
  /** Marks every day that has a daily_metrics row dirty (a profile change rescores everything). profile.ts:73 `saveProfile` */
  markAllDaysDirty(): Promise<void>;
  /** Clears every dirty mark. pipeline/stage2.ts:227 */
  clearDirty(): Promise<void>;

  // ── Reports ──────────────────────────────────────────────────────────────
  /** Upserts reports by period, writing only those whose data differs. pipeline/stage2.ts:213 */
  writeReports(rows: { period: string; data: ReportJson }[]): Promise<void>;
  /** Deletes every report whose period is not in `keep`. pipeline/stage2.ts:217 */
  deleteReportsExcept(keep: string[]): Promise<void>;
  /** queries/reports.ts:9 `readReport` */
  readReport(period: string): Promise<ReportJson | null>;
  /** The nearest same-kind period before (-1) or after (+1) `period`. queries/reports.ts:15 `neighbour` */
  reportNeighbour(kind: ReportKind, period: string, dir: -1 | 1): Promise<string | null>;
  /** The newest `limit` periods of a kind with their data, newest first. queries/home.ts:340 `latestReport` */
  latestReports(kind: ReportKind, limit: number): Promise<{ period: string; data: ReportJson }[]>;
  /** Every report, newest period first. queries/reports.ts:162 `getReportArchive` */
  listReports(): Promise<{ period: string; data: ReportJson }[]>;
  /** Reports whose `days` is above 0. queries/settings.ts:160 `getMore` */
  countReportsWithData(): Promise<number>;

  /** Deletes daily_scores, reports, the checkpoint and dirty marks (a Google account switch). avatar.ts:45 */
  clearSynced(): Promise<void>;
}

/** ISO weeks are `2026-W40`, months `2026-10`: the LIKE patterns that match them. */
const PERIOD = { week: "____-W__", month: "____-__" } as const;

export function scoresRepo(db: Db, read: ReadDb = db): ScoresRepo {
  const s = dailyScores;
  const ck = foldCheckpoints;
  const r = reports;
  const d = intradayDirty;
  /** What `writeStage2` owns: the version, stage 2's ten columns and the journal impact (pulse's STAGE2_COLUMNS). */
  const stage2 = (["scoringVersion", "recovery", "sleep", "trainingLoad", "strainTarget", "sleepPlanner", "energyBank", "stress", "healthMonitor", "healthspan", "fitness", "journalImpact"] as const).map((k) => [k, s[k]] as const);

  return {
    async readDays(from, to) {
      return (await read
        .select({
          day: s.day, strain: s.strain, activities: s.activities, sessionRhr: s.sessionRhrBpm, recovery: s.recovery, sleep: s.sleep,
          trainingLoad: s.trainingLoad, strainTarget: s.strainTarget, sleepPlanner: s.sleepPlanner, energyBank: s.energyBank,
          stress: s.stress, healthMonitor: s.healthMonitor, healthspan: s.healthspan, fitness: s.fitness,
        })
        .from(s)
        .where(and(gte(s.day, from), lte(s.day, to)))
        .all()) as ScoreRow[];
    },
    async firstDay() {
      return (await read.select({ d: min(s.day) }).from(s).all())[0]?.d ?? null;
    },
    async lastStoredDay(onOrBefore) {
      return (await read.select({ d: max(s.day) }).from(s).where(lte(s.day, onOrBefore)).all())[0]?.d ?? null;
    },
    async latestJournalImpact(onOrBefore) {
      const [row] = await read.select({ day: s.day, impact: s.journalImpact }).from(s).where(and(lte(s.day, onOrBefore), isNotNull(s.journalImpact))).orderBy(desc(s.day)).limit(1).all();
      // JSON columns read back as stored; pulse casts the same way (queries/journal.ts).
      return row ? { day: row.day, impact: row.impact as JournalImpactJson } : null;
    },
    async wearDays(onOrBefore) {
      return read
        .select({
          day: s.day,
          hrCount: sql<number>`coalesce(json_extract(${s.strain}, '$.hrCount'), 0)`.mapWith(Number),
          hrMinutes: sql<number>`coalesce(json_extract(${s.strain}, '$.hrMinutesAm'), 0) + coalesce(json_extract(${s.strain}, '$.hrMinutesPm'), 0)`.mapWith(Number),
        })
        .from(s)
        .where(lte(s.day, onOrBefore))
        .orderBy(desc(s.day))
        .all();
    },
    async countDays(onOrBefore) {
      return (await read.select({ n: count() }).from(s).where(lte(s.day, onOrBefore)).all())[0].n;
    },
    async recoveryValue(day) {
      const [row] = await read.select({ value: sql<number | null>`json_extract(${s.recovery}, '$.value')` }).from(s).where(eq(s.day, day)).all();
      return row?.value ?? null;
    },

    async stage1Stored() {
      return read.select({ day: s.day, scoringVersion: s.scoringVersion, key: sql<string | null>`json_extract(${s.strain}, '$.key')` }).from(s).all();
    },
    async writeStage1(rows) {
      atomic(db, () => {
        // Stage 1 never stamps scoring_version (a new row gets 0): stage 2 does when it commits.
        for (const part of chunks(rows, 100)) {
          db.insert(s)
            .values(part.map((x) => ({ day: x.day, scoringVersion: 0, strain: x.strain, activities: x.activities, sessionRhrBpm: x.sessionRhrBpm })))
            .onConflictDoUpdate({
              target: s.day,
              set: { strain: excluded(s.strain), activities: excluded(s.activities), sessionRhrBpm: excluded(s.sessionRhrBpm) },
              setWhere: anyDiffers([s.strain, s.activities, s.sessionRhrBpm]),
            })
            .run();
        }
      });
    },

    async readStage2Inputs() {
      return (await read
        .select({ day: s.day, strain: s.strain, activities: s.activities, sessionRhr: s.sessionRhrBpm, recovery: s.recovery, impact: s.journalImpact })
        .from(s)
        .orderBy(asc(s.day))
        .all()) as Stage2Input[];
    },
    async writeStage2(rows) {
      atomic(db, () => {
        for (const part of chunks(rows, 50)) {
          db.insert(s)
            .values(part)
            .onConflictDoUpdate({ target: s.day, set: Object.fromEntries(stage2.map(([k, c]) => [k, excluded(c)])) as never, setWhere: anyDiffers(stage2.map(([, c]) => c)) })
            .run();
        }
      });
    },
    async deleteOutside(first, last) {
      db.delete(s).where(or(lt(s.day, first), gt(s.day, last))).run();
    },
    async needsRecompute(scoringVersion) {
      if ((await read.select({ d: d.day }).from(d).limit(1).all()).length) return true;
      if ((await read.select({ d: s.day }).from(s).where(ne(s.scoringVersion, scoringVersion)).limit(1).all()).length) return true;
      const newest = (await read.select({ d: max(dailyMetrics.day) }).from(dailyMetrics).all())[0]?.d;
      return !!newest && (await read.select({ d: s.day }).from(s).where(eq(s.day, newest)).all()).length === 0;
    },

    async readCheckpoint() {
      return (await read.select({ day: ck.day, scoringVersion: ck.scoringVersion, inputsKey: ck.inputsKey, fold: ck.fold }).from(ck).where(eq(ck.id, 1)).all())[0] ?? null;
    },
    async writeCheckpoint(c) {
      const cols = [ck.day, ck.scoringVersion, ck.inputsKey, ck.fold];
      db.insert(ck)
        .values({ id: 1, ...c })
        .onConflictDoUpdate({ target: ck.id, set: { day: excluded(ck.day), scoringVersion: excluded(ck.scoringVersion), inputsKey: excluded(ck.inputsKey), fold: excluded(ck.fold) }, setWhere: anyDiffers(cols) })
        .run();
    },
    async deleteCheckpoint() {
      db.delete(ck).run();
    },

    async dirtyDays() {
      return (await read.select({ day: d.day }).from(d).orderBy(asc(d.day)).all()).map((x) => x.day);
    },
    async markDirty(days) {
      atomic(db, () => {
        for (const part of chunks(days, 500)) db.insert(d).values(part.map((day) => ({ day }))).onConflictDoNothing().run();
      });
    },
    async markAllDaysDirty() {
      // `where true` keeps SQLite from reading `on conflict` as part of the select (its parsing ambiguity).
      db.run(sql`insert into intraday_dirty (day) select distinct day from daily_metrics where true on conflict do nothing`);
    },
    async clearDirty() {
      db.delete(d).run();
    },

    async writeReports(rows) {
      atomic(db, () => {
        for (const part of chunks(rows, 100)) {
          db.insert(r).values(part).onConflictDoUpdate({ target: r.period, set: { data: excluded(r.data) }, setWhere: anyDiffers([r.data]) }).run();
        }
      });
    },
    async deleteReportsExcept(keep) {
      db.delete(r).where(keep.length ? notInArray(r.period, keep) : undefined).run();
    },
    async readReport(period) {
      return ((await read.select({ data: r.data }).from(r).where(eq(r.period, period)).all())[0]?.data ?? null) as ReportJson | null;
    },
    async reportNeighbour(kind, period, dir) {
      const [row] = await read
        .select({ period: r.period })
        .from(r)
        .where(and(like(r.period, PERIOD[kind]), dir < 0 ? lt(r.period, period) : gt(r.period, period)))
        .orderBy(dir < 0 ? desc(r.period) : asc(r.period))
        .limit(1)
        .all();
      return row?.period ?? null;
    },
    async latestReports(kind, limit) {
      return (await read.select({ period: r.period, data: r.data }).from(r).where(like(r.period, PERIOD[kind])).orderBy(desc(r.period)).limit(limit).all()) as { period: string; data: ReportJson }[];
    },
    async listReports() {
      return (await read.select({ period: r.period, data: r.data }).from(r).orderBy(desc(r.period)).all()) as { period: string; data: ReportJson }[];
    },
    async countReportsWithData() {
      return (await read.select({ n: count() }).from(r).where(sql`json_extract(${r.data}, '$.days') > 0`).all())[0].n;
    },

    async clearSynced() {
      atomic(db, () => {
        db.delete(s).run();
        db.delete(r).run();
        db.delete(ck).run();
        db.delete(d).run();
      });
    },
  };
}
