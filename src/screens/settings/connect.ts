// Connect, sync and forget Google from the screens: Settings › Data source, onboarding's Connect step and `/connect`.
// The tokens are src/google/auth.ts; the sync is src/google/sync.ts followed by the pipeline's recompute.
import { forgetSynced } from "@/actions/reset";
import type { ActionResult } from "@/actions/journal";
import { store } from "@/data/store";
import { googleAuth } from "@/google/auth";
import { GoogleError } from "@/google/oauth";
import { createGoogleSource, DEVICES_KEY } from "@/google/sync";
import { connectMessage } from "@/google/token";
import { recomputeIfNeeded } from "@/pipeline";
import { getProfile } from "@/profile";
import { syncErrorText } from "@/queries/settings";
import { dataChanged } from "../useScreen";

/** `cancelled`: the person closed Google's consent. There is no error text; the screen offers to connect again. */
export type ConnectResult = { ok: true; data: undefined } | { ok: false; error: string; cancelled?: true };

/**
 * Settings › Data source › Connect Google, Reconnect Google, "Pulse needs new permissions", Switch Google account, and
 * onboarding's Connect. Google's consent first; with `switchAccount` the data the previous account synced goes once it
 * succeeds. The caller starts the first sync (`syncNow`), after anything it clears.
 */
export async function connectGoogle({ switchAccount = false }: { switchAccount?: boolean } = {}): Promise<ConnectResult> {
  try {
    await googleAuth.connect();
    if (switchAccount) await store.transaction(forgetSynced);
  } catch (e) {
    if (e instanceof GoogleError) console.warn(e.message); // a code and status only
    const message = connectMessage(e instanceof GoogleError ? e.code : "failed");
    return message === null ? { ok: false, error: "", cancelled: true } : { ok: false, error: message };
  }
  dataChanged();
  return { ok: true, data: undefined };
}

let running: Promise<ActionResult> | null = null;

/** Whether a sync run is going: the shell's sync dot and Home's "Syncing" line. */
export const isSyncing = () => running !== null;

/** Screens reload this often while a sync runs, so the import's "n of N days" moves. */
const PROGRESS_MS = 4000;

/**
 * Settings › Sync now, and the first sync after a connect: Google's data into SQLite, then the scores. One run at a
 * time; a second call joins the running one. Per-type failures stay in sync_state (Settings › Data types); the result
 * is an error only when the grant died or nothing synced.
 */
export function syncNow(): Promise<ActionResult> {
  if (!running) {
    running = runSync().finally(() => {
      running = null;
      dataChanged();
    });
    dataChanged();
  }
  return running;
}

async function runSync(): Promise<ActionResult> {
  const grant = await store.settings.get("google.grant");
  if (!grant) return { ok: false, error: "Connect Google first." };
  if (grant.revokedAt !== null) return { ok: false, error: "Google access was revoked. Reconnect Google." };
  const timeZone = (await store.profile.userTimeZone()) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const started = Math.floor(Date.now() / 1000);
  // ponytail: every mounted screen reloads on each tick; a progress-only signal if that shows up as jank on the phone.
  const tick = setInterval(dataChanged, PROGRESS_MS);
  try {
    const { changed } = await createGoogleSource({ store, tokens: googleAuth, timeZone }).pull();
    dataChanged();
    // Before the profile is saved there is nothing to score yet; onboarding's save runs this again.
    await recomputeIfNeeded(store, changed, () => getProfile(store));
  } catch {
    return { ok: false, error: "Sync failed. Try again." };
  } finally {
    clearInterval(tick);
  }
  if ((await store.settings.get("google.grant"))?.revokedAt != null) return { ok: false, error: "Google access was revoked. Reconnect Google." };
  const rows = (await store.settings.readSyncState()).filter((r) => r.type !== DEVICES_KEY && (r.lastAttemptAt ?? 0) >= started);
  const failed = rows.filter((r) => r.lastError);
  if (rows.length && failed.length === rows.length) return { ok: false, error: `Sync failed: ${syncErrorText(failed[0].lastError!)}` };
  return { ok: true, data: undefined };
}

/** Disconnect and Delete everything: revokes the grant at Google where it can and empties the secure store. */
export const forgetGoogleTokens = (): Promise<void> => googleAuth.disconnect();

/** Delete everything: removes the coach's provider key from the secure store. The coach stream adds its key's name here. */
export async function forgetCoachKey(): Promise<void> {}
