// Ported from pulse src/server/pipeline/pipeline.test.ts and golden.test.ts, on the F2 seed. pulse grows its database
// with the demo generator (seedPull at a later `now`); here the earlier database is F2 cut at an instant, and the
// later one is F2 itself, whose full recompute is F3.
import { beforeAll, describe, expect, it } from "vitest";
import { scoreHashes, type ScoreRows } from "../testing/canonical";
import { type F2, loadF2, loadF3, type Tables } from "../testing/fixtures";
import { addDays, localMidnight } from "../time";
import { lastRun, needsRecompute, type PipelineOptions, recompute, SCORING_VERSION } from ".";
import { load } from "./data";
import { stage1 } from "./stage1";
import { dump, firstDiff, loadSeed, type MemoryStore, memoryStore } from "./testing/memoryStore";

const f2 = loadF2();
const f3 = loadF3();
const OPTS: PipelineOptions = { timeZone: f2.options.timeZone, profile: f2.options.profile };
const FIRST = f2.tables.daily_metrics[0].day as string;
const dayAt = (i: number) => addDays(FIRST, i);

/** The store (any implementation) filled from a seed; swap this one line for stream A's SQLite store. */
const fresh = async (seed: { tables: Tables }) => {
  const store = memoryStore();
  await loadSeed(store, seed);
  return store;
};
const copy = (store: MemoryStore) => store.clone();

/** F2 as it stood at local noon on `day`: no row or sample from after it, and no daily row for a later day. */
function asOf(f: F2, day: string): { tables: Tables } {
  const t = localMidnight(day, OPTS.timeZone) + 12 * 3600;
  const { tables } = f;
  const sessions = tables.sleep_sessions.filter((r) => (r.end_ts as number) <= t);
  const kept = new Set(sessions.map((r) => r.id));
  const samples = (rows: Tables[string]) =>
    rows.flatMap((r) => {
      const base = (r.bucket as number) * 86_400;
      const n = (r.offsets as number[]).filter((o) => base + o < t).length;
      return n ? [{ ...r, offsets: (r.offsets as number[]).slice(0, n), values: (r.values as number[]).slice(0, n) }] : [];
    });
  return {
    tables: {
      ...tables,
      daily_metrics: tables.daily_metrics.filter((r) => (r.day as string) <= day),
      sleep_sessions: sessions,
      sleep_segments: tables.sleep_segments.filter((r) => kept.has(r.session_id)),
      exercises: tables.exercises.filter((r) => (r.end_ts as number) <= t),
      hr_days: samples(tables.hr_days),
      steps_days: samples(tables.steps_days),
      journal_entries: tables.journal_entries.filter((r) => (r.day as string) <= day),
      intraday_dirty: tables.intraday_dirty.filter((r) => (r.day as string) <= day),
    },
  };
}

const before = (rows: ScoreRows, day: string) => rows.daily_scores.filter((r) => (r.day as string) < day);
const row = (rows: ScoreRows, day: string) => rows.daily_scores.find((r) => r.day === day)!;
async function setVersion(store: MemoryStore, v: number) {
  const impact = new Map((await store.scores.readStage2Inputs()).map((r) => [r.day, r.impact!]));
  const rows = await store.scores.readDays("0000-01-01", "9999-12-31");
  await store.scores.writeStage2(
    rows.map((r) => ({
      day: r.day,
      scoringVersion: v,
      recovery: r.recovery!,
      sleep: r.sleep!,
      trainingLoad: r.trainingLoad!,
      strainTarget: r.strainTarget!,
      sleepPlanner: r.sleepPlanner!,
      energyBank: r.energyBank!,
      stress: r.stress!,
      healthMonitor: r.healthMonitor!,
      healthspan: r.healthspan!,
      fitness: r.fitness!,
      journalImpact: impact.get(r.day)!,
    })),
  );
}

let db: MemoryStore;
let scored: ScoreRows;
beforeAll(async () => {
  db = await fresh(f2);
  await recompute(db, OPTS);
  scored = await dump(db);
});

describe("parity with pulse (F3)", () => {
  it("a full recompute of F2 hashes equal to F3 on every key", () => {
    expect(firstDiff(scored, f3)).toBeNull();
    expect(scoreHashes(scored)).toEqual(f3.hashes);
    expect(Object.keys(f3.hashes)).toHaveLength(21);
  });
});

describe("recompute on the 180-day seed", () => {
  it("scores every day once, under the current scoring version", async () => {
    expect(scored.daily_scores).toHaveLength(180);
    expect(scored.daily_scores[0].day).toBe(dayAt(0));
    expect([...new Set(scored.daily_scores.map((r) => r.scoring_version))]).toEqual([SCORING_VERSION]);
  });

  it("is deterministic: a second run reads no HR, writes nothing and leaves daily_scores byte-identical", async () => {
    const w = db.writes;
    await recompute(db, OPTS);
    expect(lastRun.stage1Days).toEqual([]);
    expect(db.writes).toBe(w);
    expect(await dump(db)).toEqual(scored);
  });

  it("matches a from-scratch run on an identical database", async () => {
    const other = await fresh(f2);
    await recompute(other, OPTS);
    expect(await dump(other)).toEqual(scored);
  });

  it("a scoring-version change recomputes every day exactly once", async () => {
    const bumped = copy(db);
    await setVersion(bumped, SCORING_VERSION - 1);
    await recompute(bumped, OPTS);
    expect(lastRun.stage1Days).toEqual(scored.daily_scores.map((r) => r.day));
    expect(new Set(lastRun.stage1Days).size).toBe(180);
    const w = bumped.writes;
    await recompute(bumped, OPTS);
    expect(lastRun.stage1Days).toEqual([]);
    expect(bumped.writes).toBe(w);
    expect(await dump(bumped)).toEqual(scored);
  });

  it("is causal: with 30 more days, every earlier day is unchanged", async () => {
    const day = dayAt(150);
    const earlier = await fresh(asOf(f2, day));
    await recompute(earlier, OPTS);
    const early = await dump(earlier);
    expect(early.daily_scores.at(-1)!.day).toBe(day);
    expect(before(early, day)).toHaveLength(150);
    expect(before(scored, day)).toEqual(before(early, day));
    // The day itself gains the rest of the day, so its strain moves; its recovery does not. Tomorrow's forecast inside
    // it does: it reads today's whole Effort (scores.ts forecastOf, `todayEffort`), 0 at noon and 54.45 by night here.
    const strip = (r: ScoreRows["daily_scores"][number]) => ({ ...(r.recovery as object), forecast: null });
    expect((row(early, day).strain as { effort: number }).effort).not.toBe((row(scored, day).strain as { effort: number }).effort);
    expect(strip(row(scored, day))).toEqual(strip(row(early, day)));
  });
});

describe("needsRecompute", () => {
  it("is false after a full recompute", async () => {
    expect(await needsRecompute(db)).toBe(false);
  });

  it("is true with a dirty day", async () => {
    const dirty = copy(db);
    await dirty.scores.markDirty([dayAt(10)]);
    expect(await needsRecompute(dirty)).toBe(true);
  });

  it("is true when a row carries another scoring version", async () => {
    const old = copy(db);
    await setVersion(old, SCORING_VERSION - 1);
    expect(await needsRecompute(old)).toBe(true);
  });

  it("is false on an empty database", async () => {
    expect(await needsRecompute(memoryStore())).toBe(false);
  });

  // Failure injection: stage 1 commits, then the process dies before stage 2 does.
  const crashBetweenStages = async (d: MemoryStore) => stage1(d, (await load(d, OPTS))!, OPTS);

  it("stays true after a crash between the stages, and the next run catches up", async () => {
    // 30 days of new rows and samples sync onto the database of day 150, marking their days dirty.
    const day = dayAt(150);
    const later = await fresh(asOf(f2, day));
    await recompute(later, OPTS);
    await loadSeed(later, { tables: { ...f2.tables, intraday_dirty: f2.tables.intraday_dirty.filter((r) => (r.day as string) >= day) } });

    await crashBetweenStages(later);
    expect(await needsRecompute(later)).toBe(true);
    await recompute(later, OPTS);
    expect(await needsRecompute(later)).toBe(false);
    expect(await dump(later)).toEqual(scored);
  });

  it("a scoring-version change survives a crash between the stages", async () => {
    const bumped = copy(db);
    await setVersion(bumped, SCORING_VERSION - 1);
    await crashBetweenStages(bumped);
    expect(await needsRecompute(bumped)).toBe(true);
    await recompute(bumped, OPTS);
    expect(await dump(bumped)).toEqual(scored);
  });
});
