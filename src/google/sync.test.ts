// Ported from pulse sync.test.ts, over a scripted fetch and the Store (testing/store.ts). The payloads are F1's (the
// Google fixtures pulse's tests read from __fixtures__). The recompute and score assertions live with the pipeline; here the dirty days and the
// tables stand in for them.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../data/repos";
import { loadF1 } from "../testing/fixtures";
import { GoogleError } from "./oauth";
import { BACKFILL_DAYS, createGoogleSource, DEVICES_KEY, LOG_IMPORT_KEY, NO_DEVICE_ERROR } from "./sync";
import { freshStore } from "./testing/store";
import { fakeTokens } from "./testing/tokens";

const TZ = "Asia/Kolkata"; // fixed +05:30, which the stub's civil-time filter relies on
const NOW = Date.parse("2026-10-02T06:00:00Z"); // 11:30 local
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Obj = Record<string, unknown>;
const at = (v: unknown, p: string) => p.split(".").reduce<unknown>((o, k) => (o as Obj | undefined)?.[k], v);
const civil = (d: unknown) => ["year", "month", "day"].map((k, i) => String(at(d, k)).padStart(i ? 2 : 4, "0")).join("-");
const F1 = loadF1();
const fixture = (name: string): unknown[] => {
  const c = F1.cases.find((x) => x.file === `${name}.json`);
  if (!c) throw new Error(`no F1 payload ${name}`);
  return structuredClone(c.payload.dataPoints ?? c.payload.rollupDataPoints ?? []);
};
const LIST_TYPES = [
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-respiratory-rate",
  "daily-sleep-temperature-derivations",
  "daily-oxygen-saturation",
  "daily-vo2-max",
  "daily-heart-rate-zones",
  "run-vo2-max",
  "weight",
  "body-fat",
  "sleep",
  "exercise",
  "heart-rate",
  "steps",
];
const camel = (s: string) => s.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase());
const payload = (p: unknown, type: string) => at(p, camel(type)) as Obj;

/** The member value a filter compares, as a sortable number or civil date string. */
function memberValue(p: unknown, type: string, member: string): number | string {
  const o = payload(p, type);
  if (member === "date") return civil(o.date);
  if (member === "interval.civil_start_time") return Date.parse(String(at(o, "interval.startTime")));
  return Date.parse(String(at(o, camel(member))));
}
const bound = (member: string, s: string) => (member === "date" ? s : member === "interval.civil_start_time" ? Date.parse(`${s}+05:30`) : Date.parse(s));

let store: Store;
let tokens: ReturnType<typeof fakeTokens>;
let data: Record<string, unknown[]>;
const grant = () => store.settings.set("google.grant", { scope: "s", revokedAt: null, updatedAt: NOW / 1000 });
beforeEach(async () => {
  store = freshStore();
  await grant();
  data = Object.fromEntries(LIST_TYPES.map((t) => [t, fixture(t)]));
  data["hydration-log"] = [];
  data["nutrition-log"] = [];
  data["steps:rollup"] = fixture("steps.dailyRollUp");
  data["total-calories:rollup"] = fixture("total-calories.dailyRollUp");
  for (const t of ["time-in-heart-rate-zone", "daily-resting-heart-rate", "daily-heart-rate-variability"]) data[`${t}:rollup`] = fixture(`${t}.dailyRollUp`);
});

/** A source over a stubbed Google that answers each request from the fixtures inside its window. */
function setup(o: { failing?: string[]; failStatus?: number; onRequest?: (type: string, filter: string | null) => void | Promise<void>; devices?: () => Response } = {}) {
  let clock = NOW;
  const calls: { type: string; filter: string | null }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/pairedDevices")) return o.devices?.() ?? json({ pairedDevices: [{ name: "users/me/pairedDevices/1" }] });
    const get = /dataTypes\/([^/]+)\/dataPoints\/([^/:]+)$/.exec(url.pathname);
    if (get) {
      calls.push({ type: `${get[1]}:get`, filter: null });
      const held = (data[get[1]] ?? []).some((p) => String(at(p, "name")).endsWith(`/${get[2]}`));
      return held ? json({}) : json({ error: { code: 404, status: "NOT_FOUND" } }, 404);
    }
    const [, type, rollup] = /dataTypes\/([^/]+)\/dataPoints(:dailyRollUp)?$/.exec(url.pathname)!;
    const filter = url.searchParams.get("filter");
    calls.push({ type, filter });
    await o.onRequest?.(type, filter);
    if (o.failing?.includes(type)) {
      return json({ error: { code: 400, status: "INVALID_ARGUMENT", message: "secret body text" } }, o.failStatus ?? 400);
    }
    if (rollup) {
      const { range } = JSON.parse(String(init.body));
      const [lo, hi] = [civil(range.start.date), civil(range.end.date)];
      const pts = data[`${type}:rollup`].filter((p) => {
        const d = civil(at(p, "civilStartTime.date"));
        return d >= lo && d < hi;
      });
      return json({ rollupDataPoints: pts });
    }
    const [, member, lo, hi] = /^\w+\.(\S+) >= "([^"]+)" AND \S+ < "([^"]+)"$/.exec(filter!)!;
    const pts = data[type].filter((p) => {
      const v = memberValue(p, type, member);
      return v >= bound(member, lo) && v < bound(member, hi);
    });
    return json({ dataPoints: pts });
  }) as unknown as typeof globalThis.fetch;
  const log = { error: vi.fn() };
  tokens = fakeTokens(() => clock);
  const source = createGoogleSource({
    store,
    tokens,
    timeZone: TZ,
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log,
  });
  return { source, calls, log, advance: (ms: number) => (clock += ms) };
}

const FOREVER = 2 ** 40;
/** Rows per table; heart rate and steps count samples. */
const counts = async () => ({
  dailyMetrics: (await store.daily.readMetrics()).length,
  sleepSessions: (await store.sessions.readSessions()).length,
  sleepSegments: (await store.sessions.readSegments()).length,
  exercises: (await store.sessions.readExercises()).length,
  hrSamples: (await store.samples.readSamples("hr", 0, FOREVER)).length,
  stepsMinutes: (await store.samples.readSamples("steps", 0, FOREVER)).length,
});
const dirtyDays = () => store.scores.dirtyDays();
const state = (type: string) => store.settings.getSyncState(type);
const day = async (d: string) => (await store.daily.readMetrics()).find((r) => r.day === d);
const clearDirty = () => store.scores.clearDirty();
const lowerBound = (f: string | null) => /"([^"]+)"/.exec(f!)![1];
const entries = async (type?: string) => {
  const types = type ? [type] : ["hydration-log", "nutrition-log", "weight", "body-fat"];
  return (await Promise.all(types.map((t) => store.log.heldEntries(t, 0, FOREVER)))).flat();
};

describe("google sync", () => {
  it("does nothing before the account is connected", async () => {
    store = freshStore(); // no grant
    const { source, calls } = setup();
    expect(await source.pull()).toEqual({ changed: false });
    expect(calls).toEqual([]);
  });

  it("first connect backfills 180 days oldest first, with monotonic N-of-180 progress", async () => {
    const progress: [number | null, number | null][] = [];
    const { source, calls } = setup({
      onRequest: (type, filter) => {
        if (type !== "heart-rate" || !filter) return; // the sample list, not the extra roll-up
        return state("heart-rate").then((s) => void progress.push([s?.backfillDaysDone ?? null, s?.backfillDaysTotal ?? null]));
      },
    });
    expect(await source.pull()).toEqual({ changed: true });

    const hr = calls.filter((c) => c.type === "heart-rate" && c.filter);
    expect(hr).toHaveLength(BACKFILL_DAYS); // one local day per request
    expect(lowerBound(hr[0].filter)).toBe("2026-04-05T18:30:00.000Z"); // local midnight, 6 April
    const starts = hr.map((c) => Date.parse(lowerBound(c.filter)));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));

    expect(progress[0]).toEqual([0, 180]);
    progress.slice(1).forEach(([done], i) => expect(done).toBeGreaterThanOrEqual(progress[i][0]!));
    expect(progress.at(-1)).toEqual([179, 180]);
    expect(await state("heart-rate")).toMatchObject({ backfillDaysDone: 180, backfillDaysTotal: 180, lastError: null });

    // The normalized tables are filled the way the seed fills them (the pipeline's columns).
    expect(await day("2026-10-01")).toEqual({
      day: "2026-10-01",
      hrvMs: 41.5,
      rhrBpm: 57,
      respBpm: 14.2,
      nightlyTempC: 34.12,
      spo2Pct: 96.4,
      vo2maxDaily: null,
      vo2maxRun: 46.3,
      steps: 8421,
      calories: 2310.5,
      weightKg: null,
      bodyFatPct: null,
      hrZones: [98, 118, 137, 157, 186],
      lightModerateMin: 52,
      vigorousPeakMin: 450.5 / 60,
      tempBaselineC: 34,
      tempSdC: 0.21,
      // Not fetched: the API refuses roll-ups on the daily types (UNSUPPORTED_DATA_TYPE_ACTION).
      rhrRangeLow: null,
      rhrRangeHigh: null,
      hrvRangeLow: null,
      hrvRangeHigh: null,
    });
    expect(await counts()).toEqual({ dailyMetrics: 3, sleepSessions: 4, sleepSegments: 9, exercises: 1, hrSamples: 5, stepsMinutes: 5 });
    expect((await store.sessions.readSegments()).map((s) => s.stage)).not.toContain("AWAKE");
    expect(await dirtyDays()).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("re-importing the same payloads leaves row counts unchanged and reports no change", async () => {
    const { source } = setup();
    await source.pull();
    const before = await counts();
    await clearDirty();

    expect(await source.pull()).toEqual({ changed: false }); // incremental, overlapping every fixture
    await store.settings.clearSynced();
    expect(await source.pull()).toEqual({ changed: false }); // a full second backfill
    expect(await counts()).toEqual(before);
    expect(await dirtyDays()).toEqual([]);
  });

  it("re-fetches heart rate from synced_through minus 1 hour and marks only today dirty", async () => {
    const { source, calls, advance } = setup();
    await source.pull();
    await clearDirty();
    calls.length = 0;

    advance(15 * 60_000);
    data["heart-rate"].push({
      dataSource: { platform: "FITBIT", recordingMethod: "PASSIVELY_MEASURED" },
      heartRate: { beatsPerMinute: "70", sampleTime: { physicalTime: "2026-10-02T06:05:00Z" } },
    });
    expect(await source.pull()).toEqual({ changed: true });

    // The last stored sample (05:50) is older than synced_through, so the hour runs back from it.
    const hr = calls.filter((c) => c.type === "heart-rate" && c.filter);
    expect(hr.map((c) => lowerBound(c.filter))).toEqual(["2026-10-02T04:50:00.000Z"]);
    // daily-* re-fetch 3 local days before synced_through.
    expect(lowerBound(calls.find((c) => c.type === "daily-resting-heart-rate")!.filter)).toBe("2026-09-29");
    expect(await dirtyDays()).toEqual(["2026-10-02"]);

    // Nothing new: nothing changes and nothing is dirty.
    await clearDirty();
    advance(15 * 60_000);
    expect(await source.pull()).toEqual({ changed: false });
    expect(await dirtyDays()).toEqual([]);
  });

  it("one failing type does not block the others, and records only the safe error", async () => {
    const { source, log } = setup({ failing: ["daily-oxygen-saturation"] });
    expect(await source.pull()).toEqual({ changed: true });

    const failed = (await state("daily-oxygen-saturation"))!;
    expect(failed.lastError).toBe("[google] daily-oxygen-saturation: INVALID_ARGUMENT (HTTP 400)");
    expect(failed.syncedThrough).toBeNull();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("secret");

    expect(await state("heart-rate")).toMatchObject({ lastError: null, backfillDaysDone: 180 });
    expect((await state("daily-respiratory-rate"))?.lastError).toBeNull();
    expect(await day("2026-10-01")).toMatchObject({ spo2Pct: null, respBpm: 14.2, hrvMs: 41.5 });
  });

  it("an unexpected error (a database failure quoting a row) reaches neither the log nor the sync state", async () => {
    const { source, log } = setup();
    vi.spyOn(store.daily, "upsertDailyMetrics").mockRejectedValue(new Error("constraint failed: weight_kg=72.1 SECRET"));
    await source.pull();
    expect((await state("daily-respiratory-rate"))?.lastError).toBe("[sync] daily-respiratory-rate: internal error");
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("SECRET");
    expect(JSON.stringify(log.error.mock.calls)).toContain("Error");
    expect((await state("heart-rate"))?.lastError).toBeNull(); // the other jobs carry on
  });

  it("a revoked grant fails every job with auth_revoked, keeps the data, and never calls Google again", async () => {
    const { source, calls } = setup();
    await source.pull();
    const before = await counts();
    await tokens.markRevoked();
    calls.length = 0;
    expect(await source.pull()).toEqual({ changed: false });
    expect(calls).toEqual([]);
    expect((await state("heart-rate"))?.lastError).toBe("[google] auth_revoked");
    expect((await state(LOG_IMPORT_KEY))?.lastError).toBe("[google] auth_revoked");
    expect(await counts()).toEqual(before);
  });

  it("records no paired device, clears it once one is paired, and keeps the last answer on an error or unknown shape", async () => {
    let devices = () => json({});
    const { source, log } = setup({ devices: () => devices() });
    await source.pull();
    expect((await state(DEVICES_KEY))?.lastError).toBe(NO_DEVICE_ERROR);
    expect((await state("heart-rate"))?.lastError).toBeNull(); // the import itself still runs

    devices = () => json({ error: { code: 403, status: "PERMISSION_DENIED", message: "secret body text" } }, 403);
    await source.pull();
    expect((await state(DEVICES_KEY))?.lastError).toBe(NO_DEVICE_ERROR);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("secret");

    devices = () => json({ somethingNew: true });
    await source.pull();
    expect((await state(DEVICES_KEY))?.lastError).toBe(NO_DEVICE_ERROR);

    devices = () => json({ pairedDevices: [{ name: "users/me/pairedDevices/1" }] });
    await source.pull();
    expect((await state(DEVICES_KEY))?.lastError).toBeNull();
  });

  describe("records deleted in Fitbit", () => {
    const ids = async () => ({
      sessions: (await store.sessions.readSessions()).map((r) => r.id.split("/").pop()).sort(),
      exercises: (await store.sessions.readExercises()).map((r) => r.id.split("/").pop()).sort(),
    });
    const s = (iso: string) => Date.parse(iso) / 1000;
    const night = (id: string, d: string, start: string, end: string) => ({
      id, day: d, startTs: s(start), endTs: s(end), isMain: true, processed: true, stagesStatus: null,
      asleepMin: null, awakeMin: null, deepMin: null, lightMin: null, remMin: null, source: "FITBIT",
    });

    it("a deleted workout and a deleted night leave the tables; older rows stay", async () => {
      const { source, advance } = setup();
      await source.pull();
      // A night inside the 30-day session re-fetch that Google no longer returns: deleted days later, so pruned too.
      await store.sessions.upsertSleepSessions([night("week-old", "2026-09-24", "2026-09-23T17:00:00Z", "2026-09-24T01:00:00Z")]);
      // One outside it, gone from Google too: never re-checked, so kept.
      await store.sessions.upsertSleepSessions([night("old-night", "2026-08-20", "2026-08-19T17:00:00Z", "2026-08-20T01:00:00Z")]);
      await clearDirty(); // what a recompute does

      data.exercise = [];
      data.sleep = data.sleep.filter((p) => !String(at(p, "name")).endsWith("/sleep-a")); // the night ending 1 October
      advance(15 * 60_000);
      expect(await source.pull()).toEqual({ changed: true });

      expect((await ids()).exercises).toEqual([]);
      expect((await ids()).sessions).toEqual(["old-night", "sleep-b", "sleep-c", "sleep-d"]);
      expect((await store.sessions.readSegments()).filter((g) => g.sessionId.endsWith("/sleep-a"))).toEqual([]); // deleted with it
      expect(await dirtyDays()).toEqual(["2026-09-24", "2026-10-01"]);
    });

    it("a failed fetch, or a page with a point we cannot read, deletes nothing", async () => {
      await setup().source.pull();
      const before = await counts();
      data.exercise = [];
      data.sleep = [];
      await setup({ failing: ["sleep", "exercise"] }).source.pull();
      expect(await counts()).toEqual(before);

      // A changed shape: in the window, but unreadable, so the window can't vouch for what is missing.
      data.sleep = [{ name: "x", sleep: { interval: { endTime: "2026-10-01T01:40:00Z" } } }];
      data.exercise = [{ name: "y", exercise: { interval: { startTime: "2026-10-01T12:30:00Z" } } }];
      await setup().source.pull();
      expect(await counts()).toEqual(before);
    });

    it("band HR samples Google no longer returns in the window are deleted, but an empty answer deletes nothing", async () => {
      const extra = { dataSource: { platform: "FITBIT" }, heartRate: { beatsPerMinute: "64", sampleTime: { physicalTime: "2026-10-02T05:30:00Z" } } };
      data["heart-rate"].push(extra);
      const { source, advance } = setup();
      await source.pull();
      expect((await counts()).hrSamples).toBe(6);
      await clearDirty();

      data["heart-rate"] = data["heart-rate"].filter((p) => p !== extra);
      advance(15 * 60_000);
      expect(await source.pull()).toEqual({ changed: true });
      expect((await store.samples.readSamples("hr", 0, 2 ** 31)).map((r) => r.ts)).not.toContain(s("2026-10-02T05:30:00Z"));
      expect((await counts()).hrSamples).toBe(5);
      expect(await dirtyDays()).toEqual(["2026-10-02"]);

      data["heart-rate"] = [];
      advance(15 * 60_000);
      await source.pull();
      expect((await counts()).hrSamples).toBe(5);
    });
  });

  it("brings entries logged in other apps home to Journal › Log, and drops the ones deleted there", async () => {
    const drink = (id: string, start: string, ml: number) => ({
      name: `users/me/dataTypes/hydration-log/dataPoints/${id}`,
      dataSource: { platform: "FITBIT" },
      hydrationLog: { interval: { startTime: start, endTime: start }, amountConsumed: { milliliters: ml } },
    });
    data["hydration-log"] = [drink("h1", "2026-10-02T03:00:00Z", 250), drink("old", "2026-09-01T03:00:00Z", 999)];
    const { source, calls, advance } = setup();
    await source.pull();
    expect(await entries("hydration-log")).toMatchObject([{ ts: Date.parse("2026-10-02T03:00:00Z") / 1000, day: "2026-10-02", data: { ml: 250 }, source: "google" }]);
    expect((await entries("weight")).map((e) => e.data)).toEqual(expect.arrayContaining([{ kg: 72.1 }, { kg: 72.5 }]));
    const filter = calls.find((c) => c.type === "hydration-log" && c.filter)!.filter!;
    expect(filter).toMatch(/^hydration_log\.interval\.civil_start_time >= "2026-09-19T00:00(:00)?" AND hydration_log\.interval\.civil_start_time < /); // 19 Sep, local midnight
    expect(await state(LOG_IMPORT_KEY)).toMatchObject({ lastError: null });

    data["hydration-log"] = [];
    advance(60_000);
    await source.pull();
    expect(await entries("hydration-log")).toEqual([]);
    expect(calls.filter((c) => c.type === "hydration-log:get")).toHaveLength(1); // confirmed gone before deleting
  });

  it("a failing log import records its error and keeps the other types", async () => {
    const { source } = setup({ failing: ["nutrition-log"] });
    await source.pull();
    expect((await state(LOG_IMPORT_KEY))?.lastError).toContain("nutrition-log");
    expect(await entries("weight")).toHaveLength(2);
  });

  it("a failed backfill resumes from its last committed chunk", async () => {
    let fail = true;
    const { source, calls } = setup({
      onRequest: (type, filter) => {
        if (type === "heart-rate" && fail && lowerBound(filter) === "2026-07-01T18:30:00.000Z") throw new Error("offline");
      },
    });
    await source.pull();
    const stuck = (await state("heart-rate"))!;
    expect(stuck.lastError).toBe("[google] heart-rate: network");
    expect(stuck.backfillDaysDone).toBeGreaterThan(0);
    expect(stuck.backfillDaysDone).toBeLessThan(180);

    fail = false;
    calls.length = 0;
    await source.pull();
    const hr = calls.filter((c) => c.type === "heart-rate" && c.filter);
    expect(lowerBound(hr[0].filter)).toBe("2026-07-01T18:30:00.000Z");
    expect(await state("heart-rate")).toMatchObject({ backfillDaysDone: 180, lastError: null });
  });
});

describe("pullHeartRate (the live view's pull)", () => {
  const sec = (iso: string) => Date.parse(iso) / 1000;
  const hrPoint = (iso: string, bpm: number) => ({
    dataSource: { platform: "FITBIT", recordingMethod: "PASSIVELY_MEASURED" },
    heartRate: { beatsPerMinute: String(bpm), sampleTime: { physicalTime: iso } },
  });
  const upper = (f: string | null) => /< "([^"]+)"/.exec(f!)![1];

  it("lists heart-rate once, from the newest stored sample minus 10 minutes to now, and merges it", async () => {
    const { source, calls } = setup();
    await store.samples.writeSamples("hr", [{ ts: sec("2026-10-02T05:50:30Z"), v: 60 }]);
    data["heart-rate"] = [hrPoint("2026-10-02T05:50:30Z", 60), hrPoint("2026-10-02T05:58:00Z", 77)];
    await source.pullHeartRate();
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe("heart-rate");
    expect(lowerBound(calls[0].filter)).toBe("2026-10-02T05:40:00.000Z"); // minute-aligned, 10 min before 05:50:30
    expect(upper(calls[0].filter)).toBe("2026-10-02T06:00:00.000Z");
    expect(await store.samples.readSamples("hr", sec("2026-10-02T05:00:00Z"), sec("2026-10-02T07:00:00Z"))).toEqual([
      { ts: sec("2026-10-02T05:50:30Z"), v: 60 },
      { ts: sec("2026-10-02T05:58:00Z"), v: 77 },
    ]);
    expect(await dirtyDays()).toEqual(["2026-10-02"]); // the next full run rescores it
    expect(await state("heart-rate")).toBeNull(); // the full sync's cursor is not moved
  });

  it("with nothing stored (or only older days), starts at today's local midnight", async () => {
    const { source, calls } = setup();
    await store.samples.writeSamples("hr", [{ ts: sec("2026-09-28T05:00:00Z"), v: 60 }]);
    await source.pullHeartRate();
    expect(lowerBound(calls[0].filter)).toBe("2026-10-01T18:30:00.000Z"); // 00:00 in Asia/Kolkata
  });

  it("does not retry a 429: it throws at once for the worker to stop", async () => {
    const { source, calls } = setup({ failing: ["heart-rate"], failStatus: 429 });
    const err = await source.pullHeartRate().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleError);
    expect((err as GoogleError).status).toBe(429);
    expect(calls).toHaveLength(1);
  });
});
