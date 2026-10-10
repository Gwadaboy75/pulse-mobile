// The one database type. Drizzle's synchronous SQLite database typed with the schema, so the same repositories run on
// `expo-sqlite` in the app (drizzle-orm/expo-sqlite) and on `better-sqlite3` in Node tests (drizzle-orm/better-sqlite3).
// Must not import expo-sqlite: Node tests load this file. Only repository factories (`xRepo(db)`) take a `Db`; no
// repository interface exposes it or any other drizzle type.
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

export type Db = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

/**
 * The handle pure reads go through: the app's async read connection (drizzle-orm/sqlite-proxy over expo-sqlite's async
 * API, off the JS thread) or, in a transaction and in tests, the same synchronous `Db`. Every read awaits its result.
 */
export type ReadDb = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;
