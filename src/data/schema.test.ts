// The schema's structural promises: one person per install (no user_id anywhere), every table owned by exactly one
// repository, and one Db type that both SQLite drivers satisfy.
import Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { drizzle as drizzleExpo } from "drizzle-orm/expo-sqlite";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createRepos, TABLE_OWNER } from "./repos";
import * as schema from "./schema";
import type { Db } from "./types";

const tables = (Object.values(schema) as unknown[]).filter((x) => is(x, SQLiteTable)) as SQLiteTable[];

describe("schema", () => {
  it("has no table with a user_id column", () => {
    expect(tables.length).toBe(23);
    for (const t of tables) expect(getTableConfig(t).columns.map((c) => c.name), getTableConfig(t).name).not.toContain("user_id");
  });

  it("is owned table by table: TABLE_OWNER lists exactly the schema's tables", () => {
    expect(Object.keys(TABLE_OWNER).sort()).toEqual(tables.map((t) => getTableConfig(t).name).sort());
  });

  it("runs the repositories on either driver (one Db type)", () => {
    const node = drizzle(new Database(":memory:"), { schema });
    expectTypeOf(node).toExtend<Db>();
    expectTypeOf<ReturnType<typeof drizzleExpo<typeof schema>>>().toExtend<Db>();
    expect(Object.keys(createRepos(node))).toEqual(["samples", "series", "scores", "daily", "sessions", "journal", "log", "profile", "settings", "coach"]);
  });

  it("stubs throw until implemented", async () => {
    const repos = createRepos(drizzle(new Database(":memory:"), { schema }));
    await expect(repos.samples.readHr(0, 1)).rejects.toThrow("not implemented: samplesRepo.readHr");
  });
});
