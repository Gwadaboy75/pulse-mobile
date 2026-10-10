// What the user logged (logged_entries): water, food, weight, mood, symptoms, cycle, plus entries brought home from
// other apps. Replaces the database parts of pulse src/server/log.ts. The Google write path, `describeEntry` and the
// import/prune orchestration stay in the port; this repository stores and reads. A few reads join daily_values and
// sync_state (read-only here; those tables belong to `daily` and `settings`).
import { and, asc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { addDays } from "../../time";
import { dailyValues, loggedEntries, syncState } from "../schema";
import type { Db, ReadDb } from "../types";
import { atomic, chunks, jsonText } from "./sql";

/** `source`: "pulse" logged in Pulse, "google" logged in another app and brought home by the sync. `data` depends on `type` (src/lib/log.ts). */
export type LoggedEntryRow = {
  id: string;
  type: string;
  ts: number;
  day: string;
  data: unknown;
  googleName: string | null;
  source: "pulse" | "google";
  app: string | null;
  createdAt: number;
};

/** Pulse's own new entry; the repository gives it nothing else (the caller supplies the id, `day` and `createdAt`). log.ts:57 */
export type NewLoggedEntry = Omit<LoggedEntryRow, "source" | "app"> & { source?: "pulse" | "google"; app?: string | null };

/** What `importEntries` changes on a held entry. log.ts:146, 154 */
export type LoggedEntryPatch = { ts?: number; day?: string; data?: unknown; app?: string | null; googleName?: string | null };

export type DayTotals = { day: string; water: number | null; kcal: number | null };
export type Food = { kcal: number; protein: number; carbs: number; fat: number };

export interface LogRepo {
  /** Stores an entry. log.ts:57 `saveEntries` (the row insert) and :156 `importEntries` (a new `google` entry) */
  insertEntry(entry: NewLoggedEntry): Promise<void>;
  /** One entry by id. log.ts:71 `deleteEntry` */
  entryById(id: string): Promise<LoggedEntryRow | null>;
  /** Updates the given fields of an entry; nothing is written when they already equal the stored ones. log.ts:146, 154 */
  updateEntry(id: string, patch: LoggedEntryPatch): Promise<void>;
  /** log.ts:86 */
  deleteEntry(id: string): Promise<void>;
  /** log.ts:185 `pruneEntries` */
  deleteEntries(ids: string[]): Promise<void>;
  /** Entries of one type with ts in [from, to). log.ts:131 `importEntries` */
  heldEntries(type: string, from: number, to: number): Promise<LoggedEntryRow[]>;
  /** Every entry of a local day, oldest first (ts, then createdAt), plus any menstrual-period entry whose start..end spans it. log.ts:203 */
  entriesOnDay(day: string): Promise<LoggedEntryRow[]>;
  /** One type's entries on one day, oldest first. No limit. log.ts:218 */
  entriesOn(type: string, day: string): Promise<LoggedEntryRow[]>;
  /**
   * Water (ml) drunk on `day`: daily_values 'water' plus the sum of this repository's Pulse-sourced hydration entries
   * created after sync_state 'hydration-log'.last_success_at (0 when never). log.ts:231 `waterOn`
   */
  waterOn(day: string): Promise<number>;
  /** `waterOn` and `foodOn`'s kcal for every day in [from, to] (days built in TypeScript, no generate_series); null for a day with nothing. log.ts:259 */
  totalsBetween(from: string, to: string): Promise<DayTotals[]>;
  /** What was eaten on `day`: daily_values (calories_in, protein, carbs, fat) plus pending Pulse nutrition entries; null with neither. log.ts:287 */
  foodOn(day: string): Promise<Food | null>;
}

export function logRepo(db: Db, read: ReadDb = db): LogRepo {
  const l = loggedEntries;
  const v = dailyValues;
  const byId = (h: ReadDb, id: string) => h.select().from(l).where(eq(l.id, id)).all();

  /** Pulse-logged entries of `types` not yet in Google's roll-up: created after that type's last successful sync (0 when never). */
  const pending = async (types: string[], where: ReturnType<typeof and>) => {
    const [cursors, rows] = await Promise.all([
      read.select({ type: syncState.type, at: syncState.lastSuccessAt }).from(syncState).where(inArray(syncState.type, types)).all(),
      read.select().from(l).where(and(where, eq(l.source, "pulse"), inArray(l.type, types))).all(),
    ]);
    const synced = new Map(cursors.map((r) => [r.type, r.at ?? 0]));
    return (rows as LoggedEntryRow[]).filter((r) => r.createdAt > (synced.get(r.type) ?? 0));
  };
  const num = (data: unknown, k: string) => {
    const x = Number((data as Record<string, unknown> | null)?.[k]);
    return Number.isFinite(x) ? x : 0;
  };
  const sum = (rows: LoggedEntryRow[], k: string) => rows.reduce((a, r) => a + num(r.data, k), 0);

  return {
    async insertEntry(entry) {
      db.insert(l).values({ ...entry, source: entry.source ?? "pulse", app: entry.app ?? null }).run();
    },
    async entryById(id) {
      return ((await byId(read, id))[0] as LoggedEntryRow | undefined) ?? null;
    },
    async updateEntry(id, patch) {
      const held = (byId(db, id) as Awaited<ReturnType<typeof byId>>)[0] as LoggedEntryRow | undefined;
      if (!held) return;
      const set: LoggedEntryPatch = {};
      if (patch.ts !== undefined && patch.ts !== held.ts) set.ts = patch.ts;
      if (patch.day !== undefined && patch.day !== held.day) set.day = patch.day;
      if (patch.app !== undefined && patch.app !== held.app) set.app = patch.app;
      if (patch.googleName !== undefined && patch.googleName !== held.googleName) set.googleName = patch.googleName;
      if (patch.data !== undefined && jsonText(patch.data) !== jsonText(held.data)) set.data = patch.data;
      if (Object.keys(set).length) db.update(l).set(set).where(eq(l.id, id)).run();
    },
    async deleteEntry(id) {
      db.delete(l).where(eq(l.id, id)).run();
    },
    async deleteEntries(ids) {
      atomic(db, () => {
        for (const part of chunks(ids, 500)) db.delete(l).where(inArray(l.id, part)).run();
      });
    },
    async heldEntries(type, from, to) {
      return (await read.select().from(l).where(and(eq(l.type, type), gte(l.ts, from), lt(l.ts, to))).all()) as LoggedEntryRow[];
    },
    async entriesOnDay(day) {
      return (await read
        .select()
        .from(l)
        .where(or(eq(l.day, day), and(eq(l.type, "menstrual-period"), sql`json_extract(${l.data}, '$.start') <= ${day}`, sql`json_extract(${l.data}, '$.end') >= ${day}`)))
        .orderBy(asc(l.ts), asc(l.createdAt))
        .all()) as LoggedEntryRow[];
    },
    async entriesOn(type, day) {
      return (await read.select().from(l).where(and(eq(l.type, type), eq(l.day, day))).orderBy(asc(l.ts), asc(l.createdAt)).all()) as LoggedEntryRow[];
    },

    async waterOn(day) {
      const [[r], mine] = await Promise.all([read.select({ value: v.value }).from(v).where(and(eq(v.day, day), eq(v.key, "water"))).all(), pending(["hydration-log"], eq(l.day, day))]);
      return (r?.value ?? 0) + sum(mine, "ml");
    },

    async totalsBetween(from, to) {
      const [synced, mine] = await Promise.all([
        read
          .select({ day: v.day, key: v.key, value: v.value })
          .from(v)
          .where(and(gte(v.day, from), lte(v.day, to), inArray(v.key, ["water", "calories_in"])))
          .all(),
        pending(["hydration-log", "nutrition-log"], and(gte(l.day, from), lte(l.day, to))),
      ]);
      const out: DayTotals[] = [];
      for (let day = from; day <= to; day = addDays(day, 1)) {
        const value = (key: string) => synced.find((x) => x.day === day && x.key === key)?.value ?? null;
        const entries = (type: string) => mine.filter((x) => x.day === day && x.type === type);
        const total = (s: number | null, es: LoggedEntryRow[], k: string) => (s === null && !es.length ? null : Math.round((s ?? 0) + sum(es, k)));
        out.push({ day, water: total(value("water"), entries("hydration-log"), "ml"), kcal: total(value("calories_in"), entries("nutrition-log"), "kcal") });
      }
      return out;
    },

    async foodOn(day) {
      const [rows, mine] = await Promise.all([
        read.select({ key: v.key, value: v.value }).from(v).where(and(eq(v.day, day), inArray(v.key, ["calories_in", "protein", "carbs", "fat"]))).all(),
        pending(["nutrition-log"], eq(l.day, day)),
      ]);
      if (!rows.length && !mine.length) return null;
      const synced = (key: string) => rows.find((r) => r.key === key)?.value ?? 0;
      const add = (a: number, b: number) => Math.round((a + b) * 10) / 10;
      return { kcal: Math.round(synced("calories_in") + sum(mine, "kcal")), protein: add(synced("protein"), sum(mine, "protein")), carbs: add(synced("carbs"), sum(mine, "carbs")), fat: add(synced("fat"), sum(mine, "fat")) };
    },
  };
}
