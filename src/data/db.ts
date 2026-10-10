// The app's database: one connection for writes (synchronous, so a transaction's statements run back to back) and one
// for pure reads (asynchronous: SQLite runs them on a background thread, off the JS thread). Only src/data/repos and
// src/data/store.ts may import this.
import { drizzle } from "drizzle-orm/expo-sqlite";
import { drizzle as proxy } from "drizzle-orm/sqlite-proxy";
import { openDatabaseSync } from "expo-sqlite";

import * as schema from "./schema";
import type { ReadDb } from "./types";

export const sqlite = openDatabaseSync("pulse.db");
// SQLite leaves foreign keys off per connection; the sleep_segments cascade needs them.
sqlite.execSync("PRAGMA foreign_keys = ON");
// WAL (kept in the file): readers never wait for the writer and the writer never waits for readers.
sqlite.execSync("PRAGMA journal_mode = WAL");
export const db = drizzle(sqlite, { schema });

/** The read connection. It sees committed data only: a transaction's writes appear when it commits. */
export const reader = openDatabaseSync("pulse.db", { useNewConnection: true });
// A WAL checkpoint can hold a lock for a moment; wait instead of failing.
reader.execSync("PRAGMA busy_timeout = 2000");
export const readDb: ReadDb = proxy(
  async (query, params, method) => {
    const statement = await reader.prepareAsync(query);
    try {
      const rows = await (await statement.executeForRawResultAsync(params)).getAllAsync();
      // drizzle's proxy wants rows as arrays, and the first row alone for `get`.
      return { rows: method === "get" ? rows[0] : rows };
    } finally {
      await statement.finalizeAsync();
    }
  },
  { schema },
);
