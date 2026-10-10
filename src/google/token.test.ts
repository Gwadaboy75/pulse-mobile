import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SettingValues } from "../data/repos/settings";
import { GOOGLE_CLIENTS } from "./clients";
import { GoogleError, SCOPES } from "./oauth";
import {
  ANDROID_TOKEN_S,
  codeFromRedirect,
  connectMessage,
  consentUrl,
  createGoogleAuth,
  EXPIRY_MARGIN_S,
  IOS_REDIRECT,
  isFresh,
  isIdentityScope,
  nativeCode,
  pkceChallenge,
  renewalError,
  silentScopes,
  type AuthDeps,
} from "./token";

const T = 1_800_000_000; // seconds
const READ = SCOPES.filter((s) => s.endsWith(".readonly"));

describe("scopes", () => {
  it("are Google Health scopes only, with no identity scope", () => {
    expect(SCOPES).toHaveLength(13);
    for (const s of SCOPES) {
      expect(s).toMatch(/^https:\/\/www\.googleapis\.com\/auth\/googlehealth\.[a-z_]+\.(readonly|writeonly)$/);
      expect(isIdentityScope(s)).toBe(false);
    }
    for (const s of ["openid", "email", "profile", "https://www.googleapis.com/auth/userinfo.email"]) expect(isIdentityScope(s)).toBe(true);
  });

  it("the iOS consent URL asks for exactly SCOPES with PKCE S256", () => {
    const q = new URL(consentUrl({ state: "st", challenge: "ch" })).searchParams;
    expect(q.get("scope")!.split(" ")).toEqual(SCOPES);
    expect(q.get("scope")!.split(" ").some(isIdentityScope)).toBe(false);
    expect([q.get("client_id"), q.get("redirect_uri"), q.get("code_challenge_method"), q.get("response_type")]).toEqual([GOOGLE_CLIENTS.ios, IOS_REDIRECT, "S256", "code"]);
    expect(IOS_REDIRECT.startsWith(`${GOOGLE_CLIENTS.iosScheme}:`)).toBe(true);
  });

  it("a silent renewal asks for the stored grant only, in SCOPES order, never anything else", () => {
    expect(silentScopes(`${SCOPES[2]} openid ${SCOPES[0]}`)).toEqual([SCOPES[0], SCOPES[2]]);
  });
});

describe("expiry", () => {
  const s = (expiresAt: number) => ({ accessToken: "a", expiresAt, scope: "" });
  it("a token within a minute of expiry is renewed", () => {
    expect(isFresh(s(T + EXPIRY_MARGIN_S + 1), T)).toBe(true);
    expect(isFresh(s(T + EXPIRY_MARGIN_S), T)).toBe(false);
    expect(isFresh(s(T - 1), T)).toBe(false);
  });
});

describe("PKCE and the redirect", () => {
  it("is base64url(sha256(verifier)) with no padding, as node:crypto computes it", () => {
    for (const v of ["dBjftJeZ4CVP-mB92K27uhbUJU1p1r7wW1gFWFOEjXk", "a".repeat(128)]) {
      expect(pkceChallenge(v)).toBe(createHash("sha256").update(v).digest("base64url"));
    }
  });

  it("reads the code, and rejects a foreign state or a refusal", () => {
    expect(codeFromRedirect(`${IOS_REDIRECT}?state=s&code=c1`, "s")).toBe("c1");
    expect(() => codeFromRedirect(`${IOS_REDIRECT}?state=x&code=c1`, "s")).toThrow(/state_mismatch/);
    expect(() => codeFromRedirect(`${IOS_REDIRECT}?state=s&error=access_denied`, "s")).toThrow(/cancelled/);
  });
});

describe("error mapping", () => {
  it("native codes become GoogleError codes; anything unknown is failed", () => {
    expect(nativeCode({ code: "ERR_CANCELLED" })).toBe("cancelled");
    expect(nativeCode({ code: "ERR_CONSENT_REQUIRED" })).toBe("consent_required");
    expect(nativeCode(new Error("x"))).toBe("failed");
    expect(nativeCode({ code: "ERR_A token goes here" })).toBe("failed");
  });

  it("only a needed consent means reconnect", () => {
    expect(renewalError("consent_required").code).toBe("auth_revoked");
    expect(renewalError("network").code).toBe("network");
    expect(renewalError("play_services").code).toBe("play_services");
  });

  it("a cancel has no message; unknown codes get the generic one", () => {
    expect(connectMessage("cancelled")).toBeNull();
    expect(connectMessage("no_scopes")).toMatch(/at least one/);
    expect(connectMessage("toString")).toMatch(/Couldn’t connect/);
  });
});

// --- The source, on scripted platforms ---------------------------------------------------------

function deps(platform: AuthDeps["platform"], fetchFn?: typeof fetch) {
  const settings = new Map<string, unknown>();
  const secure = new Map<string, string>();
  let now = T * 1000;
  const d: AuthDeps = {
    settings: {
      get: async (k) => (settings.get(k) ?? null) as never,
      set: async (k, v) => void settings.set(k, v),
    },
    secure: { get: async (k) => secure.get(k) ?? null, set: async (k, v) => void secure.set(k, v), remove: async (k) => void secure.delete(k) },
    fetch: fetchFn,
    now: () => now,
    platform,
  };
  return { d, settings, secure, advance: (s: number) => (now += s * 1000), grant: () => settings.get("google.grant") as SettingValues["google.grant"] | undefined };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function android(answers: (() => Promise<{ accessToken: string; grantedScopes: string[] }>)[]) {
  const native = { authorize: vi.fn((_s: string[], _i: boolean) => answers.shift()!()), clearToken: vi.fn(async () => {}) };
  return { native, platform: { os: "android" as const, native } };
}
const coded = (code: string) => Object.assign(new Error("native"), { code });

describe("Android", () => {
  it("connect keeps the granted subset; silent renewals ask for that subset and stay silent", async () => {
    const { native, platform } = android([async () => ({ accessToken: "at-1", grantedScopes: READ }), async () => ({ accessToken: "at-2", grantedScopes: READ })]);
    const h = deps(platform);
    const auth = createGoogleAuth(h.d);
    expect(await auth.connect()).toEqual({ scope: READ.join(" ") });
    expect(native.authorize).toHaveBeenLastCalledWith(SCOPES, true);
    expect(h.grant()).toEqual({ scope: READ.join(" "), revokedAt: null, updatedAt: T });
    // Tokens only in the secure store, never in settings.
    expect(JSON.stringify([...h.settings])).not.toContain("at-1");

    expect(await auth.getAccessToken()).toBe("at-1");
    h.advance(ANDROID_TOKEN_S - EXPIRY_MARGIN_S);
    expect(await auth.getAccessToken()).toBe("at-2");
    expect(native.clearToken).toHaveBeenCalledWith("at-1");
    expect(native.authorize).toHaveBeenLastCalledWith(READ, false);
  });

  it("a cancel, missing Play services or no scope at all is a connect error and stores nothing", async () => {
    for (const [answer, code] of [
      [() => Promise.reject(coded("ERR_CANCELLED")), "cancelled"],
      [() => Promise.reject(coded("ERR_PLAY_SERVICES")), "play_services"],
      [async () => ({ accessToken: "at", grantedScopes: [] }), "no_scopes"],
    ] as const) {
      const h = deps(android([answer]).platform);
      await expect(createGoogleAuth(h.d).connect()).rejects.toMatchObject({ code });
      expect(h.grant()).toBeUndefined();
      expect(h.secure.size).toBe(0);
    }
  });

  it("a needed consent marks the grant revoked; a network failure does not", async () => {
    const { platform } = android([async () => ({ accessToken: "at-1", grantedScopes: SCOPES }), () => Promise.reject(coded("ERR_NETWORK")), () => Promise.reject(coded("ERR_CONSENT_REQUIRED"))]);
    const h = deps(platform);
    const auth = createGoogleAuth(h.d);
    await auth.connect();
    await expect(auth.refresh()).rejects.toMatchObject({ code: "network" });
    expect(h.grant()!.revokedAt).toBeNull();
    await expect(auth.refresh()).rejects.toMatchObject({ code: "auth_revoked" });
    expect(h.grant()!.revokedAt).toBe(T);
    expect(h.secure.size).toBe(0);
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: "auth_revoked" });
  });

  it("disconnect revokes the live token at Google and forgets it", async () => {
    const fetchFn = vi.fn(async () => json(200, {}));
    const { native, platform } = android([async () => ({ accessToken: "at-1", grantedScopes: SCOPES })]);
    const h = deps(platform, fetchFn as unknown as typeof fetch);
    const auth = createGoogleAuth(h.d);
    await auth.connect();
    await auth.disconnect();
    expect(fetchFn).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke", expect.objectContaining({ body: "token=at-1" }));
    expect(native.clearToken).toHaveBeenCalledWith("at-1");
    expect(h.secure.size).toBe(0);
  });

  it("no native module (Expo Go) is `unavailable`", async () => {
    await expect(createGoogleAuth(deps({ os: "android", native: null }).d).connect()).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("iOS", () => {
  const ios = (result: (url: string) => { type: string; url?: string }) => {
    let n = 0;
    return {
      os: "ios" as const,
      openAuthSession: vi.fn(async (url: string) => result(url)),
      randomBytes: (k: number) => new Uint8Array(k).fill(++n),
    };
  };
  const approve = (url: string) => ({ type: "success", url: `${IOS_REDIRECT}?state=${new URL(url).searchParams.get("state")}&code=c1` });

  it("exchanges the code with the verifier and no secret, then refreshes before expiry", async () => {
    const calls: Record<string, string>[] = [];
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      const p = Object.fromEntries(new URLSearchParams(init.body as string));
      calls.push(p);
      return p.grant_type === "authorization_code"
        ? json(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3599, scope: READ.join(" ") })
        : json(200, { access_token: "at-2", expires_in: 3599 });
    });
    const platform = ios(approve);
    const h = deps(platform, fetchFn as unknown as typeof fetch);
    const auth = createGoogleAuth(h.d);
    await auth.connect();
    const sent = new URL(platform.openAuthSession.mock.calls[0][0]).searchParams;
    expect(pkceChallenge(calls[0].code_verifier)).toBe(sent.get("code_challenge"));
    expect(calls[0]).toMatchObject({ client_id: GOOGLE_CLIENTS.ios, code: "c1", redirect_uri: IOS_REDIRECT, grant_type: "authorization_code" });
    expect(calls[0]).not.toHaveProperty("client_secret");
    expect(h.grant()!.scope).toBe(READ.join(" "));

    expect(await auth.getAccessToken()).toBe("at-1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    h.advance(3599 - EXPIRY_MARGIN_S);
    expect(await auth.getAccessToken()).toBe("at-2");
    expect(calls[1]).toEqual({ client_id: GOOGLE_CLIENTS.ios, refresh_token: "rt-1", grant_type: "refresh_token" });
    // The refresh token is kept when Google sends none back.
    expect(JSON.parse(h.secure.get("google.session")!).refreshToken).toBe("rt-1");
  });

  it("a closed sheet is cancelled; invalid_grant on refresh revokes; a 503 does not", async () => {
    await expect(createGoogleAuth(deps(ios(() => ({ type: "cancel" }))).d).connect()).rejects.toMatchObject({ code: "cancelled" });

    const answers = [json(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3599 }), json(503, {}), json(400, { error: "invalid_grant" })];
    const h = deps(ios(approve), (async () => answers.shift()!) as unknown as typeof fetch);
    const auth = createGoogleAuth(h.d);
    await auth.connect();
    expect(h.grant()!.scope).toBe(SCOPES.join(" ")); // no scope in the answer: what was asked for
    await expect(auth.refresh()).rejects.toMatchObject({ code: "http_503" });
    expect(h.grant()!.revokedAt).toBeNull();
    await expect(auth.refresh()).rejects.toEqual(expect.any(GoogleError));
    expect(h.grant()!.revokedAt).toBe(T);
  });

  it("disconnect revokes the refresh token even with Google unreachable, and never throws", async () => {
    const answers: (() => Promise<Response>)[] = [async () => json(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3599 }), () => Promise.reject(new TypeError("offline"))];
    const fetchFn = vi.fn(async () => answers.shift()!());
    const h = deps(ios(approve), fetchFn as unknown as typeof fetch);
    const auth = createGoogleAuth(h.d);
    await auth.connect();
    await expect(auth.disconnect()).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenLastCalledWith("https://oauth2.googleapis.com/revoke", expect.objectContaining({ body: "token=rt-1" }));
    expect(h.secure.size).toBe(0);
  });
});

it("with no grant the source is not connected", async () => {
  await expect(createGoogleAuth(deps({ os: "android", native: null }).d).getAccessToken()).rejects.toMatchObject({ code: "not_connected" });
});
