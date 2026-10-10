# Releasing APKs

APKs go to GitHub Releases, never into the repository. Each APK holds one CPU architecture, which keeps it near 29 MB.

| Profile | Architecture | Phones |
|---|---|---|
| `preview` | `arm64-v8a` | Nearly every Android phone since 2017 |
| `preview-armv7` | `armeabi-v7a` | Old 32-bit phones |
| `preview-x86_64` | `x86_64` | Emulators and Chromebooks |

`adb shell getprop ro.product.cpu.abi` prints a connected phone's architecture.

```mermaid
flowchart LR
  Main[main at the commit] --> Build[eas build --local, one per profile]
  Build --> APKs[pulse-SHA-ABI.apk]
  APKs --> Script[scripts/github-release.sh TAG APKs]
  Script --> Release[GitHub release TAG with the APKs]
```

## Build

On `main`, with a clean tree (`eas build` packs the working tree):

```sh
sha=$(git rev-parse --short HEAD)
out=~/personal/pulse-mobile-builds
for p in preview:arm64-v8a preview-armv7:armeabi-v7a preview-x86_64:x86_64; do
  ANDROID_HOME=~/Library/Android/sdk GRADLE_OPTS='-Dorg.gradle.workers.max=2 -Xmx4g' \
    npx eas-cli@latest build -p android --profile "${p%%:*}" --local --non-interactive --output "$out/pulse-$sha-${p##*:}.apk"
done
```

## Publish

```sh
scripts/github-release.sh "v0.1.0-$sha" ~/personal/pulse-mobile-builds/pulse-$sha-*.apk
```

The script creates the release on `HEAD` with GitHub's generated notes, or adds to it when the tag already has one, and prints each APK's download link. It reads the token from `$GH_TOKEN`, which `~/.zshrc` sets to the adityaongit account's under `~/personal/` (its `$GITHUB_TOKEN` is the work account's and is ignored), else from git's credential helper. Any single APK can be added later the same way.
