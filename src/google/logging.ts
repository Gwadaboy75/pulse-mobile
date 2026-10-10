// The Google parts of pulse's src/server/logging.ts (spec §11 LG1): a validated set of entries is checked against the
// grant's write scopes, written to Google, mirrored in `logged_entries`, and the readable types' sync cursors are
// rewound so the next sync fetches their totals. `revalidatePath` and `requestSync` belong to the caller, which starts
// a sync after a successful result.
import type { Repos } from "../data/repos";
import { createGoogleClient, type ClientDeps } from "./client";
import { logAccess, saveEntries, type LogResult, type LogWriter, type NewEntry } from "./log";
import { READABLE, RECONNECT } from "@/lib/log";
import { localDay, localMidnight } from "../time";

export const LOG_MESSAGE: Record<Exclude<LogResult, { ok: true }>["reason"], string> = {
  reconnect: RECONNECT,
  failed: "Google Health didn’t take it. Try again in a minute.",
  foreign: "This was logged in another app. Delete it there.",
};

/** One Google client per action: it holds the rate limiter. */
export function logWriter(deps: ClientDeps): LogWriter {
  return createGoogleClient(deps);
}

/**
 * Writes `entries` to Google and stores them. A grant without a type's write scope (or no grant) answers `reconnect`
 * before any request, as pulse's logFor did. After a write, the readable types (water, food, weight, body fat) come
 * back through the sync, which owns their totals: their cursors are rewound to the entry's day, so the caller should
 * start a sync (pulse's `requestSync({ force: true })`) when this returns `ok` and `needsSync` is true.
 */
export async function logEntries(
  store: Pick<Repos, "log" | "settings">,
  entries: NewEntry[],
  o: { tz: string; writer: LogWriter; now: number; newId?: () => string },
): Promise<LogResult & { needsSync?: boolean }> {
  const access = await logAccess(store);
  if (entries.some((e) => access[e.type] === "reconnect" || access[e.type] === "not_connected")) return { ok: false, reason: "reconnect" };
  const res = await saveEntries(store, entries, o);
  if (!res.ok) return res;
  const readable = entries.filter((e) => READABLE.has(e.type));
  for (const e of readable) await store.settings.rewindSyncCursor(e.type, localMidnight(localDay(e.ts, o.tz), o.tz));
  return { ok: true, needsSync: readable.length > 0 };
}
