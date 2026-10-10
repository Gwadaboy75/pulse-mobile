import { describe, expect, it } from "vitest";
import { testDb, testStore } from "../testing";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Store.transaction", () => {
  it("commits what the callback wrote across repositories, and returns its result", async () => {
    const { store, sqlite } = testDb();
    const out = await store.transaction(async (tx) => {
      await tx.scores.markDirty(["2026-10-01"]);
      await sleep(5); // an async gap inside the transaction
      await tx.settings.setSyncState("steps", { syncedThrough: 5 });
      expect(sqlite.inTransaction).toBe(true);
      return 42;
    });
    expect(out).toBe(42);
    expect(sqlite.inTransaction).toBe(false);
    expect(await store.scores.dirtyDays()).toEqual(["2026-10-01"]);
    expect((await store.settings.getSyncState("steps"))?.syncedThrough).toBe(5);
  });

  it("a rejected callback rolls everything back and rethrows its error", async () => {
    const { store, sqlite } = testDb();
    await store.scores.markDirty(["2026-09-01"]);
    await expect(
      store.transaction(async (tx) => {
        await tx.scores.markDirty(["2026-10-01"]);
        await tx.samples.writeSamples("hr", [{ ts: 100, v: 60 }]);
        await sleep(1);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(sqlite.inTransaction).toBe(false);
    expect(await store.scores.dirtyDays()).toEqual(["2026-09-01"]);
    expect(await store.samples.hasHr()).toBe(false);
  });

  it("a rollback does not poison the next transaction", async () => {
    const store = testStore();
    await expect(store.transaction(async () => Promise.reject(new Error("first")))).rejects.toThrow("first");
    await store.transaction((tx) => tx.scores.markDirty(["2026-10-01"]));
    expect(await store.scores.dirtyDays()).toEqual(["2026-10-01"]);
  });

  it("two transactions started together do not interleave: the second begins after the first has committed", async () => {
    const { store, sqlite } = testDb();
    const log: string[] = [];
    const a = store.transaction(async (tx) => {
      log.push("a start");
      await tx.scores.markDirty(["a1"]);
      await sleep(20);
      await tx.scores.markDirty(["a2"]);
      log.push("a end");
    });
    const b = store.transaction(async (tx) => {
      log.push(`b start (a's rows: ${(await tx.scores.dirtyDays()).join(",")})`);
      expect(sqlite.inTransaction).toBe(true);
      await tx.scores.markDirty(["b1"]);
      log.push("b end");
    });
    await Promise.all([a, b]);
    expect(log).toEqual(["a start", "a end", "b start (a's rows: a1,a2)", "b end"]);
    expect(await store.scores.dirtyDays()).toEqual(["a1", "a2", "b1"]);
  });

  it("a failed transaction does not stop the queue behind it", async () => {
    const store = testStore();
    const a = store.transaction(async (tx) => {
      await tx.scores.markDirty(["a"]);
      throw new Error("a failed");
    });
    const b = store.transaction((tx) => tx.scores.markDirty(["b"]));
    await expect(a).rejects.toThrow("a failed");
    await b;
    expect(await store.scores.dirtyDays()).toEqual(["b"]);
  });

  it("repository methods that write several statements (savepoints) nest inside a transaction and roll back with it", async () => {
    const store = testStore();
    await expect(
      store.transaction(async (tx) => {
        await tx.settings.saveDashboard(["a", "b"]);
        await tx.samples.mergeSamples("hr", { start: 0, end: 100 }, new Map([[5, 60]]), "replace");
        throw new Error("undo");
      }),
    ).rejects.toThrow("undo");
    expect(await store.settings.dashboardKeys()).toEqual([]);
    expect(await store.samples.hasHr()).toBe(false);
  });

  it("a failing multi-statement method undoes its own partial work, outside any transaction", async () => {
    const { store, sqlite } = testDb();
    await store.sessions.upsertSleepSessions([{ id: "a", day: "d", startTs: 0, endTs: 1, isMain: true, processed: true, stagesStatus: null, asleepMin: null, awakeMin: null, deepMin: null, lightMin: null, remMin: null, source: "g" }]);
    // the second segment repeats the first's (session, start): the insert fails after the delete
    const bad = [{ sessionId: "a", startTs: 0, endTs: 1, stage: "deep" as const }, { sessionId: "a", startTs: 0, endTs: 2, stage: "light" as const }];
    await expect(store.sessions.replaceSegments(["a"], bad)).rejects.toThrow();
    expect(sqlite.inTransaction).toBe(false);
    expect(await store.sessions.readSegments()).toEqual([]);
    await store.sessions.replaceSegments(["a"], [bad[0]]);
    await expect(store.sessions.replaceSegments(["a"], bad)).rejects.toThrow();
    expect(await store.sessions.readSegments()).toEqual([bad[0]]); // the old segments survived
  });
});
