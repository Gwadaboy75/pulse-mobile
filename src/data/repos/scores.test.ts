import { beforeEach, describe, expect, it } from "vitest";
import { testDb, writesOf } from "../testing";
import type { Stage2Write } from "./scores";

let t: ReturnType<typeof testDb>;
beforeEach(() => {
  t = testDb();
});
const stage1 = (day: string, key = "k1", sessionRhrBpm: number | null = 52) => ({ day, strain: { key, effort: 12.5, hrCount: 900, hrMinutesAm: 100, hrMinutesPm: 200 }, activities: [{ id: "a" }], sessionRhrBpm });
const stage2 = (day: string, over: Partial<Stage2Write> = {}): Stage2Write => ({
  day, scoringVersion: 7,
  recovery: { value: 71.5, reason: null }, sleep: { s: 1 }, trainingLoad: { l: 1 }, strainTarget: { t: 1 }, sleepPlanner: { p: 1 },
  energyBank: { e: 1 }, stress: { s: 1 }, healthMonitor: { h: 1 }, healthspan: { h: 1 }, fitness: { f: 1 }, journalImpact: { key: "x", impacts: [] },
  ...over,
});

describe("scores: stage 1", () => {
  it("writes strain, activities and session RHR with version 0, and reads them back", async () => {
    const { scores } = t.store;
    await scores.writeStage1([stage1("2026-10-01"), stage1("2026-10-02", "k2", null)]);
    expect(await scores.stage1Stored()).toEqual([{ day: "2026-10-01", scoringVersion: 0, key: "k1" }, { day: "2026-10-02", scoringVersion: 0, key: "k2" }]);
    const [d1, d2] = await scores.readDays("2026-10-01", "2026-10-02");
    expect(d1).toMatchObject({ day: "2026-10-01", strain: { key: "k1", effort: 12.5 }, activities: [{ id: "a" }], sessionRhr: 52, recovery: null, sleep: null });
    expect(d2.sessionRhr).toBeNull();
    expect(await scores.readDays("2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("leaves stage 2's columns and the version alone when it rewrites a day", async () => {
    const { scores } = t.store;
    await scores.writeStage1([stage1("2026-10-01")]);
    await scores.writeStage2([stage2("2026-10-01")]);
    await scores.writeStage1([stage1("2026-10-01", "k9")]);
    expect(await scores.stage1Stored()).toEqual([{ day: "2026-10-01", scoringVersion: 7, key: "k9" }]);
    expect((await scores.readDays("2026-10-01", "2026-10-01"))[0].recovery).toEqual({ value: 71.5, reason: null });
  });

  it("diff-only: repeating the write changes nothing", async () => {
    await t.store.scores.writeStage1([stage1("2026-10-01"), stage1("2026-10-02")]);
    expect(await writesOf(t.sqlite, () => t.store.scores.writeStage1([stage1("2026-10-01"), stage1("2026-10-02")]))).toBe(0);
    expect(await writesOf(t.sqlite, () => t.store.scores.writeStage1([stage1("2026-10-01", "changed")]))).toBe(1);
  });
});

describe("scores: stage 2", () => {
  it("round-trips the ten columns and the journal impact", async () => {
    const { scores } = t.store;
    await scores.writeStage1([stage1("2026-10-01")]);
    await scores.writeStage2([stage2("2026-10-01")]);
    const [row] = await scores.readDays("2026-10-01", "2026-10-01");
    expect(row).toMatchObject({ recovery: { value: 71.5 }, sleep: { s: 1 }, trainingLoad: { l: 1 }, strainTarget: { t: 1 }, sleepPlanner: { p: 1 }, energyBank: { e: 1 }, stress: { s: 1 }, healthMonitor: { h: 1 }, healthspan: { h: 1 }, fitness: { f: 1 } });
    expect(await scores.readStage2Inputs()).toEqual([{ day: "2026-10-01", strain: expect.objectContaining({ key: "k1" }), activities: [{ id: "a" }], sessionRhr: 52, recovery: { value: 71.5, reason: null }, impact: { key: "x", impacts: [] } }]);
  });

  it("diff-only: an unchanged run writes nothing; a changed column or version writes that row only", async () => {
    const { scores } = t.store;
    const rows = ["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => stage2(d));
    await scores.writeStage1(rows.map((r) => stage1(r.day)));
    await scores.writeStage2(rows);
    expect(await writesOf(t.sqlite, () => scores.writeStage2(rows))).toBe(0);
    expect(await writesOf(t.sqlite, () => scores.writeStage2([rows[0], stage2("2026-10-02", { stress: { s: 2 } }), rows[2]]))).toBe(1);
    expect(await writesOf(t.sqlite, () => scores.writeStage2([stage2("2026-10-03", { scoringVersion: 8 })]))).toBe(1);
    expect((await scores.stage1Stored()).map((s) => s.scoringVersion)).toEqual([7, 7, 8]);
  });

  it("keeps the key order of a stored object (journal impact's memo key depends on it)", async () => {
    await t.store.scores.writeStage2([stage2("2026-10-01", { journalImpact: { b: 1, a: 2 } })]);
    expect(t.sqlite.prepare("select journal_impact as j from daily_scores").get()).toEqual({ j: '{"b":1,"a":2}' });
  });

  it("writeStage2 of a column set to null stores SQL null, not the text 'null'", async () => {
    await t.store.scores.writeStage2([stage2("2026-10-01", { fitness: null })]);
    expect(t.sqlite.prepare("select fitness as f from daily_scores").get()).toEqual({ f: null });
  });
});

describe("scores: reads", () => {
  beforeEach(async () => {
    const { scores } = t.store;
    await scores.writeStage1(["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => stage1(d)));
    await scores.writeStage2([stage2("2026-10-01"), stage2("2026-10-02", { journalImpact: null })]);
  });

  it("firstDay, lastStoredDay, countDays, recoveryValue", async () => {
    const { scores } = t.store;
    expect(await scores.firstDay()).toBe("2026-10-01");
    expect(await scores.lastStoredDay("2026-10-02")).toBe("2026-10-02");
    expect(await scores.lastStoredDay("2026-12-01")).toBe("2026-10-03");
    expect(await scores.lastStoredDay("2026-01-01")).toBeNull();
    expect(await scores.countDays("2026-10-02")).toBe(2);
    expect(await scores.recoveryValue("2026-10-01")).toBe(71.5);
    expect(await scores.recoveryValue("2026-10-03")).toBeNull(); // stage 1 only
    expect(await scores.recoveryValue("2026-11-01")).toBeNull();
  });

  it("firstDay on an empty table is null", async () => {
    expect(await testDb().store.scores.firstDay()).toBeNull();
  });

  it("latestJournalImpact: the newest row on or before the day that has one", async () => {
    expect(await t.store.scores.latestJournalImpact("2026-10-03")).toEqual({ day: "2026-10-01", impact: { key: "x", impacts: [] } });
    expect(await t.store.scores.latestJournalImpact("2026-09-30")).toBeNull();
  });

  it("wearDays: heart-rate count and minutes per day, newest first", async () => {
    expect(await t.store.scores.wearDays("2026-10-02")).toEqual([{ day: "2026-10-02", hrCount: 900, hrMinutes: 300 }, { day: "2026-10-01", hrCount: 900, hrMinutes: 300 }]);
    await t.store.scores.writeStage1([{ day: "2026-10-04", strain: { key: "k" }, activities: [], sessionRhrBpm: null }]);
    expect((await t.store.scores.wearDays("2026-10-04"))[0]).toEqual({ day: "2026-10-04", hrCount: 0, hrMinutes: 0 });
  });

  it("deleteOutside removes days before the first and after the last", async () => {
    await t.store.scores.deleteOutside("2026-10-02", "2026-10-02");
    expect((await t.store.scores.readDays("2026-01-01", "2026-12-31")).map((r) => r.day)).toEqual(["2026-10-02"]);
  });
});

describe("scores: needsRecompute", () => {
  it("is false on an empty store", async () => {
    expect(await t.store.scores.needsRecompute(7)).toBe(false);
  });

  it("true for a dirty day, a row from another version, or a newest daily row not yet scored", async () => {
    const { scores, daily } = t.store;
    await daily.upsertDailyMetrics([{ day: "2026-10-01", source: "google", steps: 1 }]);
    expect(await scores.needsRecompute(7)).toBe(true); // newest daily row unscored
    await scores.writeStage1([stage1("2026-10-01")]);
    await scores.writeStage2([stage2("2026-10-01")]);
    expect(await scores.needsRecompute(7)).toBe(false);
    expect(await scores.needsRecompute(8)).toBe(true); // another version
    await scores.markDirty(["2026-10-01"]);
    expect(await scores.needsRecompute(7)).toBe(true);
    await scores.clearDirty();
    expect(await scores.needsRecompute(7)).toBe(false);
    await daily.upsertDailyMetrics([{ day: "2026-10-02", source: "google", steps: 1 }]);
    expect(await scores.needsRecompute(7)).toBe(true);
  });
});

describe("scores: checkpoint and dirty days", () => {
  it("one checkpoint row: write, read, repeat writes nothing, replace, delete", async () => {
    const { scores } = t.store;
    expect(await scores.readCheckpoint()).toBeNull();
    const c = { day: "2026-09-01", scoringVersion: 7, inputsKey: '["a"]', fold: '{"z":1,"a":2}' };
    await scores.writeCheckpoint(c);
    expect(await scores.readCheckpoint()).toEqual(c);
    expect(await writesOf(t.sqlite, () => scores.writeCheckpoint(c))).toBe(0);
    await scores.writeCheckpoint({ ...c, day: "2026-09-30" });
    expect((await scores.readCheckpoint())?.day).toBe("2026-09-30");
    expect(t.sqlite.prepare("select count(*) n from fold_checkpoints").get()).toEqual({ n: 1 });
    await scores.deleteCheckpoint();
    expect(await scores.readCheckpoint()).toBeNull();
  });

  it("markDirty is insert-or-ignore; markAllDaysDirty marks every daily_metrics day; clearDirty empties", async () => {
    const { scores, daily } = t.store;
    await scores.markDirty(["2026-10-02", "2026-10-01"]);
    await scores.markDirty(["2026-10-01"]);
    expect(await scores.dirtyDays()).toEqual(["2026-10-01", "2026-10-02"]);
    expect(await writesOf(t.sqlite, () => scores.markDirty(["2026-10-01", "2026-10-02"]))).toBe(0);
    await daily.upsertDailyMetrics([{ day: "2026-10-05", source: "google" }, { day: "2026-10-06", source: "google" }]);
    await scores.markAllDaysDirty();
    expect(await scores.dirtyDays()).toEqual(["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"]);
    await scores.clearDirty();
    expect(await scores.dirtyDays()).toEqual([]);
  });
});

describe("scores: reports", () => {
  const report = (days: number, kind: "week" | "month") => ({ kind, days, partial: false });
  beforeEach(async () => {
    await t.store.scores.writeReports([
      { period: "2026-W38", data: report(7, "week") }, { period: "2026-W39", data: report(0, "week") }, { period: "2026-W40", data: report(5, "week") },
      { period: "2026-08", data: report(31, "month") }, { period: "2026-09", data: report(30, "month") },
    ]);
  });

  it("round trips, lists newest first, counts the ones with data", async () => {
    const { scores } = t.store;
    expect(await scores.readReport("2026-W40")).toEqual(report(5, "week"));
    expect(await scores.readReport("2030-W01")).toBeNull();
    expect((await scores.listReports()).map((r) => r.period)).toEqual(["2026-W40", "2026-W39", "2026-W38", "2026-09", "2026-08"]);
    expect(await scores.countReportsWithData()).toBe(4);
  });

  it("neighbours stay within their kind; latestReports is newest first", async () => {
    const { scores } = t.store;
    expect(await scores.reportNeighbour("week", "2026-W39", -1)).toBe("2026-W38");
    expect(await scores.reportNeighbour("week", "2026-W39", 1)).toBe("2026-W40");
    expect(await scores.reportNeighbour("week", "2026-W40", 1)).toBeNull();
    expect(await scores.reportNeighbour("month", "2026-09", -1)).toBe("2026-08");
    expect(await scores.reportNeighbour("month", "2026-08", -1)).toBeNull();
    expect((await scores.latestReports("week", 2)).map((r) => r.period)).toEqual(["2026-W40", "2026-W39"]);
    expect((await scores.latestReports("month", 3)).map((r) => r.period)).toEqual(["2026-09", "2026-08"]);
  });

  it("diff-only: same data writes nothing; changed data writes that report; deleteReportsExcept keeps the listed", async () => {
    const { scores } = t.store;
    expect(await writesOf(t.sqlite, () => scores.writeReports([{ period: "2026-W38", data: report(7, "week") }]))).toBe(0);
    expect(await writesOf(t.sqlite, () => scores.writeReports([{ period: "2026-W38", data: report(6, "week") }]))).toBe(1);
    await scores.deleteReportsExcept(["2026-W38", "2026-09"]);
    expect((await scores.listReports()).map((r) => r.period)).toEqual(["2026-W38", "2026-09"]);
    await scores.deleteReportsExcept([]);
    expect(await scores.listReports()).toEqual([]);
  });

  it("clearSynced empties scores, reports, checkpoint and dirty marks", async () => {
    const { scores } = t.store;
    await scores.writeStage1([stage1("2026-10-01")]);
    await scores.writeCheckpoint({ day: "d", scoringVersion: 1, inputsKey: "k", fold: "{}" });
    await scores.markDirty(["2026-10-01"]);
    await scores.clearSynced();
    expect([await scores.firstDay(), await scores.readCheckpoint(), await scores.dirtyDays(), await scores.listReports()]).toEqual([null, null, [], []]);
  });
});

describe("series", () => {
  const day = (n: number, v = 60) => Array.from({ length: 4 }, (_, i) => (i === 1 ? null : v + n + i));
  it("upserts, reads, diff-only on repeat, deletes by kind and outside", async () => {
    const { series } = t.store;
    const rows = [
      { day: "2026-10-01", kind: "hr", data: day(0) }, { day: "2026-10-02", kind: "hr", data: day(1) },
      { day: "2026-10-02", kind: "energy_bank", data: day(2) }, { day: "2026-10-03", kind: "stress", data: day(3) },
    ];
    await series.upsertSeries(rows);
    expect(await series.loadSeries("2026-10-01", "hr")).toEqual(day(0));
    expect(await series.loadSeries("2026-10-01", "stress")).toBeNull();
    expect(await writesOf(t.sqlite, () => series.upsertSeries(rows))).toBe(0);
    expect(await writesOf(t.sqlite, () => series.upsertSeries([{ ...rows[0], data: day(9) }, rows[1]]))).toBe(1);
    expect((await series.readSeries(["hr", "energy_bank"], "2026-10-02", "2026-10-03")).map((r) => `${r.day} ${r.kind}`).sort()).toEqual(["2026-10-02 energy_bank", "2026-10-02 hr"]);
    expect(await series.readSeries([], "2026-10-01", "2026-10-09")).toEqual([]);
    await series.deleteSeries("energy_bank", ["2026-10-02", "2026-10-05"]);
    expect(await series.loadSeries("2026-10-02", "energy_bank")).toBeNull();
    expect(await series.loadSeries("2026-10-02", "hr")).not.toBeNull();
    await series.deleteOutside("2026-10-02", "2026-10-02");
    expect(await series.loadSeries("2026-10-01", "hr")).toBeNull();
    expect(await series.loadSeries("2026-10-03", "stress")).toBeNull();
    expect(await series.loadSeries("2026-10-02", "hr")).toEqual(day(1));
    await series.clearSynced();
    expect(await series.loadSeries("2026-10-02", "hr")).toBeNull();
  });
});
