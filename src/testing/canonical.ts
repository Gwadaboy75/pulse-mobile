// Canonical encoding and fingerprints, copied from pulse's src/server/pipeline/golden.test.ts (canon and hash) so a
// hash here equals the one pulse pins. The parity rule: outputs match when their canonical encodings hash equal.
// @noble/hashes rather than node:crypto: the same SHA-256, and it also runs on Hermes (app/dev/parity.tsx).
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

// Numbers are rounded to 10 significant digits first, so a last-ulp difference in Math between Node
// versions does not count as a scoring change. Object keys are sorted: jsonb stores them in its own order.
export const canon = (v: unknown): unknown =>
  typeof v === "number"
    ? +v.toPrecision(10)
    : Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;

export const hash = (rs: Record<string, unknown>[]) =>
  bytesToHex(sha256(utf8ToBytes(rs.map((r) => Object.values(r).map((v) => JSON.stringify(canon(v))).join("\t")).join("\n")))).slice(0, 16);

export type Row = Record<string, unknown>;
export type ScoreRows = { daily_scores: Row[]; intraday_series: Row[]; reports: Row[] };

/**
 * golden.test.ts's fingerprints, from score rows instead of a database: one per daily_scores column over (day, value)
 * by day, one per intraday_series kind over (day, data) by day, and one for reports over (period, data) by period.
 * Rows are taken in the order given (the fixtures store them in that order).
 */
export function scoreHashes({ daily_scores, intraday_series, reports }: ScoreRows): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(daily_scores[0] ?? {}).filter((k) => k !== "day").sort())
    out[`daily_scores.${name}`] = hash(daily_scores.map((r) => ({ day: r.day, [name]: r[name] })));
  for (const kind of [...new Set(intraday_series.map((r) => r.kind as string))].sort())
    out[`intraday_series.${kind}`] = hash(intraday_series.filter((r) => r.kind === kind).map((r) => ({ day: r.day, data: r.data })));
  out.reports = hash(reports.map((r) => ({ period: r.period, data: r.data })));
  return out;
}
