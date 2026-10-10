// Ported from pulse src/server/pipeline/timezone.test.ts. A change of TZ moves every day's bounds; its own file so its two
// full recomputes run beside pipeline.test.ts.
import { expect, it } from "vitest";
import { loadF2 } from "../testing/fixtures";
import { lastRun, type PipelineOptions, recompute } from ".";
import { dump, loadSeed, memoryStore } from "./testing/memoryStore";

it("a time-zone change reruns stage 1 for every day and matches a from-scratch run in the new zone", async () => {
  const f2 = loadF2();
  const opts: PipelineOptions = { timeZone: f2.options.timeZone, profile: f2.options.profile };
  const utc = { ...opts, timeZone: "UTC" };
  const moved = memoryStore();
  await loadSeed(moved, f2);
  await recompute(moved, opts);
  await recompute(moved, utc);
  const rerun = lastRun.stage1Days;
  const scratch = moved.clone();
  // pulse deletes daily_scores, intraday_series and reports; clearSynced also drops the checkpoint and the (empty) dirty
  // marks, which a full fold ignores and rewrites.
  await scratch.scores.clearSynced();
  await scratch.series.clearSynced();
  await recompute(scratch, utc);
  const after = await dump(scratch);
  expect(rerun).toEqual(after.daily_scores.map((r) => r.day));
  const { daily_scores, intraday_series } = await dump(moved);
  expect(daily_scores).toEqual(after.daily_scores);
  expect(intraday_series).toEqual(after.intraday_series);
}, 120_000);
