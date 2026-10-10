// Where the Google access token comes from. The connect step (how the phone gets a token) is out of this stream:
// the client, sync and write paths take a TokenSource and have no implementation of their own.
//
// What they rely on:
// - getAccessToken(): a token valid right now, refreshed first when it expires within a minute. Throws
//   GoogleError("not_connected") when no grant exists and GoogleError("auth_revoked") once the grant is revoked.
//   Called before every request.
// - refresh(): forces a refresh and returns the new token (the client calls it once, right after a 401). Throws
//   GoogleError("auth_revoked") when Google answers invalid_grant, and any other GoogleError (http_503, network) as is.
// - markRevoked(): records that the grant is dead: sets `revokedAt` in settings 'google.grant', so every later
//   getAccessToken() throws auth_revoked until the person connects again. Safe to call twice.
// Tokens never appear in an error message or a log line.
export type TokenSource = { getAccessToken(): Promise<string>; refresh(): Promise<string>; markRevoked(): Promise<void> };
