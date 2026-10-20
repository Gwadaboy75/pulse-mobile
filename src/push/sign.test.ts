import { describe, expect, it } from "vitest";
import { signBody } from "./sign";

describe("signBody", () => {
  it("is sha256=<HMAC-SHA256 hex> over the exact bytes (RFC 2202-style vector)", () => {
    expect(signBody("The quick brown fox jumps over the lazy dog", "key")).toBe("sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });
  it("changes with one byte of the body or the secret", () => {
    const a = signBody('{"a":1}', "s");
    expect(signBody('{"a":2}', "s")).not.toBe(a);
    expect(signBody('{"a":1}', "t")).not.toBe(a);
    expect(signBody(new TextEncoder().encode('{"a":1}'), "s")).toBe(a);
  });
});
