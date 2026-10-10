// An in-memory SQLite database with the migrations applied, for Node tests (better-sqlite3, the same drizzle schema as
// the app's expo-sqlite). `testStore()` is what tests of the pipeline, sync and queries use; `testDb()` also hands back
// the raw handles for tests that count writes (`sqlite.prepare("select total_changes()")`).
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { createStore, type Store } from "./repos";
import * as schema from "./schema";

export function testDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON"); // db.ts does the same for the app: the segment cascade needs it
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
  return { sqlite, db, store: createStore(db) };
}

export const testStore = (): Store => testDb().store;

/** Rows SQLite inserted, updated or deleted while `fn` ran: 0 proves a write changed nothing (diff-only writes). */
export async function writesOf(sqlite: Database.Database, fn: () => Promise<unknown>): Promise<number> {
  const total = () => (sqlite.prepare("select total_changes() as n").get() as { n: number }).n;
  const before = total();
  await fn();
  return total() - before;
}
