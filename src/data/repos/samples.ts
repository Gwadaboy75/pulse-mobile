// Band heart rate and per-minute steps (hr_days, steps_days).
// Replaces pulse src/server/samples.ts and the sample parts of sync.ts. Pulse's raw page archive (raw_payloads) is
// dropped on the phone: nothing read it.
// Rows are decoded: `offsets` and `values` are plain number arrays (delta-varint / uint8 BLOBs are this repository's
// concern, a later stream). Every write method writes nothing when the stored row is unchanged.
import type { Db } from "../types";
import { todo } from "./todo";

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

export function samplesRepo(_db: Db): SamplesRepo {
  return {
    readSamples: async () => todo("samplesRepo.readSamples"),
    readHr: async () => todo("samplesRepo.readHr"),
    sampleRange: async () => todo("samplesRepo.sampleRange"),
    lastSample: async () => todo("samplesRepo.lastSample"),
    hasHr: async () => todo("samplesRepo.hasHr"),
    mergeSamples: async () => todo("samplesRepo.mergeSamples"),
    compactHr: async () => todo("samplesRepo.compactHr"),
    writeSamples: async () => todo("samplesRepo.writeSamples"),
    clearSynced: async () => todo("samplesRepo.clearSynced"),
  };
}
