#!/usr/bin/env python3
"""Exercise the production HealthKit permission catalogue in an iOS simulator.

Builds an isolated probe from the plugin's actual type builders. It requests
authorization without granting access or reading/writing health data. Invalid
types raise Objective-C exceptions that JavaScript and Swift mocks cannot catch.
"""

import argparse
import json
import platform
import plistlib
import subprocess
import tempfile
from pathlib import Path


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def declaration(source, marker):
    start = source.index(marker)
    end = source.index("{", start) + 1
    depth = 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end].replace("private ", "")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", help="An installed iOS simulator runtime identifier")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    source = (root / "apps/mobile/ios/App/App/AppleHealthPlugin.swift").read_text()
    markers = [
        "private enum DailyRollup", "private struct DailyQuantity",
        "private func quantityType", "private func categoryType",
        "private func dailyQuantities", "private enum DailyCategoryRollup",
        "private struct DailyCategory {", "private func dailyCategories",
        "private func logUnresolved", "private func healthReadTypes",
        "private func healthShareTypes",
    ]
    catalogue = "\n".join(declaration(source, marker) for marker in markers)
    runtimes = json.loads(output("xcrun", "simctl", "list", "runtimes", "--json"))["runtimes"]
    available = [r for r in runtimes if r["isAvailable"] and ".iOS-" in r["identifier"]]
    runtime = args.runtime or max(available, key=lambda r: tuple(map(int, r["version"].split("."))))["identifier"]
    device = output("xcrun", "simctl", "create", "OneRep Health Authorization Test",
                    "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro", runtime)
    try:
        run("xcrun", "simctl", "boot", device)
        run("xcrun", "simctl", "bootstatus", device, "-b")
        with tempfile.TemporaryDirectory(prefix="onerep-health-auth-") as tmp:
            folder = Path(tmp)
            app = folder / "HealthAuthorizationTest.app"
            app.mkdir()
            swift = folder / "main.swift"
            swift.write_text("import UIKit\nimport HealthKit\nclass Catalogue {\n" + catalogue + "\n}\n" + r'''
class Delegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
        configurationForConnecting session: UISceneSession,
        options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    let store = HKHealthStore()
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
        options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { exit(1) }
        window = UIWindow(windowScene: scene)
        window?.rootViewController = UIViewController()
        window?.makeKeyAndVisible()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            let catalogue = Catalogue()
            let share = catalogue.healthShareTypes()
            let read = catalogue.healthReadTypes()
            NSLog("Testing %d share types and %d read types", share.count, read.count)
            self.store.requestAuthorization(toShare: share, read: read) { _, error in
                if let error {
                    NSLog("HEALTH_AUTH_FAIL: %@", error.localizedDescription)
                    exit(1)
                }
            }
            // Invalid types throw synchronously. Also allow asynchronous setup
            // errors to arrive before accepting the request. No permissions
            // are granted and the isolated simulator is removed after the test.
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                NSLog("HEALTH_AUTH_PASS: native authorization request accepted")
                exit(0)
            }
        }
    }
}
UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(Delegate.self))
''')
            info = {
                "CFBundleIdentifier": "com.onerep.health-authorization-test",
                "CFBundleExecutable": "HealthAuthorizationTest",
                "CFBundleName": "Health Authorization Test",
                "CFBundleVersion": "1", "CFBundleShortVersionString": "1",
                "CFBundlePackageType": "APPL", "LSRequiresIPhoneOS": True,
                "NSHealthShareUsageDescription": "Verify native authorization in regression tests.",
                "NSHealthUpdateUsageDescription": "Verify native authorization in regression tests.",
                "UILaunchScreen": {},
                "UIApplicationSceneManifest": {"UIApplicationSupportsMultipleScenes": False},
            }
            (app / "Info.plist").write_bytes(plistlib.dumps(info))
            entitlements = folder / "entitlements.plist"
            entitlements.write_bytes(plistlib.dumps({
                "com.apple.developer.healthkit": True,
                "application-identifier": "TESTTEAM01." + info["CFBundleIdentifier"],
            }))
            sdk = output("xcrun", "--sdk", "iphonesimulator", "--show-sdk-path")
            run("xcrun", "--sdk", "iphonesimulator", "swiftc", "-sdk", sdk,
                "-target", f"{platform.machine()}-apple-ios17.0-simulator",
                str(swift), "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT",
                "-Xlinker", "__entitlements", "-Xlinker", str(entitlements),
                "-o", str(app / "HealthAuthorizationTest"))
            run("xcrun", "simctl", "install", device, str(app))
            result = subprocess.run(
                ["xcrun", "simctl", "launch", "--console", device, info["CFBundleIdentifier"]],
                capture_output=True, text=True, timeout=60,
            )
            log = result.stdout + result.stderr
            print(log)
            if "HEALTH_AUTH_PASS:" not in log or "HEALTH_AUTH_FAIL:" in log:
                raise RuntimeError("Native HealthKit authorization smoke test failed")
    finally:
        subprocess.run(["xcrun", "simctl", "shutdown", device], capture_output=True)
        run("xcrun", "simctl", "delete", device)


if __name__ == "__main__":
    main()
