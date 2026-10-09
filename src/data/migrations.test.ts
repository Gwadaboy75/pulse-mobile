import Database from "better-sqlite3";
import { is, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

const tables = (Object.values(schema) as unknown[]).filter((x) => is(x, SQLiteTable)) as SQLiteTable[];

function fresh() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/data/migrations" });
  return { sqlite, db };
}

describe("migrations", () => {
  it("apply to an empty database", () => {
    const { sqlite } = fresh();
    const applied = sqlite.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number };
    expect(applied.n).toBeGreaterThan(0);
  });

  it("create every table in the schema", () => {
    const { sqlite } = fresh();
    const names = tables.map((t) => getTableConfig(t).name);
    expect(names.length).toBe(24);
    const present = (sqlite.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((r) => r.name);
    expect(names.filter((n) => !present.includes(n))).toEqual([]);
  });

  it("keep the single-row tables to id 1", () => {
    const { sqlite } = fresh();
    expect(() => sqlite.prepare("insert into profile (id, birth_date, sex, time_zone, updated_at) values (2, '1990-01-01', 'male', 'UTC', 0)").run()).toThrow(/CHECK/);
    sqlite.prepare("insert into profile (birth_date, sex, time_zone, updated_at) values ('1990-01-01', 'male', 'UTC', 0)").run();
    expect((sqlite.prepare("select id from profile").get() as { id: number }).id).toBe(1);
  });

  it("cascade a session's segments", () => {
    const { sqlite } = fresh();
    sqlite.prepare("insert into sleep_sessions (id, day, start_ts, end_ts, is_main, processed, source) values ('s', '2026-10-01', 0, 1, 1, 1, 'google')").run();
    sqlite.prepare("insert into sleep_segments (session_id, start_ts, end_ts, stage) values ('s', 0, 1, 'deep')").run();
    sqlite.prepare("delete from sleep_sessions where id = 's'").run();
    expect((sqlite.prepare("select count(*) n from sleep_segments").get() as { n: number }).n).toBe(0);
  });

  it("round-trip BLOB columns as Uint8Array and JSON columns in key order", () => {
    const { db } = fresh();
    db.insert(schema.hrDays).values({ bucket: 1, offsets: new Uint8Array([1, 2, 3]), values: new Uint8Array([60, 61, 62]) }).run();
    const [r] = db.select().from(schema.hrDays).all();
    expect([...r.offsets]).toEqual([1, 2, 3]);
    expect(r.minute).toBe(false);
    db.insert(schema.reports).values({ period: "2026-W40", data: { b: 1, a: 2 } }).run();
    expect(db.get<{ data: string }>(sql`select data from reports`).data).toBe('{"b":1,"a":2}');
  });
});
