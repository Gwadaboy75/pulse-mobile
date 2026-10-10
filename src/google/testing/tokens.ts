// A scripted TokenSource for the tests: what src/google/token.ts says the client relies on, and nothing else.
import { GoogleError } from "../oauth";
import type { TokenSource } from "../token";

export type FakeTokens = TokenSource & {
  /** The token handed out now; `refresh()` replaces it with `next` (at-2, at-3, ...). */
  current: string;
  refreshCalls: number;
  revokedAt: number | null;
  /** Set to make the next refresh() fail, as Google's invalid_grant does (the grant is dead). */
  refreshError: GoogleError | null;
};

export function fakeTokens(now: () => number = Date.now): FakeTokens {
  const t: FakeTokens = {
    current: "at-1",
    refreshCalls: 0,
    revokedAt: null,
    refreshError: null,
    async getAccessToken() {
      if (t.revokedAt !== null) throw new GoogleError("auth_revoked");
      return t.current;
    },
    async refresh() {
      t.refreshCalls++;
      if (t.refreshError) throw t.refreshError;
      t.current = `at-${t.refreshCalls + 1}`;
      return t.current;
    },
    async markRevoked() {
      t.revokedAt ??= Math.floor(now() / 1000);
    },
  };
  return t;
}
