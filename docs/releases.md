# Releasing APKs

APKs go to GitHub Releases, never into the repository. Each APK holds one CPU architecture, which keeps it near 29 MB.

| Profile | Architecture | Phones |
|---|---|---|
| `preview` | `arm64-v8a` (asset `-arm64`) | Nearly every Android phone since 2017 |
| `preview-armv7` | `armeabi-v7a` (asset `-armv7`) | Old 32-bit phones |
| `preview-x86_64` | `x86_64` (asset `-x86_64`) | Emulators and Chromebooks |

Each release bumps `expo.version` in `app.json` (and `package.json`'s `version` with it) on `main` first: `0.2.0`, then
`0.3.0`, or `0.2.1` for a fix. The Android version code is EAS's remote counter, so it goes up on its own.

`adb shell getprop ro.product.cpu.abi` prints a connected phone's architecture.

```mermaid
flowchart LR
  Bump[Bump expo.version on main] --> Build[eas build --local, one per profile]
  Build --> APKs[pulse-mobile-VERSION-ABI.apk]
  APKs --> Script[scripts/github-release.sh VERSION APKs]
  Script --> Release[GitHub release vVERSION, Pulse Mobile VERSION]
```

## Build

On `main`, with a clean tree (`eas build` packs the working tree):

```sh
v=$(jq -r .expo.version app.json)
out=~/personal/pulse-mobile-builds
for p in preview:arm64 preview-armv7:armv7 preview-x86_64:x86_64; do
  ANDROID_HOME=~/Library/Android/sdk GRADLE_OPTS='-Dorg.gradle.workers.max=2 -Xmx4g' \
    npx eas-cli@latest build -p android --profile "${p%%:*}" --local --non-interactive --output "$out/pulse-mobile-$v-${p##*:}.apk"
done
```

## Publish

```sh
scripts/github-release.sh "$v" ~/personal/pulse-mobile-builds/pulse-mobile-$v-*.apk
```

The release is `v<version>`, titled "Pulse Mobile <version>", with assets `pulse-mobile-<version>-arm64.apk`, `-armv7` and
`-x86_64`. The script refuses a version that is not `app.json`'s, creates the release on `HEAD` with GitHub's generated notes, or adds to it when the tag already has one, and prints each APK's download link. It reads the token from `$GH_TOKEN`, which `~/.zshrc` sets to the adityaongit account's under `~/personal/` (its `$GITHUB_TOKEN` is the work account's and is ignored), else from git's credential helper. Any single APK can be added later the same way.
