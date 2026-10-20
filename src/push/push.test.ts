// The push over the in-memory Store with a fake server: windows, sequences, the signature, errors and the after-sync hook.
import { describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    multiSet: async (kv: [string, string][]) => kv.forEach(([k, v]) => storage.set(k, v)),
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
  },
}));
const secure = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (k: string) => secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secure.set(k, v),
  deleteItemAsync: async (k: string) => void secure.delete(k),
}));

const { MemoryStore } = await import("@/data/memory");
const { emptyMetrics } = await import("@/data/types");
const { addDays, localMidnight } = await import("@/lib/time");
const { clearPairing, readState, savePairing, writeState } = await import("./pairing");
const { ping, pushAfterSync, PushError, pushToServer, WINDOW_DAYS } = await import("./push");
const { signBody } = await import("./sign");

const TZ = "UTC";
const TODAY = "2026-10-20";
const NOW = localMidnight(TODAY, TZ) + 15 * 3600;
const URL_OK = "https://pulse.example.com/api/ingest/health-connect/abcdefghijklmnopqrstuv";
const SECRET = "shared-secret";

type Call = { url: string; body: Record<string, unknown>; signature: string | null };

/** A fake server: records every call, answers by `status` (a function may vary it). */
function fakeServer(status: number | ((call: Call, i: number) => number) = 202) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const text = String(init?.body);
    const headers = init?.headers as Record<string, string>;
    const call = { url: String(url), body: JSON.parse(text) as Record<string, unknown>, signature: headers["X-Signature"] ?? null };
    calls.push(call);
    const s = typeof status === "function" ? status(call, calls.length - 1) : status;
    return new Response(null, { status: s });
  }) as typeof fetch;
  return { calls, fetchFn };
}

/** A Store with `days` days of a few rows each, ending today. */
async function storeWith(days: number) {
  const store = new MemoryStore();
  const first = addDays(TODAY, -(days - 1));
  const metrics = [];
  const sessions = [];
  const hr = [];
  for (let d = first; d <= TODAY; d = addDays(d, 1)) {
    const mid = localMidnight(d, TZ);
    metrics.push({ ...emptyMetrics(d), rhrBpm: 55, hrvMs: 50 });
    sessions.push({ id: `s-${d}`, day: d, startTs: mid - 2 * 3600, endTs: mid + 6 * 3600, isMain: true, processed: true, stagesStatus: null, asleepMin: 420, awakeMin: 30, deepMin: null, lightMin: null, remMin: null });
    hr.push({ ts: mid + 8 * 3600, bpm: 70 });
  }
  await store.upsertMetrics(metrics);
  await store.upsertSessions(sessions, []);
  await store.putHr(hr);
  return store;
}

describe("pushToServer", () => {
  it("needs a pairing", async () => {
    await clearPairing();
    await expect(pushToServer(new MemoryStore(), { timeZone: TZ, mode: "sync", now: NOW })).rejects.toMatchObject({ code: "not_paired" });
  });

  it("first push after pairing sends the history in 7-day windows, signed, with rising sequences", async () => {
    await savePairing({ url: URL_OK, secret: SECRET, name: "Pulse" }, NOW);
    const store = await storeWith(20);
    const { calls, fetchFn } = fakeServer(202);
    const r = await pushToServer(store, { timeZone: TZ, mode: "sync", now: NOW, fetchFn });
    expect(r).toMatchObject({ sent: 3, days: 20, from: addDays(TODAY, -19), to: TODAY, empty: false });
    expect(calls.map((c) => c.body.sequence)).toEqual([1, 2, 3]);
    expect(calls[0].body.window_start).toBe(new Date(localMidnight(addDays(TODAY, -19), TZ) * 1000).toISOString());
    expect(calls[2].body.window_end).toBe(new Date(localMidnight(addDays(TODAY, 1), TZ) * 1000).toISOString());
    // The signature is over the exact body sent.
    expect(calls[0].signature).toBe(signBody(JSON.stringify(calls[0].body), SECRET));
    expect((calls[0].body.sleep as unknown[]).length).toBe(WINDOW_DAYS);
    const state = await readState();
    expect(state).toMatchObject({ lastSequence: 3, lastDay: TODAY, lastSentAt: NOW, lastError: null, lastDays: 20 });
  });

  it("a push after a sync re-sends from 3 days before the last one", async () => {
    await writeState({ lastDay: addDays(TODAY, -2), lastSequence: 3 });
    const store = await storeWith(20);
    const { calls, fetchFn } = fakeServer(202);
    const r = await pushToServer(store, { timeZone: TZ, mode: "sync", now: NOW, fetchFn });
    expect(r).toMatchObject({ sent: 1, from: addDays(TODAY, -4), to: TODAY });
    expect(calls[0].body.sequence).toBe(4);
    expect((calls[0].body.sleep as unknown[]).length).toBe(5);
  });

  it("history mode re-sends the whole window the Store has", async () => {
    const store = await storeWith(20);
    const { calls, fetchFn } = fakeServer(200);
    const r = await pushToServer(store, { timeZone: TZ, mode: "history", now: NOW, fetchFn });
    expect(r.days).toBe(20);
    expect(calls).toHaveLength(3);
  });

  it("a 401 stops the push, records the code, and keeps what was sent", async () => {
    await writeState({ lastDay: null, lastSequence: 10 });
    const store = await storeWith(20);
    const { calls, fetchFn } = fakeServer((_, i) => (i === 1 ? 401 : 202));
    await expect(pushToServer(store, { timeZone: TZ, mode: "sync", now: NOW, fetchFn })).rejects.toMatchObject({ code: "rejected_signature" });
    expect(calls).toHaveLength(2);
    const state = await readState();
    expect(state.lastError).toBe("rejected_signature");
    expect(state.lastDay).toBe(addDays(TODAY, -13));
    expect(state.lastSequence).toBe(12);
  });

  it("an unreachable server is a PushError too", async () => {
    const store = await storeWith(3);
    const fetchFn = (async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch;
    await expect(pushToServer(store, { timeZone: TZ, mode: "sync", now: NOW, fetchFn })).rejects.toBeInstanceOf(PushError);
    expect((await readState()).lastError).toBe("unreachable");
  });

  it("the ping is a test envelope the server answers 204 to", async () => {
    const { calls, fetchFn } = fakeServer(204);
    await ping({ url: URL_OK, secret: SECRET, name: "Pulse" }, TZ, fetchFn, NOW);
    expect(calls[0].body).toMatchObject({ test: true, source: "health_connect" });
    await expect(ping({ url: URL_OK, secret: SECRET, name: "Pulse" }, TZ, fakeServer(404).fetchFn, NOW)).rejects.toMatchObject({ code: "unknown_endpoint" });
  });

  it("splits a window too big for the server: halves down to a day, then the day's heart rate in plain payloads", async () => {
    await writeState({ lastDay: null, lastSequence: 0 });
    const store = await storeWith(3);
    // Three days of one-second heart rate: about 1 MB a day once sent.
    const dense = [];
    for (let d = 0; d < 3; d++) for (let s = 0; s < 10_000; s++) dense.push({ ts: localMidnight(addDays(TODAY, -d), TZ) + 9 * 3600 + s, bpm: 60 + (s % 40) });
    await store.putHr(dense);
    const maxBytes = 400_000;
    const { calls, fetchFn } = fakeServer(202);
    const r = await pushToServer(store, { timeZone: TZ, mode: "sync", now: NOW, fetchFn, maxBytes });
    expect(r.days).toBe(3);
    for (const c of calls) expect(new TextEncoder().encode(JSON.stringify(c.body)).length).toBeLessThanOrEqual(maxBytes);
    // Every sample sent once, sequences rising one by one, each body signed over itself.
    const times = calls.flatMap((c) => ((c.body.heart_rate as { time: string }[] | undefined) ?? []).map((h) => h.time));
    expect(new Set(times).size).toBe(times.length);
    expect(times.length).toBe((await store.readHr(localMidnight(addDays(TODAY, -2), TZ), NOW + 86_400)).length);
    expect(calls.map((c) => c.body.sequence)).toEqual(calls.map((_, i) => i + 1));
    for (const c of calls) expect(c.signature).toBe(signBody(JSON.stringify(c.body), SECRET));
    // One complete window per day, with its night; the overflow is plain heart rate the server never prunes.
    const complete = calls.filter((c) => c.body.window_complete === true);
    expect(complete).toHaveLength(3);
    for (const c of complete) expect((c.body.sleep as unknown[]).length).toBe(1);
    const extra = calls.filter((c) => c.body.window_complete !== true);
    expect(extra.length).toBeGreaterThan(0);
    for (const c of extra) {
      expect(c.body).toMatchObject({ backfill: false, source: "health_connect" });
      expect(Object.keys(c.body).filter((k) => !["test", "source", "timestamp", "sequence", "app_version", "timezone", "backfill"].includes(k))).toEqual(["heart_rate"]);
    }
  });

  it("the after-sync hook never throws and says what it did", async () => {
    await clearPairing();
    expect(await pushAfterSync(new MemoryStore(), TZ)).toBeNull();
    await savePairing({ url: URL_OK, secret: SECRET, name: "Pulse" }, NOW);
    await writeState({ enabled: false });
    expect(await pushAfterSync(await storeWith(3), TZ)).toBeNull();
  });
});
