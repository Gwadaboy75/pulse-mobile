// Logging from Pulse, as halo's src/screens/journal/actions.ts does it: water, food, weight (and body fat), blood
// oxygen, mood, symptoms, or (female profiles) a period or ovulation test. Every entry stays on the phone
// (`logged_entries`, source "pulse"): nothing is written to Health Connect or Google. Same validation and messages as
// pulse's src/server/actions/log.ts.
import { addDays, fromWall, localDay } from "@/lib/time";
import {
  CYCLE_SYMPTOMS,
  deleteEntry,
  FLOWS,
  isCycleKind,
  MEALS,
  MOODS,
  type NewEntry,
  OVULATION_RESULTS,
  saveEntries,
  SYMPTOMS,
  VALENCES,
  type Flow,
  type Meal,
  type Mood,
  type OvulationResult,
  type Symptom,
  type Valence,
} from "@/queries/log";
import type { ActionCtx, ActionResult } from "./journal";

/** One food: its name (blank: the meal's) and calories, and grams; a nutrient not given is null (unknown). */
export type FoodItemInput = { name: string; kcal: number; protein: number | null; carbs: number | null; fat: number | null };

export type LogInput =
  | { kind: "water"; ml: number; at?: string }
  | ({ kind: "food"; meal: Meal; at?: string } & FoodItemInput)
  | { kind: "weight"; kg: number; fatPct: number | null; at?: string }
  | { kind: "spo2"; pct: number; at?: string }
  | { kind: "mood"; moods: Mood[]; valence: Valence | null; at?: string }
  | { kind: "symptoms"; symptoms: Symptom[]; at?: string }
  | { kind: "period"; start: string; end: string; flow: Flow | null }
  | { kind: "ovulation"; result: OvulationResult; at?: string };

const fail = (error: string) => ({ ok: false as const, error });
const nowOf = (c: ActionCtx) => (c.nowS ? c.nowS() : Math.floor(Date.now() / 1000));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && new Date(Date.parse(`${v}T00:00:00Z`)).toISOString().slice(0, 10) === v;
const AT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
/** A local wall time `YYYY-MM-DDTHH:mm` that names a real minute. */
const validAt = (at: string) => {
  const m = AT.exec(at);
  return !!m && isDay(m[1]) && +m[2] < 24 && +m[3] < 60;
};
const keys = (list: readonly (readonly [string, ...unknown[]])[]) => new Set(list.map((x) => x[0]));
const MEAL_KEYS = keys(MEALS);
const MOOD_KEYS = keys(MOODS);
const VALENCE_KEYS = keys(VALENCES);
const SYMPTOM_KEYS = keys(SYMPTOMS);
const FLOW_KEYS = keys(FLOWS);
const RESULT_KEYS = keys(OVULATION_RESULTS);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const grams = (v: unknown) => v === null || (num(v) && v >= 0 && v <= 1000);
const ENUM = "Invalid option";

/** The first problem with `v`, as the web's zod schema reports it; null when it's valid. */
function invalid(v: LogInput): string | null {
  if ("at" in v && v.at !== undefined && !validAt(v.at)) return "Choose a time";
  switch (v.kind) {
    case "water":
      if (!num(v.ml) || !Number.isInteger(v.ml)) return "Enter the amount in millilitres.";
      if (v.ml < 10) return "At least 10 ml";
      if (v.ml > 5000) return "At most 5,000 ml";
      return null;
    case "food":
      if (!MEAL_KEYS.has(v.meal)) return ENUM;
      if (typeof v.name !== "string" || v.name.trim().length > 80) return "Use 80 characters or fewer.";
      if (!num(v.kcal) || !Number.isInteger(v.kcal) || v.kcal < 0) return "Enter calories as a whole number.";
      if (v.kcal > 10_000) return "At most 10,000 kcal";
      if (![v.protein, v.carbs, v.fat].every(grams)) return "Macros are grams, between 0 and 1,000.";
      return null;
    case "weight":
      if (!num(v.kg) || v.kg < 20 || v.kg > 300) return "Between 20 and 300 kg";
      if (v.fatPct !== null && (!num(v.fatPct) || v.fatPct < 2 || v.fatPct > 75)) return "Between 2 and 75%";
      return null;
    case "spo2":
      return num(v.pct) && v.pct >= 70 && v.pct <= 100 ? null : "Between 70 and 100%";
    case "mood":
      if (!Array.isArray(v.moods) || v.moods.length < 1) return "Choose how you feel";
      if (v.moods.length > 5) return "Choose up to 5 feelings";
      if (!v.moods.every((m) => MOOD_KEYS.has(m)) || (v.valence !== null && !VALENCE_KEYS.has(v.valence))) return ENUM;
      return null;
    case "symptoms":
      if (!Array.isArray(v.symptoms) || v.symptoms.length < 1) return "Choose a symptom";
      if (v.symptoms.length > 10) return "Choose up to 10 symptoms";
      if (!v.symptoms.every((s) => SYMPTOM_KEYS.has(s))) return ENUM;
      return null;
    case "period":
      if (!isDay(v.start) || !isDay(v.end)) return "Choose the first and last day.";
      if (v.flow !== null && !FLOW_KEYS.has(v.flow)) return ENUM;
      return null;
    case "ovulation":
      return RESULT_KEYS.has(v.result) ? null : ENUM;
  }
}

/** Logs one entry (weight with body fat is two). */
export async function logEntry(c: ActionCtx, input: LogInput): Promise<ActionResult> {
  const problem = invalid(input);
  if (problem) return fail(problem);
  const v = input;
  const tz = c.timeZone;
  // Cycle tracking never exists on a male profile, whatever a request says.
  if (c.profile.sex !== "female" && (isCycleKind(v.kind) || (v.kind === "symptoms" && v.symptoms.some((s) => CYCLE_SYMPTOMS.has(s))))) {
    return fail("Not available for this profile");
  }

  const now = nowOf(c);
  const today = localDay(now, tz);
  const ts = "at" in v && v.at ? fromWall(v.at, tz) : now;
  if (ts > now + 60) return fail("Can’t log the future");
  if (ts < now - 366 * 86_400) return fail("Can’t log more than a year back");

  let entries: NewEntry[];
  switch (v.kind) {
    case "water":
      entries = [{ type: "hydration-log", ts, data: { ml: v.ml } }];
      break;
    case "food":
      entries = [{ type: "nutrition-log", ts, data: { name: v.name.trim() || null, meal: v.meal, kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat } }];
      break;
    case "weight":
      entries = [
        { type: "weight", ts, data: { kg: Math.round(v.kg * 10) / 10 } },
        ...(v.fatPct != null ? [{ type: "body-fat" as const, ts, data: { pct: Math.round(v.fatPct * 10) / 10 } }] : []),
      ];
      break;
    case "spo2":
      entries = [{ type: "oxygen-saturation", ts, data: { pct: Math.round(v.pct * 10) / 10 } }];
      break;
    case "mood":
      entries = [{ type: "moods", ts, data: { moods: v.moods, valence: v.valence } }];
      break;
    case "symptoms":
      entries = [{ type: "symptoms", ts, data: { symptoms: v.symptoms } }];
      break;
    case "period": {
      if (v.end < v.start) return fail("The last day is before the first");
      if (v.end > today) return fail("Can’t log a future day");
      if (v.start < addDays(today, -366)) return fail("Can’t log more than a year back");
      if (v.end > addDays(v.start, 14)) return fail("A period is 15 days at most");
      entries = [{ type: "menstrual-period", ts: fromWall(`${v.start}T00:00`, tz), data: { start: v.start, end: v.end, flow: v.flow } }];
      break;
    }
    case "ovulation":
      entries = [{ type: "ovulation-test", ts, data: { result: v.result } }];
      break;
  }
  await saveEntries(c.store, entries, { tz, now });
  return { ok: true, data: undefined };
}

/** Deletes a logged entry. */
export async function deleteLogEntry(c: ActionCtx, input: { id: string }): Promise<ActionResult> {
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) return fail("Invalid UUID");
  await deleteEntry(c.store, input.id);
  return { ok: true, data: undefined };
}
