import { createContext, useContext, type ReactNode } from "react";

/** One day of the calendar panel's colouring: the day's three scores. */
export type CalendarDay = { day: string; recovery: number | null; strain: number | null; sleep: number | null };

/**
 * What the shells need to know about "now" (the web's ShellStatus, reduced to the calendar: sync and connection state
 * come with the Google and sync streams). `today` and `firstDay` are YYYY-MM-DD in the user's zone; `firstDay` is the
 * first day with data (days before it are not selectable). `loadMonth` fetches a month of scores for the calendar panel;
 * without it the days are simply uncoloured.
 */
export type ShellCalendar = {
  today: string;
  firstDay?: string | null;
  timeZone?: string;
  loadMonth?: (month: string) => Promise<CalendarDay[]>;
};

const Context = createContext<ShellCalendar | null>(null);

export function ShellCalendarProvider({ value, children }: { value: ShellCalendar; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShellCalendar(): ShellCalendar {
  const v = useContext(Context);
  if (!v) throw new Error("useShellCalendar needs a <ShellCalendarProvider> above it");
  return v;
}

/** For charts and rows that format clock times: the zone when there is a provider, the device's otherwise. */
export const useOptionalShellCalendar = () => useContext(Context);
