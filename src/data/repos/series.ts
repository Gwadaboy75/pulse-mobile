// Per-minute series per day (intraday_series): kinds "hr", "still_hr", "load", "stress", "energy_bank". Replaces the
// series parts of pulse pipeline/data.ts, stage2.ts and queries/common.ts. Every write is diff-only.
import type { Db } from "../types";
import { todo } from "./todo";

/** `data` is one value per minute of the local day, null for a gap. */
export type SeriesRow = { day: string; kind: string; data: (number | null)[] };

export interface SeriesRepo {
  /** Upserts series, writing only rows whose data differs (stored text compared; no `is distinct from` in SQLite). pipeline/data.ts:131 `upsertSeries` */
  upsertSeries(rows: SeriesRow[]): Promise<void>;
  /** One day's series of one kind, or null. queries/common.ts:187 `loadSeries` */
  loadSeries(day: string, kind: string): Promise<(number | null)[] | null>;
  /** Series of the given kinds for days in [from, to], any order. pipeline/stage2.ts:124 (the per-batch still_hr and load read) */
  readSeries(kinds: string[], from: string, to: string): Promise<SeriesRow[]>;
  /** Deletes the series of `kind` for the given days. pipeline/stage2.ts:109 (energy_bank on days without one) */
  deleteSeries(kind: string, days: string[]): Promise<void>;
  /** Deletes every series for days before `first` or after `last`. pipeline/stage2.ts:219 */
  deleteOutside(first: string, last: string): Promise<void>;
  /** Deletes all series (a Google account switch). avatar.ts:45 */
  clearSynced(): Promise<void>;
}

export function seriesRepo(_db: Db): SeriesRepo {
  return {
    upsertSeries: async () => todo("seriesRepo.upsertSeries"),
    loadSeries: async () => todo("seriesRepo.loadSeries"),
    readSeries: async () => todo("seriesRepo.readSeries"),
    deleteSeries: async () => todo("seriesRepo.deleteSeries"),
    deleteOutside: async () => todo("seriesRepo.deleteOutside"),
    clearSynced: async () => todo("seriesRepo.clearSynced"),
  };
}
