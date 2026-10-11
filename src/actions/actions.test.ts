// halo's src/screens/journal/actions.test.ts (ported from pulse's journal and log action tests) on Pulse's actions:
// the journal and log parts, plus Select Behaviors' save. There is one person per phone and no Google write.
import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import type { Profile } from "@/data/types";
import { DEFAULT_JOURNAL_TAGS, ensureDefaultTags, getBehaviours, MAX_TAGS } from "@/queries/journal";
import type { QueryCtx } from "@/queries/ctx";
import { addCustomTag, loadCheckIn, saveBehaviors, saveCheckIn, saveJournalEntry, type ActionCtx } from "./journal";
import { deleteLogEntry, logEntry } from "./log";

const TZ = "Asia/Kolkata";
// 20:00 UTC on Oct 2 is 01:30 on Oct 3 in Kolkata.
const NIGHT = Date.parse("2026-10-02T20:00:00Z") / 1000;
// 06:00 UTC on Oct 2 is 11:30 in Kolkata.
const MORNING = Date.parse("2026-10-02T06:00:00Z") / 1000;

let store: Store;
let now = NIGHT;
let sex: Profile["sex"] = "male";
const c = (): ActionCtx => ({ store, profile: { birthDate: "1990-01-01", sex, maxHr: null, heightCm: null, timeZone: TZ }, timeZone: TZ, nowS: () => now });
const q = (today: string): QueryCtx => ({ ...c(), today, now, sync: { lastSyncTs: null, firstDay: null, lastError: null } });
const entries = async () => (await store.allJournal()).map(({ day, tag, value }) => ({ day, tag, value }));
const order = async (keep: (t: { tag: string; isDefault: boolean }) => boolean) => (await store.journalTags()).filter(keep).map((t) => t.tag);

beforeEach(async () => {
  store = openMemoryStore();
  now = NIGHT;
  sex = "male";
  await ensureDefaultTags(store);
});

describe("ensureDefaultTags", () => {
  it("is idempotent and keeps custom tags", async () => {
    expect(await ensureDefaultTags(store)).toBe(0);
    await addCustomTag(c(), { label: "Cold plunge" });
    expect(await ensureDefaultTags(store)).toBe(0);
    const tags = await store.journalTags();
    expect(tags.filter((t) => t.isDefault)).toHaveLength(DEFAULT_JOURNAL_TAGS.length);
    expect(tags.find((t) => t.tag === "cold_plunge")).toMatchObject({ tag: "cold_plunge", label: "Cold plunge", isDefault: false, hidden: false });
  });

  it("an empty store gets the defaults the first time the tags are read", async () => {
    store = openMemoryStore();
    expect(await saveJournalEntry(c(), { day: "2026-10-01", tag: "alcohol", value: true })).toMatchObject({ ok: true });
    expect((await store.journalTags()).map((t) => t.tag)).toEqual(DEFAULT_JOURNAL_TAGS.map((t) => t.tag));
  });
});

describe("saveJournalEntry", () => {
  it("saves today in the person's time zone, and past days", async () => {
    expect(await saveJournalEntry(c(), { day: "2026-10-03", tag: "alcohol", value: true })).toEqual({ ok: true, data: undefined });
    expect(await saveJournalEntry(c(), { day: "2026-09-01", tag: "alcohol", value: 2 })).toMatchObject({ ok: true });
    expect(await entries()).toEqual([
      { day: "2026-10-03", tag: "alcohol", value: 1 },
      { day: "2026-09-01", tag: "alcohol", value: 2 },
    ]);
  });

  it("marks the day for a recompute", async () => {
    await saveJournalEntry(c(), { day: "2026-09-30", tag: "alcohol", value: true });
    await saveJournalEntry(c(), { day: "2026-09-30", tag: "alcohol", value: null });
    expect(await store.takeIntradayDirty()).toEqual(["2026-09-30"]);
  });

  it("rejects a future day", async () => {
    expect(await saveJournalEntry(c(), { day: "2026-10-04", tag: "alcohol", value: true })).toEqual({ ok: false, error: "Can’t log a future day" });
    expect(await entries()).toEqual([]);
    expect(await store.takeIntradayDirty()).toEqual([]);
  });

  it("rejects an unknown tag and malformed input", async () => {
    expect(await saveJournalEntry(c(), { day: "2026-10-01", tag: "nope", value: true })).toEqual({ ok: false, error: "Unknown tag: nope" });
    expect((await saveJournalEntry(c(), { day: "2026-13-01", tag: "alcohol", value: true })).ok).toBe(false);
    expect((await saveJournalEntry(c(), { day: "2026-02-31", tag: "alcohol", value: true })).ok).toBe(false);
    expect((await saveJournalEntry(c(), { day: "2026-10-01", tag: "alcohol", value: -1 })).ok).toBe(false);
    expect((await saveJournalEntry(c(), { day: "2026-10-01", tag: "alcohol", value: 1.5 })).ok).toBe(false);
    expect(await entries()).toEqual([]);
  });

  it("a repeat submit is idempotent; a changed answer updates the row", async () => {
    const e = { day: "2026-10-01", tag: "meditation", value: true };
    await saveJournalEntry(c(), e);
    await saveJournalEntry(c(), e);
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "meditation", value: 1 }]);
    await saveJournalEntry(c(), { ...e, value: false });
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "meditation", value: 0 }]);
  });

  it("null clears a saved answer back to unanswered, and is idempotent", async () => {
    await saveJournalEntry(c(), { day: "2026-10-01", tag: "alcohol", value: true });
    await saveJournalEntry(c(), { day: "2026-10-01", tag: "sauna", value: false });
    expect(await saveJournalEntry(c(), { day: "2026-10-01", tag: "alcohol", value: null })).toEqual({ ok: true, data: undefined });
    expect(await saveJournalEntry(c(), { day: "2026-10-01", tag: "alcohol", value: null })).toMatchObject({ ok: true });
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "sauna", value: 0 }]);
    expect(await saveJournalEntry(c(), { day: "2026-10-04", tag: "alcohol", value: null })).toMatchObject({ ok: false });
  });
});

describe("loadCheckIn", () => {
  it("returns the shown behaviours and the day's answers; refuses a future, malformed or too-old day", async () => {
    await saveJournalEntry(c(), { day: "2026-10-01", tag: "alcohol", value: true });
    const r = await loadCheckIn(q("2026-10-03"), "2026-10-01");
    expect(r.ok && r.data.checkIn).toMatchObject({ done: true, entries: { alcohol: 1 } });
    expect(r.ok && r.data.tags.some((t) => t.tag === "alcohol")).toBe(true);
    expect(await loadCheckIn(q("2026-10-03"), "2026-10-04")).toMatchObject({ ok: false });
    expect(await loadCheckIn(q("2026-10-03"), "nope")).toMatchObject({ ok: false });
    // Too far back: the sheet's day strip would run from that day to today.
    expect(await loadCheckIn(q("2026-10-03"), "2010-01-01")).toMatchObject({ ok: false });
  });
});

describe("addCustomTag", () => {
  it("stops at MAX_TAGS, so insights work per recompute stays bounded", async () => {
    const have = (await store.journalTags()).length;
    for (let i = have; i < MAX_TAGS; i++) expect((await addCustomTag(c(), { label: `Cap ${i}` })).ok).toBe(true);
    expect(await addCustomTag(c(), { label: "One more" })).toEqual({ ok: false, error: `Too many behaviours: the limit is ${MAX_TAGS}` });
  });

  it("validates the label and rejects duplicates", async () => {
    expect(await addCustomTag(c(), { label: "  Late  Workout! " })).toEqual({ ok: true, data: { tag: "late_workout" } });
    expect(await addCustomTag(c(), { label: "late workout" })).toEqual({ ok: false, error: "Tag already exists: late_workout" });
    expect(await addCustomTag(c(), { label: "Alcohol" })).toMatchObject({ ok: false });
    expect((await addCustomTag(c(), { label: "   " })).ok).toBe(false);
    expect((await addCustomTag(c(), { label: "!!!" })).ok).toBe(false);
    expect((await addCustomTag(c(), { label: "x".repeat(41) })).ok).toBe(false);
    expect(await saveJournalEntry(c(), { day: "2026-10-02", tag: "late_workout", value: true })).toMatchObject({ ok: true });
  });

  it("puts a new behaviour after every existing one", async () => {
    await addCustomTag(c(), { label: "Cold plunge" });
    await addCustomTag(c(), { label: "Late workout" });
    await addCustomTag(c(), { label: "Nap" });
    expect(await order((t) => !t.isDefault)).toEqual(["cold_plunge", "late_workout", "nap"]);
  });
});

describe("saveCheckIn", () => {
  it("saves each answer and stops at the first failure", async () => {
    expect(await saveCheckIn(c(), "2026-10-01", [{ tag: "alcohol", value: 2 }, { tag: "sauna", value: false }])).toEqual({ ok: true, data: undefined });
    expect(await saveCheckIn(c(), "2026-10-01", [{ tag: "nope", value: true }, { tag: "meditation", value: true }])).toEqual({ ok: false, error: "Unknown tag: nope" });
    expect(await entries()).toEqual([
      { day: "2026-10-01", tag: "alcohol", value: 2 },
      { day: "2026-10-01", tag: "sauna", value: 0 },
    ]);
  });
});

describe("saveBehaviors", () => {
  it("adds catalogue behaviours, hides the rest and keeps their answers", async () => {
    await saveJournalEntry(c(), { day: "2026-10-01", tag: "sauna", value: true });
    expect(await saveBehaviors(c(), { tags: ["alcohol", "caffeine"] })).toEqual({ ok: true, data: undefined });
    const tags = await store.journalTags();
    expect(tags.filter((t) => !t.hidden).map((t) => t.tag)).toEqual(["alcohol", "caffeine"]);
    expect(tags.find((t) => t.tag === "caffeine")).toMatchObject({ label: "Caffeine", isDefault: false });
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "sauna", value: 1 }]);
    const vm = await getBehaviours(q("2026-10-03"));
    expect(vm.tags.find((t) => t.tag === "sauna")).toMatchObject({ hidden: true, answers: 1 });
    expect(await saveBehaviors(c(), { tags: ["not_a_behaviour"] })).toEqual({ ok: false, error: "Unknown behaviour" });
  });
});

describe("logEntry", () => {
  beforeEach(() => {
    now = MORNING;
  });
  const rows = () => store.loggedEntries(0);

  it("stores locally", async () => {
    expect(await logEntry(c(), { kind: "water", ml: 250 })).toEqual({ ok: true, data: undefined });
    expect(await rows()).toMatchObject([{ type: "hydration-log", day: "2026-10-02", data: { ml: 250 } }]);
  });

  it("validates input, the time, and writes weight and body fat as two points", async () => {
    expect(await logEntry(c(), { kind: "water", ml: 0 })).toEqual({ ok: false, error: "At least 10 ml" });
    expect(await logEntry(c(), { kind: "mood", moods: [], valence: null })).toEqual({ ok: false, error: "Choose how you feel" });
    expect(await logEntry(c(), { kind: "weight", kg: 72.44, fatPct: null, at: "2026-10-02T12:00" })).toEqual({ ok: false, error: "Can’t log the future" });
    expect(await logEntry(c(), { kind: "weight", kg: 72.44, fatPct: null, at: "2026-10-02 08:00" })).toEqual({ ok: false, error: "Choose a time" });
    expect(await logEntry(c(), { kind: "weight", kg: 72.44, fatPct: null, at: "2026-10-02T25:00" })).toEqual({ ok: false, error: "Choose a time" });
    expect(await logEntry(c(), { kind: "weight", kg: 72.44, fatPct: 18.26, at: "2026-10-02T08:00" })).toMatchObject({ ok: true });
    expect((await rows()).map((r) => [r.type, r.data, r.ts])).toEqual([
      ["weight", { kg: 72.4 }, Date.parse("2026-10-02T02:30:00Z") / 1000],
      ["body-fat", { pct: 18.3 }, Date.parse("2026-10-02T02:30:00Z") / 1000],
    ]);
  });

  it("refuses cycle logging and cycle symptoms on a male profile, allows them on a female one", async () => {
    const period = { kind: "period", start: "2026-09-29", end: "2026-10-01", flow: "LIGHT" } as const;
    expect(await logEntry(c(), period)).toEqual({ ok: false, error: "Not available for this profile" });
    expect(await logEntry(c(), { kind: "ovulation", result: "POSITIVE" })).toMatchObject({ ok: false });
    expect(await logEntry(c(), { kind: "symptoms", symptoms: ["CRAMPS"] })).toMatchObject({ ok: false });
    expect(await rows()).toEqual([]);
    sex = "female";
    expect(await logEntry(c(), period)).toMatchObject({ ok: true });
    expect(await logEntry(c(), { kind: "period", start: "2026-10-01", end: "2026-09-30", flow: null })).toEqual({ ok: false, error: "The last day is before the first" });
    expect(await logEntry(c(), { kind: "period", start: "2026-09-01", end: "2026-09-20", flow: null })).toEqual({ ok: false, error: "A period is 15 days at most" });
    expect((await rows()).map((r) => r.type)).toEqual(["menstrual-period"]);
  });

  it("logs blood oxygen as a percentage between 70 and 100", async () => {
    expect(await logEntry(c(), { kind: "spo2", pct: 101 })).toEqual({ ok: false, error: "Between 70 and 100%" });
    expect(await logEntry(c(), { kind: "spo2", pct: 95.44, at: "2026-10-02T08:00" })).toMatchObject({ ok: true });
    expect((await rows()).map((r) => [r.type, r.data])).toEqual([["oxygen-saturation", { pct: 95.4 }]]);
  });

  it("food keeps a blank name as null", async () => {
    expect(await logEntry(c(), { kind: "food", name: "  ", meal: "LUNCH", kcal: 600, protein: 20, carbs: null, fat: null })).toMatchObject({ ok: true });
    expect((await rows())[0].data).toEqual({ name: null, meal: "LUNCH", kcal: 600, protein: 20, carbs: null, fat: null });
    expect(await logEntry(c(), { kind: "food", name: "x", meal: "LUNCH", kcal: 20_000, protein: null, carbs: null, fat: null })).toEqual({ ok: false, error: "At most 10,000 kcal" });
  });
});

describe("deleteLogEntry", () => {
  it("needs a valid id, then deletes", async () => {
    now = MORNING;
    await logEntry(c(), { kind: "water", ml: 250 });
    const { id } = (await store.loggedEntries(0))[0];
    expect(await deleteLogEntry(c(), { id: "nope" })).toMatchObject({ ok: false });
    expect(await deleteLogEntry(c(), { id })).toEqual({ ok: true, data: undefined });
    expect(await store.loggedEntries(0)).toEqual([]);
  });
});

