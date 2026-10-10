// F3 on the SQLite repositories: the same full recompute as pipeline.test.ts, which runs on the in-memory store, so the
// parity holds on the storage the app ships with. A second run must write nothing.
import { expect, it } from "vitest";
import { testDb, writesOf } from "../data/testing";
import { scoreHashes } from "../testing/canonical";
import { loadF2, loadF3 } from "../testing/fixtures";
import { lastRun, type PipelineOptions, recompute } from ".";
import { dump, firstDiff, loadSeed } from "./testing/memoryStore";

it("a full recompute of F2 on SQLite equals F3, and a second run writes nothing", async () => {
  const f2 = loadF2();
  const f3 = loadF3();
  const opts: PipelineOptions = { timeZone: f2.options.timeZone, profile: f2.options.profile };
  const { sqlite, store } = testDb();
  await loadSeed(store, f2);
  await recompute(store, opts);
  const rows = await dump(store);
  expect(firstDiff(rows, f3)).toBeNull();
  expect(scoreHashes(rows)).toEqual(f3.hashes);

  expect(await writesOf(sqlite, () => recompute(store, opts))).toBe(0);
  expect(lastRun.stage1Days).toEqual([]);
}, 120_000);
