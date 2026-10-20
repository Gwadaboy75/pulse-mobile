// Sending Pulse's rows to the paired server (docs/server.md): after a sync (the app's or the background task's),
// the days since the last push, a few days back for late nights; on request, the whole history. Each window is one
// signed POST the server archives and applies in `sequence` order; it answers 202 (taken), 200 (already had these
// bytes) or 204 (a ping). Nothing here reads Health Connect: the rows are the Store's, after the source policy.
import { utf8ToBytes } from "@noble/hashes/utils";
import { APP_VERSION } from "@/queries/settings";
import type { Store } from "@/data/store";
import { addDays, localDay, localMidnight } from "@/lib/time";
import { readPairing, readSecret, readState, writeState, type Pairing } from "./pairing";
import { buildPayload, isEmptyPayload, testPayload, windows, type PushRows } from "./payload";
import { SIGNATURE_HEADER, signBody } from "./sign";

/** Days per payload when it fits: a week of 15-second heart rate is a few megabytes. */
export const WINDOW_DAYS = 7;
/**
 * The largest body sent: under the server's 12 MB and a reverse proxy's usual 10 MB. Heart rate is stored at up to one
 * sample a second (about 100 bytes each once sent), so a busy week can pass it: the window is then halved, down to one
 * day, and a day still too big sends its heart rate in extra payloads (splitBodies).
 */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;
/** What one sent row weighs, to split a window before building a body that would be too big. */
const ROW_BYTES = { hr: 100, steps: 140, hrv: 120 } as const;
/** A push after a sync re-sends this many days before the last one, for nights that arrived late. */
export const RESEND_DAYS = 3;
/** The first push after pairing, and "Envoyer l'historique". */
export const HISTORY_DAYS = 180;
/** The server answers within the phone app's 10-second limit; a slow link gets a little more. */
export const TIMEOUT_MS = 30_000;

export type PushErrorCode = "not_paired" | "no_secret" | "unreachable" | "rejected_signature" | "unknown_endpoint" | "too_large" | "server_error" | "bad_response";

export class PushError extends Error {
  constructor(
    public code: PushErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

export type PushResult = {
  /** Payloads the server took (202) or already had (200). */
  sent: number;
  days: number;
  from: string | null;
  to: string | null;
  /** Nothing to send (no rows in the window). */
  empty: boolean;
};

export type PushOptions = {
  timeZone: string;
  /** "sync": the days since the last push; "history": the last HISTORY_DAYS days. */
  mode: "sync" | "history";
  now?: number;
  historyDays?: number;
  onProgress?: (done: number, total: number) => void;
  /** Test seams. */
  fetchFn?: typeof fetch;
  maxBytes?: number;
};

/** One signed POST. Throws PushError on anything but 200, 202 or 204. */
export async function post(pairing: Pairing, secret: string, body: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<number> {
  const text = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchFn(pairing.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signBody(text, secret), "User-Agent": `pulse-mobile/${APP_VERSION}` },
      body: text,
      signal: controller.signal,
    });
  } catch (e) {
    throw new PushError("unreachable", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 200 || res.status === 202 || res.status === 204) return res.status;
  if (res.status === 401) throw new PushError("rejected_signature");
  if (res.status === 404) throw new PushError("unknown_endpoint");
  if (res.status === 413) throw new PushError("too_large");
  if (res.status >= 500) throw new PushError("server_error", `HTTP ${res.status}`);
  throw new PushError("bad_response", `HTTP ${res.status}`);
}

/** The pairing ping: the server answers 204 when the URL and the secret match. */
export async function ping(p: { url: string; secret: string; name: string }, timeZone: string, fetchFn: typeof fetch = fetch, now = Math.floor(Date.now() / 1000)): Promise<void> {
  await post({ url: p.url, name: p.name, pairedAt: now }, p.secret, testPayload(now, APP_VERSION, timeZone), fetchFn);
}

/** The Store's rows for the window's days. */
export async function readRows(store: Store, from: string, to: string, tz: string): Promise<PushRows> {
  const lo = localMidnight(from, tz);
  const hi = localMidnight(addDays(to, 1), tz);
  const [hr, steps, hrv, sessions, exercises, metrics, dailyValues, latest] = await Promise.all([
    store.readHr(lo, hi),
    store.readSteps(lo, hi),
    store.readHrv(lo, hi),
    store.allSessions(),
    store.allExercises(),
    store.allMetrics(),
    store.dailyValues({ from, to }),
    store.dailyValues({ from: "latest", to: "latest" }),
  ]);
  const inWindow = (day: string) => day >= from && day <= to;
  const sess = sessions.filter((s) => inWindow(s.day));
  const segments = sess.length ? await store.segmentsFor(sess.map((s) => s.id)) : [];
  const height = latest.find((v) => v.key === "height_cm")?.value ?? null;
  return { hr, steps, hrv, sessions: sess, segments, exercises: exercises.filter((e) => inWindow(e.day)), metrics: metrics.filter((m) => inWindow(m.day)), dailyValues, heightCm: height };
}

/** The window a push covers, from what the Store holds and what was sent before. Null when there is nothing. */
export async function planWindow(store: Store, state: { lastDay: string | null }, o: { mode: PushOptions["mode"]; today: string; historyDays: number }): Promise<{ from: string; to: string } | null> {
  const bounds = await store.hrBounds();
  const sessions = await store.allSessions();
  const firstDays = [bounds ? localDayOf(bounds.first) : null, sessions[0]?.day ?? null].filter((d): d is string => !!d).sort();
  const first = firstDays[0] ?? null;
  if (!first) return null;
  const historyFrom = addDays(o.today, -(o.historyDays - 1));
  const from = o.mode === "history" || !state.lastDay ? (first > historyFrom ? first : historyFrom) : addDays(state.lastDay, -(RESEND_DAYS - 1));
  return { from: from > o.today ? o.today : from, to: o.today };
}
// `hrBounds` gives instants; the day is taken in UTC here only to pick the earlier of two starts, never for a row.
const localDayOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

const byteLength = (body: Record<string, unknown>) => utf8ToBytes(JSON.stringify(body)).length;
const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
const ENVELOPE = ["test", "source", "timestamp", "sequence", "app_version", "timezone"] as const;

/**
 * The bodies for one window, each under `maxBytes`, in send order, their `sequence` still to set. The window whole when
 * it fits; else its two halves, down to one day. A day still too big keeps everything but part of its heart rate in
 * the complete-window body and sends the rest as plain (non-backfill) payloads: the server never prunes heart rate by
 * window, so nothing the first body leaves out is dropped.
 */
export async function splitBodies(store: Store, w: { from: string; to: string }, o: { timeZone: string; now: number; maxBytes: number }): Promise<Record<string, unknown>[]> {
  const rows = await readRows(store, w.from, w.to, o.timeZone);
  const days = dayCount(w.from, w.to);
  const halves = async () => {
    const mid = addDays(w.from, Math.floor(days / 2) - 1);
    return [...(await splitBodies(store, { from: w.from, to: mid }, o)), ...(await splitBodies(store, { from: addDays(mid, 1), to: w.to }, o))];
  };
  const estimate = rows.hr.length * ROW_BYTES.hr + rows.steps.length * ROW_BYTES.steps + rows.hrv.length * ROW_BYTES.hrv;
  if (days > 1 && estimate > o.maxBytes) return halves();
  const body = buildPayload(rows, { from: w.from, to: w.to, timeZone: o.timeZone, sequence: 0, now: o.now, appVersion: APP_VERSION });
  if (isEmptyPayload(body)) return [];
  const size = byteLength(body);
  if (size <= o.maxBytes) return [body];
  if (days > 1) return halves();
  const hr = (body.heart_rate as unknown[] | undefined) ?? [];
  if (!hr.length) return [body]; // Nothing left to split: the server says too_large and the screen explains it.
  const rest = { ...body };
  delete rest.heart_rate;
  const room = Math.max(1, o.maxBytes - byteLength(rest));
  const perPart = Math.max(1, Math.floor((hr.length * room) / (size - byteLength(rest)) * 0.9));
  const envelope = Object.fromEntries(ENVELOPE.map((k) => [k, body[k]]));
  const out: Record<string, unknown>[] = [{ ...rest, heart_rate: hr.slice(0, perPart) }];
  for (let i = perPart; i < hr.length; i += perPart) out.push({ ...envelope, backfill: false, heart_rate: hr.slice(i, i + perPart) });
  return out;
}

/**
 * Pushes the Store's rows to the paired server. Resolves with what was sent; throws PushError (and records it in
 * the state) when a window fails, leaving the earlier windows sent.
 */
export async function pushToServer(store: Store, o: PushOptions): Promise<PushResult> {
  const now = o.now ?? Math.floor(Date.now() / 1000);
  const fetchFn = o.fetchFn ?? fetch;
  const pairing = await readPairing();
  if (!pairing) throw new PushError("not_paired");
  const secret = await readSecret();
  if (!secret) {
    await writeState({ lastError: "no_secret" });
    throw new PushError("no_secret");
  }
  const state = await readState();
  const today = localDay(now, o.timeZone);
  const window = await planWindow(store, state, { mode: o.mode, today, historyDays: o.historyDays ?? HISTORY_DAYS });
  if (!window) return { sent: 0, days: 0, from: null, to: null, empty: true };
  const parts = windows(window.from, window.to, WINDOW_DAYS);
  let sent = 0;
  let sequence = state.lastSequence;
  try {
    for (const [i, w] of parts.entries()) {
      o.onProgress?.(i, parts.length);
      const bodies = await splitBodies(store, w, { timeZone: o.timeZone, now, maxBytes: o.maxBytes ?? MAX_BODY_BYTES });
      if (!bodies.length) continue;
      for (const body of bodies) {
        sequence += 1;
        body.sequence = sequence;
        // The sequence is taken before the send: a retry after a lost answer gets a new one, and the server drops the
        // same bytes by their hash anyway.
        await writeState({ lastSequence: sequence });
        await post(pairing, secret, body, fetchFn);
        sent += 1;
      }
      await writeState({ lastDay: w.to, lastSentAt: now, lastError: null, lastDays: dayCount(window.from, w.to) });
    }
    o.onProgress?.(parts.length, parts.length);
  } catch (e) {
    const code = e instanceof PushError ? e.code : "unreachable";
    await writeState({ lastError: code });
    throw e instanceof PushError ? e : new PushError(code, e instanceof Error ? e.message : String(e));
  }
  return { sent, days: dayCount(window.from, window.to), from: window.from, to: window.to, empty: sent === 0 };
}

/**
 * The hook after a sync (src/background/runSync.ts): pushes when a server is paired and the push is on, and never
 * throws: a failure is a warning the next Settings visit explains.
 */
export async function pushAfterSync(store: Store, timeZone: string): Promise<string | null> {
  const pairing = await readPairing();
  if (!pairing) return null;
  const state = await readState();
  if (!state.enabled) return null;
  try {
    const r = await pushToServer(store, { timeZone, mode: "sync" });
    return r.empty ? null : `server_push:${r.sent}`;
  } catch (e) {
    const code = e instanceof PushError ? e.code : "unreachable";
    console.warn("[push]", code);
    return `server_push_failed:${code}`;
  }
}
