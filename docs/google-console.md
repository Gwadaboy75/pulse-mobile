# Google Cloud: Android and iOS OAuth clients for Pulse Mobile

## Purpose

Pulse Mobile has no accounts and no sign-in of its own. The phone asks Google for one thing: permission to read and
write the owner's Google Health data, then calls the Google Health API directly. This runbook adds one Android
OAuth client and one iOS OAuth client to the existing Pulse Google Cloud project.

Nothing else changes. The project, the OAuth consent screen, the scopes, and the verification status stay as they are
(see `docs/google-verification.md` in the pulse repo).

## Scopes

The app asks for the same health scopes as the web app: `SCOPES` in `src/server/sources/google/oauth.ts` in the pulse
repo. It does not ask for `LOGIN_SCOPES` (`openid`, `email`, `profile`): the web app needed them for its accounts, and
Pulse Mobile has none.

| # | Scope (full form as Google lists it) | Group |
|---|---|---|
| 1 | `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` | `SCOPES` read |
| 2 | `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly` | `SCOPES` read |
| 3 | `https://www.googleapis.com/auth/googlehealth.sleep.readonly` | `SCOPES` read |
| 4 | `https://www.googleapis.com/auth/googlehealth.ecg.readonly` | `SCOPES` read |
| 5 | `https://www.googleapis.com/auth/googlehealth.irn.readonly` | `SCOPES` read |
| 6 | `https://www.googleapis.com/auth/googlehealth.nutrition.readonly` | `SCOPES` read |
| 7 | `https://www.googleapis.com/auth/googlehealth.profile.readonly` | `SCOPES` read |
| 8 | `https://www.googleapis.com/auth/googlehealth.settings.readonly` | `SCOPES` read |
| 9 | `https://www.googleapis.com/auth/googlehealth.nutrition.writeonly` | `SCOPES` write |
| 10 | `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.writeonly` | `SCOPES` write |
| 11 | `https://www.googleapis.com/auth/googlehealth.mindfulness.writeonly` | `SCOPES` write |
| 12 | `https://www.googleapis.com/auth/googlehealth.logged_symptoms.writeonly` | `SCOPES` write |
| 13 | `https://www.googleapis.com/auth/googlehealth.reproductive_health.writeonly` | `SCOPES` write |

The consent screen lists these scopes under Google Auth Platform › Data access. Do not add or remove any scope in the
console for this work. If a scope is missing from the list, stop and tell the developer.

## Before you start

1. Confirm the Google Auth Platform project is the one that holds the Pulse web client. Use the same project. Do not
   create a new one.
2. Open the Google Auth Platform › Clients page. The console may ask you to register the app first. Google says this is
   required before you create a client.
3. Open the EAS project for Pulse Mobile (`in.portlabs.pulse`). You need its Android keystore fingerprint (step A1).

**How each platform connects.** Google's native-app docs say "Custom URI schemes are no longer supported on Android
and Chrome apps." So Android uses Google's Authorization API from Play services (no browser, no redirect), and only iOS
uses a redirect, to its reversed client id scheme. Both are described under "Connect flow" below. Neither needs a client
secret or a server.

## Android client

Package name: `in.portlabs.pulse`. Scheme in `app.json`: `pulse`.

A1. Get the SHA-1 of the EAS development keystore.

1. In a terminal in the Pulse Mobile repo, run:
   `npx eas-cli@latest credentials -p android`
2. Choose the development profile (`development` in `eas.json`) when asked. Read the output only. Do not delete or reset the keystore.
3. Copy the line labelled SHA1 Fingerprint. The label may differ in your version of the CLI.
4. If you have already run a first `eas build`, the SHA-1 is also printed in the build log. Use the same value.

A2. Create the Android client.

1. Open Google Auth Platform › Clients.
2. Click "CREATE CLIENT".
3. Select the application type for Android. The docs group it under "Native Applications (Android, iOS, Desktop, Chrome
   Extensions, TV and Limited Input)." The dropdown label may differ.
4. In the Package name field, enter `in.portlabs.pulse`.
5. In the SHA-1 field, paste the fingerprint from step A1. The form label may differ.
6. Verification of Android app ownership is optional. You can skip it for now.
7. Click "Create".
8. Copy the Android client ID. It looks like `<number>-<hash>.apps.googleusercontent.com`. Save it for the send-back list.

A3. Custom URI scheme setting.

Nothing to do. Google's current docs say custom URI schemes are no longer supported on Android, and no console setting
enables them. The app uses Google's Android library instead, which needs only the client from step A2.

A4. Play Store release (later, not now).

When the app goes to the Play Store, Play App Signing creates a different key. Google Play must then be able to sign in
with that key too.

1. Open Play Console › Release › Setup › App Integrity. Copy the "App signing key certificate" SHA-1. The label may
   differ.
2. Create a second Android client in the same way as step A2, with that SHA-1 and the same package name.
3. Give both client IDs to the developer. The developer decides which one the release build uses.

## iOS client

Bundle ID: `in.portlabs.pulse`.

B1. Create the iOS client.

1. Open Google Auth Platform › Clients.
2. Click "CREATE CLIENT".
3. Select the application type for iOS. The docs say "Select the iOS application type." The dropdown label may differ.
4. Enter a name for the client. The field label may differ.
5. In the Bundle ID field, enter `in.portlabs.pulse`. The field label may differ.
6. If the form asks for a Team ID, enter the 10-character Apple Developer Team ID for the Pulse team. Google says
   a team ID is required for iOS clients, and the field label may differ.
7. Leave "Protect your OAuth client from abuse with Firebase App Check" off unless the developer asks for it.
8. Click "Create".
9. Copy the client ID shown. It looks like `<number>-<hash>.apps.googleusercontent.com`.

B2. Record the reversed client ID.

The reversed client ID is the client ID with the order reversed, for example `com.googleusercontent.apps.<number>-<hash>`.
Google's docs call this "the reverse DNS notation of the client ID." The console may show it on the client's details
page. If it does not, build it from the client ID. The label may differ.

B3. What the app needs from the iOS client.

- The client ID, for the consent request (`src/google/clients.ts`).
- The reversed client ID, registered as the iOS URL scheme (`ios.scheme` in `app.json`).
- The redirect URI `com.googleusercontent.apps.<number>-<hash>:/oauthredirect`. Google allows this custom scheme for
  iOS clients, and nothing needs to be entered in the console for it.

B4. Client secret.

Google's console may show a client secret for a native client. The app does not use one. Google says `client_secret`
does not apply to Android, iOS or Chrome app clients. Ignore it. Do not send it.

## Test users

The app stays in testing status until verification is done. In testing, only listed test users can sign in.

1. Open Google Auth Platform › Audience. The label may differ.
2. Under Test users, click "Add users".
3. Add the owner's Google account. It must be the account that holds the Fitbit data.
4. Add the Google accounts of beta testers.
5. Testing status allows up to 100 test users. Pulse's verification notes say an unverified app is capped at about 100
   users. Stay under this limit.

For verification, see `docs/google-verification.md` in the pulse repo. It lists the submission fields, the scope
justifications and the demo video steps. Verification is needed beyond 100 users.

## Send back to the developer

Send these three values after both clients exist. Paste them as plain text.

| Value | Where it comes from | Example form |
|---|---|---|
| Android client ID | Step A2, point 8 | `<number>-<hash>.apps.googleusercontent.com` |
| iOS client ID | Step B1, point 9 | `<number>-<hash>.apps.googleusercontent.com` |
| iOS reversed client ID | Step B2 | `com.googleusercontent.apps.<number>-<hash>` |

Client IDs are not secrets. They appear in the app and in the consent URL. No client secret exists for these native
clients, and none is needed. Do not send any client secret, Google account password or Fitbit data.

If you added a Play App Signing client (step A4), also send its client ID.

## Connect flow

The code is `src/google/token.ts` (`createGoogleAuth`: connect, token renewal, disconnect), `src/google/auth.ts` (the
device's modules), `modules/google-auth/` (the Android Authorization API) and `src/screens/settings/connect.ts`
(`connectGoogle`, `syncNow`). Tokens live only in `expo-secure-store` (`google.session`, readable after the first
unlock, never restored onto another device). SQLite holds only the granted scope list (`settings` `google.grant`).
Neither platform asks for `openid`, `email` or `profile`, and the app never learns which Google account was chosen.

### Android: Google's Authorization API

Docs: [Authorize access to Google user data](https://developer.android.com/identity/authorization). Play services
matches the request to the Android client by package name and signing SHA-1, so the app passes no client id. Every
screen is Google's own native UI over the app; nothing opens a browser.

```mermaid
sequenceDiagram
  actor P as Person
  participant App as Pulse (ConnectFlow)
  participant M as modules/google-auth
  participant GMS as Google Play services
  participant API as Google Health API
  P->>App: Connect Google Health
  App->>M: authorize(SCOPES, interactive)
  M->>GMS: AuthorizationClient.authorize(scopes, prompt SELECT_ACCOUNT)
  GMS-->>M: result with a consent PendingIntent
  M->>GMS: startIntentSenderForResult(PendingIntent)
  GMS->>P: Choose an account, then "Select what Pulse can access"
  P-->>GMS: ticks some or all scopes
  GMS-->>M: access token + granted scopes
  M-->>App: { accessToken, grantedScopes }
  App->>App: secure store: token; settings: granted scopes
  App->>API: first sync (Bearer token)
  Note over App,GMS: Later: an expired token, or a 401
  App->>M: clearToken(old), authorize(granted scopes, silent)
  M->>GMS: authorize without UI
  GMS-->>App: fresh access token, or "consent required" (the grant shows as revoked: Reconnect)
```

- A cancelled consent returns `cancelled`: the Connect screen shows "Reconnect Google Health".
- No Play services: `play_services`, with a message to update it. A package or SHA-1 that does not match the Android
  client: `misconfigured`.
- A partial grant is kept as granted. Silent renewals ask for exactly the granted scopes, so they never need consent
  again; Settings shows "Pulse needs new permissions" for the missing ones.
- Disconnect revokes the grant at `https://oauth2.googleapis.com/revoke` with a live access token (revoking an access
  token revokes its grant) and clears Play services' cached token.

### iOS: authorization code with PKCE in the in-app sign-in sheet

Docs: [OAuth 2.0 for iOS and desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) and
[`WebBrowser.openAuthSessionAsync`](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/). The sheet is
`ASWebAuthenticationSession`, which stays over the app (not Safari).

```mermaid
sequenceDiagram
  actor P as Person
  participant App as Pulse (ConnectFlow)
  participant S as Sign-in sheet (ASWebAuthenticationSession)
  participant G as accounts.google.com
  participant T as oauth2.googleapis.com/token
  P->>App: Connect Google Health
  App->>App: PKCE verifier + S256 challenge, random state
  App->>S: open consent URL (iOS client id, SCOPES, prompt select_account consent)
  S->>G: consent page
  G->>P: choose an account, choose what Pulse can read
  P-->>G: allow
  G-->>S: redirect com.googleusercontent.apps...:/oauthredirect?code&state
  S-->>App: redirect URL (sheet closes)
  App->>App: check state
  App->>T: code + code_verifier + client_id (no secret)
  T-->>App: access token, refresh token, granted scopes
  App->>App: secure store: tokens; settings: granted scopes
  Note over App,T: Later: within a minute of expiry, or a 401
  App->>T: refresh_token + client_id
  T-->>App: new access token, or invalid_grant (the grant shows as revoked: Reconnect)
```

- Closing the sheet or "Cancel" on Google's page returns `cancelled`.
- Only `invalid_grant` marks the grant revoked. A 5xx or no network leaves it alone and the next sync tries again.
- Disconnect revokes the refresh token at `https://oauth2.googleapis.com/revoke`.

## For the owner in the console

- Google Auth Platform › Data access lists the 13 scopes above. The consent screen shows only what is listed there.
- Google Auth Platform › Audience: the account that holds the Fitbit data is a test user while the app is in testing.
- The Android client's SHA-1 must be the keystore that signs the installed build (EAS development or preview). A build
  signed with another key fails the connect with "Google doesn’t recognise this build of Pulse yet".

## Checklist

- [ ] Android client created with package `in.portlabs.pulse` and the EAS development SHA-1.
- [ ] iOS client created with bundle ID `in.portlabs.pulse`.
- [ ] Reversed client ID recorded.
- [ ] Owner and beta testers added as test users.
- [ ] Three values sent to the developer.
