import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, it } from "vitest";

it("the bundled migrations apply to an empty database", () => {
  const sqlite = new Database(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: "src/data/migrations" });
  const applied = sqlite.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number };
  expect(applied.n).toBeGreaterThan(0);
});
