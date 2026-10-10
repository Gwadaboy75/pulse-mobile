// The one place the Google tests get their `Store`. The orchestrator swaps this for the SQLite repositories
// (createStore over an in-memory better-sqlite3 database) to rerun every test against them.
import type { Store } from "../../data/repos";
import { createFakeStore } from "./fakeStore";

export const freshStore = (): Store => createFakeStore();
