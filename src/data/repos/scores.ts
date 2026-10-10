// What the pipeline computes and caches: daily_scores (stage 1 and stage 2 columns), reports, the one fold checkpoint
// and the dirty-day marks. Replaces the score parts of pulse pipeline/{index,stage1,stage2}.ts, queries/common.ts,
// queries/{home,reports,journal,health,settings}.ts and push.ts. Every write is diff-only.
import type { Db } from "../types";
import { todo } from "./todo";

// The JSON columns' shapes are pulse's stored types (src/server/pipeline/types.ts). They are `unknown` here because
// src/pipeline/types.ts (stream B) and src/core do not exist yet; when they land, replace each alias with the import
// (`Stage1Day`, `Stage1Activity`, `RecoveryRow`, `SleepRow`, `TrainingLoadRow`, `StrainTargetRow`, `SleepPlannerRow`,
// `EnergyBankRow`, `StressRow`, `HealthMonitorRow`, `HealthspanRow`, `FitnessRow`, `JournalImpactRow`, `Report`).
export type Stage1DayJson = unknown;
export type Stage1ActivityJson = unknown;
export type RecoveryJson = unknown;
export type SleepJson = unknown;
export type TrainingLoadJson = unknown;
export type StrainTargetJson = unknown;
export type SleepPlannerJson = unknown;
export type EnergyBankJson = unknown;
export type StressJson = unknown;
export type HealthMonitorJson = unknown;
export type HealthspanJson = unknown;
export type FitnessJson = unknown;
export type JournalImpactJson = unknown;
export type ReportJson = unknown;

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

export function scoresRepo(_db: Db): ScoresRepo {
  return {
    readDays: async () => todo("scoresRepo.readDays"),
    firstDay: async () => todo("scoresRepo.firstDay"),
    lastStoredDay: async () => todo("scoresRepo.lastStoredDay"),
    latestJournalImpact: async () => todo("scoresRepo.latestJournalImpact"),
    wearDays: async () => todo("scoresRepo.wearDays"),
    countDays: async () => todo("scoresRepo.countDays"),
    recoveryValue: async () => todo("scoresRepo.recoveryValue"),
    stage1Stored: async () => todo("scoresRepo.stage1Stored"),
    writeStage1: async () => todo("scoresRepo.writeStage1"),
    readStage2Inputs: async () => todo("scoresRepo.readStage2Inputs"),
    writeStage2: async () => todo("scoresRepo.writeStage2"),
    deleteOutside: async () => todo("scoresRepo.deleteOutside"),
    needsRecompute: async () => todo("scoresRepo.needsRecompute"),
    readCheckpoint: async () => todo("scoresRepo.readCheckpoint"),
    writeCheckpoint: async () => todo("scoresRepo.writeCheckpoint"),
    deleteCheckpoint: async () => todo("scoresRepo.deleteCheckpoint"),
    dirtyDays: async () => todo("scoresRepo.dirtyDays"),
    markDirty: async () => todo("scoresRepo.markDirty"),
    markAllDaysDirty: async () => todo("scoresRepo.markAllDaysDirty"),
    clearDirty: async () => todo("scoresRepo.clearDirty"),
    writeReports: async () => todo("scoresRepo.writeReports"),
    deleteReportsExcept: async () => todo("scoresRepo.deleteReportsExcept"),
    readReport: async () => todo("scoresRepo.readReport"),
    reportNeighbour: async () => todo("scoresRepo.reportNeighbour"),
    latestReports: async () => todo("scoresRepo.latestReports"),
    listReports: async () => todo("scoresRepo.listReports"),
    countReportsWithData: async () => todo("scoresRepo.countReportsWithData"),
    clearSynced: async () => todo("scoresRepo.clearSynced"),
  };
}
