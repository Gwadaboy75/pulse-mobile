import { beforeEach, describe, expect, it } from "vitest";
import { testDb, writesOf } from "../testing";

let t: ReturnType<typeof testDb>;
beforeEach(() => {
  t = testDb();
});
const g = (day: string, over: Record<string, unknown> = {}) => ({ day, source: "google", ...over });

describe("daily metrics", () => {
  it("round-trips the pipeline's columns, with hr zones as JSON and absent columns as null", async () => {
    const { daily } = t.store;
    await daily.upsertDailyMetrics([g("2026-10-02", { rhrBpm: 51.5, hrvMs: 62, steps: 9000, hrZones: [90, 120, 150, 170, 190], tempSdC: 0.3 }), g("2026-10-01", { rhrBpm: 50 })]);
    const rows = await daily.readMetrics();
    expect(rows.map((r) => r.day)).toEqual(["2026-10-01", "2026-10-02"]); // oldest first
    expect(rows[1]).toMatchObject({ rhrBpm: 51.5, hrvMs: 62, steps: 9000, hrZones: [90, 120, 150, 170, 190], tempSdC: 0.3, weightKg: null, vo2maxRun: null });
    expect(rows[1]).not.toHaveProperty("source");
    expect(await daily.readMetricsBetween("2026-10-02", "2026-10-31")).toEqual([expect.objectContaining({ day: "2026-10-02", rhrBpm: 51.5 })]);
  });

  it("returns the days inserted or changed; a repeat writes nothing and returns none", async () => {
    const { daily } = t.store;
    const rows = [g("2026-10-01", { rhrBpm: 50, hrZones: [1, 2, 3, 4, 5] }), g("2026-10-02", { rhrBpm: 51, hrZones: null })];
    expect((await daily.upsertDailyMetrics(rows)).sort()).toEqual(["2026-10-01", "2026-10-02"]);
    expect(await writesOf(t.sqlite, async () => expect(await daily.upsertDailyMetrics(rows)).toEqual([]))).toBe(0);
    expect(await daily.upsertDailyMetrics([g("2026-10-01", { rhrBpm: 50, hrZones: [1, 2, 3, 4, 6] }), rows[1]])).toEqual(["2026-10-01"]);
    expect(t.sqlite.prepare("select hr_zones z from daily_metrics where day = '2026-10-02'").get()).toEqual({ z: null });
  });

  it("a column a job does not carry is left as it is; a carried null clears it", async () => {
    const { daily } = t.store;
    await daily.upsertDailyMetrics([g("2026-10-01", { rhrBpm: 50, steps: 100 })]);
    await daily.upsertDailyMetrics([g("2026-10-01", { hrvMs: 60 })]);
    expect((await daily.readMetrics())[0]).toMatchObject({ rhrBpm: 50, steps: 100, hrvMs: 60 });
    expect(await daily.upsertDailyMetrics([g("2026-10-01", { steps: null })])).toEqual(["2026-10-01"]);
    expect((await daily.readMetrics())[0]).toMatchObject({ rhrBpm: 50, steps: null });
  });

  it("rows with the same day in one call: the last wins", async () => {
    await t.store.daily.upsertDailyMetrics([g("2026-10-01", { rhrBpm: 50 }), g("2026-10-01", { rhrBpm: 55 })]);
    expect((await t.store.daily.readMetrics())[0].rhrBpm).toBe(55);
  });

  it("handles a long backfill (more rows than one insert statement)", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => g(`${2000 + Math.floor(i / 365)}-${String(1 + (i % 365) % 12).padStart(2, "0")}-${String(1 + ((i % 365) % 28)).padStart(2, "0")}-${i}`, { rhrBpm: i, steps: i }));
    expect(await t.store.daily.upsertDailyMetrics(rows)).toHaveLength(2500);
    expect(await writesOf(t.sqlite, () => t.store.daily.upsertDailyMetrics(rows))).toBe(0);
  });

  it("metricReadings, recentWeights", async () => {
    const { daily } = t.store;
    await daily.upsertDailyMetrics([g("2026-10-01", { weightKg: 80, bodyFatPct: 20 }), g("2026-10-02"), g("2026-10-03", { weightKg: 79.5 }), g("2026-10-04", { weightKg: 79 })]);
    expect(await daily.metricReadings("weightKg")).toEqual([{ day: "2026-10-04", value: 79 }, { day: "2026-10-03", value: 79.5 }, { day: "2026-10-01", value: 80 }]);
    expect(await daily.metricReadings("bodyFatPct")).toEqual([{ day: "2026-10-01", value: 20 }]);
    expect(await daily.recentWeights("2026-10-01", "2026-10-03", 2)).toEqual([{ day: "2026-10-03", kg: 79.5 }, { day: "2026-10-01", kg: 80 }]);
  });
});

describe("daily values", () => {
  it("upserts roll-ups, counts changes, reads a range without 'latest'", async () => {
    const { daily } = t.store;
    const rows = [{ day: "2026-10-01", key: "water", value: 1500 }, { day: "2026-10-02", key: "water", value: 1800 }, { day: "2026-10-02", key: "protein", value: 90 }, { day: "latest", key: "height_cm", value: 181 }];
    expect(await daily.upsertDailyValues(rows)).toBe(4);
    expect(await writesOf(t.sqlite, async () => expect(await daily.upsertDailyValues(rows)).toBe(0))).toBe(0);
    expect(await daily.upsertDailyValues([{ day: "2026-10-01", key: "water", value: 1600 }])).toBe(1);
    expect((await daily.readValuesBetween("2026-10-01", "2026-12-31")).map((r) => `${r.day} ${r.key} ${r.value}`).sort()).toEqual(["2026-10-01 water 1600", "2026-10-02 protein 90", "2026-10-02 water 1800"]);
    expect(await daily.googleHeight()).toBe(181);
    expect(await daily.valueReadings("water")).toEqual([{ day: "2026-10-02", value: 1800 }, { day: "2026-10-01", value: 1600 }]);
  });

  it("googleHeight is null with none", async () => {
    expect(await t.store.daily.googleHeight()).toBeNull();
  });
});

describe("health records", () => {
  it("upserts by id, diff-only, newest first up to a day", async () => {
    const { daily } = t.store;
    const rows = [
      { id: "e1", kind: "ecg" as const, ts: 100, day: "2026-10-01", data: { result: "SINUS_RHYTHM", avgBpm: 61 } },
      { id: "e2", kind: "ecg" as const, ts: 200, day: "2026-10-02", data: { result: "AFIB", avgBpm: 110 } },
      { id: "i1", kind: "irn" as const, ts: 300, day: "2026-10-03", data: { windows: 2 } },
    ];
    expect(await daily.upsertHealthRecords(rows)).toBe(3);
    expect(await writesOf(t.sqlite, async () => expect(await daily.upsertHealthRecords(rows)).toBe(0))).toBe(0);
    expect(await daily.upsertHealthRecords([{ ...rows[0], data: { result: "SINUS_RHYTHM", avgBpm: 62 } }])).toBe(1);
    expect((await daily.healthRecordsUpTo("2026-10-02")).map((r) => r.id)).toEqual(["e2", "e1"]);
    expect((await daily.healthRecordsUpTo("2026-10-03"))[0]).toEqual(rows[2]);
  });

  it("clearSynced empties the three tables", async () => {
    const { daily } = t.store;
    await daily.upsertDailyMetrics([g("2026-10-01")]);
    await daily.upsertDailyValues([{ day: "2026-10-01", key: "water", value: 1 }]);
    await daily.upsertHealthRecords([{ id: "e", kind: "ecg", ts: 1, day: "2026-10-01", data: {} }]);
    await daily.clearSynced();
    expect([(await daily.readMetrics()).length, (await daily.readValuesBetween("0", "9")).length, (await daily.healthRecordsUpTo("9")).length]).toEqual([0, 0, 0]);
  });
});
