import { parseDay } from "@/lib/url";
import { type QueryCtx, todayOf } from "@/queries/common";
import { getJournal } from "@/queries/journal";
import { getLog } from "@/queries/log";

/** The Journal tab's query and key, by the route's `d` (none or empty: today); Home prefetches them. */
export const journalQuery = (raw?: string) => async (ctx: QueryCtx) => {
  const day = parseDay(raw, todayOf(ctx)).d;
  const [vm, log, offered] = await Promise.all([getJournal(ctx, day), getLog(ctx, day), ctx.store.settings.get("journal.yesterdayOffered")]);
  return { vm, log, offered: !!offered };
};
export const journalKey = (raw?: string) => ["journal", raw || null] as const;
