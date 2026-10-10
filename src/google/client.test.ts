// Ported from pulse client.test.ts. Dropped with the raw page archive: the archive and its pruning tests, and the
// archived-page asserts. The token tests (expiry, refresh against Google's token endpoint) belong to the connect step;
// here the TokenSource is scripted (testing/tokens.ts) and the client's use of it is checked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATA_TYPE_IDS, DATA_TYPES } from "./catalogue";
import { localDay, localMidnight } from "../time";
import { buildFilter, createGoogleClient, localWindows, parsePairedDevices } from "./client";
import { GoogleError, SCOPES } from "./oauth";
import { fakeTokens } from "./testing/tokens";

const TZ = "Asia/Kolkata"; // UTC+5:30, so a UTC date and the local date differ before 05:30
const NOW = Date.parse("2026-10-02T06:00:00Z");
const T = NOW / 1000;
const DAY = 86_400;
const lm = (day: string, tz = TZ) => localMidnight(day, tz);
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** A client over a stubbed fetch, a fake clock that only sleep advances, and recorded calls. */
function setup(api: Handler) {
  let clock = NOW;
  const sleeps: number[] = [];
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return api(url, init);
  }) as unknown as typeof globalThis.fetch;
  const tokens = fakeTokens(() => clock);
  const client = createGoogleClient({
    tokens,
    timeZone: TZ,
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { client, sleeps, tokens, apiCalls: () => calls };
}

const filters = (calls: { url: URL }[]) => calls.map((c) => c.url.searchParams.get("filter"));
const auth = (c: { init: RequestInit }) => (c.init.headers as Record<string, string>).authorization;
const caught = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e as GoogleError,
  );

describe("catalogue", () => {
  it("every listable type has a filter member, and only rollup types lack one", () => {
    for (const id of DATA_TYPE_IDS) {
      const t = DATA_TYPES[id];
      expect(t.member !== null || t.dailyRollUp, id).toBe(true);
      expect(t.maxDays, id).toBeGreaterThan(0);
    }
    expect(DATA_TYPES["total-calories"]).toMatchObject({ member: null, dailyRollUp: true, maxDays: 14 });
    expect(DATA_TYPES["heart-rate"].maxDays).toBe(14);
    expect(DATA_TYPES.sleep.pageSize).toBe(25);
    expect(DATA_TYPES.exercise.pageSize).toBe(25);
  });
});

describe("scopes", () => {
  it("health scopes only: never openid, email or profile", () => {
    expect(SCOPES).toHaveLength(13);
    for (const s of SCOPES) expect(s).toMatch(/^https:\/\/www\.googleapis\.com\/auth\/googlehealth\./);
    expect(SCOPES.join(" ")).not.toMatch(/openid|email|\bprofile\b(?!\.readonly)/);
  });
});

describe("local days", () => {
  it("localDay and localMidnight use the configured zone, not UTC", () => {
    expect(lm("2026-09-10")).toBe(Date.parse("2026-09-09T18:30:00Z") / 1000);
    expect(localDay(Date.parse("2026-09-09T19:00:00Z") / 1000, TZ)).toBe("2026-09-10");
  });

  it("a 30-day window splits into 14 + 14 + 2 local days, with no gap or overlap", () => {
    const w = localWindows(lm("2026-09-01"), lm("2026-10-01"), 14, TZ);
    expect(w).toEqual([
      { start: lm("2026-09-01"), end: lm("2026-09-15") },
      { start: lm("2026-09-15"), end: lm("2026-09-29") },
      { start: lm("2026-09-29"), end: lm("2026-10-01") },
    ]);
  });

  it("a mid-day start ends its first window at the next local midnight boundary", () => {
    const from = lm("2026-09-10") + 10 * 3600;
    expect(localWindows(from, lm("2026-09-12") + 60, 1, TZ)).toEqual([
      { start: from, end: lm("2026-09-11") },
      { start: lm("2026-09-11"), end: lm("2026-09-12") },
      { start: lm("2026-09-12"), end: lm("2026-09-12") + 60 },
    ]);
  });

  it("day windows follow local midnight across a DST change (23 h day)", () => {
    const tz = "Europe/London"; // clocks go forward on 2026-03-29
    const w = localWindows(lm("2026-03-28", tz), lm("2026-03-31", tz), 1, tz);
    expect(w.map((x) => (x.end - x.start) / 3600)).toEqual([24, 23, 24]);
    expect(w.map((x) => localDay(x.start, tz))).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
  });

  it("an empty or reversed range has no windows", () => {
    expect(localWindows(100, 100, 14, TZ)).toEqual([]);
    expect(localWindows(200, 100, 14, TZ)).toEqual([]);
  });
});

describe("filters", () => {
  const day = { start: lm("2026-09-10"), end: lm("2026-09-11") };

  it("daily-resting-heart-rate filters on the civil date in TZ", () => {
    expect(buildFilter("daily-resting-heart-rate", "date", day, TZ)).toBe('daily_resting_heart_rate.date >= "2026-09-10" AND daily_resting_heart_rate.date < "2026-09-11"');
  });

  it("a date window ending mid-day still includes that day", () => {
    const w = { start: day.start, end: day.start + 10 * 3600 };
    expect(buildFilter("daily-heart-rate-variability", "date", w, TZ)).toBe('daily_heart_rate_variability.date >= "2026-09-10" AND daily_heart_rate_variability.date < "2026-09-11"');
  });

  it("sleep filters on interval.end_time as instants", () => {
    expect(buildFilter("sleep", "interval.end_time", day, TZ)).toBe('sleep.interval.end_time >= "2026-09-09T18:30:00.000Z" AND sleep.interval.end_time < "2026-09-10T18:30:00.000Z"');
  });

  it("exercise filters on civil start time in TZ, without an offset", () => {
    expect(buildFilter("exercise", "interval.civil_start_time", day, TZ)).toBe('exercise.interval.civil_start_time >= "2026-09-10T00:00:00" AND exercise.interval.civil_start_time < "2026-09-11T00:00:00"');
  });

  it("list sends the type's member and page size on the dataPoints path", async () => {
    const { client, apiCalls } = setup(() => json({}));
    await client.list("sleep", day.start, day.end);
    await client.list("daily-resting-heart-rate", day.start, day.end);
    const [sleep, rhr] = apiCalls();
    expect(sleep.url.pathname).toBe("/v4/users/me/dataTypes/sleep/dataPoints");
    expect(sleep.url.searchParams.get("pageSize")).toBe("25");
    expect(sleep.url.searchParams.get("filter")).toContain("sleep.interval.end_time >=");
    expect(rhr.url.searchParams.get("filter")).toContain('daily_resting_heart_rate.date >= "2026-09-10"');
    expect(auth(sleep)).toBe("Bearer at-1");
  });
});

describe("list", () => {
  it("follows nextPageToken, returns every point in order and stops without a token", async () => {
    const pages = [json({ dataPoints: [{ n: 1 }, { n: 2 }], nextPageToken: "p2" }), json({ dataPoints: [{ n: 3 }] })];
    const { client, apiCalls } = setup(() => pages.shift()!);
    expect(await client.list("heart-rate", lm("2026-09-10"), lm("2026-09-11"))).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(apiCalls().map((c) => c.url.searchParams.get("pageToken"))).toEqual([null, "p2"]);
  });

  it("listEach hands over one page at a time", async () => {
    const pages = [json({ dataPoints: [{ n: 1 }, { n: 2 }], nextPageToken: "p2" }), json({ dataPoints: [{ n: 3 }] })];
    const { client } = setup(() => pages.shift()!);
    const seen: unknown[][] = [];
    await client.listEach("sleep", lm("2026-09-10"), lm("2026-09-11"), (points) => void seen.push(points));
    expect(seen).toEqual([[{ n: 1 }, { n: 2 }], [{ n: 3 }]]);
  });

  it("a 30-day heart-rate request is three windows, 14 + 14 + 2 days", async () => {
    const { client, apiCalls } = setup(() => json({ dataPoints: [] }));
    await client.list("heart-rate", lm("2026-09-01"), lm("2026-10-01"));
    const iso = (d: string) => new Date(lm(d) * 1000).toISOString();
    const f = (a: string, b: string) => `heart_rate.sample_time.physical_time >= "${iso(a)}" AND heart_rate.sample_time.physical_time < "${iso(b)}"`;
    expect(filters(apiCalls())).toEqual([f("2026-09-01", "2026-09-15"), f("2026-09-15", "2026-09-29"), f("2026-09-29", "2026-10-01")]);
  });

  it("an empty body is no data (proto3 omits empty arrays)", async () => {
    const { client } = setup(() => json({}));
    expect(await client.list("weight", lm("2026-09-10"), lm("2026-09-11"))).toEqual([]);
  });

  it("refuses a rollup-only type", async () => {
    const { client, apiCalls } = setup(() => json({}));
    expect((await caught(client.list("total-calories", 0, DAY))).code).toBe("unsupported_action");
    expect(apiCalls()).toHaveLength(0);
  });

  it("a page token that never ends stops at the page cap", async () => {
    const { client } = setup(() => json({ dataPoints: [], nextPageToken: "again" }));
    expect((await caught(client.list("steps", lm("2026-09-10"), lm("2026-09-11")))).code).toBe("too_many_pages");
  });

  it("a 200 that is not the expected envelope is an error, never quoted", async () => {
    const { client } = setup(() => new Response("<html>SECRET proxy page</html>"));
    const err = await caught(client.list("sleep", lm("2026-09-10"), lm("2026-09-11")));
    expect(err.code).toBe("bad_response");
    expect(err.message).not.toContain("SECRET");

    const { client: c2 } = setup(() => json({ dataPoints: { not: "an array" } }));
    expect((await caught(c2.list("steps", lm("2026-09-10"), lm("2026-09-11")))).code).toBe("bad_response");
  });
});

describe("retries and auth", () => {
  const range = [lm("2026-09-10"), lm("2026-09-11")] as const;

  it("429 with Retry-After waits that long, then retries", async () => {
    const res = [json({}, 429, { "retry-after": "7" }), json({ dataPoints: [{ n: 1 }] })];
    const { client, sleeps, apiCalls } = setup(() => res.shift()!);
    expect(await client.list("steps", ...range)).toEqual([{ n: 1 }]);
    expect(sleeps).toEqual([7000]);
    expect(apiCalls()).toHaveLength(2);
  });

  it("429 asking to wait longer than a minute fails the job instead of stalling the run", async () => {
    const { client, apiCalls } = setup(() => json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429, { "retry-after": "3600" }));
    await expect(client.list("weight", 0, 86_400)).rejects.toMatchObject({ code: "RESOURCE_EXHAUSTED", status: 429 });
    expect(apiCalls()).toHaveLength(1);
  });

  it("429 with an HTTP-date Retry-After waits until then", async () => {
    const at = new Date(NOW + 3000).toUTCString();
    const res = [json({}, 429, { "retry-after": at }), json({})];
    const { client, sleeps } = setup(() => res.shift()!);
    await client.list("steps", ...range);
    expect(sleeps).toEqual([3000]);
  });

  it("5xx and network failures back off exponentially", async () => {
    let n = 0;
    const { client, sleeps } = setup(() => {
      n++;
      if (n === 2) throw new TypeError("fetch failed");
      return n < 4 ? json({}, 503) : json({});
    });
    await client.list("steps", ...range);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it("gives up after five attempts with the status", async () => {
    const { client, apiCalls } = setup(() => json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429));
    const err = await caught(client.list("steps", ...range));
    expect(err).toMatchObject({ code: "RESOURCE_EXHAUSTED", status: 429 });
    expect(apiCalls()).toHaveLength(5);
  });

  it("asks the token source for a token before every request", async () => {
    const { client, tokens } = setup(() => json({}));
    const get = vi.spyOn(tokens, "getAccessToken");
    await client.list("steps", ...range);
    await client.list("steps", ...range);
    expect(get).toHaveBeenCalledTimes(2);
    expect(tokens.refreshCalls).toBe(0);
  });

  it("401 refreshes once and retries with the new token", async () => {
    const res = [json({}, 401), json({ dataPoints: [{ n: 1 }] })];
    const { client, apiCalls, tokens } = setup(() => res.shift()!);
    expect(await client.list("steps", ...range)).toEqual([{ n: 1 }]);
    expect(tokens.refreshCalls).toBe(1);
    expect(apiCalls().map(auth)).toEqual(["Bearer at-1", "Bearer at-2"]);
    expect(tokens.revokedAt).toBeNull();
  });

  it("a second 401 gives auth_revoked, marks the grant revoked, and stops further requests", async () => {
    const { client, apiCalls, tokens } = setup(() => json({}, 401));
    expect(await caught(client.list("steps", ...range))).toMatchObject({ code: "auth_revoked", status: 401 });
    expect(tokens.refreshCalls).toBe(1);
    expect(tokens.revokedAt).toBe(T);
    expect((await caught(client.list("steps", ...range))).code).toBe("auth_revoked");
    expect(apiCalls()).toHaveLength(2);
  });

  it("auth_revoked from the refresh after a 401 marks the grant revoked", async () => {
    const { client, tokens } = setup(() => json({}, 401));
    tokens.refreshError = new GoogleError("auth_revoked", 400, "token refresh");
    expect((await caught(client.list("steps", ...range))).code).toBe("auth_revoked");
    expect(tokens.revokedAt).toBe(T);
  });

  it("any other refresh failure is not a revocation", async () => {
    const { client, tokens } = setup(() => json({}, 401));
    tokens.refreshError = new GoogleError("http_503", 503, "token refresh");
    expect((await caught(client.list("steps", ...range))).code).toBe("http_503");
    expect(tokens.revokedAt).toBeNull();
  });

  it("a failing request's error holds status and code only: no token, no body text", async () => {
    const body = { error: { code: 400, message: "bad filter SECRET-BODY near at-1", status: "INVALID_ARGUMENT", details: [] } };
    const { client } = setup(() => json(body, 400));
    const err = await caught(client.list("sleep", ...range));
    expect(err).toMatchObject({ code: "INVALID_ARGUMENT", status: 400 });
    expect(err.message).toBe("[google] sleep: INVALID_ARGUMENT (HTTP 400)");
    const everything = `${err.message} ${err.stack} ${JSON.stringify(err)} ${String(err.cause)}`;
    for (const secret of ["SECRET-BODY", "at-1"]) expect(everything).not.toContain(secret);
  });

  it("prefers a machine-readable reason, and ignores a free-text code", async () => {
    const { client } = setup(() => json({ error: { status: "INVALID_ARGUMENT", details: [{ reason: "INVALID_ROLLUP_QUERY_DURATION" }] } }, 400));
    expect((await caught(client.dailyRollUp("steps", "2026-09-10", "2026-09-11"))).code).toBe("INVALID_ROLLUP_QUERY_DURATION");
    const { client: c2 } = setup(() => json({ error: { status: "some text with SECRET" } }, 400));
    expect((await caught(c2.list("steps", ...range))).code).toBe("http_400");
  });
});

describe("request timeout (React Native has no AbortSignal.timeout)", () => {
  afterEach(() => vi.useRealTimers());

  it("aborts a request that never answers after 30 s and counts it as a network failure", async () => {
    vi.useFakeTimers();
    const hang = (_url: URL, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const tokens = fakeTokens();
    const client = createGoogleClient({
      tokens,
      timeZone: TZ,
      maxTries: 1,
      fetch: ((u: string | URL, init: RequestInit) => hang(new URL(String(u)), init)) as unknown as typeof fetch,
      sleep: async () => {},
    });
    const p = caught(client.list("steps", lm("2026-09-10"), lm("2026-09-11")));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await p).toMatchObject({ code: "network" });
  });
});

describe("limiter", () => {
  it("spaces requests 250 ms apart (4 per second)", async () => {
    const { client, sleeps } = setup(() => json({}));
    for (let i = 0; i < 5; i++) await client.list("steps", lm("2026-09-10"), lm("2026-09-11"));
    expect(sleeps).toEqual([250, 250, 250, 250]);
  });

  it("does not wait when requests are already slower than the limit", async () => {
    const { client, sleeps } = setup(() => json({}, 503));
    await caught(client.list("steps", lm("2026-09-10"), lm("2026-09-11")));
    expect(sleeps).toEqual([1000, 2000, 4000, 8000]);
  });
});

describe("dailyRollUp", () => {
  it("POSTs civil ranges of at most 14 days, exclusive end, and concatenates rollupDataPoints", async () => {
    const { client, apiCalls } = setup(() => json({ rollupDataPoints: [{ n: 1 }] }));
    expect(await client.dailyRollUp("total-calories", "2026-09-01", "2026-10-01")).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }]);
    const calls = apiCalls();
    expect(calls[0].url.pathname).toBe("/v4/users/me/dataTypes/total-calories/dataPoints:dailyRollUp");
    expect(calls[0].init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    const ranges = calls.map((c) => JSON.parse(String(c.init.body)).range);
    const d = (day: number, month = 9) => ({ date: { year: 2026, month, day } });
    expect(ranges).toEqual([
      { start: d(1), end: d(15) },
      { start: d(15), end: d(29) },
      { start: d(29), end: d(1, 10) },
    ]);
  });

  it("serves daily step totals, and refuses types without a rollup", async () => {
    const { client, apiCalls } = setup(() => json({}));
    expect(await client.dailyRollUp("steps", "2026-09-10", "2026-09-11")).toEqual([]);
    expect((await caught(client.dailyRollUp("sleep", "2026-09-10", "2026-09-11"))).code).toBe("unsupported_action");
    expect(apiCalls()).toHaveLength(1);
  });
});

describe("writes", () => {
  const NAME = "users/12345/dataTypes/moods/dataPoints/abc-1";
  const done = (response: unknown) => json({ done: true, response });
  const point = { moods: { sampleTime: { physicalTime: "2026-10-02T06:00:00Z", utcOffset: "19800s" }, moods: ["CALM"] } };

  it("create POSTs the data point as JSON to the type's dataPoints and returns the name from the finished operation", async () => {
    const { client, apiCalls } = setup(() => done({ "@type": "type.googleapis.com/google.devicesandservices.health.v4.DataPoint", name: NAME, ...point }));
    expect(await client.create("moods", point)).toBe(NAME);
    const [c] = apiCalls();
    expect(c.url.href).toBe("https://health.googleapis.com/v4/users/me/dataTypes/moods/dataPoints");
    expect(c.init.method).toBe("POST");
    expect((c.init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(c.init.body))).toEqual(point);
    expect(auth(c)).toBe("Bearer at-1");
  });

  it("an unfinished operation has no name yet; a failed one throws its code", async () => {
    expect(await setup(() => json({ name: "operations/1", done: false })).client.create("moods", point)).toBeNull();
    const failed = setup(() => json({ done: true, error: { code: 3, status: "INVALID_ARGUMENT", message: "bad" } }));
    expect((await caught(failed.client.create("moods", point))).code).toBe("INVALID_ARGUMENT");
  });

  it("a grant without the write scope is a 403, not retried", async () => {
    const { client, apiCalls } = setup(() => json({ error: { code: 403, status: "PERMISSION_DENIED" } }, 403));
    const e = await caught(client.create("moods", point));
    expect([e.code, e.status]).toEqual(["PERMISSION_DENIED", 403]);
    expect(apiCalls()).toHaveLength(1);
  });

  it("create never repeats on a 5xx or a network failure (it may have landed), but does after a 429", async () => {
    const five = setup(() => json({}, 503));
    expect((await caught(five.client.create("moods", point))).status).toBe(503);
    expect(five.apiCalls()).toHaveLength(1);
    const pages = [json({}, 429, { "retry-after": "1" }), done({ name: NAME })];
    const busy = setup(() => pages.shift()!);
    expect(await busy.client.create("moods", point)).toBe(NAME);
    expect(busy.apiCalls()).toHaveLength(2);
  });

  it("batchDelete POSTs the names under users/me to :batchDelete", async () => {
    const { client, apiCalls } = setup(() => json({ done: true, response: {} }));
    await client.batchDelete("moods", [NAME]);
    const [c] = apiCalls();
    expect(c.url.href).toBe("https://health.googleapis.com/v4/users/me/dataTypes/moods/dataPoints:batchDelete");
    expect(JSON.parse(String(c.init.body))).toEqual({ names: ["users/me/dataTypes/moods/dataPoints/abc-1"] });
  });
});

describe("parsePairedDevices", () => {
  it("says none only for the documented empty list, and unknown for any other shape", () => {
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: [{ name: "users/me/pairedDevices/1" }] }))).toBe("some");
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: [{}], nextPageToken: "n" }))).toBe("some");
    expect(parsePairedDevices("{}")).toBe("none"); // proto3 JSON drops an empty list
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: [] }))).toBe("none");
    expect(parsePairedDevices(JSON.stringify({ devices: [] }))).toBe("unknown");
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: {} }))).toBe("unknown");
    expect(parsePairedDevices("[]")).toBe("unknown");
    expect(parsePairedDevices("null")).toBe("unknown");
    expect(parsePairedDevices("not json")).toBe("unknown");
  });
});

describe("buildFilter for sessions Google filters differently", () => {
  const w = { start: 1767225600, end: 1767312000 };
  it("ECG takes a start-time lower bound only", () => {
    expect(buildFilter("electrocardiogram", "interval.start_time", w, "UTC")).toBe('electrocardiogram.interval.start_time >= "2026-01-01T00:00:00.000Z"');
  });
  it("irregular rhythm notifications filter on civil start time, both bounds", () => {
    expect(buildFilter("irregular-rhythm-notification", "interval.civil_start_time", w, "UTC")).toBe(
      'irregular_rhythm_notification.interval.civil_start_time >= "2026-01-01T00:00:00" AND irregular_rhythm_notification.interval.civil_start_time < "2026-01-02T00:00:00"',
    );
  });
});
