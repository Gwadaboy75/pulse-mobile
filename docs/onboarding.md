# Onboarding

First run should show Pulse working before it asks for anything. The model is Baro's onboarding: a welcome screen with two
ways in, a plain explainer before Google's consent screen, and Home appearing while the first sync is still running.
Questions come up where their answer is used, not in a form up front.

## The flow

```mermaid
flowchart TD
  W["Welcome<br/>Connect Google Health · Explore with sample data<br/>privacy line"] -->|Explore| S["Seed the last 30 days of the demo story<br/>settings.sample = true"]
  S --> HS["Tabs with the Sample data card"]
  HS -->|"Connect your data<br/>or Settings › Connect"| CX["/connect: explainer (sample copy)"]
  CX -->|Not now| HS
  CX --> CO["Waiting screen behind Google's consent"]
  CO -->|"cancelled: Reconnect Google Health,<br/>or failed: the error"| CX
  CO -->|yes| L["leaveSample: empty every table,<br/>keep the grant and the theme"]
  L --> P
  W -->|Connect| X["Explainer: How Pulse uses your health data"]
  X -->|Not now| W
  X --> O["Waiting screen behind Google's consent"]
  O -->|"cancelled: Reconnect Google Health,<br/>or failed: the error"| X
  O -->|yes| P["Profile: birth date, sex, time zone<br/>'Loading your Google Health data' while the first sync runs"]
  P --> H["Home: 'Syncing · n of N days' over the empty dials"]
  H -.later, in context.-> A["Pulse Age: 'Build your first Pulse Age' checklist, height asked there"]
  H -.later, in context.-> J["Journal: 'Log yesterday' check-in sheet, offered once"]
```

## Where each piece lives

| Piece | Where | Notes |
|---|---|---|
| Steps and start | `src/screens/onboarding/OnboardingScreen.tsx`, `gate.ts` | Welcome, connect, profile. The gate opens onboarding on the profile step when Google is connected but no profile was saved (the app closed in between, or the sample was just left). |
| Frame | `src/screens/onboarding/Frame.tsx` | pulse's AuthShell: wordmark, one 400 px column, footer pinned to the bottom. |
| Explainer and waiting screen | `src/screens/onboarding/Connect.tsx` `ConnectFlow` | One line per scope group in `src/google/oauth.ts` `SCOPES`, plus what Pulse writes. While `connectGoogle()` runs, "Waiting for Google" sits behind Google's screens; a closed consent shows "Reconnect Google Health". Android back is "Not now". |
| Sample data | `loadDemoData(store, { days: 30 })` in `src/seed/load.ts` | The demo story's last 30 days, so its scripted events keep their dates and today is still its last day. The demo saves its own profile, which opens the gate. |
| Sample flag | `settings.sample` | Set before the seed runs, so a seed that stops halfway still shows the way out. `ShellData` passes it to the shells. |
| Sample data card | `src/ui/shells/SampleCard.tsx`, in `PageShell` | Top of every tab root. "Connect your data" opens `/connect`. |
| Leaving sample data | `app/connect.tsx`, `src/actions/sample.ts` | Google says yes first, so a cancelled consent keeps the sample. Then one transaction empties every table (`clearAllTables`, which follows `TABLE_OWNER`) except the new grant and the theme, and the profile step follows. Settings › Connect goes through `/connect` too while the sample is loaded. |
| First sync on Home | `HomeScreen.tsx` `FirstSync` | "Syncing · n of N days" over the dials while the first import runs (`connection: "importing"`). The dials show their own empty states. |
| Pulse Age checklist | `src/screens/health/FirstAge.tsx` | Replaces Pace of Aging until the first Pulse Age: recorded days out of 20, the Sleep, Strain and Fitness measures that are ready, and height (opens the profile sheet). |
| Log yesterday | `app/(tabs)/journal.tsx` `useOfferYesterday` | The first time the Journal opens on today with yesterday not checked in, the check-in sheet opens on yesterday. Once only (`journal.yesterdayOffered`). |

## Why the profile is not deferred further

Baro asks for a birth date only on its Age tab. Pulse cannot: the pipeline reads the profile before scoring anything
(`src/pipeline/index.ts`). Max HR is estimated from age and drives Strain, and sex sets the reference ranges. So the
profile is asked while the first sync runs. Waiting there costs the person no time, and the scores are ready when they
reach Home. Height is optional and waits for the Pulse Age checklist.

## Connecting Google

In Baro the consent never leaves the app, and Pulse does the same:

- **Android:** Google's account chooser and "Select what Pulse can access" screens are Play services' own native screens
  over the app (the Authorization API, `modules/google-auth`). No browser opens on any path.
- **iOS:** Google's consent runs in the in-app sign-in sheet (`ASWebAuthenticationSession`). It stays over the app, but
  it is Google's web page.

Both need the Pulse app build (a development, preview or store build), not Expo Go. The steps, the tokens and the
errors are in `docs/google-console.md` ("Connect flow").

```mermaid
stateDiagram-v2
  [*] --> Explainer: Connect Google Health
  Explainer --> Waiting: Connect Google Health
  Waiting --> Reconnect: consent closed
  Waiting --> Explainer: other error (shown under the button)
  Waiting --> Profile: granted (first sync starts)
  Reconnect --> Waiting: Connect Google Health
  Reconnect --> Welcome: Not now (sample data is there)
  Explainer --> Welcome: Not now
  Profile --> Home: saved (the sync runs again to score)
```

| State | What shows |
|---|---|
| Waiting | "Waiting for Google" with a spinner, behind Google's screens. |
| Reconnect | "Reconnect Google Health", Connect again or Not now. A cancel never clears the sample. |
| Error | One line under the button: no Play services, no network, no scope ticked, a build Google does not recognise. |
| Loading | The profile step's "Loading your Google Health data in the background", then Home's "Syncing · n of N days". |

The first sync is `syncNow()` in `src/screens/settings/connect.ts`: `createGoogleSource(...).pull()` (180 days, cheap types
first), then the pipeline's recompute once a profile exists. Screens reload every 4 s while it runs, so the import line
moves. Saving the profile runs it again, which joins a sync still running or scores what the first one brought.
