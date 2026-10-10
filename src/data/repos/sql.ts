// Small helpers the repositories share. Nothing here is exported past src/data/repos.
import { getTableColumns, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "../types";

export const chunks = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** A stored JSON value as text, null for null or undefined: what the JSON columns hold, so two values compare as text. */
export const jsonText = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

/** The row SQLite proposed for insertion (`excluded.col`), for `ON CONFLICT DO UPDATE`. */
export const excluded = (c: SQLiteColumn) => sql.raw(`excluded."${c.name}"`);

/** True when any of the columns would change: SQLite's `IS NOT` is Postgres's `IS DISTINCT FROM` (null-safe, so null is null). */
export const anyDiffers = (cols: SQLiteColumn[]): SQL => or(...cols.map((c) => sql`${c} is not ${excluded(c)}`))!;

/**
 * Runs `fn` as one unit: a SAVEPOINT, so it nests inside `Store.transaction` and also stands alone. `fn` must be
 * synchronous (drizzle's SQLite calls are), so nothing else runs on the connection while the savepoint is open.
 */
export function atomic<T>(db: Db, fn: () => T): T {
  db.run(sql`savepoint repo`);
  try {
    const r = fn();
    db.run(sql`release repo`);
    return r;
  } catch (e) {
    db.run(sql`rollback to repo`);
    db.run(sql`release repo`);
    throw e;
  }
}

/** SQLite allows 32,766 variables in a statement; stay well under it. */
const VARS = 30_000;

/**
 * Multi-row upsert on `key` that updates a row only when a given column differs, so an unchanged re-fetch writes
 * nothing (pulse sources/google/sync.ts:291 `upsert`, `IS DISTINCT FROM` there, `IS NOT` per column here). Rows with
 * the same key: the last wins. A column a row does not carry is left as it is; rows are grouped by the columns they
 * carry. Returns the key columns of the rows actually inserted or updated.
 */
export function upsertChanged(db: Db, table: SQLiteTable, key: string[], input: Record<string, unknown>[]): Record<string, unknown>[] {
  const cols = getTableColumns(table) as Record<string, SQLiteColumn>;
  const byKey = new Map(input.map((r) => [key.map((k) => String(r[k])).join("\u0000"), r]));
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of byKey.values()) {
    const row = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));
    const shape = Object.keys(row).sort().join(",");
    groups.set(shape, [...(groups.get(shape) ?? []), row]);
  }
  const out: Record<string, unknown>[] = [];
  const returned = Object.fromEntries(key.map((k) => [k, cols[k]]));
  for (const rows of groups.values()) {
    const names = Object.keys(rows[0]).filter((k) => !key.includes(k));
    const target = key.map((k) => cols[k]);
    for (const part of chunks(rows, Math.max(1, Math.floor(VARS / Object.keys(rows[0]).length)))) {
      const ins = db.insert(table).values(part as never);
      const res = names.length
        ? ins.onConflictDoUpdate({ target, set: Object.fromEntries(names.map((k) => [k, excluded(cols[k])])) as never, setWhere: anyDiffers(names.map((k) => cols[k])) }).returning(returned).all()
        : ins.onConflictDoNothing().returning(returned).all();
      out.push(...(res as Record<string, unknown>[]));
    }
  }
  return out;
}
