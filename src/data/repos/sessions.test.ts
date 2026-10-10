import { beforeEach, describe, expect, it } from "vitest";
import { testDb, writesOf } from "../testing";
import type { ExerciseWrite, Segment, SleepSessionRow } from "./sessions";

let t: ReturnType<typeof testDb>;
beforeEach(() => {
  t = testDb();
});
const sess = (id: string, startTs: number, over: Partial<SleepSessionRow> = {}): SleepSessionRow => ({
  id, day: "2026-10-02", startTs, endTs: startTs + 8 * 3600, isMain: true, processed: true, stagesStatus: "ok", asleepMin: 420, awakeMin: 30, deepMin: 90, lightMin: 250, remMin: 80, source: "google", ...over,
});
const seg = (sessionId: string, startTs: number, endTs: number, stage: Segment["stage"]): Segment => ({ sessionId, startTs, endTs, stage });
const ex = (id: string, startTs: number, over: Partial<ExerciseWrite> = {}): ExerciseWrite => ({ id, day: "2026-10-02", startTs, endTs: startTs + 1800, type: "RUNNING", name: null, calories: 300, distanceM: 5000, source: "google", ...over });

describe("sleep sessions", () => {
  it("round trips; orders by start time then id in byte order; drops `source` from the pipeline's read", async () => {
    const { sessions } = t.store;
    await sessions.upsertSleepSessions([sess("b", 100), sess("B", 100), sess("a", 50), sess("nap", 9999, { isMain: false })]);
    const rows = await sessions.readSessions();
    expect(rows.map((r) => r.id)).toEqual(["a", "B", "b", "nap"]); // "B" (0x42) sorts before "b" (0x62)
    expect(rows[0]).toMatchObject({ isMain: true, processed: true, asleepMin: 420 });
    expect(rows[0]).not.toHaveProperty("source");
    expect(rows[3].isMain).toBe(false);
    expect(await sessions.sessionById("a")).toMatchObject({ id: "a", source: "google" });
    expect(await sessions.sessionById("zzz")).toBeNull();
  });

  it("returns the ids inserted or changed; a repeat writes nothing", async () => {
    const { sessions } = t.store;
    const rows = [sess("a", 50), sess("b", 100)];
    expect((await sessions.upsertSleepSessions(rows)).sort()).toEqual(["a", "b"]);
    expect(await writesOf(t.sqlite, async () => expect(await sessions.upsertSleepSessions(rows)).toEqual([]))).toBe(0);
    expect(await sessions.upsertSleepSessions([rows[0], sess("b", 100, { deepMin: 95 })])).toEqual(["b"]);
    expect(await sessions.upsertSleepSessions([sess("a", 50, { stagesStatus: null })])).toEqual(["a"]);
  });
});

describe("segments", () => {
  beforeEach(async () => {
    await t.store.sessions.upsertSleepSessions([sess("a", 0), sess("b", 100_000)]);
  });

  it("replaces only the sessions whose segments differ, as one ordered list", async () => {
    const { sessions } = t.store;
    const next = [seg("a", 0, 60, "light"), seg("a", 60, 120, "deep"), seg("b", 100_000, 100_060, "rem")];
    expect((await sessions.replaceSegments(["a", "b"], next)).sort()).toEqual(["a", "b"]);
    expect(await sessions.segmentsOf("a")).toEqual([seg("a", 0, 60, "light"), seg("a", 60, 120, "deep")]);
    expect(await writesOf(t.sqlite, async () => expect(await sessions.replaceSegments(["a", "b"], [...next].reverse())).toEqual([]))).toBe(0);
    // only b changes
    expect(await sessions.replaceSegments(["a", "b"], [next[0], next[1], seg("b", 100_000, 100_060, "awake")])).toEqual(["b"]);
    expect((await sessions.readSegments()).map((s) => s.stage)).toEqual(["light", "deep", "awake"]);
    // a listed session with no segments in `next` loses its segments
    expect(await sessions.replaceSegments(["a"], [])).toEqual(["a"]);
    expect(await sessions.segmentsOf("a")).toEqual([]);
    expect(await sessions.segmentsOf("b")).toHaveLength(1);
  });

  it("nothing listed, nothing done", async () => {
    expect(await t.store.sessions.replaceSegments([], [seg("a", 0, 1, "deep")])).toEqual([]);
    expect(await t.store.sessions.readSegments()).toEqual([]);
  });
});

describe("prune", () => {
  it("deletes sessions in the window (by end_ts) that Google did not return, with their segments, and returns their days", async () => {
    const { sessions } = t.store;
    await sessions.upsertSleepSessions([sess("keep", 0, { day: "2026-10-01" }), sess("gone", 40_000, { day: "2026-10-02" }), sess("outside", 1_000_000, { day: "2026-10-20" })]);
    await sessions.replaceSegments(["gone", "keep"], [seg("gone", 40_000, 40_060, "deep"), seg("keep", 0, 60, "light")]);
    const win = { start: 0, end: 500_000 };
    expect(await sessions.pruneSleepSessions(win, ["keep"])).toEqual(["2026-10-02"]);
    expect((await sessions.readSessions()).map((s) => s.id)).toEqual(["keep", "outside"]);
    expect((await sessions.readSegments()).map((s) => s.sessionId)).toEqual(["keep"]);
    expect(await writesOf(t.sqlite, async () => expect(await sessions.pruneSleepSessions(win, ["keep"])).toEqual([]))).toBe(0);
  });

  it("deletes exercises by start_ts", async () => {
    const { sessions } = t.store;
    await sessions.upsertExercises([ex("a", 100), ex("b", 200, { day: "2026-10-03" }), ex("c", 9000)]);
    expect(await sessions.pruneExercises({ start: 0, end: 1000 }, ["a"])).toEqual(["2026-10-03"]);
    expect((await sessions.readExercises()).map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("exercises", () => {
  it("upserts diff-only and reads in the shapes the pipeline and queries want", async () => {
    const { sessions } = t.store;
    const rows = [ex("b", 200), ex("a", 100, { name: "Morning run", distanceM: null }), ex("c", 50, { day: "2026-10-01" })];
    expect((await sessions.upsertExercises(rows)).sort()).toEqual(["a", "b", "c"]);
    expect(await writesOf(t.sqlite, async () => expect(await sessions.upsertExercises(rows)).toEqual([]))).toBe(0);
    expect(await sessions.upsertExercises([ex("b", 200, { calories: 310 })])).toEqual(["b"]);
    const pipe = await sessions.readExercises();
    expect(pipe.map((e) => e.id)).toEqual(["c", "a", "b"]);
    expect(pipe[1]).toEqual({ id: "a", day: "2026-10-02", startTs: 100, endTs: 1900, type: "RUNNING", name: "Morning run", calories: 300 }); // no distanceM, no source
    expect((await sessions.exercisesBetween("2026-10-02", "2026-10-02")).map((e) => e.id)).toEqual(["a", "b"]);
    expect(await sessions.exerciseById("a")).toMatchObject({ distanceM: null, name: "Morning run" });
    expect(await sessions.exerciseById("x")).toBeNull();
    expect(await sessions.hasExerciseBefore("2026-10-02")).toBe(true);
    expect(await sessions.hasExerciseBefore("2026-10-01")).toBe(false);
  });

  it("clearSynced empties sessions, segments and exercises", async () => {
    const { sessions } = t.store;
    await sessions.upsertSleepSessions([sess("a", 0)]);
    await sessions.replaceSegments(["a"], [seg("a", 0, 1, "deep")]);
    await sessions.upsertExercises([ex("e", 1)]);
    await sessions.clearSynced();
    expect([(await sessions.readSessions()).length, (await sessions.readSegments()).length, (await sessions.readExercises()).length]).toEqual([0, 0, 0]);
  });
});
