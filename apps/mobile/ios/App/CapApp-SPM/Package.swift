// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v17)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.1"),
        .package(name: "CapacitorCamera", path: "../../../../../node_modules/.bun/@capacitor+camera@8.2.0+767ac80cbab8ae50/node_modules/@capacitor/camera"),
        .package(name: "CapacitorFilesystem", path: "../../../../../node_modules/.bun/@capacitor+filesystem@8.1.2+767ac80cbab8ae50/node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorHaptics", path: "../../../../../node_modules/.bun/@capacitor+haptics@8.0.2+767ac80cbab8ae50/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../../node_modules/.bun/@capacitor+local-notifications@8.2.0+767ac80cbab8ae50/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPreferences", path: "../../../../../node_modules/.bun/@capacitor+preferences@8.0.1+767ac80cbab8ae50/node_modules/@capacitor/preferences"),
        .package(name: "CapacitorShare", path: "../../../../../node_modules/.bun/@capacitor+share@8.0.1+767ac80cbab8ae50/node_modules/@capacitor/share"),
        .package(name: "CapgoCapacitorSpeechRecognition", path: "../../../../../node_modules/.bun/@capgo+capacitor-speech-recognition@8.1.10+767ac80cbab8ae50/node_modules/@capgo/capacitor-speech-recognition"),
        .package(name: "CapgoCapacitorUpdater", path: "../../../../../node_modules/.bun/@capgo+capacitor-updater@8.51.3+767ac80cbab8ae50/node_modules/@capgo/capacitor-updater")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapgoCapacitorSpeechRecognition", package: "CapgoCapacitorSpeechRecognition"),
                .product(name: "CapgoCapacitorUpdater", package: "CapgoCapacitorUpdater")
            ]
        )
    ]
)
