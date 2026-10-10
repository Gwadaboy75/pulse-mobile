// Band heart rate and per-minute steps (hr_days, steps_days).
// Replaces pulse src/server/samples.ts and the sample parts of sync.ts. Pulse's raw page archive (raw_payloads) is
// dropped on the phone: nothing read it.
// Rows are decoded: `offsets` and `values` are plain number arrays (delta-varint / uint8 BLOBs are this repository's
// concern: src/data/encoding.ts). Every write method writes nothing when the stored row is unchanged.
import { and, asc, between, desc, eq, lt } from "drizzle-orm";
import { decodeDay, decodeOffsets, encodeDay, u8, varint, type Codec } from "../encoding";
import { hrDays, stepsDays } from "../schema";
import type { Db } from "../types";
import { atomic } from "./sql";

export type SampleTable = "hr" | "steps";
export const DAY = 86_400;
/** The UTC day a unix-second timestamp belongs to (samples.ts:10). */
export const bucketOf = (ts: number) => Math.floor(ts / DAY);

/** One UTC day of samples: second-of-day offsets and values, sorted by offset (samples.ts:12). */
export type SampleDay = { bucket: number; offsets: number[]; values: number[] };
export type Sample = { ts: number; v: number };
export type HrSample = { ts: number; bpm: number };

/** Buckets compacted per `compactHr` call (samples.ts:113). */
export const COMPACT_BATCH = 30;

/** An archived raw page (client.ts:79). The caller hashes and gzips; the repository only stores. */

export interface SamplesRepo {
  /** Samples with lo <= ts < hi, in time order. samples.ts:25 */
  readSamples(table: SampleTable, lo: number, hi: number): Promise<Sample[]>;
  /** Heart rate as the scorers want it. samples.ts:38 */
  readHr(lo: number, hi: number): Promise<HrSample[]>;
  /** First and last sample time, or null with none; reads only the first and last bucket. samples.ts:42 */
  sampleRange(table: SampleTable): Promise<{ min: number; max: number } | null>;
  /** The newest stored sample, unix seconds: the last offset of the newest day row. sync.ts:431 */
  lastSample(table: SampleTable): Promise<number | null>;
  /** True once any heart rate has synced (a phone-only account has none). queries/home.ts:230 `hasBand` */
  hasHr(): Promise<boolean>;
  /**
   * Merges a sync window's samples and returns the timestamps whose value changed (added, updated or removed), for
   * dirty-day marking. "replace" (heart rate): inside [win.start, win.end) the stored samples become exactly
   * `incoming`; outside they stay. "max" (steps): each minute keeps the larger of stored and incoming; nothing is
   * removed. Diff-only: a bucket whose merged samples equal the stored ones is not written (a bucket that ends empty
   * is deleted). A replaced hr bucket gets `minute: false`. samples.ts:59
   */
  mergeSamples(table: SampleTable, win: { start: number; end: number }, incoming: Map<number, number>, mode: "replace" | "max"): Promise<number[]>;
  /**
   * Compacts raw hr days before `beforeBucket` to one rounded mean per minute (offset = the minute's first second),
   * oldest first, at most COMPACT_BATCH rows. Returns the number of rows compacted. Rows already `minute` are skipped,
   * so a repeat call writes nothing. samples.ts:121
   */
  compactHr(beforeBucket: number): Promise<number>;
  /** Writes whole buckets without reading the sample table first; stored samples win over `samples` (insert-or-ignore). Diff-only per bucket. samples.ts:148 */
  writeSamples(table: SampleTable, samples: Sample[]): Promise<void>;

  /** Deletes hr_days and steps_days (a Google account switch). avatar.ts:45 `forgetSyncedData` */
  clearSynced(): Promise<void>;
}

const T = { hr: hrDays, steps: stepsDays } as const;
/** Heart rate is one uint8 per sample; steps are varints (a minute can pass 255). See encoding.ts. */
const CODEC: Record<SampleTable, Codec> = { hr: u8, steps: varint };
/** What a stored value can be: whole, and for heart rate within a byte (a reading above 255 bpm is a sensor fault). */
const fit = (table: SampleTable, v: number) => (table === "hr" ? Math.min(255, Math.max(0, Math.round(v))) : Math.max(0, Math.round(v)));

type Row = { bucket: number; offsets: number[]; values: number[] };

function load(db: Db, table: SampleTable, lo: number, hi: number): Row[] {
  const t = T[table];
  if (hi <= lo) return [];
  return db
    .select({ bucket: t.bucket, offsets: t.offsets, values: t.values })
    .from(t)
    .where(between(t.bucket, bucketOf(lo), bucketOf(hi - 1)))
    .orderBy(asc(t.bucket))
    .all()
    .map((r) => ({ bucket: r.bucket, ...decodeDay(CODEC[table], r.offsets, r.values) }));
}

const save = (db: Db, table: SampleTable, bucket: number, offsets: number[], values: number[]) => {
  const t = T[table];
  const blobs = encodeDay(CODEC[table], offsets, values);
  const set = { ...blobs, ...(table === "hr" && { minute: false }) };
  db.insert(t).values({ bucket, ...set }).onConflictDoUpdate({ target: t.bucket, set }).run();
};

export function samplesRepo(db: Db): SamplesRepo {
  const readSamples: SamplesRepo["readSamples"] = async (table, lo, hi) => {
    const out: Sample[] = [];
    for (const r of load(db, table, lo, hi)) {
      const base = r.bucket * DAY;
      for (let i = 0; i < r.offsets.length; i++) {
        const ts = base + r.offsets[i];
        if (ts >= lo && ts < hi) out.push({ ts, v: r.values[i] });
      }
    }
    return out;
  };

  // Reads only the first and last bucket, and only their offsets.
  const sampleRange: SamplesRepo["sampleRange"] = async (table) => {
    const t = T[table];
    const edge = (order: typeof asc) => {
      const [r] = db.select({ bucket: t.bucket, offsets: t.offsets }).from(t).orderBy(order(t.bucket)).limit(1).all();
      return r ? { bucket: r.bucket, offsets: decodeOffsets(r.offsets) } : null;
    };
    const first = edge(asc);
    const last = edge(desc);
    if (!first?.offsets.length || !last?.offsets.length) return null;
    return { min: first.bucket * DAY + first.offsets[0], max: last.bucket * DAY + last.offsets[last.offsets.length - 1] };
  };

  return {
    readSamples,
    readHr: async (lo, hi) => (await readSamples("hr", lo, hi)).map((s) => ({ ts: s.ts, bpm: s.v })),
    sampleRange,
    lastSample: async (table) => (await sampleRange(table))?.max ?? null,

    async hasHr() {
      return db.select({ b: hrDays.bucket }).from(hrDays).limit(1).all().length > 0;
    },

    async mergeSamples(table, win, incoming, mode) {
      const t = T[table];
      // A loop, not Math.min(...keys): a day can hold 86k keys, past what a spread call takes as arguments.
      let lo = win.start;
      let hi = win.end;
      for (const k of incoming.keys()) {
        if (k < lo) lo = k;
        if (k + 1 > hi) hi = k + 1;
      }
      const stored = new Map(load(db, table, lo, hi).map((r) => [r.bucket, r]));
      const buckets = new Set<number>(stored.keys());
      for (const ts of incoming.keys()) buckets.add(bucketOf(ts));
      if (mode === "replace") for (let b = bucketOf(win.start); b <= bucketOf(win.end - 1); b++) buckets.add(b);

      const changed: number[] = [];
      atomic(db, () => {
        for (const b of buckets) {
          const base = b * DAY;
          const before = new Map<number, number>();
          const r = stored.get(b);
          if (r) for (let i = 0; i < r.offsets.length; i++) before.set(base + r.offsets[i], r.values[i]);
          const after = new Map(before);
          if (mode === "replace") {
            for (const ts of before.keys()) if (ts >= win.start && ts < win.end && !incoming.has(ts)) after.delete(ts);
          }
          for (const [ts, raw] of incoming) {
            if (bucketOf(ts) !== b) continue;
            const v = fit(table, raw);
            if (mode === "max") after.set(ts, Math.max(v, before.get(ts) ?? v));
            else after.set(ts, v);
          }
          const n = changed.length;
          for (const ts of new Set([...before.keys(), ...after.keys()])) if (before.get(ts) !== after.get(ts)) changed.push(ts);
          if (changed.length === n) continue;
          const sorted = [...after].sort((a, z) => a[0] - z[0]);
          if (!sorted.length) {
            db.delete(t).where(eq(t.bucket, b)).run();
            continue;
          }
          save(db, table, b, sorted.map(([ts]) => ts - base), sorted.map(([, v]) => v));
        }
      });
      return changed;
    },

    async compactHr(beforeBucket) {
      const t = hrDays;
      const rows = db
        .select({ bucket: t.bucket, offsets: t.offsets, values: t.values })
        .from(t)
        .where(and(eq(t.minute, false), lt(t.bucket, beforeBucket)))
        .orderBy(asc(t.bucket))
        .limit(COMPACT_BATCH)
        .all();
      atomic(db, () => {
        for (const r of rows) {
          const day = decodeDay(u8, r.offsets, r.values);
          const sum = new Map<number, { s: number; n: number }>();
          for (let i = 0; i < day.offsets.length; i++) {
            const m = Math.floor(day.offsets[i] / 60);
            const a = sum.get(m) ?? { s: 0, n: 0 };
            a.s += day.values[i];
            a.n++;
            sum.set(m, a);
          }
          const minutes = [...sum].sort((a, z) => a[0] - z[0]);
          const blobs = encodeDay(u8, minutes.map(([m]) => m * 60), minutes.map(([, a]) => Math.round(a.s / a.n)));
          db.update(t).set({ ...blobs, minute: true }).where(eq(t.bucket, r.bucket)).run();
        }
      });
      return rows.length;
    },

    async writeSamples(table, samples) {
      const byBucket = new Map<number, Sample[]>();
      for (const s of samples) {
        const b = bucketOf(s.ts);
        if (!byBucket.has(b)) byBucket.set(b, []);
        byBucket.get(b)!.push(s);
      }
      atomic(db, () => {
        for (const [b, xs] of byBucket) {
          xs.sort((a, z) => a.ts - z.ts);
          const base = b * DAY;
          const [existing] = load(db, table, base, base + DAY);
          const merged = new Map<number, number>();
          if (existing) for (let i = 0; i < existing.offsets.length; i++) merged.set(base + existing.offsets[i], existing.values[i]);
          const held = merged.size;
          for (const s of xs) if (!merged.has(s.ts)) merged.set(s.ts, fit(table, s.v)); // keep stored, like insert-or-ignore
          if (merged.size === held) continue; // nothing new: the stored samples win, so nothing to write
          const sorted = [...merged].sort((a, z) => a[0] - z[0]);
          const t = T[table];
          const blobs = encodeDay(CODEC[table], sorted.map(([ts]) => ts - base), sorted.map(([, v]) => v));
          db.insert(t).values({ bucket: b, ...blobs }).onConflictDoUpdate({ target: t.bucket, set: blobs }).run();
        }
      });
    },

    async clearSynced() {
      atomic(db, () => {
        db.delete(hrDays).run();
        db.delete(stepsDays).run();
      });
    },
  };
}
