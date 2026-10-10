// The semantics of pulse src/server/samples.test.ts and the merge rules in samples.ts, on better-sqlite3.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hrDays } from "../schema";
import { testDb, writesOf } from "../testing";
import { bucketOf, COMPACT_BATCH, DAY } from "./samples";

let t: ReturnType<typeof testDb>;
beforeEach(() => {
  t = testDb();
});
const old = 1_000 * DAY;
const minuteFlag = (bucket: number) => t.db.select({ m: hrDays.minute }).from(hrDays).where(eq(hrDays.bucket, bucket)).all()[0]?.m;

describe("round trips", () => {
  it("reads back what writeSamples stored, in time order, within [lo, hi)", async () => {
    const { samples } = t.store;
    await samples.writeSamples("hr", [{ ts: old + 30, v: 62 }, { ts: old + 10, v: 60 }, { ts: old + DAY + 5, v: 70 }]);
    expect(await samples.readSamples("hr", old, old + DAY + 6)).toEqual([{ ts: old + 10, v: 60 }, { ts: old + 30, v: 62 }, { ts: old + DAY + 5, v: 70 }]);
    expect(await samples.readSamples("hr", old + 11, old + 30)).toEqual([]);
    expect(await samples.readHr(old, old + 31)).toEqual([{ ts: old + 10, bpm: 60 }, { ts: old + 30, bpm: 62 }]);
    expect(await samples.readSamples("hr", old + 5, old + 5)).toEqual([]);
    expect(await samples.readSamples("steps", old, old + DAY)).toEqual([]);
  });

  it("a full day of about 37,000 heart-rate samples survives the BLOB round trip", async () => {
    const day = Array.from({ length: 37_000 }, (_, i) => ({ ts: old + 2 + Math.floor(i * 2.3), v: 50 + (i % 100) }));
    await t.store.samples.writeSamples("hr", day);
    expect(await t.store.samples.readSamples("hr", old, old + DAY)).toEqual(day.map((s) => ({ ts: s.ts, v: s.v })));
    const [r] = t.db.select().from(hrDays).all();
    expect(r.offsets.length + r.values.length).toBeLessThan(80_000);
  });

  it("sampleRange, lastSample and hasHr", async () => {
    const { samples } = t.store;
    expect(await samples.sampleRange("hr")).toBeNull();
    expect(await samples.lastSample("hr")).toBeNull();
    expect(await samples.hasHr()).toBe(false);
    await samples.writeSamples("hr", [{ ts: old + 100, v: 60 }, { ts: old + 5, v: 61 }, { ts: old + 3 * DAY + 7, v: 62 }, { ts: old + 3 * DAY + 9, v: 63 }]);
    expect(await samples.sampleRange("hr")).toEqual({ min: old + 5, max: old + 3 * DAY + 9 });
    expect(await samples.lastSample("hr")).toBe(old + 3 * DAY + 9);
    expect(await samples.lastSample("steps")).toBeNull();
    expect(await samples.hasHr()).toBe(true);
  });

  it("steps above 255 a minute are kept; heart rate is held to a byte", async () => {
    await t.store.samples.mergeSamples("steps", { start: old, end: old + 600 }, new Map([[old, 400], [old + 60, 12]]), "max");
    expect(await t.store.samples.readSamples("steps", old, old + 600)).toEqual([{ ts: old, v: 400 }, { ts: old + 60, v: 12 }]);
    await t.store.samples.writeSamples("hr", [{ ts: old, v: 300 }]);
    expect(await t.store.samples.readHr(old, old + 1)).toEqual([{ ts: old, bpm: 255 }]);
  });

  it("clearSynced empties both tables", async () => {
    await t.store.samples.writeSamples("hr", [{ ts: old, v: 60 }]);
    await t.store.samples.writeSamples("steps", [{ ts: old, v: 6 }]);
    await t.store.samples.clearSynced();
    expect(await t.store.samples.hasHr()).toBe(false);
    expect(await t.store.samples.sampleRange("steps")).toBeNull();
  });
});

describe("mergeSamples", () => {
  const win = { start: old + 100, end: old + 200 };

  it("replace: inside the window the stored samples become exactly the incoming ones; outside they stay; returns what changed", async () => {
    const { samples } = t.store;
    await samples.writeSamples("hr", [{ ts: old + 50, v: 60 }, { ts: old + 110, v: 61 }, { ts: old + 120, v: 62 }, { ts: old + 150, v: 63 }, { ts: old + 250, v: 64 }]);
    const changed = await samples.mergeSamples("hr", win, new Map([[old + 120, 70], [old + 130, 71], [old + 150, 63]]), "replace");
    // 110 removed, 120 updated, 130 added; 150 equal; 50 and 250 outside the window
    expect(changed.sort()).toEqual([old + 110, old + 120, old + 130]);
    expect(await samples.readHr(old, old + DAY)).toEqual([
      { ts: old + 50, bpm: 60 }, { ts: old + 120, bpm: 70 }, { ts: old + 130, bpm: 71 }, { ts: old + 150, bpm: 63 }, { ts: old + 250, bpm: 64 },
    ]);
  });

  it("replace with an empty map wipes the window (a night with HR samples wiped)", async () => {
    await t.store.samples.writeSamples("hr", [{ ts: old + 110, v: 61 }, { ts: old + 500, v: 62 }]);
    expect(await t.store.samples.mergeSamples("hr", win, new Map(), "replace")).toEqual([old + 110]);
    expect(await t.store.samples.readHr(old, old + DAY)).toEqual([{ ts: old + 500, bpm: 62 }]);
  });

  it("replace that empties a bucket deletes its row", async () => {
    await t.store.samples.writeSamples("hr", [{ ts: old + 110, v: 61 }]);
    await t.store.samples.mergeSamples("hr", win, new Map(), "replace");
    expect(t.db.select().from(hrDays).all()).toEqual([]);
    expect(await t.store.samples.hasHr()).toBe(false);
  });

  it("a window across midnight reaches both buckets", async () => {
    const mid = old + DAY;
    await t.store.samples.writeSamples("hr", [{ ts: mid - 10, v: 60 }, { ts: mid + 10, v: 61 }]);
    const changed = await t.store.samples.mergeSamples("hr", { start: mid - 20, end: mid + 20 }, new Map([[mid - 5, 65]]), "replace");
    expect(changed.sort()).toEqual([mid - 10, mid - 5, mid + 10]);
    expect(await t.store.samples.readHr(old, old + 2 * DAY)).toEqual([{ ts: mid - 5, bpm: 65 }]);
  });

  it("incoming outside the window is stored too, and the range widens to it", async () => {
    const changed = await t.store.samples.mergeSamples("hr", win, new Map([[old + 10, 66]]), "replace");
    expect(changed).toEqual([old + 10]);
    expect(await t.store.samples.readHr(old, old + DAY)).toEqual([{ ts: old + 10, bpm: 66 }]);
  });

  it("max (steps): each minute keeps the larger of stored and incoming, and nothing is removed", async () => {
    const { samples } = t.store;
    const w = { start: old, end: old + 600 };
    await samples.mergeSamples("steps", w, new Map([[old, 10], [old + 60, 30], [old + 120, 5]]), "max");
    const changed = await samples.mergeSamples("steps", w, new Map([[old, 20], [old + 60, 10], [old + 180, 7]]), "max");
    expect(changed.sort()).toEqual([old, old + 180]); // 60 stays 30 (smaller incoming), 120 untouched
    expect(await samples.readSamples("steps", old, old + 600)).toEqual([{ ts: old, v: 20 }, { ts: old + 60, v: 30 }, { ts: old + 120, v: 5 }, { ts: old + 180, v: 7 }]);
  });

  it("diff-only: merging the same window twice changes no row", async () => {
    const { samples } = t.store;
    const incoming = new Map([[old + 110, 61], [old + 120, 62]]);
    const steps = new Map([[old + 60, 12]]);
    expect(await samples.mergeSamples("hr", win, incoming, "replace")).toHaveLength(2);
    await samples.mergeSamples("steps", win, steps, "max");
    expect(await writesOf(t.sqlite, async () => {
      expect(await samples.mergeSamples("hr", win, incoming, "replace")).toEqual([]);
      expect(await samples.mergeSamples("steps", win, steps, "max")).toEqual([]);
      expect(await samples.mergeSamples("steps", win, new Map([[old + 60, 3]]), "max")).toEqual([]); // a smaller one changes nothing
    })).toBe(0);
  });

  it("a replaced hr bucket is no longer `minute`, so it is compacted again; an unchanged one keeps the flag", async () => {
    const { samples } = t.store;
    const w = { start: old, end: old + 3600 };
    await samples.writeSamples("hr", [{ ts: old + 5, v: 60 }, { ts: old + 20, v: 62 }]);
    await samples.compactHr(bucketOf(old) + 1);
    expect(minuteFlag(bucketOf(old))).toBe(true);
    // a re-fetch of the same minute means: stored (minute means) differ from the raw samples, so it changes
    await samples.mergeSamples("hr", w, new Map([[old + 5, 60], [old + 20, 62]]), "replace");
    expect(minuteFlag(bucketOf(old))).toBe(false);
    expect(await samples.compactHr(bucketOf(old) + 1)).toBe(1);
    // merging the compacted minute mean back unchanged is a no-op that leaves the flag alone
    expect(await samples.mergeSamples("hr", w, new Map([[old, 61]]), "replace")).toEqual([]);
    expect(minuteFlag(bucketOf(old))).toBe(true);
  });
});

describe("writeSamples", () => {
  it("stored samples win over the incoming ones (insert-or-ignore) and new ones are added", async () => {
    const { samples } = t.store;
    await samples.writeSamples("hr", [{ ts: old + 5, v: 60 }]);
    await samples.writeSamples("hr", [{ ts: old + 5, v: 99 }, { ts: old + 6, v: 61 }]);
    expect(await samples.readHr(old, old + 10)).toEqual([{ ts: old + 5, bpm: 60 }, { ts: old + 6, bpm: 61 }]);
  });

  it("diff-only: writing samples that are all stored changes no row", async () => {
    const { samples } = t.store;
    const xs = [{ ts: old + 5, v: 60 }, { ts: old + 6, v: 61 }, { ts: old + DAY, v: 70 }];
    await samples.writeSamples("hr", xs);
    await samples.writeSamples("steps", xs);
    expect(await writesOf(t.sqlite, async () => {
      await samples.writeSamples("hr", xs);
      await samples.writeSamples("hr", [{ ts: old + 5, v: 99 }]);
      await samples.writeSamples("steps", xs);
    })).toBe(0);
  });
});

describe("compactHr", () => {
  it("folds a raw day to one rounded mean per minute, leaves recent days raw, and is idempotent", async () => {
    const { samples } = t.store;
    const recent = old + 10 * DAY;
    // Minute 0: three samples at 5, 20, 40 s (60, 62, 65 -> 62.33 -> 62); minute 2: one sample.
    await samples.writeSamples("hr", [
      { ts: old + 5, v: 60 }, { ts: old + 20, v: 62 }, { ts: old + 40, v: 65 }, { ts: old + 125, v: 70 },
      { ts: recent + 5, v: 80 }, { ts: recent + 20, v: 81 },
    ]);
    expect(await samples.compactHr(bucketOf(recent))).toBe(1);
    expect(await samples.readHr(old, old + DAY)).toEqual([{ ts: old, bpm: 62 }, { ts: old + 120, bpm: 70 }]);
    expect(await samples.readHr(recent, recent + DAY)).toEqual([{ ts: recent + 5, bpm: 80 }, { ts: recent + 20, bpm: 81 }]);
    expect([minuteFlag(bucketOf(old)), minuteFlag(bucketOf(recent))]).toEqual([true, false]);
    expect(await writesOf(t.sqlite, async () => expect(await samples.compactHr(bucketOf(recent))).toBe(0))).toBe(0);
  });

  it("rounds the mean half up, as Math.round does", async () => {
    await t.store.samples.writeSamples("hr", [{ ts: old, v: 60 }, { ts: old + 1, v: 61 }]); // 60.5 -> 61
    await t.store.samples.compactHr(bucketOf(old) + 1);
    expect(await t.store.samples.readHr(old, old + 60)).toEqual([{ ts: old, bpm: 61 }]);
  });

  it("works through the history in batches of COMPACT_BATCH, oldest first, and never touches steps", async () => {
    const { samples } = t.store;
    const days = 75;
    const xs = Array.from({ length: days }, (_, i) => [{ ts: old + i * DAY + 5, v: 60 }, { ts: old + i * DAY + 30, v: 64 }]).flat();
    await samples.writeSamples("hr", xs);
    await samples.writeSamples("steps", [{ ts: old + 5, v: 9 }]);
    const cutoff = bucketOf(old) + 70; // 70 old days, 5 recent
    const sizes: number[] = [];
    for (let n = await samples.compactHr(cutoff); n > 0; n = await samples.compactHr(cutoff)) sizes.push(n);
    expect(sizes).toEqual([COMPACT_BATCH, COMPACT_BATCH, 10]);
    const flags = t.db.select({ b: hrDays.bucket, m: hrDays.minute }).from(hrDays).all();
    expect(flags.filter((f) => f.m).map((f) => f.b).sort((a, z) => a - z)).toEqual(Array.from({ length: 70 }, (_, i) => bucketOf(old) + i));
    expect(await samples.readSamples("steps", old, old + DAY)).toEqual([{ ts: old + 5, v: 9 }]);
  });

  it("the first batch is the oldest days", async () => {
    await t.store.samples.writeSamples("hr", Array.from({ length: 40 }, (_, i) => ({ ts: old + i * DAY + 5, v: 60 })));
    expect(await t.store.samples.compactHr(bucketOf(old) + 40)).toBe(COMPACT_BATCH);
    const raw = t.db.select({ b: hrDays.bucket }).from(hrDays).where(eq(hrDays.minute, false)).all().map((r) => r.b);
    expect(Math.min(...raw)).toBe(bucketOf(old) + COMPACT_BATCH);
  });

  it("a raw re-fetch of a compacted day clears the flag, so it is compacted again", async () => {
    const { samples } = t.store;
    await samples.writeSamples("hr", [{ ts: old + 5, v: 60 }, { ts: old + 20, v: 62 }]);
    await samples.compactHr(bucketOf(old) + 1);
    await samples.mergeSamples("hr", { start: old, end: old + 3600 }, new Map([[old + 5, 60], [old + 20, 62]]), "replace");
    expect(minuteFlag(bucketOf(old))).toBe(false);
    expect(t.db.select({ n: hrDays.offsets }).from(hrDays).all()).toHaveLength(1);
    expect(await samples.readHr(old, old + 60)).toEqual([{ ts: old + 5, bpm: 60 }, { ts: old + 20, bpm: 62 }]);
    expect(await samples.compactHr(bucketOf(old) + 1)).toBe(1);
  });
});
