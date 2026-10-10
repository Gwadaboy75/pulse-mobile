// Per-minute series per day (intraday_series): kinds "hr", "still_hr", "load", "stress", "energy_bank". Replaces the
// series parts of pulse pipeline/data.ts, stage2.ts and queries/common.ts. Every write is diff-only.
import { and, between, eq, gt, inArray, lt, or } from "drizzle-orm";
import { intradaySeries } from "../schema";
import type { Db, ReadDb } from "../types";
import { anyDiffers, atomic, chunks, excluded } from "./sql";

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

export function seriesRepo(db: Db, read: ReadDb = db): SeriesRepo {
  const t = intradaySeries;
  return {
    async upsertSeries(rows) {
      atomic(db, () => {
        for (const part of chunks(rows, 100)) {
          db.insert(t)
            .values(part)
            .onConflictDoUpdate({ target: [t.day, t.kind], set: { data: excluded(t.data) }, setWhere: anyDiffers([t.data]) })
            .run();
        }
      });
    },
    async loadSeries(day, kind) {
      const [r] = await read.select({ data: t.data }).from(t).where(and(eq(t.day, day), eq(t.kind, kind))).all();
      return r?.data ?? null;
    },
    async readSeries(kinds, from, to) {
      if (!kinds.length) return [];
      return read.select().from(t).where(and(inArray(t.kind, kinds), between(t.day, from, to))).all();
    },
    async deleteSeries(kind, days) {
      atomic(db, () => {
        for (const part of chunks(days, 500)) db.delete(t).where(and(eq(t.kind, kind), inArray(t.day, part))).run();
      });
    },
    async deleteOutside(first, last) {
      db.delete(t).where(or(lt(t.day, first), gt(t.day, last))).run();
    },
    async clearSynced() {
      db.delete(t).run();
    },
  };
}
