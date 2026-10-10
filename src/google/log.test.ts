// Ported from pulse log.test.ts: the Google parts (logAccess, saveEntries, deleteEntry, importEntries, pruneEntries) and
// logging.ts's write path. Dropped, because they are repository reads (logRepo) or per-user: entriesOnDay, entriesOn,
// waterOn, totalsBetween, "per user". rewindSync is `settings.rewindSyncCursor`, checked through logEntries.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../data/repos";
import { deleteEntry, IMPORT_GRACE_S, importEntries, logAccess, PRUNE_CHECKS, pruneEntries, saveEntries, type LogWriter, type PointCheck } from "./log";
import { LOG_TYPES, scopeUrl } from "./logTypes";
import { LOG_MESSAGE, logEntries } from "./logging";
import type { MappedEntry } from "./map";
import { GoogleError, SCOPES } from "./oauth";
import { freshStore } from "./testing/store";

const TZ = "Asia/Kolkata";
const T = Date.parse("2026-10-02T06:00:00Z") / 1000; // Oct 2, 11:30 local
const NAME = "users/1/dataTypes/moods/dataPoints/p1";

let store: Store;
beforeEach(() => {
  store = freshStore();
});

const fake = (o: Partial<LogWriter> = {}) => ({ create: vi.fn(async () => NAME), batchDelete: vi.fn(async () => {}), exists: vi.fn(async () => true), ...o }) satisfies LogWriter;
const grant = (scopes: string[], revokedAt: number | null = null) => store.settings.set("google.grant", { scope: scopes.join(" "), revokedAt, updatedAt: T });
const all = async () => (await Promise.all(LOG_TYPES.map((t) => store.log.heldEntries(t, 0, 2 ** 40)))).flat();

describe("logAccess", () => {
  it("not connected without a grant", async () => {
    expect((await logAccess(store)).moods).toBe("not_connected");
  });

  it("an older grant writes water and food (nutrition.writeonly) but needs a reconnect for the rest", async () => {
    await grant([scopeUrl("hydration-log")]);
    const a = await logAccess(store);
    expect([a["hydration-log"], a["nutrition-log"], a.weight, a.moods, a.symptoms, a["menstrual-period"]]).toEqual(["ok", "ok", "reconnect", "reconnect", "reconnect", "reconnect"]);
  });

  it("a revoked grant needs a reconnect", async () => {
    await grant([scopeUrl("moods")], T);
    expect((await logAccess(store)).moods).toBe("reconnect");
  });

  it("the full scope list covers every type", async () => {
    await grant(SCOPES);
    expect(Object.values(await logAccess(store))).toEqual(LOG_TYPES.map(() => "ok"));
  });
});

describe("saveEntries / deleteEntry", () => {
  it("writes to Google, stores the name, and deletes at Google then here", async () => {
    const w = fake();
    expect(await saveEntries(store, [{ type: "moods", ts: T, data: { moods: ["CALM"], valence: "PLEASANT" } }], { tz: TZ, writer: w, now: T })).toEqual({ ok: true });
    expect(w.create).toHaveBeenCalledWith("moods", { moods: expect.objectContaining({ moods: ["CALM"], valences: ["PLEASANT"] }) });
    const [row] = await all();
    expect(row).toMatchObject({ type: "moods", ts: T, day: "2026-10-02", googleName: NAME, source: "pulse", data: { moods: ["CALM"], valence: "PLEASANT" } });

    expect(await deleteEntry(store, row.id, w)).toEqual({ ok: true, type: "moods", day: "2026-10-02" });
    expect(w.batchDelete).toHaveBeenCalledWith("moods", [NAME]);
    expect(await all()).toEqual([]);
  });

  it("no writer keeps entries locally only", async () => {
    await saveEntries(store, [{ type: "symptoms", ts: T, data: { symptoms: ["HEADACHE"] } }], { tz: TZ, writer: null, now: T });
    expect((await all())[0].googleName).toBeNull();
  });

  it("a 403 asks for a reconnect and stores nothing; other Google errors fail softly", async () => {
    const denied = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await saveEntries(store, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: denied, now: T })).toEqual({
      ok: false,
      reason: "reconnect",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("http_503", 503))) });
    expect(await saveEntries(store, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: down, now: T })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(await all()).toEqual([]);
  });

  it("a revoked grant (auth_revoked from the client) asks for a reconnect too", async () => {
    const revoked = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("auth_revoked", 401))) });
    expect(await saveEntries(store, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: revoked, now: T })).toEqual({ ok: false, reason: "reconnect" });
  });

  it("a delete Google no longer knows still deletes here; a failing one keeps the row", async () => {
    await saveEntries(store, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: fake(), now: T });
    const id = (await all())[0].id;
    const denied = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await deleteEntry(store, id, denied)).toEqual({ ok: false, reason: "reconnect" });
    expect(await all()).toHaveLength(1);
    const gone = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("NOT_FOUND", 404))) });
    expect(await deleteEntry(store, id, gone)).toEqual({ ok: true, type: "moods", day: "2026-10-02" });
    expect(await all()).toEqual([]);
  });
});

describe("importEntries", () => {
  const WIN: { from: number; to: number; now: number; check: PointCheck } = { from: T - 14 * 86_400, to: T + 3600, now: T + 3600, check: async () => false };
  /** One sync's worth: import, then prune what Google confirms gone. */
  const run = async (type: Parameters<typeof importEntries>[1], entries: MappedEntry[], complete = true, o = WIN) => {
    const r = await importEntries(store, type, { entries, complete }, o);
    const p = await pruneEntries(store, r.missing, o.check);
    if (p.error) throw p.error;
    return r.changed || p.deleted > 0;
  };
  const pt = (id: string, ts: number, ml: number): MappedEntry => ({ name: `users/9/dataTypes/hydration-log/dataPoints/${id}`, ts, day: "2026-10-02", data: { ml } });
  const water = (entries: MappedEntry[], complete = true, o = WIN) => run("hydration-log", entries, complete, o);

  it("brings another app's entries home as google entries, once", async () => {
    expect(await water([pt("a", T, 300)])).toBe(true);
    expect(await water([pt("a", T, 300)])).toBe(false);
    expect(await all()).toMatchObject([{ type: "hydration-log", ts: T, day: "2026-10-02", data: { ml: 300 }, source: "google", googleName: expect.stringContaining("/a") }]);
  });

  it("matches Pulse's own entries by point id whatever the user part of the name, and takes Google's edits", async () => {
    await saveEntries(store, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: fake({ create: vi.fn(async () => "users/me/dataTypes/hydration-log/dataPoints/a") }), now: T });
    expect(await water([pt("a", T, 250)])).toBe(false);
    expect(await water([pt("a", T + 60, 500)])).toBe(true);
    expect(await all()).toMatchObject([{ ts: T + 60, data: { ml: 500 }, source: "pulse" }]);
  });

  it("names a Pulse entry whose write did not report a name, instead of importing it twice", async () => {
    await saveEntries(store, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: fake({ create: vi.fn(async () => null) as never }), now: T });
    await water([pt("a", T, 250)]);
    expect(await all()).toMatchObject([{ source: "pulse", googleName: expect.stringContaining("/a") }]);
  });

  it("deletes what Google no longer returns, but not a fresh write, an unnamed entry or after an unreadable page", async () => {
    await water([pt("a", T, 300), pt("b", T + 1, 400)]);
    await saveEntries(store, [{ type: "hydration-log", ts: T + 2, data: { ml: 100 } }], { tz: TZ, writer: fake({ create: vi.fn(async () => "users/me/dataTypes/hydration-log/dataPoints/c") }), now: WIN.now - 60 });
    await saveEntries(store, [{ type: "hydration-log", ts: T + 3, data: { ml: 50 } }], { tz: TZ, writer: null, now: T });
    expect(await water([pt("a", T, 300)], false)).toBe(false);
    expect(await all()).toHaveLength(4);
    expect(await water([pt("a", T, 300)])).toBe(true);
    expect((await all()).map((r) => (r.data as { ml: number }).ml).sort((x, y) => x - y)).toEqual([50, 100, 300]);
    await water([pt("a", T, 300)], true, { ...WIN, now: WIN.now + IMPORT_GRACE_S });
    expect((await all()).map((r) => (r.data as { ml: number }).ml).sort((x, y) => x - y)).toEqual([50, 300]);
  });

  it("keeps a missing entry Google still answers for: a short page never clears the log", async () => {
    await water([pt("a", T, 300), pt("b", T + 1, 400)]);
    const check = vi.fn(async () => true);
    expect(await water([], true, { ...WIN, check })).toBe(false);
    expect(check).toHaveBeenCalledTimes(2);
    expect(await all()).toHaveLength(2);
  });

  it("a read-back error keeps the entry, never blocks new ones, and is reported", async () => {
    await water([pt("a", T, 300)]);
    const failing = async () => Promise.reject(new GoogleError("http_503", 503));
    const r = await importEntries(store, "hydration-log", { entries: [pt("b", T + 1, 400)], complete: true }, WIN);
    expect(await pruneEntries(store, r.missing, failing)).toMatchObject({ deleted: 0, error: expect.any(GoogleError) });
    expect(await all()).toHaveLength(2);
  });

  it("spends at most PRUNE_CHECKS read-backs a run", async () => {
    await water(Array.from({ length: PRUNE_CHECKS + 5 }, (_, i) => pt(`m${i}`, T - i, 100)));
    const check = vi.fn(async () => false);
    await water([], true, { ...WIN, check });
    expect(check).toHaveBeenCalledTimes(PRUNE_CHECKS);
    expect(await all()).toHaveLength(5);
  });

  it("takes an optional 0 g that Google drops as the same food", async () => {
    const food = (fat: number | null): MappedEntry => ({ name: "users/9/dataTypes/nutrition-log/dataPoints/f", ts: T, day: "2026-10-02", data: { name: "Tea", meal: "SNACK", kcal: 30, protein: null, carbs: 7, fat } });
    await saveEntries(store, [{ type: "nutrition-log", ts: T, data: food(0).data }], { tz: TZ, writer: fake({ create: vi.fn(async () => food(0).name) }), now: T });
    expect(await run("nutrition-log", [food(null)])).toBe(false);
    expect(await run("nutrition-log", [food(2)])).toBe(true);
  });

  it("moves an entry to its new local day", async () => {
    await water([pt("a", T, 300)]);
    await water([{ ...pt("a", T, 300), day: "2026-10-01" }]);
    expect((await all())[0].day).toBe("2026-10-01");
  });

  it("leaves entries outside the window and other types alone", async () => {
    await water([pt("old", T - 20 * 86_400, 300)], true, { ...WIN, from: T - 30 * 86_400 });
    await saveEntries(store, [{ type: "moods", ts: T, data: { moods: ["CALM"], valence: null } }], { tz: TZ, writer: fake(), now: T - 3600 });
    await water([]);
    expect((await all()).map((r) => r.type).sort()).toEqual(["hydration-log", "moods"]);
  });

  it("deleting another app's entry Google refuses (403 or 404) says where to delete it and keeps it", async () => {
    await grant([scopeUrl("hydration-log")]);
    await water([pt("a", T, 300)]);
    const id = (await all())[0].id;
    for (const status of [403, 404]) {
      const refused = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("x", status))) });
      expect(await deleteEntry(store, id, refused)).toEqual({ ok: false, reason: "foreign" });
    }
    expect(await all()).toHaveLength(1);
    // Already deleted in that app: a 404 that Google cannot read back either is deleted here too.
    const gone = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("x", 404))), exists: vi.fn(async () => false) });
    expect(await deleteEntry(store, id, gone)).toEqual({ ok: true, type: "hydration-log", day: "2026-10-02" });
    expect(await all()).toEqual([]);
  });

  it("deleting another app's entry without the write scope asks for a reconnect, before calling Google", async () => {
    await grant([scopeUrl("hydration-log")]);
    await run("weight", [{ name: "users/9/dataTypes/weight/dataPoints/w", ts: T, day: "2026-10-02", data: { kg: 70 } }]);
    const w = fake();
    expect(await deleteEntry(store, (await all())[0].id, w)).toEqual({ ok: false, reason: "reconnect" });
    expect(w.batchDelete).not.toHaveBeenCalled();
  });

  it("a 403 on Pulse's own entry still asks for a reconnect", async () => {
    await saveEntries(store, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: fake(), now: T });
    const denied = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await deleteEntry(store, (await all())[0].id, denied)).toEqual({ ok: false, reason: "reconnect" });
  });
});

describe("logEntries (logging.ts)", () => {
  const water = (ts: number) => ({ type: "hydration-log" as const, ts, data: { ml: 250 } });

  it("asks for a reconnect before any request when the grant lacks a type's write scope, or there is no grant", async () => {
    const w = fake();
    expect(await logEntries(store, [water(T)], { tz: TZ, writer: w, now: T })).toEqual({ ok: false, reason: "reconnect" });
    await grant([scopeUrl("hydration-log")]);
    expect(await logEntries(store, [{ type: "moods", ts: T, data: { moods: ["CALM"], valence: null } }], { tz: TZ, writer: w, now: T })).toEqual({ ok: false, reason: "reconnect" });
    expect(w.create).not.toHaveBeenCalled();
    expect(LOG_MESSAGE.reconnect).toBe("reconnect");
  });

  it("writes, and rewinds the readable types' cursors to the entry's day: never forward, a type with no cursor left alone", async () => {
    await grant(SCOPES);
    await store.settings.setSyncState("hydration-log", { syncedThrough: T });
    await store.settings.setSyncState("weight", { syncedThrough: null });
    const w = fake();
    const day20 = Date.parse("2026-09-20T00:00:00+05:30") / 1000;
    expect(await logEntries(store, [water(day20 + 3600)], { tz: TZ, writer: w, now: T })).toEqual({ ok: true, needsSync: true });
    expect((await store.settings.getSyncState("hydration-log"))?.syncedThrough).toBe(day20);
    await logEntries(store, [water(Date.parse("2026-09-25T10:00:00+05:30") / 1000)], { tz: TZ, writer: w, now: T });
    expect((await store.settings.getSyncState("hydration-log"))?.syncedThrough).toBe(day20); // not forward
    await logEntries(store, [{ type: "weight", ts: day20, data: { kg: 70 } }], { tz: TZ, writer: w, now: T });
    expect((await store.settings.getSyncState("weight"))?.syncedThrough).toBeNull();
    expect(await all()).toHaveLength(3);
  });

  it("a write-only type needs no sync", async () => {
    await grant(SCOPES);
    expect(await logEntries(store, [{ type: "moods", ts: T, data: { moods: ["CALM"], valence: null } }], { tz: TZ, writer: fake(), now: T })).toEqual({ ok: true, needsSync: false });
  });

  it("a failed write stores nothing and rewinds nothing", async () => {
    await grant(SCOPES);
    await store.settings.setSyncState("hydration-log", { syncedThrough: T });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("http_503", 503))) });
    expect(await logEntries(store, [water(T - 20 * 86_400)], { tz: TZ, writer: down, now: T })).toEqual({ ok: false, reason: "failed" });
    expect(await all()).toEqual([]);
    expect((await store.settings.getSyncState("hydration-log"))?.syncedThrough).toBe(T);
  });
});
