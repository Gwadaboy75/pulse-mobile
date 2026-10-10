// The one place the Google tests get their `Store`: the SQLite repositories on an in-memory better-sqlite3 database.
import type { Store } from "../../data/repos";
import { testStore } from "../../data/testing";

export const freshStore = (): Store => testStore();
