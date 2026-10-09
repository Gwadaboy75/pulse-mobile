// The app's one SQLite database. Only src/data/repos may import this.
import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

export const sqlite = openDatabaseSync("pulse.db");
export const db = drizzle(sqlite);
