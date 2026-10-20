// The webhook signature the server checks (pulse src/server/sources/healthConnect/receive.ts `signatureOk`):
// `sha256=<hex of HMAC-SHA256(secret, raw body)>`, the same header Life Dashboard Companion sends. Pure JS
// (@noble/hashes), so it runs in Hermes and in Node tests alike; no native crypto module.
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export const SIGNATURE_HEADER = "X-Signature";

/** The header value for `body` (the exact bytes sent) under `secret`. */
export function signBody(body: string | Uint8Array, secret: string): string {
  const bytes = typeof body === "string" ? utf8ToBytes(body) : body;
  return `sha256=${bytesToHex(hmac(sha256, utf8ToBytes(secret), bytes))}`;
}
