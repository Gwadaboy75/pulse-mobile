// Google's daily rows: daily_metrics (the scored daily values), daily_values (shown-only roll-ups, plus 'latest'
// height) and health_records (ECG, irregular rhythm). Replaces the daily parts of pulse pipeline/data.ts,
// queries/common.ts, queries/{health,log}.ts, profile.ts and sources/google/sync.ts. Every write is diff-only.
import type { Db } from "../types";
import { todo } from "./todo";

/** A whole daily_metrics row. */
export type DailyMetricsRow = {
  day: string;
  hrvMs: number | null;
  hrvDeepMs: number | null;
  rhrBpm: number | null;
  rhrMethod: string | null;
  respBpm: number | null;
  nightlyTempC: number | null;
  spo2Pct: number | null;
  vo2maxDaily: number | null;
  vo2maxRun: number | null;
  steps: number | null;
  calories: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  /** Google's zone bounds for the day: `[light, moderate, vigorous, peak]` minimum bpm, then the peak maximum. */
  hrZones: number[] | null;
  lightModerateMin: number | null;
  vigorousPeakMin: number | null;
  tempBaselineC: number | null;
  tempSdC: number | null;
  rhrRangeLow: number | null;
  rhrRangeHigh: number | null;
  hrvRangeLow: number | null;
  hrvRangeHigh: number | null;
  source: string;
};

/** The columns the pipeline loads (pipeline/data.ts:36 `Metrics`). */
export type Metrics = Omit<DailyMetricsRow, "hrvDeepMs" | "rhrMethod" | "source">;

/** The columns the screen queries load (queries/common.ts:66 `MetricsRow`). */
export type MetricsRow = Pick<
  DailyMetricsRow,
  "day" | "hrvMs" | "rhrBpm" | "respBpm" | "nightlyTempC" | "spo2Pct" | "vo2maxDaily" | "vo2maxRun" | "steps" | "calories" | "weightKg" | "bodyFatPct" | "lightModerateMin" | "vigorousPeakMin" | "tempSdC"
>;

/**
 * What a sync job writes: the key (`day`), `source`, and the columns that job maps (the mappers fill different
 * columns per Google type). Within one call every row has the same keys; a column the rows do not carry is left as it is.
 */
export type DailyMetricsPatch = { day: string; source: string } & Partial<Omit<DailyMetricsRow, "day" | "source">>;

/** One roll-up: `day` is a local date, or 'latest' for height_cm. */
export type DailyValue = { day: string; key: string; value: number };

/** `data`: ECG classification and average bpm, or IRN alert window count. Never the waveform. */
export type HealthRecord = { id: string; kind: "ecg" | "irn"; ts: number; day: string; data: unknown };

export interface DailyRepo {
  /** Every daily row, oldest first, with the pipeline's columns. pipeline/data.ts:63 */
  readMetrics(): Promise<Metrics[]>;
  /** The screen queries' columns for days in [from, to]. queries/common.ts:132 (the `loadDays` metrics query) */
  readMetricsBetween(from: string, to: string): Promise<MetricsRow[]>;
  /** Shown-only roll-ups for days in [from, to] (dated rows only; 'latest' is excluded). queries/common.ts:152 */
  readValuesBetween(from: string, to: string): Promise<DailyValue[]>;

  /**
   * Upserts daily rows keyed on `day` and returns the days actually inserted or changed. Diff-only: a row whose
   * given columns all equal the stored ones is not written and its day is not returned. Rows with the same day in one
   * call: the last wins. sources/google/sync.ts:325 `dailyRows`, :291 `upsert`
   */
  upsertDailyMetrics(rows: DailyMetricsPatch[]): Promise<string[]>;
  /** Upserts roll-ups keyed on (day, key); returns the number inserted or changed (diff-only). sync.ts:377, 385 */
  upsertDailyValues(rows: DailyValue[]): Promise<number>;
  /** Upserts heart-rhythm records keyed on `id`; returns the number inserted or changed (diff-only). sync.ts:380 */
  upsertHealthRecords(rows: HealthRecord[]): Promise<number>;

  /** Google's latest height (daily_values 'latest' / height_cm), or null. profile.ts:53 `googleHeight` */
  googleHeight(): Promise<number | null>;
  /** Every reading of a daily_values key, newest day first. queries/health.ts:425 `readings` (string column) */
  valueReadings(key: string): Promise<{ day: string; value: number }[]>;
  /** Every non-null reading of a daily_metrics column, newest day first. queries/health.ts:432 `readings` (metrics column) */
  metricReadings(column: "weightKg" | "bodyFatPct"): Promise<{ day: string; value: number }[]>;
  /** The newest `limit` non-null weights in [from, to], newest first. queries/log.ts:56 `getLog` */
  recentWeights(from: string, to: string, limit: number): Promise<{ day: string; kg: number }[]>;
  /** Heart-rhythm records on or before `day`, newest first. queries/health.ts:397 `heartRhythm` */
  healthRecordsUpTo(day: string): Promise<HealthRecord[]>;

  /** Deletes daily_metrics, daily_values and health_records (a Google account switch). avatar.ts:45 */
  clearSynced(): Promise<void>;
}

export function dailyRepo(_db: Db): DailyRepo {
  return {
    readMetrics: async () => todo("dailyRepo.readMetrics"),
    readMetricsBetween: async () => todo("dailyRepo.readMetricsBetween"),
    readValuesBetween: async () => todo("dailyRepo.readValuesBetween"),
    upsertDailyMetrics: async () => todo("dailyRepo.upsertDailyMetrics"),
    upsertDailyValues: async () => todo("dailyRepo.upsertDailyValues"),
    upsertHealthRecords: async () => todo("dailyRepo.upsertHealthRecords"),
    googleHeight: async () => todo("dailyRepo.googleHeight"),
    valueReadings: async () => todo("dailyRepo.valueReadings"),
    metricReadings: async () => todo("dailyRepo.metricReadings"),
    recentWeights: async () => todo("dailyRepo.recentWeights"),
    healthRecordsUpTo: async () => todo("dailyRepo.healthRecordsUpTo"),
    clearSynced: async () => todo("dailyRepo.clearSynced"),
  };
}
