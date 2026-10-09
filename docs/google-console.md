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

**Open question for the developer, not for this runbook.** Google's native-app docs say "Custom URI schemes are no
longer supported on Android and Chrome apps." So on Android the app will use Google's own Android library instead of a
browser redirect. That changes the app's code, not the console: every Android option needs the same Android client
(package name plus SHA-1). Create it now.

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

- The client ID, for the sign-in request.
- The reversed client ID, registered as a URL scheme in the iOS build (`CFBundleURLSchemes`).
- A redirect URI in this form: `com.googleusercontent.apps.<number>-<hash>:<path>`. Google's docs show the form
  `com.googleusercontent.apps.123:redirect_uri_path`. The developer picks the path. The page says custom URI schemes
  are no longer supported on Android and Chrome apps, and it does not say whether iOS clients need the reversed client
  ID scheme. Confirm the iOS redirect with the developer before testing.

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

## Connect flow (iOS)

```mermaid
flowchart LR
  A["App opens Google consent<br/>in a system browser sheet"] --> B["Owner approves the scopes<br/>on Google's consent screen"]
  B --> C["Google redirects to the app<br/>with a code and the state value"]
  C --> D["App sends the code plus the PKCE verifier<br/>to Google's token endpoint"]
  D --> E["Google returns an access token<br/>and a refresh token"]
  E --> F[("expo-secure-store<br/>keeps the refresh token")]
```

The app creates the PKCE verifier and challenge on the phone. The token exchange needs no client secret. On Android
the developer's chosen Google library replaces the browser and redirect steps; the result is the same: a token kept on
the phone.

## Checklist

- [ ] Android client created with package `in.portlabs.pulse` and the EAS development SHA-1.
- [ ] iOS client created with bundle ID `in.portlabs.pulse`.
- [ ] Reversed client ID recorded.
- [ ] Owner and beta testers added as test users.
- [ ] Three values sent to the developer.
