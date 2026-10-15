# Mobile updates

OTA executable updates are disabled for iOS and Android in all builds.
Mobile code changes are delivered through App Store and Google Play releases.

- Capacitor excludes the executable updater from native plugin linking on both platforms.
- The app does not mount the OTA lifecycle, and the shared OTA switch is off.
- Vite replaces the OTA runtime with a version-only module, excluding manifest fetching, bundle downloads, and activation code.
- Native apps unregister legacy service workers and load their bundled assets.
- The OTA release workflow is disabled. Historical release tooling remains in the repository.
- The browser PWA retains its normal service-worker update flow.

These changes take effect when users install the new native store release.
Previously installed app versions are not changed retroactively.
