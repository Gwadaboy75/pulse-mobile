// Typed loaders for the parity fixtures in fixtures/ (exported from pulse, see fixtures/README.md). Each reads
// `<name>.json`, or `<name>.json.gz` when the file was too large to keep as plain JSON.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import type { Row, ScoreRows } from "./canonical";

const DIR = fileURLToPath(new URL("../../fixtures/", import.meta.url));

function load<T>(name: string): T {
  const file = `${DIR}${name}.json`;
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : zlib.gunzipSync(fs.readFileSync(`${file}.gz`)).toString("utf8");
  return JSON.parse(text) as T;
}

type Stamp = { generatedFrom: string; scoringVersion: number };
export type Profile = { birthDate: string; sex: "male" | "female"; maxHr: number; maxHrSource: "set" | "estimated"; heightCm: number | null; timeZone: string };
export type Options = { userId: number; timeZone: string; profile: Profile; now: number; seedNows: number[] };
/** Input rows per table (snake_case columns, no user_id). */
export type Tables = Record<string, Row[]>;

export type F1 = Stamp & {
  note: string;
  cases: { file: string; mapper: string; args: Record<string, string>; rows: unknown; payload: { dataPoints?: unknown[]; rollupDataPoints?: unknown[] } }[];
};
export type F2 = Stamp & { note: string; options: Options; tables: Tables };
export type F3 = Stamp & ScoreRows & { options: Options; hashes: Record<string, string> };
export type F4 = Stamp &
  ScoreRows & {
    note: string;
    options: Options;
    seed: Tables;
    change: { day: string; dayIndex: number; session: Row; segments: Row[]; metrics: Row };
    heldBackRecoveryReason: string;
    incremental: { stage1Days: string[]; stage2Days: number; checkpointDay: string };
    equalsFullFold: boolean;
    hashes: Record<string, string>;
  };
export type F5 = Stamp & {
  wall: { tz: string; s: number; day: string; time: string; asUtc: number }[];
  localMidnight: { tz: string; day: string; s: number }[];
  fromWall: { tz: string; civil: string; s: number }[];
  localMinutes: { tz: string; s: number; minutes: number }[];
  utcOffsetS: { tz: string; s: number; offset: number }[];
};
export type F6 = Stamp & {
  note: string;
  ctx: { userId: number; timeZone: string; profile: Profile; mode: "demo" | "google"; now: number };
  days: string[];
  metricKeys: string[];
  cases: { query: "getHome" | "getSleep" | "getRecovery" | "getStrain" | "getMetricDetail"; vm: string; key?: string; day: string; value: unknown }[];
};

export const loadF1 = () => load<F1>("f1-mappers");
export const loadF2 = () => load<F2>("f2-seed");
export const loadF3 = () => load<F3>("f3-scores");
export const loadF4 = () => load<F4>("f4-incremental");
export const loadF5 = () => load<F5>("f5-time");
export const loadF6 = () => load<F6>("f6-viewmodels");
