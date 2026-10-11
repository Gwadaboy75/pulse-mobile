// The coach's one-line take on a workout (activity-01's "Analyzing…" pill), ported from Pulse's
// src/app/api/coach/workout/route.ts: the same gate as a chat turn (the per-minute limit, a usable model, the person's
// data), the coach's instructions, then the workout_glance wording and the workout's numbers. Never logs the text, the
// numbers or provider bodies.
import { generateText } from "ai";
import { getActivity } from "@/queries/activity";
import { getActivityExtras } from "@/queries/mobileExtras";
import type { QueryCtx } from "@/queries/ctx";
import type { ActivityVM } from "@/queries/types";
import { coachInstructions } from "./instructions";
import { defaultTexts } from "./texts";
import { allowRequest, type CoachModel, type CoachProblem } from "./transport";

type Workout = ActivityVM & Awaited<ReturnType<typeof getActivityExtras>>;

/** The workout's numbers as plain lines for the model: only what the screen shows. */
export function workoutFacts(a: Workout): string {
  const f = (n: number | null | undefined, d = 1) => (n == null ? "unknown" : n.toFixed(d));
  const lines = [
    `Activity: ${a.name}, ${Math.round((a.end - a.start) / 60_000)} minutes.`,
    `Strain: ${f(a.strain.value)} (usual for ${a.name.toLowerCase()}: ${f(a.strainAverage)}).`,
    ...a.stats.map((s) => `${s.label}: ${f(s.metric.value, 0)}${s.unit ? ` ${s.unit}` : ""} (usual: ${f(s.average, 0)}).`),
    ...(a.steps ? [`Steps: ${a.steps.value} (usual: ${f(a.steps.average, 0)}).`] : []),
    ...(a.zones.value ?? []).map((z) => `${z.label}: ${Math.round(z.seconds / 60)} minutes.`),
  ];
  return lines.join("\n");
}

export type GlanceDeps = { ctx: () => QueryCtx | null; model: () => Promise<CoachModel | null>; allow?: () => boolean };

/** The one-line take. Throws `Error(problem)`: a CoachProblem, "not_found" for an unknown workout, or "provider". */
export async function workoutGlance(deps: GlanceDeps, id: string, abortSignal?: AbortSignal): Promise<string> {
  const m = await deps.model();
  if (!m) throw new Error("key" satisfies CoachProblem);
  if (!(deps.allow ?? allowRequest)()) throw new Error("limit" satisfies CoachProblem);
  const ctx = deps.ctx();
  if (!ctx) throw new Error("profile" satisfies CoachProblem);
  const [vm, extras] = await Promise.all([getActivity(id, ctx), getActivityExtras(id, ctx)]);
  if (!vm) throw new Error("not_found");
  try {
    const { text } = await generateText({
      model: m.model,
      instructions: coachInstructions(ctx, defaultTexts, m.instructions),
      prompt: `${defaultTexts("workout_glance")}\n\n${workoutFacts({ ...vm, ...extras })}`,
      maxOutputTokens: 80,
      abortSignal,
    });
    return text.trim();
  } catch (e) {
    console.warn(`[coach] workout glance via ${m.provider} failed: ${e instanceof Error ? e.name : "error"}`);
    throw new Error("provider");
  }
}
