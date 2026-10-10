import { beforeEach, describe, expect, it } from "vitest";
import { testDb, writesOf } from "../testing";
import type { NewLoggedEntry } from "./log";

let t: ReturnType<typeof testDb>;
beforeEach(() => {
  t = testDb();
});
const T = Date.parse("2026-10-02T06:00:00Z") / 1000;
const entry = (id: string, type: string, ts: number, data: unknown, over: Partial<NewLoggedEntry> = {}): NewLoggedEntry => ({
  id, type, ts, day: "2026-10-02", data, googleName: null, createdAt: ts, ...over,
});

describe("logged entries", () => {
  it("inserts with source pulse by default, reads by id, deletes one and many", async () => {
    const { log } = t.store;
    await log.insertEntry(entry("a", "hydration-log", T, { ml: 250 }));
    await log.insertEntry(entry("b", "moods", T, { moods: ["CALM"] }, { source: "google", app: "FITBIT", googleName: "users/1/dataTypes/moods/dataPoints/p1" }));
    await log.insertEntry(entry("c", "moods", T + 1, { moods: [] }));
    expect(await log.entryById("a")).toEqual({ id: "a", type: "hydration-log", ts: T, day: "2026-10-02", data: { ml: 250 }, googleName: null, source: "pulse", app: null, createdAt: T });
    expect(await log.entryById("b")).toMatchObject({ source: "google", app: "FITBIT" });
    expect(await log.entryById("zz")).toBeNull();
    await log.deleteEntry("a");
    await log.deleteEntries(["b", "c", "missing"]);
    expect(await log.heldEntries("moods", 0, T + 100)).toEqual([]);
    expect(await log.entryById("a")).toBeNull();
  });

  it("updateEntry writes only what differs, and nothing when equal", async () => {
    const { log } = t.store;
    await log.insertEntry(entry("a", "weight", T, { kg: 80, fatPct: null }, { source: "google", app: "FITBIT" }));
    expect(await writesOf(t.sqlite, () => log.updateEntry("a", { ts: T, day: "2026-10-02", data: { kg: 80, fatPct: null }, app: "FITBIT", googleName: null }))).toBe(0);
    expect(await writesOf(t.sqlite, () => log.updateEntry("a", {}))).toBe(0);
    expect(await writesOf(t.sqlite, () => log.updateEntry("nope", { ts: 1 }))).toBe(0);
    await log.updateEntry("a", { data: { kg: 79, fatPct: null }, googleName: "users/1/x" });
    expect(await log.entryById("a")).toMatchObject({ data: { kg: 79, fatPct: null }, googleName: "users/1/x", app: "FITBIT", ts: T });
    await log.updateEntry("a", { app: null, ts: T + 5, day: "2026-10-03" });
    expect(await log.entryById("a")).toMatchObject({ app: null, ts: T + 5, day: "2026-10-03" });
  });

  it("heldEntries is by type and [from, to); entriesOn/entriesOnDay are oldest first (ts, then createdAt)", async () => {
    const { log } = t.store;
    await log.insertEntry(entry("late", "moods", T + 10, {}));
    await log.insertEntry(entry("early2", "moods", T, {}, { createdAt: 5 }));
    await log.insertEntry(entry("early1", "moods", T, {}, { createdAt: 3 }));
    await log.insertEntry(entry("water", "hydration-log", T + 5, { ml: 100 }));
    await log.insertEntry(entry("other", "moods", T + 20, {}, { day: "2026-10-03" }));
    expect((await log.heldEntries("moods", T, T + 10)).map((e) => e.id).sort()).toEqual(["early1", "early2"]);
    expect((await log.entriesOn("moods", "2026-10-02")).map((e) => e.id)).toEqual(["early1", "early2", "late"]);
    expect((await log.entriesOnDay("2026-10-02")).map((e) => e.id)).toEqual(["early1", "early2", "water", "late"]);
  });

  it("entriesOnDay also returns a menstrual period that runs through the day", async () => {
    const { log } = t.store;
    await log.insertEntry(entry("p", "menstrual-period", T - 86_400, { start: "2026-10-01", end: "2026-10-04" }, { day: "2026-10-01" }));
    await log.insertEntry(entry("q", "menstrual-period", T - 9 * 86_400, { start: "2026-09-20", end: "2026-09-24" }, { day: "2026-09-20" }));
    expect((await log.entriesOnDay("2026-10-03")).map((e) => e.id)).toEqual(["p"]);
    expect((await log.entriesOnDay("2026-10-05")).map((e) => e.id)).toEqual([]);
    expect((await log.entriesOnDay("2026-10-01")).map((e) => e.id)).toEqual(["p"]);
  });
});

describe("water and food", () => {
  const sync = (type: string, at: number) => t.store.settings.setSyncState(type, { lastSuccessAt: at });

  it("waterOn: Google's roll-up plus Pulse's entries created after the last hydration sync", async () => {
    const { log, daily } = t.store;
    expect(await log.waterOn("2026-10-02")).toBe(0);
    await daily.upsertDailyValues([{ day: "2026-10-02", key: "water", value: 1000 }]);
    await log.insertEntry(entry("a", "hydration-log", T, { ml: 250 }, { createdAt: 100 }));
    await log.insertEntry(entry("b", "hydration-log", T, { ml: 500 }, { createdAt: 200 }));
    await log.insertEntry(entry("g", "hydration-log", T, { ml: 999 }, { source: "google", createdAt: 300 })); // already in the roll-up
    await log.insertEntry(entry("x", "hydration-log", T, { ml: 700 }, { day: "2026-10-01", createdAt: 300 }));
    expect(await log.waterOn("2026-10-02")).toBe(1750); // no hydration sync yet: both pulse entries count
    await sync("hydration-log", 150);
    expect(await log.waterOn("2026-10-02")).toBe(1500); // a is in the roll-up now
    await sync("hydration-log", 250);
    expect(await log.waterOn("2026-10-02")).toBe(1000);
  });

  it("waterOn with no roll-up and no entries is 0; pending without a roll-up still counts", async () => {
    await t.store.log.insertEntry(entry("a", "hydration-log", T, { ml: 250 }));
    expect(await t.store.log.waterOn("2026-10-02")).toBe(250);
  });

  it("totalsBetween: one row per day in TypeScript, null for a day with nothing", async () => {
    const { log, daily } = t.store;
    await daily.upsertDailyValues([{ day: "2026-10-01", key: "water", value: 1000.4 }, { day: "2026-10-01", key: "calories_in", value: 2000 }, { day: "2026-10-03", key: "calories_in", value: 1800 }]);
    await log.insertEntry(entry("w", "hydration-log", T, { ml: 250 }, { day: "2026-10-02" }));
    await log.insertEntry(entry("n", "nutrition-log", T, { kcal: 300 }, { day: "2026-10-03" }));
    await sync("hydration-log", 0);
    expect(await log.totalsBetween("2026-10-01", "2026-10-04")).toEqual([
      { day: "2026-10-01", water: 1000, kcal: 2000 },
      { day: "2026-10-02", water: 250, kcal: null },
      { day: "2026-10-03", water: null, kcal: 2100 },
      { day: "2026-10-04", water: null, kcal: null },
    ]);
    expect(await log.totalsBetween("2026-10-05", "2026-10-05")).toEqual([{ day: "2026-10-05", water: null, kcal: null }]);
    expect(await log.totalsBetween("2026-10-06", "2026-10-05")).toEqual([]);
  });

  it("foodOn: Google's roll-ups plus pending Pulse nutrition entries; null with neither", async () => {
    const { log, daily } = t.store;
    expect(await log.foodOn("2026-10-02")).toBeNull();
    await log.insertEntry(entry("n1", "nutrition-log", T, { kcal: 400, protein: 20.25, carbs: 50, fat: null, meal: "LUNCH" }));
    expect(await log.foodOn("2026-10-02")).toEqual({ kcal: 400, protein: 20.3, carbs: 50, fat: 0 });
    await daily.upsertDailyValues([{ day: "2026-10-02", key: "calories_in", value: 1500 }, { day: "2026-10-02", key: "protein", value: 80 }]);
    expect(await log.foodOn("2026-10-02")).toEqual({ kcal: 1900, protein: 100.3, carbs: 50, fat: 0 });
    await sync("nutrition-log", T + 1); // the sync has caught up
    expect(await log.foodOn("2026-10-02")).toEqual({ kcal: 1500, protein: 80, carbs: 0, fat: 0 });
  });
});
