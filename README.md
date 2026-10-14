# Pulse Mobile

Pulse Mobile is the Android app version of [Pulse](https://github.com/adityaongit/pulse): recovery, strain, sleep, Pulse Age, stress, Energy Bank and journal insights from your Fitbit data, on your phone.

There is no server and no account. The app reads your Fitbit data from **Health Connect**, where the Google Health app writes it, keeps it in SQLite on the phone and scores it there. Pulse only reads Health Connect and never writes to it. The engine (Health Connect source, storage, scoring and view models) comes from halo, a fork of the same Pulse app; the screens keep Pulse's own look.

```mermaid
flowchart LR
  F[Fitbit band] --> G[Google Health app]
  G --> HC[(Health Connect)]
  HC -->|read permissions, source policy| S[Import on the phone]
  S --> DB[(SQLite: expo-sqlite, async)]
  DB --> P[Pipeline: stage 1, stage 2, scoring v19]
  P --> DB
  DB --> Q[View models]
  Q --> UI[Screens: Expo Router, Skia charts]
```

The plan is in [docs/rewrite-plan.md](docs/rewrite-plan.md).

## Pulse Mobile or Pulse?

| | Pulse Mobile (this repo) | [Pulse](https://github.com/adityaongit/pulse) |
|---|---|---|
| Runs | On your Android phone | On a server you host, in the browser (and its app shell) |
| Data | Only on the phone | On your server |
| Source | Fitbit through Health Connect | The Google Health API |
| Accounts | None: one install is one person | One server, many users |

Pulse Mobile imports what Health Connect holds, up to the last 180 days. It does not carry over a Pulse server's
history.

## Install

Download the APK for your phone from [Releases](https://github.com/adityaongit/pulse-mobile/releases/latest)
(`arm64-v8a` fits nearly every phone since 2017) and open it to install. Android asks you to allow installs from
your browser or file manager once. [docs/releases.md](docs/releases.md) lists the builds.

## Setup

You need Node (current LTS) and [pnpm](https://pnpm.io).

```bash
pnpm install
```

## Run it on a phone

Expo changes every SDK, so check the current docs first: fetch https://docs.expo.dev/llms.txt and follow its links. This project is on SDK 57.

Health Connect is a native module, so the app needs a development build, not Expo Go. Build one with `npx eas-cli@latest build --profile development`, or locally with `pnpm android` (needs Android Studio). Then `pnpm start` and open the project in that build. Docs: https://docs.expo.dev/develop/development-builds/introduction.md

On the phone, make sure the Google Health app shares its data with Health Connect, then open Pulse, enter your profile, tap **Connect Health Connect** and allow every permission, including access to past data. The first import reads the last 180 days.

## Commands

| Command | What it does |
|---|---|
| `pnpm start` | Dev server |
| `pnpm android` | Build and run a development build on Android |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest in Node |
| `npx expo install <pkg>` | Add a dependency (use this, not `pnpm add`) |
| `npx expo-doctor` | Check dependencies and config |

## Documentation

- [AGENTS.md](AGENTS.md): commands, layout and rules for contributors and coding agents.
- [docs/rewrite-plan.md](docs/rewrite-plan.md): the move to Health Connect and halo's engine.
- [docs/learning.md](docs/learning.md): a running notebook of the React Native and Expo choices made here, and why.
- [docs/onboarding.md](docs/onboarding.md): the first run.
- [docs/design/spec.md](docs/design/spec.md): the UI contract.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately: [SECURITY.md](SECURITY.md).

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Use it, change it and share it for any noncommercial purpose. Selling it, or putting it inside a commercial product, is not allowed.

Pulse Mobile is an independent project. It is not affiliated with, endorsed by or connected to Fitbit, Google,
WHOOP, Bevel, Garmin or any other wearable maker. The code names other products only to cite what they publish.
