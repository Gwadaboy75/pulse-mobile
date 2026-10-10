// Where the Google access token comes from, on both platforms (docs/google-console.md, "Connect flow").
//
// The client, sync and write paths rely on TokenSource:
// - getAccessToken(): a token valid right now, renewed first when it expires within a minute. Throws
//   GoogleError("not_connected") when no grant exists and GoogleError("auth_revoked") once the grant is revoked or
//   Google needs the person's consent again (the "needs reconnect" error). Called before every request.
// - refresh(): forces a renewal and returns the new token (the client calls it once, right after a 401). Throws
//   GoogleError("auth_revoked") when the grant is dead, and any other GoogleError (http_503, network) as is.
// - markRevoked(): records that the grant is dead: sets `revokedAt` in settings 'google.grant', so every later
//   getAccessToken() throws auth_revoked until the person connects again. Safe to call twice.
//
// GoogleAuth adds the connect and disconnect steps:
// - Android: Google's Authorization API (modules/google-auth). Play services shows the account chooser and consent
//   natively and hands back an access token; a silent call with the granted scopes renews it. No refresh token exists.
// - iOS: authorization code with PKCE in an ASWebAuthenticationSession sheet, redirected to the iOS client's reversed
//   client id scheme; the code and later the refresh token are exchanged at Google's token endpoint without a secret.
//
// Tokens live only in the secure store (and in memory while the app runs). Only the granted scope list goes to SQLite.
// Health scopes only: never openid, email or profile, and nothing about the Google account is kept.
// Tokens never appear in an error message or a log line.
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import type { Repos } from "../data/repos";
import { GOOGLE_CLIENTS } from "./clients";
import { errorCode, FETCH_TIMEOUT_MS, GoogleError, parseJson, SCOPES } from "./oauth";
import type { GoogleAuthModule } from "../../modules/google-auth";

export type TokenSource = { getAccessToken(): Promise<string>; refresh(): Promise<string>; markRevoked(): Promise<void> };

export type GoogleAuth = TokenSource & {
  /** Interactive: Google's account chooser and consent. Resolves the granted scopes; throws a GoogleError whose code `connectMessage` reads. */
  connect(): Promise<{ scope: string }>;
  /** Revokes the grant at Google where it can, then forgets the tokens. Never throws. */
  disconnect(): Promise<void>;
};

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SESSION_KEY = "google.session";
/** A token this close to its expiry counts as expired. */
export const EXPIRY_MARGIN_S = 60;
/** Android's tokens come without an expiry. Google's access tokens last an hour. */
export const ANDROID_TOKEN_S = 3600;
/** Where Google sends the iOS consent back: the reversed client id scheme, registered in app.json `ios.scheme`. */
export const IOS_REDIRECT = `${GOOGLE_CLIENTS.iosScheme}:/oauthredirect`;

/** Scopes that name the person. No request holds one. */
export const IDENTITY_SCOPES = ["openid", "email", "profile"];
export const isIdentityScope = (s: string) => IDENTITY_SCOPES.includes(s) || s.includes("/auth/userinfo.");

/** What the secure store keeps. `scope` is the granted list, so a disconnect can revoke without the settings row. */
export type Session = { accessToken: string; expiresAt: number; refreshToken?: string; scope: string };

export const isFresh = (s: Session, nowS: number) => s.expiresAt > nowS + EXPIRY_MARGIN_S;

/** The SCOPES Google granted, in SCOPES order: anything else in the answer is dropped. */
export const grantedOf = (granted: Iterable<string>) => {
  const g = new Set(granted);
  return SCOPES.filter((s) => g.has(s));
};

/** A silent renewal asks for exactly the stored grant, so a partial grant never needs consent again. */
export const silentScopes = (scope: string) => grantedOf(scope.split(/\s+/));

// --- Errors -------------------------------------------------------------------------------------

/** Text for a failed connect, by GoogleError code. `cancelled` has none: the screen shows its reconnect state instead. */
export const CONNECT_MESSAGE: Record<string, string | null> = {
  cancelled: null,
  no_scopes: "Pulse needs at least one Google Health permission. Connect again and choose what Pulse can read.",
  play_services: "Connecting needs Google Play services. Update it from the Play Store and try again.",
  network: "Couldn’t reach Google. Check your connection and try again.",
  misconfigured: "Google doesn’t recognise this build of Pulse yet. Install the build from the developer.",
  unavailable: "Connecting Google needs the Pulse app, not Expo Go.",
};
const CONNECT_FAILED = "Couldn’t connect Google Health. Try again.";
export const connectMessage = (code: string): string | null => (Object.prototype.hasOwnProperty.call(CONNECT_MESSAGE, code) ? CONNECT_MESSAGE[code] : CONNECT_FAILED);

/** The native module's rejection code (`ERR_CANCELLED`) as a GoogleError code (`cancelled`); anything unknown is `failed`. */
export function nativeCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^ERR_[A-Z_]{1,40}$/.test(code) ? code.slice(4).toLowerCase() : "failed";
}

/** A silent Android renewal's failure: only "consent needed" means reconnect; a network or Play services problem retries later. */
export const renewalError = (code: string) => new GoogleError(code === "consent_required" ? "auth_revoked" : code, undefined, "token renew");

// --- iOS: PKCE and the token endpoint ----------------------------------------------------------

export const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** RFC 7636 S256: base64url(sha256(verifier)), no padding. */
export const pkceChallenge = (verifier: string) => base64url(sha256(utf8ToBytes(verifier)));

/** Google's consent URL for the iOS client: code flow, PKCE, health scopes only, the account chooser every time. */
export function consentUrl(o: { state: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENTS.ios,
    redirect_uri: IOS_REDIRECT,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    state: o.state,
    // The account chooser, then the consent screen, which is what returns a refresh token.
    prompt: "select_account consent",
  });
  return `${AUTH_URL}?${q}`;
}

/** The code in Google's redirect. Throws `cancelled` when the person said no, `state_mismatch` for a redirect this app did not start. */
export function codeFromRedirect(url: string, state: string): string {
  const q = new URLSearchParams(url.slice(url.indexOf("?") + 1).split("#")[0]);
  if (q.get("state") !== state) throw new GoogleError("state_mismatch", undefined, "consent");
  const error = q.get("error");
  if (error) throw new GoogleError(error === "access_denied" ? "cancelled" : (errorCode({ error }) ?? "failed"), undefined, "consent");
  const code = q.get("code");
  if (!code) throw new GoogleError("failed", undefined, "consent");
  return code;
}

/** One POST to Google's token endpoint (no client secret: native clients have none). Errors carry Google's code only. */
export async function tokenRequest(fetchFn: typeof fetch, params: Record<string, string>, nowS: number, where: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  let text: string;
  try {
    res = await fetchFn(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString(), signal: abort.signal });
    text = await res.text();
  } catch {
    throw new GoogleError("network", undefined, where);
  } finally {
    clearTimeout(timer);
  }
  const body = parseJson(text) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown } | undefined;
  if (!res.ok) {
    const code = errorCode(body) ?? `http_${res.status}`;
    // Only invalid_grant means the grant is dead. A 5xx is Google having a bad day, not a revocation.
    throw new GoogleError(code === "invalid_grant" ? "auth_revoked" : code, res.status, where);
  }
  if (typeof body?.access_token !== "string" || typeof body.expires_in !== "number") throw new GoogleError("bad_token_response", res.status, where);
  return {
    accessToken: body.access_token,
    expiresAt: nowS + body.expires_in,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined,
  };
}

// --- The source --------------------------------------------------------------------------------

export type SecureStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };

export type AuthDeps = {
  settings: Pick<Repos["settings"], "get" | "set">;
  secure: SecureStore;
  fetch?: typeof fetch;
  /** Milliseconds. */
  now?: () => number;
  platform:
    | { os: "android"; native: GoogleAuthModule | null }
    | { os: "ios"; openAuthSession(url: string, redirect: string): Promise<{ type: string; url?: string }>; randomBytes(n: number): Uint8Array };
};

function parseSession(raw: string | null): Session | null {
  const s = raw ? (parseJson(raw) as Partial<Session> | undefined) : undefined;
  return typeof s?.accessToken === "string" && typeof s.expiresAt === "number" && typeof s.scope === "string" ? (s as Session) : null;
}

export function createGoogleAuth(deps: AuthDeps): GoogleAuth {
  const { settings, secure, fetch: fetchFn = fetch, now = Date.now, platform } = deps;
  const nowS = () => Math.floor(now() / 1000);
  let session: Session | null | undefined; // undefined until read from the secure store
  let renewing: Promise<string> | null = null;

  const load = async () => (session !== undefined ? session : (session = parseSession(await secure.get(SESSION_KEY))));
  const save = async (s: Session | null) => {
    session = s;
    await (s ? secure.set(SESSION_KEY, JSON.stringify(s)) : secure.remove(SESSION_KEY));
  };
  const native = () => {
    if (platform.os !== "android" || !platform.native) throw new GoogleError("unavailable");
    return platform.native;
  };

  async function grant() {
    const g = await settings.get("google.grant");
    if (!g) throw new GoogleError("not_connected");
    if (g.revokedAt !== null) throw new GoogleError("auth_revoked");
    return g;
  }

  async function renew(scope: string): Promise<string> {
    const old = await load();
    try {
      if (platform.os === "android") {
        const n = native();
        if (old) await n.clearToken(old.accessToken).catch(() => {});
        const a = await n.authorize(silentScopes(scope), false).catch((e: unknown) => {
          throw renewalError(nativeCode(e));
        });
        await save({ accessToken: a.accessToken, expiresAt: nowS() + ANDROID_TOKEN_S, scope });
        return a.accessToken;
      }
      if (!old?.refreshToken) throw new GoogleError("auth_revoked", undefined, "token refresh");
      const t = await tokenRequest(fetchFn, { client_id: GOOGLE_CLIENTS.ios, refresh_token: old.refreshToken, grant_type: "refresh_token" }, nowS(), "token refresh");
      await save({ accessToken: t.accessToken, expiresAt: t.expiresAt, refreshToken: t.refreshToken ?? old.refreshToken, scope });
      return t.accessToken;
    } catch (err) {
      if (err instanceof GoogleError && err.code === "auth_revoked") await source.markRevoked();
      throw err;
    }
  }

  /** One renewal at a time: the sync and the live heart-rate pull may ask together. */
  const renewOnce = (scope: string) => (renewing ??= renew(scope).finally(() => (renewing = null)));

  /** A token to revoke: the refresh token on iOS; on Android a live access token, renewed silently when needed. */
  async function revocable(): Promise<string | null> {
    const s = await load();
    if (s?.refreshToken) return s.refreshToken;
    if (s && isFresh(s, nowS())) return s.accessToken;
    if (platform.os !== "android" || !platform.native) return null;
    const scope = s?.scope ?? (await settings.get("google.grant"))?.scope;
    return scope ? (await platform.native.authorize(silentScopes(scope), false)).accessToken : null;
  }

  async function revoke(token: string) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10_000);
    try {
      const res = await fetchFn(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString(), signal: abort.signal });
      await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  const source: GoogleAuth = {
    async getAccessToken() {
      const g = await grant();
      const s = await load();
      return s && isFresh(s, nowS()) ? s.accessToken : renewOnce(g.scope);
    },

    async refresh() {
      return renewOnce((await grant()).scope);
    },

    async markRevoked() {
      const g = await settings.get("google.grant");
      if (g && g.revokedAt === null) await settings.set("google.grant", { ...g, revokedAt: nowS(), updatedAt: nowS() });
      await save(null);
    },

    async connect() {
      let s: Session;
      if (platform.os === "android") {
        const a = await native()
          .authorize(SCOPES, true)
          .catch((e: unknown) => {
            throw new GoogleError(nativeCode(e), undefined, "consent");
          });
        s = { accessToken: a.accessToken, expiresAt: nowS() + ANDROID_TOKEN_S, scope: grantedOf(a.grantedScopes).join(" ") };
      } else {
        const verifier = base64url(platform.randomBytes(32)); // 43 characters, the RFC 7636 minimum
        const state = base64url(platform.randomBytes(16));
        const r = await platform.openAuthSession(consentUrl({ state, challenge: pkceChallenge(verifier) }), IOS_REDIRECT);
        if (r.type !== "success" || !r.url) throw new GoogleError("cancelled", undefined, "consent");
        const code = codeFromRedirect(r.url, state);
        const t = await tokenRequest(fetchFn, { client_id: GOOGLE_CLIENTS.ios, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: IOS_REDIRECT }, nowS(), "token exchange");
        if (!t.refreshToken) throw new GoogleError("no_refresh_token", undefined, "token exchange");
        s = { accessToken: t.accessToken, expiresAt: t.expiresAt, refreshToken: t.refreshToken, scope: grantedOf((t.scope ?? SCOPES.join(" ")).split(/\s+/)).join(" ") };
      }
      if (!s.scope) throw new GoogleError("no_scopes", undefined, "consent");
      await save(s);
      await settings.set("google.grant", { scope: s.scope, revokedAt: null, updatedAt: nowS() });
      return { scope: s.scope };
    },

    async disconnect() {
      const s = await load().catch(() => null);
      try {
        const token = await revocable();
        // Revoking an access token revokes its grant too: every scope this Google project holds for the account.
        if (token) await revoke(token);
      } catch {
        // Best effort: offline, or already revoked. The person can also remove Pulse under Google Account › Third-party access.
      }
      if (platform.os === "android" && platform.native && s) await platform.native.clearToken(s.accessToken).catch(() => {});
      await save(null).catch(() => {});
    },
  };
  return source;
}
