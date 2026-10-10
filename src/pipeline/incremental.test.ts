// Ported from pulse src/server/pipeline/incremental.test.ts ("a late night for day 200"), on F4: the 220-day seed with
// the main night of day 200 held back, recomputed, then restored and recomputed incrementally from the checkpoint.
import { expect, it } from "vitest";
import { scoreHashes } from "../testing/canonical";
import { loadF4 } from "../testing/fixtures";
import type { DailyMetricsPatch } from "../data/repos/daily";
import type { Segment, SleepSessionRow } from "../data/repos/sessions";
import { localMidnight } from "../time";
import { lastRun, type PipelineOptions, recompute, type RecoveryRow } from ".";
import { dump, firstDiff, loadSeed, memoryStore } from "./testing/memoryStore";

const camel = <T>(r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()), v])) as T;

it("a late night for day 200 then an incremental recompute equals F4's rows and hashes", async () => {
  const f4 = loadF4();
  const opts: PipelineOptions = { timeZone: f4.options.timeZone, profile: f4.options.profile };
  const { day } = f4.change;
  const session = camel<SleepSessionRow>(f4.change.session);
  const segments = f4.change.segments.map((g) => camel<Segment>(g));
  const metrics = camel<Omit<DailyMetricsPatch, "day" | "source">>(f4.change.metrics);
  const late = memoryStore();
  await loadSeed(late, { tables: f4.seed });
  expect((await late.daily.readMetrics()).length).toBe(220);

  // Hold back night 200: its session, stages and nightly metrics.
  expect(await late.sessions.pruneSleepSessions({ start: session.endTs, end: session.endTs + 1 }, [])).toEqual([day]);
  const cleared = Object.fromEntries(Object.keys(metrics).map((k) => [k, null]));
  await late.daily.upsertDailyMetrics([{ day, source: "seed", ...cleared }]);
  await recompute(late, opts);
  const held = (await late.scores.readDays(day, day))[0].recovery as RecoveryRow;
  expect(held.reason).toBe(f4.heldBackRecoveryReason);

  // The night syncs late: the source writes the rows (no HR changed, so nothing is marked dirty).
  await late.sessions.upsertSleepSessions([session]);
  await late.sessions.replaceSegments([session.id], segments);
  await late.daily.upsertDailyMetrics([{ day, source: "seed", ...metrics }]);
  await recompute(late, opts);
  // Only the days the night touches rerun stage 1: the morning it ended, and the evening before if it started then.
  expect(session.startTs < localMidnight(day, opts.timeZone)).toBe(f4.incremental.stage1Days.length === 2);
  expect(lastRun.stage1Days).toEqual(f4.incremental.stage1Days);
  // Stage 2 replayed from the checkpoint (31 days before the newest) rather than from day 0.
  expect(lastRun.stage2Days).toBe(f4.incremental.stage2Days);
  expect((await late.scores.readCheckpoint())?.day).toBe(f4.incremental.checkpointDay);

  const rows = await dump(late);
  expect(firstDiff(rows, f4)).toBeNull();
  expect(scoreHashes(rows)).toEqual(f4.hashes);
}, 120_000);
