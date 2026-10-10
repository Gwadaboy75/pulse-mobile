import { useEffect, useState } from "react";
import { View } from "react-native";
import { agoShort, ago } from "@/lib/format";
import { BandIcon } from "../brand";
import { cn } from "../cn";
import { push } from "../navigate";
import { Text } from "../Text";
import { useTheme } from "../theme";
import { useShellSync, type ShellSync } from "./ShellStatus";
import { Press } from "../Press";

/** The web's syncView (TopBar.tsx): the dot's colour and the spoken label for a sync state. */
function syncView(s: ShellSync, now: number): { dot: string; label: string } {
  const last = s.sync.lastSuccessAt;
  const rel = last ? ago(last, now) : null;
  if (s.connection === "auth_revoked" || s.sync.state === "error") return { dot: "bg-recovery-red", label: "Sync failed" };
  if (s.sync.state === "syncing") return { dot: "bg-coach", label: "Syncing…" };
  if (s.sync.state === "stale") return { dot: "bg-warning", label: rel ? `Last sync ${rel}` : "Sync is behind" };
  return { dot: "bg-optimal", label: rel ? `Synced ${rel}` : "Synced" };
}

/** Re-renders once a minute, so "12m" stays true. */
function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Sync freshness in the reference app's battery slot (the web's SyncStatus): "12m", the band icon and a status dot, at
 * the right of Home's top row and of the Health, Journal and More headers. The web opens a popover whose one link is
 * Settings › Data source (with Sync now); here the tap goes straight there.
 */
export function SyncStatus() {
  const s = useShellSync();
  const now = useMinute();
  const { c } = useTheme();
  if (!s) return null;
  const v = syncView(s, now);
  const short = s.sync.lastSuccessAt ? agoShort(s.sync.lastSuccessAt, now) : "";
  return (
    <Press activeScale={0.96} accessibilityRole="button" accessibilityLabel={v.label} onPress={() => push("/settings?s=source")} className="h-11 min-w-11 flex-row items-center justify-end gap-1.5 rounded-full pl-2 pr-0.5">
      <Text className="min-w-[3ch] whitespace-nowrap text-right font-numeric text-[15px] font-semibold leading-5 tabular-nums text-muted-foreground">{short}</Text>
      {/* The band with its dot at the top right, ringed in the header's colour (the web's Band). */}
      <View className="ml-1 size-6 items-center justify-center">
        <BandIcon size={22} color={c.foreground} />
        <View className={cn("absolute -right-1.5 -top-1 size-2 rounded-full", v.dot)} style={{ boxShadow: `0 0 0 2px ${c["background-top"]}` }} />
      </View>
    </Press>
  );
}
