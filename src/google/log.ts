// The Google parts of pulse's src/server/log.ts (spec §11 LG1): what the user logs is written to Google Health and
// mirrored in `logged_entries`, the only copy Pulse can read of the write-only types. The other way, the sync brings
// the readable types logged in other apps home here too (`importEntries`). Over the repositories: reads for the Log
// screen (entriesOnDay, entriesOn, waterOn, totalsBetween, foodOn) and the database parts live in `logRepo`.
import type { Repos } from "../data/repos";
import { scopeUrl, LOG_TYPES, type LogType } from "@/lib/log";
import type { GoogleClient } from "./client";
import { GoogleError } from "./oauth";
import type { MappedEntry, ReadableLogType } from "./map";
import { toDataPoint } from "./write";
import { localDay } from "../time";

/** `reconnect`: the grant lacks this type's write scope (or was revoked). */
export type LogAccess = "ok" | "reconnect" | "not_connected";

export async function logAccess({ settings }: Pick<Repos, "settings">): Promise<Record<LogType, LogAccess>> {
  const grant = await settings.get("google.grant");
  const granted = new Set(grant?.scope.split(/\s+/));
  const of = (t: LogType): LogAccess => (!grant ? "not_connected" : grant.revokedAt !== null || !granted.has(scopeUrl(t)) ? "reconnect" : "ok");
  return Object.fromEntries(LOG_TYPES.map((t) => [t, of(t)])) as Record<LogType, LogAccess>;
}

export type LogWriter = Pick<GoogleClient, "create" | "batchDelete" | "exists">;
/** Reads one data point back: false only when Google answers "not found". */
export type PointCheck = (name: string) => Promise<boolean>;
export type NewEntry = { type: LogType; ts: number; data: unknown };
export type LogResult = { ok: true } | { ok: false; reason: "reconnect" | "failed" | "foreign" };

/**
 * A fresh row id. Node's randomUUID is not on Hermes unless a polyfill provides `crypto.randomUUID`, so the
 * fallback builds a v4-shaped id from Math.random. These ids are local keys, not secrets.
 * ponytail: Math.random collisions are negligible at a few entries a day; inject `newId` (expo-crypto) if that changes.
 */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });

/** 403 is a grant without the write scope (from before the write scope was added); revoked means the same fix. */
const failure = (e: unknown): LogResult => {
  if (e instanceof GoogleError && (e.status === 403 || e.code === "auth_revoked" || e.code === "not_connected")) return { ok: false, reason: "reconnect" };
  if (e instanceof GoogleError) {
    console.warn(`[log] ${e.message}`); // status and code only (GoogleError never carries a body)
    return { ok: false, reason: "failed" };
  }
  throw e;
};

/**
 * Writes each entry to Google (with `writer`; null keeps it local), then stores it with the name Google gave it.
 * Entries go in order; one that fails stops the rest, and those already written stay.
 */
export async function saveEntries(
  { log }: Pick<Repos, "log">,
  entries: NewEntry[],
  o: { tz: string; writer: LogWriter | null; now: number; newId?: () => string },
): Promise<LogResult> {
  for (const e of entries) {
    let googleName: string | null = null;
    try {
      if (o.writer) googleName = await o.writer.create(e.type, toDataPoint(e.type, e.data, e.ts, o.tz));
    } catch (err) {
      return failure(err);
    }
    await log.insertEntry({ id: (o.newId ?? newId)(), type: e.type, ts: e.ts, day: localDay(e.ts, o.tz), data: e.data, googleName, createdAt: o.now });
  }
  return { ok: true };
}

/**
 * Deletes an entry at Google (when it was written there) and then here. Already gone at Google counts as deleted,
 * except for another app's entry: Google may answer 404 for a point Pulse cannot touch, and deleting it here would
 * only bring it back on the next sync, so it stays and the user is sent to that app.
 */
export async function deleteEntry(store: Pick<Repos, "log" | "settings">, id: string, writer: LogWriter | null): Promise<LogResult & { type?: LogType; day?: string }> {
  const row = await store.log.entryById(id);
  if (!row) return { ok: true };
  if (row.googleName && writer) {
    const foreign = row.source === "google";
    if (foreign && (await logAccess(store))[row.type as LogType] !== "ok") return { ok: false, reason: "reconnect" };
    try {
      await writer.batchDelete(row.type, [row.googleName]);
    } catch (err) {
      const missing = err instanceof GoogleError && (err.status === 404 || err.code === "NOT_FOUND");
      if (foreign && err instanceof GoogleError && err.status === 403) return { ok: false, reason: "foreign" };
      // A 404 on another app's point may only mean Pulse cannot touch it: gone only if Google cannot read it either.
      if (foreign && missing && (await writer.exists(row.type, row.googleName).catch(() => true))) return { ok: false, reason: "foreign" };
      if (!missing) return failure(err);
    }
  }
  await store.log.deleteEntry(id);
  return { ok: true, type: row.type as LogType, day: row.day };
}

/** A data point's id at Google: names carry the user as `users/{id}/` or `users/me/`, so only the tail is compared. */
const pointKey = (name: string) => name.slice(name.lastIndexOf("/") + 1);
/** proto3 drops zero, so an optional 0 g comes back absent: the two are the same entry. */
const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => JSON.stringify(v, (_, x) => (x === 0 ? null : x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  return norm(a) === norm(b);
};

/** A Pulse write younger than this is never taken for deleted: Google's list may not show it yet. */
export const IMPORT_GRACE_S = 15 * 60;

/**
 * Brings one readable type's Google data points in [from, to) home to `logged_entries`, so what is logged in another
 * app (or edited or deleted there) shows in Journal › Log. A point Pulse already holds (by name) is updated when it
 * changed; one Pulse wrote but holds without a name (an unfinished write) is matched on time and values and gets
 * its name; anything else is a new `google` entry. When `complete` (every point was readable), the named entries
 * Google no longer returns come back as `missing`, for `pruneEntries` to confirm one by one outside any transaction:
 * a short or empty page must never clear the log.
 */
export async function importEntries(
  { log }: Pick<Repos, "log">,
  type: ReadableLogType,
  points: { entries: MappedEntry[]; complete: boolean },
  o: { from: number; to: number; now: number; newId?: () => string },
): Promise<{ changed: boolean; missing: { id: string; googleName: string }[] }> {
  const held = await log.heldEntries(type, o.from, o.to);
  const byKey = new Map(held.filter((r) => r.googleName).map((r) => [pointKey(r.googleName!), r]));
  const unnamed = held.filter((r) => !r.googleName);
  const seen = new Set<string>();
  let changed = false;

  for (const e of points.entries) {
    const key = pointKey(e.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = byKey.get(key);
    if (r) {
      const app = r.source === "google" ? (e.app ?? null) : r.app;
      if (r.ts !== e.ts || r.day !== e.day || r.app !== app || !same(r.data, e.data)) {
        await log.updateEntry(r.id, { ts: e.ts, day: e.day, data: e.data, app });
        changed = true;
      }
      continue;
    }
    const i = unnamed.findIndex((u) => u.ts === e.ts && same(u.data, e.data));
    if (i >= 0) {
      const [u] = unnamed.splice(i, 1);
      await log.updateEntry(u.id, { googleName: e.name });
    } else {
      await log.insertEntry({ id: (o.newId ?? newId)(), type, ts: e.ts, day: e.day, data: e.data, googleName: e.name, source: "google", app: e.app ?? null, createdAt: o.now });
    }
    changed = true;
  }

  const settled = (r: (typeof held)[number]) => r.source === "google" || r.createdAt <= o.now - IMPORT_GRACE_S;
  const missing = points.complete
    ? held.filter((r) => r.googleName && !seen.has(pointKey(r.googleName)) && settled(r)).map((r) => ({ id: r.id, googleName: r.googleName! }))
    : [];
  return { changed, missing };
}

/** Read-backs one sync may spend on missing entries; the rest wait for the next run. */
export const PRUNE_CHECKS = 20;

/**
 * Deletes the missing entries Google answers "not found" for (`check`). Any other answer keeps the entry; the first
 * such error is returned for the sync state. Returns how many were deleted.
 */
export async function pruneEntries({ log }: Pick<Repos, "log">, missing: { id: string; googleName: string }[], check: PointCheck): Promise<{ deleted: number; error: unknown }> {
  const gone: string[] = [];
  let error: unknown = null;
  for (const m of missing.slice(0, PRUNE_CHECKS)) {
    try {
      if (!(await check(m.googleName))) gone.push(m.id);
    } catch (err) {
      error ??= err;
    }
  }
  if (gone.length) await log.deleteEntries(gone);
  return { deleted: gone.length, error };
}
