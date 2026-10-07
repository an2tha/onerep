# iOS screenshot automation

Fastlane Snapshot drives the installed Capacitor app with XCUITest and saves
full-resolution PNGs plus an HTML overview. It never uploads screenshots.
The dedicated `AppScreenshots` scheme leaves the release scheme unchanged.

## Setup

Use macOS, Xcode with an iOS simulator runtime, Bun dependencies, and a modern
Ruby (the macOS system Ruby is too old for the locked Bundler).
`bun run ios:screenshots` uses a compatible Ruby from your PATH, or automatically
selects installed Homebrew Ruby when your shell still points at macOS Ruby.
It uses the exact Bundler version recorded in `Gemfile.lock`.
For the manual `bundle` setup commands below, first run
`export PATH="$(brew --prefix ruby)/bin:$PATH"` if you use Homebrew Ruby.
From `apps/mobile/ios/App`, install the locked gems:

```sh
bundle install
```

If your Ruby installation is not writable, use a user-owned gem directory:

```sh
bundle config set --local path "$HOME/.cache/onerep-bundle"
bundle install
```

The normal native build prerequisites apply: configure the development Convex
environment and fetch Core ML models with `bun run models:fetch:ios` from the repository root.

## Capture

From `apps/mobile`:

```sh
bun run ios:screenshots
```

This runs the repository's `build:ios` command, including its checks and Capacitor
sync, then captures sign-in and account creation on an iPhone 17 Pro Max in English.
Use a signed-out simulator. No account is created or submitted by the test.

For the main app, sign into a demo account on the selected simulator, complete
onboarding, set the app language to English, dismiss any permission prompts, and
prepare representative data. Then run:

```sh
bun run ios:screenshots flow:tabs
```

This captures Today, Nutrition, Training, Goals, and More. Tests navigate only.
They do not erase the simulator, log out, or seed backend data. Every selected
simulator needs its own prepared session. Captures contain that account's data.

Choose exact installed simulator names and an optional iOS version:

```sh
xcrun simctl list devices available
SCREENSHOT_DEVICES="iPhone 17 Pro Max,iPhone 17 Pro" \
SCREENSHOT_IOS_VERSION="26.2" bun run ios:screenshots flow:tabs
```

After building and syncing the web assets yourself, skip that step:

```sh
bun run ios:screenshots skip_build:true
```

This still builds the native app and UI tests. It captures the assets already in
`ios/App/App/public`, so use it only when those assets are the version you want.
The equivalent command from `ios/App` is
`bundle exec fastlane ios screenshots skip_build:true`.

## Output and extension

- Images and HTML: `ios/App/fastlane/screenshots/auth/` or `screenshots/tabs/`.
- Xcode build output and logs: `ios/App/build/screenshots/`.
- Capture steps: `ios/App/AppScreenshots/OneRepScreenshots.swift`.
- Devices and runner options: `ios/App/fastlane/Snapfile`.

Output folders are ignored by Git. Runs retain existing captures, replacing
matching image names. Remove old output yourself when you want a fresh export.
The status bar is normalized to 9:41 and a full battery. Dates, account data, and
app preferences are live, so prepare them consistently for repeatable captures.

The initial tests expect English accessibility labels. Extend those selectors
before adding languages. Onboarding screenshots need a separate prepared account
and test flow. Android is not included in this iOS Snapshot workflow.

If the app stays blank or never reaches the expected page, the test fails instead
of exporting that screen. Check the build logs and rebuild/sync the web assets.
For a missing signed-in session, verify the exact device and runtime selected;
pin `SCREENSHOT_IOS_VERSION` to keep using the simulator you prepared after an
Xcode update installs a newer runtime.

`SnapshotHelper.swift` is generated from the Fastlane version in `Gemfile.lock`.
When upgrading Fastlane, use `bundle exec fastlane snapshot update` to refresh it.
See the [Fastlane screenshot guide](https://docs.fastlane.tools/getting-started/ios/screenshots/).
