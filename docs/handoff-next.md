# Handoff: next session (written 2026-10-10)

Read this first, then `docs/handoff.md` (sections 3, 4, 7) for rules, commands and the code map.

## State

- `main` (pushed) has today's work: UI parity fixes (kit, screens, sheets), narrow-phone layout and type scale, theme tokens
  (audit: `docs/audits/2026-10-10-theme-token-audit.md`), app icon, splash and opening animation, APK size work
  (preview APK 27.2 MB, `docs/learning.md` "Android app size"), and **Google connect** (Android: local Expo module
  `modules/google-auth`, Authorization API, Baro-style in-app consent; iOS: PKCE in the in-app auth sheet, not yet
  compiled or run). Client ids: `src/google/clients.ts`.
- The owner's phone (OnePlus CPH2691, Android, 361 dp) has the preview APK from `main` installed. Google connect works
  on it: every data type shows synced in Settings.
- EAS: project `@adityajindals-team/pulse`, Android keystore on EAS (SHA-1 `29:DA:72:C1:0A:27:25:F7:0F:D1:56:CB:64:15:FE:BB:E9:87:25:A7`,
  the Android OAuth client is bound to it). Build locally, never plain Gradle, so the signature matches:
  `ANDROID_HOME=~/Library/Android/sdk npx eas-cli@latest build -p android --profile <preview|development> --local --non-interactive --output ~/personal/pulse-mobile-builds/<name>.apk`
  then `adb install -r <apk>` (same key, updates in place, keeps data).

## In flight when this session ended

1. **Perf agent** on branch `perf/transitions` (worktree `~/personal/worktrees/pulse-mobile/perf`): opening a screen on
   Android cross-fades with both screens visible (two headers) and is slow. Brief: pick the right transition
   (`slide_from_right` on Android), opaque incoming screen, defer heavy content until the transition ends, stop the 4 s
   sync poll from re-rendering whole screens. Check the branch for its commits; it was not merged.
2. **Development build** (`--profile development --local`) was building into `~/personal/pulse-mobile-builds/pulse-dev-*.apk`,
   signed with the EAS key. Install it on the phone to get JS logs (`adb logcat -s ReactNativeJS`) and live reload with
   Google working; the release APK strips logs.

## Open problems (owner-reported, most important first)

1. **Data synced but nothing scored.** After Google connect, Settings lists every type as synced, yet Home shows "No band
   data yet", Sleep/Recovery "Waiting for sleep", Healthspan "0 of 20 days". Find why on the phone with the dev build:
   the first sync's day range, whether sleep sessions and HR samples land in SQLite, whether the band-presence check and
   `recompute` run over the synced days (`src/google/sync*`, `syncNow`, `src/pipeline`). Compare with pulse's server
   sync (`~/personal/pulse/src/server`, read only).
2. **"Syncing x of 180 days" jumps up and down** and repeats per data type. Show one progress for the whole sync.
3. **Screens open slowly and glitch** (perf agent above). Verify on the phone with `adb shell dumpsys gfxinfo in.portlabs.pulse`.
4. On the phone, R8 is on: check charts, the Log date field (@expo/ui), animations, export, the dashboard editor.
5. iOS Google connect is untested; Android Google console: consent screen lists the 13 Google Health scopes, owner's
   account is a test user.

## How the owner wants to work (see also the memory files)

- Drive the phone yourself over USB: `adb exec-out screencap -p`, `adb shell input tap/swipe`, `adb logcat`,
  `adb shell screenrecord`. Quick targeted checks, never long sweeps. Never delete app data or uninstall without asking.
- Merge each finished fix to `main` and push right away (owner allowed direct pushes), checks green first.
- Fan out work to subagents in worktrees under `~/personal/worktrees/pulse-mobile/`; one owner per shared file.
- UI must look like the Pulse PWA; native behaviour only. Comments: present tense, no owner names or dates.
