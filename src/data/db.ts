// The app's one SQLite database. Only src/data/repos may import this.
import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

import * as schema from "./schema";

export const sqlite = openDatabaseSync("pulse.db");
// SQLite leaves foreign keys off per connection; the sleep_segments cascade needs them.
sqlite.execSync("PRAGMA foreign_keys = ON");
export const db = drizzle(sqlite, { schema });
