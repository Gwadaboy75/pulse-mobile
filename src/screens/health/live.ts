// The live heart-rate pull. The web polls `/heart-rate?since=` every minute while the page is open (pulse
// src/app/heart-rate/route.ts, which runs the worker's throttled `pullHeartRate`); the app calls this function on
// the same schedule from the screen's focus effect (HeartRateScreen.tsx) and re-reads the day from the store.
//
// `createGoogleSource(deps).pullHeartRate()` (src/google/sync.ts) lists heart rate from the newest stored sample to now
// and writes it to the store. "Not connected" (no grant, or a revoked one) never throws: the caller treats a throw as a
// failed poll and backs off (60 s doubling to 10 minutes, as the web does).
import { store } from "@/data/store";
import { googleAuth } from "@/google/auth";
import { GoogleError } from "@/google/oauth";
import { createGoogleSource } from "@/google/sync";

export type LivePull = { connected: false } | { connected: true; changed: boolean };

export async function pullLiveHeartRate(): Promise<LivePull> {
  const grant = await store.settings.get("google.grant");
  if (!grant || grant.revokedAt !== null) return { connected: false };
  const timeZone = (await store.profile.userTimeZone()) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    await createGoogleSource({ store, tokens: googleAuth, timeZone }).pullHeartRate();
  } catch (e) {
    if (e instanceof GoogleError && (e.code === "auth_revoked" || e.code === "not_connected")) return { connected: false };
    throw e;
  }
  return { connected: true, changed: true };
}
