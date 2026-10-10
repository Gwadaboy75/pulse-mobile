// What the client and sync need from pulse's oauth.ts: the scope list, the error type and the response parsers.
// The consent URL, code exchange and token refresh are the connect step (token.ts), not here.
//
// Hygiene rule: errors and logs carry a status and a short code only, never a token or a response
// body. JSON.parse's own error quotes the input, so bodies are parsed through parseJson.
import type { Repos } from "../data/repos";

export const FETCH_TIMEOUT_MS = 30_000;

// Every read scope the API has, so one consent covers all data. Nutrition has no read-only scope:
// `nutrition.writeonly` is the only one that lets dataPoints.list return food and hydration logs.
// Writes (create, batchDelete) happen only for what the person logs in the app (src/google/logging.ts).
// Health scopes only: never `openid`, `email` or `profile`, since there are no accounts here.
export const SCOPES = [
  // Read: every screen and score. settings.readonly is what users.pairedDevices.list needs (the "no Fitbit device" check).
  "activity_and_fitness.readonly",
  "health_metrics_and_measurements.readonly",
  "sleep.readonly",
  "ecg.readonly",
  "irn.readonly",
  "nutrition.readonly",
  "profile.readonly",
  "settings.readonly",
  // Write: Journal › Log. Moods, symptoms, menstrual periods and ovulation tests are write-only types at Google (no
  // read exists for them), so Pulse keeps its own copy in logged_entries.
  "nutrition.writeonly",
  "health_metrics_and_measurements.writeonly",
  "mindfulness.writeonly",
  "logged_symptoms.writeonly",
  "reproductive_health.writeonly",
].map((s) => `https://www.googleapis.com/auth/googlehealth.${s}`);

/**
 * `code` is ours (`auth_revoked`, `not_connected`, `http_503`, ...) or Google's own error code
 * (`invalid_grant`, `INVALID_ARGUMENT`). Safe to store in `sync_state.last_error` and to log.
 */
export class GoogleError extends Error {
  override name = "GoogleError";
  constructor(
    readonly code: string,
    readonly status?: number,
    where?: string,
  ) {
    super(`[google] ${where ? `${where}: ` : ""}${code}${status ? ` (HTTP ${status})` : ""}`);
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Google's error code from a token-endpoint (`{error: "invalid_grant"}`) or API (`{error: {status, details}}`) body. */
export function errorCode(body: unknown): string | undefined {
  const e = (body as { error?: unknown } | null | undefined)?.error;
  const { details, status } = (e ?? {}) as { status?: unknown; details?: unknown };
  const reason = Array.isArray(details) ? details.find((d) => d?.reason)?.reason : undefined;
  const code = typeof e === "string" ? e : (reason ?? status);
  // Only enum-shaped codes: a free-text field must never reach a log.
  return typeof code === "string" && /^[A-Za-z_]{1,64}$/.test(code) ? code : undefined;
}

/**
 * The scopes in SCOPES the stored grant lacks (empty with no grant: that is "not connected", not "missing").
 * A grant made before a scope was added keeps working for the rest; only a new consent adds it.
 * The grant's scope string is the non-secret part kept in settings 'google.grant'.
 */
export async function missingScopes({ settings }: Pick<Repos, "settings">): Promise<string[]> {
  const grant = await settings.get("google.grant");
  if (!grant) return [];
  const granted = new Set(grant.scope.split(/\s+/));
  return SCOPES.filter((s) => !granted.has(s));
}
