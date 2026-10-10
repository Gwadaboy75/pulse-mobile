# AGENTS.md

Guide for coding agents (and humans) working on Pulse Mobile: the React Native (Expo) version of Pulse, where every byte lives on the phone. The app asks Google only for permission to the owner's Google Health data (a native OAuth client), pulls Fitbit Air data from the Google Health API, keeps it in SQLite, and turns it into recovery, strain, sleep, Pulse Age, stress, Energy Bank and journal insights with Pulse's own scoring code. There is no server, no web interface and no accounts: one install is one person. The plan is `docs/plan.md`. Read it before you start a stream.

## Expo has changed: do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json` (SDK 57 today, React Native 0.86).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt, an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need. Never answer from memory.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm start` | Dev server (`expo start`) |
| `pnpm ios` | `expo run:ios`: build and run a development build on the iOS simulator or a device (needs Xcode) |
| `pnpm android` | `expo run:android`: build and run a development build on an emulator or a device (needs Android Studio) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest in Node (`src/**/*.test.ts`, `scripts/**/*.test.ts`) |
| `pnpm db:generate` | New drizzle migration from `src/data/schema.ts` into `src/data/migrations/` |
| `npx expo install <pkg>` | Add a dependency. Always use this instead of `pnpm add` for anything native: it picks the version that matches the SDK |
| `npx expo install --fix` | Fix package versions that do not match the SDK |
| `npx expo-doctor` | Diagnose dependency and config issues |
| `npx expo export --platform android --platform ios --output-dir <tmp dir>` | Bundle check: Metro builds both platforms. Use a directory outside the repo and delete it after |
| `npx eas-cli@latest build --profile development` | Cloud development build (profiles in `eas.json`: `development`, `preview`, `production`) |

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit. Run the bundle check when you change `babel.config.js`, `metro.config.js`, `app.json`, or add a dependency.

## Layout

```
app/          Expo Router routes: one file per screen, _layout.tsx files are navigators. Routes live in the root app/, not in src/.
src/
  core/       copied from pulse src/core: pure scoring, no I/O
  lib/        copied from pulse src/lib: format, url, bands, reasons, behaviors, dashboard, extraMetrics
  time.ts     ported from pulse src/server/time.ts. Sits beside pipeline/ and queries/ so their ../time imports match pulse
  pipeline/   stage1, stage2, scores, types: ported from pulse src/server/pipeline onto the repositories
  data/
    schema.ts       drizzle SQLite schema (the contract in the plan, "Data model")
    db.ts           the one database handle; only repos import it
    migrations/     drizzle-kit output, bundled into the app
    repos/          the only code that touches SQLite
  google/     native OAuth, client, catalogue, map, sync, write
  queries/    view models, ported from pulse src/server/queries
  coach/      tools, texts, instructions, history, approvals
  notify/     local notification scheduling
  tasks/      background sync task
  ui/         tokens, shells, kit, charts
  dev/        development screens (kit, parity, time, demo); the routes in app/dev/ load them in development builds only
fixtures/     parity fixtures exported from pulse
scripts/      sync-core.sh and other tooling
docs/         plan.md, design/spec.md, learning.md, runbooks
```

Not every folder exists yet. The plan says in which phase each one arrives.

## Rules

- **No auth.** No accounts, no login screen, no user ids. Google OAuth exists only to grant access to Google Health data, with health scopes only: never `openid`, `email` or `profile`, and never store a Google account's email, name or picture.
- **No I/O in `src/core`.** Pure TypeScript only: no database, no network, no clock reads, no React.
- **Only `src/data/repos` touches SQLite.** Everything else takes plain rows in and out. `src/data/db.ts` is imported by repositories only.
- **No secrets in logs.** Never log tokens, API response bodies or the coach key. The Google tokens and the coach provider key live only in `expo-secure-store`. Never in SQLite, never in a fixture.
- **Honest states.** Every nullable metric is `{ value, reason, provisional }`, using the reason codes in `src/lib/reasons.ts`. Never show a fabricated number. Every screen renders the five metric states through `MetricState`.
- **Scales.** Core keeps Effort on 0 to 100. `toStrainScale` (x21/100) is applied only for display and in Strain Target. Recovery's `sleepPerf` is on [0, 1].
- **Causality.** A day's scores depend only on that day and earlier days. Baselines fold from earlier nights only. Never let a later night change history.
- **UI.** Build from the shells and kit in `src/ui`, using NativeWind classes and the tokens. Spec decisions and deviations live in `docs/design/spec.md`.
- **Copy.** User-facing text says Pulse and Pulse Age.
- **Core is a copy.** `src/core` and the copied `src/lib` files are byte-identical to pulse. Change them only through `scripts/sync-core.sh`, never by hand. A fix belongs in pulse first.
- **Parity.** The pipeline's output hashes must equal fixtures F3 and F4, and the view models must reproduce F6. Comparison is after canonical encoding (sorted keys, 10 significant digits). A port that cannot reach parity reports the exact difference and never rounds it away.
- **Shared files.** `src/data/schema.ts`, the repository interfaces, the UI tokens and the kit's exports change only in the orchestrating session, between waves. A stream that needs a change asks for it in its report.
- **Read the original.** Open the web app's code (the pulse repository) beside every port. The port must read like the original.
- **No native edits.** `ios/` and `android/` are generated (Continuous Native Generation) and git-ignored. Never create or edit them by hand. Configure native behavior in `app.json` and config plugins.
- **Expo Go limits.** Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build (`pnpm ios`, `pnpm android`, or `npx eas-cli@latest build --profile development`).
- **Prefer Expo modules** over third-party libraries. Docs: https://docs.expo.dev/versions/latest/index.md

## Git

- Use the `git` CLI only, never `gh`.
- Commit as `adityaongit`, email `74150665+adityaongit@users.noreply.github.com`. Check `git config user.email` before committing.
- Conventional commit messages, signed off (`git commit -s`).
- Never push to `main`. Work on a branch and land it through a pull request.

## Testing

- Vitest runs in Node. SQLite tests use `better-sqlite3` with the same drizzle schema (see `src/data/migrations.test.ts`).
- Algorithms get golden-value or property tests beside the file. Repositories and queries get tests on an in-memory database.
- No local e2e and no device automation. The owner checks on a phone. CI is the gate.

## Docs

- Explanations, runbooks and guides are markdown in `docs/`. Use mermaid flowcharts for flows and architecture.
- Keep `docs/learning.md` current: when you make an Expo or React Native choice, add one short section.
- Other docs: `docs/google-console.md` (Google OAuth clients), `docs/hermes-time-check.md` (running the time checks under Hermes).
