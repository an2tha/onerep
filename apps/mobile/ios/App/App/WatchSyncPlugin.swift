import Capacitor
import Foundation
import WatchConnectivity

/// The phone's half of the link to the watch.
///
/// Deliberately thin. The web app already computes today's numbers for the home
/// widgets; this pushes the same shape to the wrist and relays taps back. No
/// business logic lives here, because every rule about what a glass of water
/// costs or when a workout counts is already written once, in TypeScript.
///
/// Outbound state goes through `updateApplicationContext`, which keeps only the
/// newest value and delivers it whether or not the watch app is running — the
/// right semantics for "here is today", and the wrong ones for events, which is
/// why actions travel the other way as messages instead.
@objc(WatchSyncPlugin)
public class WatchSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchSyncPlugin"
    public let jsName = "WatchSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateContext", returnType: CAPPluginReturnPromise),
    ]

    private var session: WCSession? {
        WCSession.isSupported() ? .default : nil
    }

    override public func load() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        guard let session else {
            call.resolve(["supported": false, "paired": false, "installed": false])
            return
        }
        call.resolve([
            "supported": true,
            "paired": session.isPaired,
            "installed": session.isWatchAppInstalled,
        ])
    }

    @objc func updateContext(_ call: CAPPluginCall) {
        guard let session, session.activationState == .activated else {
            // Not an error worth surfacing: plenty of people do not own a
            // watch, and the caller pushes this on every dashboard render.
            call.resolve(["delivered": false])
            return
        }

        var context: [String: Any] = [:]
        for key in [
            "calories", "calorieGoal", "caloriesLeft", "protein", "proteinGoal",
            "carbs", "carbsGoal", "fat", "fatGoal", "waterMl", "waterGoalMl",
            "streakDays",
        ] {
            if let value = call.getInt(key) { context[key] = value }
        }
        if let brief = call.getString("workoutBrief") {
            context["workoutBrief"] = brief
        }
        context["updatedAt"] = Date().timeIntervalSince1970

        do {
            try session.updateApplicationContext(context)
            call.resolve(["delivered": true])
        } catch {
            call.resolve(["delivered": false])
        }
    }

    /// Hands an inbound action to the web app, which owns the mutation.
    private func relay(_ payload: [String: Any]) {
        guard let action = payload["action"] as? String else { return }
        var data = payload
        data.removeValue(forKey: "action")
        notifyListeners("watchAction", data: ["action": action, "payload": data])
    }
}

extension WatchSyncPlugin: WCSessionDelegate {
    public func session(
        _ session: WCSession,
        activationDidCompleteWith state: WCSessionActivationState,
        error: Error?
    ) {}

    /// Required on iOS: the phone can be handed to a different watch, and the
    /// session must be reactivated for the new pairing.
    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        relay(message)
        replyHandler(["received": true])
    }

    public func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        relay(message)
    }

    /// The queued path, used when the watch acted out of range.
    public func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any]
    ) {
        relay(userInfo)
    }
}
