// This provider sits outside the navigator, so its reads cannot use the screen-focus hook.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { loadCalendarMonth } from "@/actions/calendar";
import { store } from "@/data/store";
import { ctxOf, firstDay, todayOf } from "@/queries/common";
import { getShellStatus } from "@/queries/settings";
import { ShellCalendarProvider, ShellSyncProvider, useShellCalendar, type ShellCalendar, type ShellSync } from "@/ui/shells/ShellStatus";
import { isSyncing, syncIfStale, syncNow } from "./settings/connect";
import { useDataVersion } from "./useScreen";
import { useSyncVersion } from "./settings/syncSignal";

const loadMonth = (month: string) => loadCalendarMonth(store, month);

type Read = { today: string; firstDay: string | null; timeZone: string; sync: ShellSync };

export function ShellData({ children }: { children: ReactNode }) {
  const root = useShellCalendar();
  const version = useDataVersion();
  const syncVersion = useSyncVersion();
  // Without a profile (before onboarding) there is nothing to read: the device's today stands in.
  const [data, setData] = useState<Read>();
  useEffect(() => {
    let live = true;
    ctxOf(store)
      .then(async (ctx) => {
        const [status, sample] = await Promise.all([getShellStatus(ctx, isSyncing()), ctx.store.settings.get("sample")]);
        const sync: ShellSync = { sync: status.sync, connection: status.connection, streak: status.streak, timeZone: ctx.timeZone, importProgress: status.importProgress, sample: !!sample, syncNow };
        return { today: todayOf(ctx), firstDay: await firstDay(ctx), timeZone: ctx.timeZone, sync };
      })
      .then(
        (d) => live && setData((previous) => JSON.stringify(previous) === JSON.stringify(d) ? previous : d),
        () => live && setData(undefined),
      );
    return () => {
      live = false;
    };
  }, [version, syncVersion]);
  // The web's 15-minute sync worker, while the app is in front: on open, on coming back, and checked every minute.
  useEffect(() => {
    const check = () => AppState.currentState === "active" && void syncIfStale().catch(() => {});
    check();
    const sub = AppState.addEventListener("change", check);
    const timer = setInterval(check, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  const value = useMemo<ShellCalendar>(() => ({ today: data?.today ?? root.today, firstDay: data?.firstDay, timeZone: data?.timeZone, loadMonth }), [data?.today, data?.firstDay, data?.timeZone, root.today]);
  return (
    <ShellCalendarProvider value={value}>
      <ShellSyncProvider value={data?.sync ?? null}>{children}</ShellSyncProvider>
    </ShellCalendarProvider>
  );
}
