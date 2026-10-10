// The app's one Store: the repositories over the app's database. Screens, sync and the pipeline all use this.
import { db, readDb } from "./db";
import { clearAllTables, createStore } from "./repos";

export const store = createStore(db, readDb);

/** Empties every table: run it inside `store.transaction` (src/actions/sample.ts). */
export const clearAll = () => clearAllTables(db);
