// The heart-rate screen's live pull. The web polls `/heart-rate?since=` every minute while the page is open; the app
// calls this on the same schedule from the screen's focus effect (HeartRateScreen.tsx) and re-reads the day. It is
// halo's short Health Connect read (src/health/live.ts refreshRecentHeartRate: the last 20 minutes, written to the
// Store) without halo's app-wide ticker. Sample data has no Health Connect to ask.
import { refreshRecentHeartRate } from "@/health/live";
import { appState } from "@/state/app";

export type LivePull = { connected: false } | { connected: true; changed: boolean };

export async function pullLiveHeartRate(): Promise<LivePull> {
  const { store, source, profile, status } = appState();
  // A sync run reads the same days; the next poll catches up.
  if (!store || source !== "health_connect" || status === "syncing") return { connected: false };
  const r = await refreshRecentHeartRate(store, { source, timeZone: profile?.timeZone });
  if (r.error) throw new Error("live_read_failed");
  return { connected: true, changed: r.added > 0 };
}
