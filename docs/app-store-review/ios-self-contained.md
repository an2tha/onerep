# iOS review fix for guideline 2.5.2

Build 38 was rejected on October 3, 2026 for remote code that could change app behavior after review. The iOS release now excludes the Capgo executable bundle updater from native linking, removes the OtaTrust plugin, and replaces the OTA client at build time with version-only diagnostics. No manifest checking, bundle downloading, or bundle activation code is packaged in the iOS JavaScript assets.

The iOS Needle entry uses the linked native engine and excludes the web script loader. The ONNX fallback runtime and its WebAssembly binary are bundled locally. Remote analytics script injection is excluded. The About update action opens the app's App Store listing. Android and the browser retain their existing update behavior.

Build iOS with `VITE_NATIVE_PLATFORM=ios`. The iOS workflow audits the generated assets before Capacitor sync and checks native plugin linking afterward. `upload_store=true` uploads the binary to App Store Connect without requesting beta review. Select the processed build on version 1.2.1, submit it to main App Review, then request expedited review for the broken Active workout page.

Review notes: This build removes the remote executable bundle update mechanism identified in the beta review of build 38 under guideline 2.5.2. iOS runs the assets bundled in the signed app. App functionality updates are delivered through App Store releases. The build also includes the Active workout loading, sync recovery, and navigation fixes.
