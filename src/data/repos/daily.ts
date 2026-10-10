// Google's daily rows: daily_metrics (the scored daily values), daily_values (shown-only roll-ups, plus 'latest'
// height) and health_records (ECG, irregular rhythm). Replaces the daily parts of pulse pipeline/data.ts,
// queries/common.ts, queries/{health,log}.ts, profile.ts and sources/google/sync.ts. Every write is diff-only.
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { dailyMetrics, dailyValues, healthRecords } from "../schema";
import type { Db } from "../types";
import { atomic, upsertChanged } from "./sql";

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

export function dailyRepo(db: Db): DailyRepo {
  const m = dailyMetrics;
  const v = dailyValues;
  const h = healthRecords;
  return {
    async readMetrics() {
      return db
        .select({
          day: m.day, hrvMs: m.hrvMs, rhrBpm: m.rhrBpm, respBpm: m.respBpm, nightlyTempC: m.nightlyTempC, spo2Pct: m.spo2Pct,
          vo2maxDaily: m.vo2maxDaily, vo2maxRun: m.vo2maxRun, steps: m.steps, calories: m.calories, weightKg: m.weightKg,
          bodyFatPct: m.bodyFatPct, hrZones: m.hrZones, lightModerateMin: m.lightModerateMin, vigorousPeakMin: m.vigorousPeakMin,
          tempBaselineC: m.tempBaselineC, tempSdC: m.tempSdC, rhrRangeLow: m.rhrRangeLow, rhrRangeHigh: m.rhrRangeHigh,
          hrvRangeLow: m.hrvRangeLow, hrvRangeHigh: m.hrvRangeHigh,
        })
        .from(m)
        .orderBy(asc(m.day))
        .all();
    },
    async readMetricsBetween(from, to) {
      return db
        .select({
          day: m.day, hrvMs: m.hrvMs, rhrBpm: m.rhrBpm, respBpm: m.respBpm, nightlyTempC: m.nightlyTempC, spo2Pct: m.spo2Pct,
          vo2maxDaily: m.vo2maxDaily, vo2maxRun: m.vo2maxRun, steps: m.steps, calories: m.calories, weightKg: m.weightKg,
          bodyFatPct: m.bodyFatPct, lightModerateMin: m.lightModerateMin, vigorousPeakMin: m.vigorousPeakMin, tempSdC: m.tempSdC,
        })
        .from(m)
        .where(and(gte(m.day, from), lte(m.day, to)))
        .all();
    },
    // daily_values.day is text ('latest' sorts after every date, so the range already excludes it).
    async readValuesBetween(from, to) {
      return db.select({ day: v.day, key: v.key, value: v.value }).from(v).where(and(gte(v.day, from), lte(v.day, to))).all();
    },

    async upsertDailyMetrics(rows) {
      return atomic(db, () => upsertChanged(db, m, ["day"], rows)).map((r) => r.day as string);
    },
    async upsertDailyValues(rows) {
      return atomic(db, () => upsertChanged(db, v, ["day", "key"], rows)).length;
    },
    async upsertHealthRecords(rows) {
      return atomic(db, () => upsertChanged(db, h, ["id"], rows)).length;
    },

    async googleHeight() {
      const [r] = db.select({ v: v.value }).from(v).where(and(eq(v.day, "latest"), eq(v.key, "height_cm"))).all();
      return r?.v ?? null;
    },
    async valueReadings(key) {
      return db.select({ day: v.day, value: v.value }).from(v).where(eq(v.key, key)).orderBy(desc(v.day)).all();
    },
    async metricReadings(column) {
      const col = m[column];
      const rows = db.select({ day: m.day, value: col }).from(m).where(isNotNull(col)).orderBy(desc(m.day)).all();
      return rows as { day: string; value: number }[];
    },
    async recentWeights(from, to, limit) {
      const rows = db
        .select({ day: m.day, kg: m.weightKg })
        .from(m)
        .where(and(gte(m.day, from), lte(m.day, to), isNotNull(m.weightKg)))
        .orderBy(desc(m.day))
        .limit(limit)
        .all();
      return rows as { day: string; kg: number }[];
    },
    async healthRecordsUpTo(day) {
      return db.select().from(h).where(lte(h.day, day)).orderBy(desc(h.ts)).all();
    },

    async clearSynced() {
      atomic(db, () => {
        db.delete(m).run();
        db.delete(v).run();
        db.delete(h).run();
      });
    },
  };
}
