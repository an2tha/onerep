# Native endurance recording

The `EnduranceLocation` Capacitor bridge records outdoor workout locations independently of the WebView. Indoor workouts keep their existing stopwatch flow. The web app and older native shells without this bridge use foreground GPS and pause outdoor sessions when their page becomes hidden.

## Platform services

- iOS uses a long-lived `CLLocationManager` with fitness activity, background location updates, the system location indicator, and automatic pausing disabled. The workout starts from the foreground after precise when-in-use location permission. `UIBackgroundModes` includes `location`.
- Android uses a location foreground service and an ongoing workout notification with a Pause action. The foreground activity requests precise location; the service declares `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION`. It does not request always-on background location permission. Resume starts from an open app.
- Pause and finish stop location collection. Explicit discard and sign-out stop the recorder and delete its local journal. A service interrupted by the OS returns as paused rather than silently counting the downtime as training. Force-quit/reboot continuation is not promised.

See [Apple background location guidance](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background) and [Android foreground location services](https://developer.android.com/develop/sensors-and-location/location/permissions#foreground).

## Journal and recovery

Each platform maintains one private append-only JSON-lines journal, capped at 64 MiB. Reads return up to 500 points per page. iOS files remain accessible after the first unlock while the screen is locked; the temporary recording directory is excluded from backup. Android uses `noBackupFilesDir`.

A byte cursor, route geometry, distance, elevation and filtering state are checkpointed together. The shared TypeScript reducer applies the same GPS filtering used by browser recording. Replaying an acknowledged page cannot add distance twice. Native checkpoints can restore the session if WebView storage disappears. The journal stays available until saving completes.

Resume marks the first new point as a segment boundary. A partial final write is trimmed before recovery or resume. After process interruption, the timer is frozen at the last persisted fix. Recording is resumed explicitly from the app; it does not restart silently after a reboot or force-quit.

## Validation

Local validation on 2026-09-12 passed: 28 shared tracking/endurance tests, four Android journal JVM tests, the standalone Swift journal suite, TypeScript checking, targeted ESLint, the development web bundle, an arm64 iOS Simulator build, and Android debug APK assembly. Both native builds include the updated web assets. Device access was disabled in the agent environment, so no physical-device screen-lock test was performed. The production web build remains gated by the configured development Convex deployment.

Automated coverage includes native journal paging, paused writes, resume boundaries, partial-write recovery, timer recovery, session ownership, cleanup, buffered-point replay, checkpoint failure/retry, recovery after WebView storage loss, and invalidating stale controls on sign-out.

Run the shared reducer/controller tests:

```sh
bun test apps/mobile/src/lib/__tests__/native-endurance.test.ts apps/mobile/src/lib/__tests__/hiking-tracking.test.ts apps/mobile/src/pages/endurance.test.ts
```

Run the platform-independent Swift journal tests on macOS:

```sh
xcrun swiftc apps/mobile/ios/App/App/EnduranceJournal.swift apps/mobile/ios/tests/EnduranceJournalTests.swift -o /tmp/onerep-endurance-journal-tests
/tmp/onerep-endurance-journal-tests
```

Run the Android journal JVM tests from `apps/mobile/android`, using JDK 21:

```sh
./gradlew :app:testDebugUnitTest --tests '*EnduranceJournalTest'
```

Endurance is released from beta. These tests and native builds do **not** validate OS delivery of locations on a locked physical device, so the following checks remain part of release validation on iOS and Android:

1. Start a workout with precise location enabled; compare the foreground route with a known walking route.
2. Lock the screen for at least ten minutes while moving, then reopen. Verify distance and intermediate geometry include that interval without duplicate points or a straight shortcut.
3. Switch apps, lose network access, and return. Verify the local route survives without needing map tiles or a backend connection.
4. Pause, move, resume, and finish. Confirm paused travel is excluded, the service/indicator stops, and the saved route matches the recording.
5. Reload the WebView and terminate/relaunch the process separately. Confirm checkpoint recovery and an honestly paused interrupted session.
6. Revoke location permission, test approximate-only permission, and test device storage exhaustion. Confirm clear errors and preserved recoverable data.
7. Discard or sign out while recording. Confirm native location collection stops and the previous account's journal cannot be resumed.

A new native build is required to install the bridge, service and background-mode declarations. An OTA web update alone cannot add these capabilities.
