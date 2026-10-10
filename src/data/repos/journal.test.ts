import { beforeEach, describe, expect, it } from "vitest";
import { testDb, writesOf } from "../testing";

let t: ReturnType<typeof testDb>;
beforeEach(() => {
  t = testDb();
});
const DEFAULTS = [{ tag: "alcohol", label: "Alcohol" }, { tag: "late_caffeine", label: "Late caffeine" }, { tag: "sauna", label: "Sauna" }];

describe("journal tags", () => {
  it("ensureDefaultTags inserts the missing ones in order and leaves existing rows alone", async () => {
    const { journal } = t.store;
    expect(await journal.ensureDefaultTags(DEFAULTS)).toBe(3);
    expect(await writesOf(t.sqlite, async () => expect(await journal.ensureDefaultTags(DEFAULTS)).toBe(0))).toBe(0);
    await journal.showOnly(["alcohol"]);
    expect(await journal.ensureDefaultTags([...DEFAULTS, { tag: "travel", label: "Travel" }])).toBe(1);
    const tags = await journal.tags();
    expect(tags.map((x) => [x.tag, x.isDefault, x.hidden])).toEqual([["alcohol", true, false], ["late_caffeine", true, true], ["sauna", true, true], ["travel", true, false]]);
    expect(tags.map((x) => x.seq)).toEqual([1, 2, 3, 4]);
  });

  it("addTag adds at the end of its group, then says exists or full", async () => {
    const { journal } = t.store;
    await journal.ensureDefaultTags(DEFAULTS);
    expect(await journal.addTag("cold_plunge", "Cold plunge", 5)).toBe("added");
    expect(await journal.addTag("cold_plunge", "Again", 5)).toBe("exists");
    expect(await journal.addTag("yoga", "Yoga", 5)).toBe("added");
    expect(await journal.addTag("reading", "Reading", 5)).toBe("full");
    expect(await journal.addTag("alcohol", "Alcohol", 5)).toBe("full"); // at the cap, as pulse answers
    const tags = await journal.tags();
    expect(tags.map((x) => x.tag)).toEqual(["alcohol", "late_caffeine", "sauna", "cold_plunge", "yoga"]);
    expect(tags.slice(3).map((x) => [x.position, x.seq, x.isDefault, x.hidden])).toEqual([[1, 4, false, false], [2, 5, false, false]]);
    expect(await journal.tagCounts()).toEqual({ total: 5, shown: 5 });
    expect(await journal.hasTag("yoga")).toBe(true);
    expect(await journal.hasTag("nope")).toBe(false);
    expect((await journal.tagKeys()).sort()).toEqual(["alcohol", "cold_plunge", "late_caffeine", "sauna", "yoga"]);
  });

  it("a custom tag sorts after the defaults whatever its seq (position first, then seq)", async () => {
    const { journal } = t.store;
    await journal.addTag("mine", "Mine", 60);
    await journal.ensureDefaultTags(DEFAULTS); // defaults arrive later: seq 2.., position 0
    expect((await journal.tags()).map((x) => x.tag)).toEqual(["alcohol", "late_caffeine", "sauna", "mine"]);
  });

  it("addTags adds catalogue tags the user lacks at the end; existing rows stay", async () => {
    const { journal } = t.store;
    await journal.ensureDefaultTags(DEFAULTS);
    await journal.addTags([{ tag: "sauna", label: "Renamed" }, { tag: "nap", label: "Nap" }, { tag: "walk", label: "Walk" }]);
    const tags = await journal.tags();
    expect(tags.map((x) => x.tag)).toEqual(["alcohol", "late_caffeine", "sauna", "nap", "walk"]);
    expect(tags[2].label).toBe("Sauna");
    expect(tags[3].isDefault).toBe(false);
  });

  it("showOnly shows the given tags and hides the rest, writing only tags that change", async () => {
    const { journal } = t.store;
    await journal.ensureDefaultTags(DEFAULTS);
    expect(await writesOf(t.sqlite, () => journal.showOnly(["alcohol", "late_caffeine", "sauna"]))).toBe(0);
    expect(await writesOf(t.sqlite, () => journal.showOnly(["alcohol"]))).toBe(2);
    expect(await journal.tagCounts()).toEqual({ total: 3, shown: 1 });
    expect(await writesOf(t.sqlite, () => journal.showOnly(["alcohol"]))).toBe(0);
    await journal.showOnly([]);
    expect(await journal.tagCounts()).toEqual({ total: 3, shown: 0 });
    await journal.showOnly(["sauna"]);
    expect((await journal.tags()).filter((x) => !x.hidden).map((x) => x.tag)).toEqual(["sauna"]);
  });
});

describe("journal answers", () => {
  it("saveEntry is diff-only and says whether anything changed", async () => {
    const { journal } = t.store;
    expect(await journal.saveEntry({ day: "2026-10-01", tag: "alcohol", value: 1, detail: null })).toBe(true);
    expect(await writesOf(t.sqlite, async () => expect(await journal.saveEntry({ day: "2026-10-01", tag: "alcohol", value: 1, detail: null })).toBe(false))).toBe(0);
    expect(await journal.saveEntry({ day: "2026-10-01", tag: "alcohol", value: 1, detail: 120 })).toBe(true);
    expect(await journal.saveEntry({ day: "2026-10-01", tag: "alcohol", value: 0, detail: null })).toBe(true); // a no is an answer
    expect(await journal.entriesBetween("2026-10-01", "2026-10-01")).toEqual([{ day: "2026-10-01", tag: "alcohol", value: 0, detail: null }]);
  });

  it("reads by range ordered by day then tag, days with answers, scoring order in bytes, count, delete", async () => {
    const { journal } = t.store;
    for (const [day, tag] of [["2026-10-02", "b"], ["2026-10-01", "z"], ["2026-10-01", "B"], ["2026-10-03", "a"], ["2026-10-02", "a"]]) await journal.saveEntry({ day, tag, value: 1, detail: null });
    expect((await journal.entriesBetween("2026-10-01", "2026-10-02")).map((e) => `${e.day} ${e.tag}`)).toEqual(["2026-10-01 B", "2026-10-01 z", "2026-10-02 a", "2026-10-02 b"]);
    expect(await journal.entryDays("2026-10-02", "2026-10-09")).toEqual(["2026-10-02", "2026-10-03"]);
    expect((await journal.entriesForScoring()).map((e) => e.tag)).toEqual(["B", "z", "a", "b", "a"]);
    expect(await journal.answerCount()).toBe(5);
    await journal.deleteEntry("2026-10-01", "z");
    await journal.deleteEntry("2026-10-01", "nope");
    expect(await journal.answerCount()).toBe(4);
  });

  it("entriesWithLabels joins the label, falling back to the tag", async () => {
    const { journal } = t.store;
    await journal.ensureDefaultTags(DEFAULTS);
    await journal.saveEntry({ day: "2026-10-01", tag: "sauna", value: 1, detail: 15 });
    await journal.saveEntry({ day: "2026-10-01", tag: "ghost", value: 0, detail: null });
    expect(await journal.entriesWithLabels()).toEqual([
      { day: "2026-10-01", tag: "ghost", label: "ghost", value: 0, detail: null },
      { day: "2026-10-01", tag: "sauna", label: "Sauna", value: 1, detail: 15 },
    ]);
  });
});

describe("journal notes", () => {
  it("saves, repeats without writing, updates, lists by day and deletes", async () => {
    const { journal } = t.store;
    expect(await journal.noteOn("2026-10-01")).toBeNull();
    await journal.saveNote("2026-10-02", "slept badly");
    await journal.saveNote("2026-10-01", "ok");
    expect(await writesOf(t.sqlite, () => journal.saveNote("2026-10-01", "ok"))).toBe(0);
    await journal.saveNote("2026-10-01", "great");
    expect(await journal.noteOn("2026-10-01")).toBe("great");
    expect(await journal.notes()).toEqual([{ day: "2026-10-01", text: "great" }, { day: "2026-10-02", text: "slept badly" }]);
    await journal.deleteNote("2026-10-01");
    expect(await journal.noteOn("2026-10-01")).toBeNull();
  });
});
