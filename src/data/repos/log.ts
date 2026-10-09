// What the user logged (logged_entries): water, food, weight, mood, symptoms, cycle, plus entries brought home from
// other apps. Replaces the database parts of pulse src/server/log.ts. The Google write path, `describeEntry` and the
// import/prune orchestration stay in the port; this repository stores and reads. A few reads join daily_values and
// sync_state (read-only here; those tables belong to `daily` and `settings`).
import type { Db } from "../types";
import { todo } from "./todo";

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

export function logRepo(_db: Db): LogRepo {
  return {
    insertEntry: async () => todo("logRepo.insertEntry"),
    entryById: async () => todo("logRepo.entryById"),
    updateEntry: async () => todo("logRepo.updateEntry"),
    deleteEntry: async () => todo("logRepo.deleteEntry"),
    deleteEntries: async () => todo("logRepo.deleteEntries"),
    heldEntries: async () => todo("logRepo.heldEntries"),
    entriesOnDay: async () => todo("logRepo.entriesOnDay"),
    entriesOn: async () => todo("logRepo.entriesOn"),
    waterOn: async () => todo("logRepo.waterOn"),
    totalsBetween: async () => todo("logRepo.totalsBetween"),
    foodOn: async () => todo("logRepo.foodOn"),
  };
}
