import Foundation
import WatchConnectivity

/// The watch's half of the link to the phone.
///
/// Reads come in through `applicationContext`, which is the right channel for
/// this shape of data: the system keeps only the newest one, delivers it
/// whether or not the watch app is running, and never queues a backlog of
/// stale days to replay when the app wakes up.
///
/// Writes go out as messages when the phone is reachable and fall back to
/// `transferUserInfo`, which is queued and guaranteed. A glass of water logged
/// on a wrist out of Bluetooth range still arrives — later, but it arrives.
final class WatchConnectivityStore: NSObject, ObservableObject {
    @Published private(set) var snapshot = TodaySnapshot()
    /// Set while a tap is in flight so the UI can show it was received.
    @Published private(set) var pendingAction: String?

    private var session: WCSession? {
        WCSession.isSupported() ? .default : nil
    }

    override init() {
        super.init()
        guard let session else { return }
        session.delegate = self
        session.activate()
        // The context that arrived before this launch is still the truth.
        apply(session.receivedApplicationContext)
    }

    /// Restores the last snapshot across launches, so opening the app out of
    /// range shows yesterday's numbers with an honest timestamp instead of an
    /// empty screen.
    private static let cacheKey = "onerep.watch.snapshot"

    private func apply(_ context: [String: Any]) {
        guard !context.isEmpty else {
            restoreCached()
            return
        }
        let next = TodaySnapshot(dictionary: context)
        DispatchQueue.main.async { self.snapshot = next }
        if let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: Self.cacheKey)
        }
    }

    private func restoreCached() {
        guard
            let data = UserDefaults.standard.data(forKey: Self.cacheKey),
            let cached = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
        else { return }
        DispatchQueue.main.async { self.snapshot = cached }
    }

    // MARK: - Actions

    func logWater(ml: Int) {
        send(["action": "logWater", "amountMl": ml], label: "water")
        // Optimistic: the phone will correct us on its next context push, and a
        // ring that does not move when tapped feels broken on a wrist.
        DispatchQueue.main.async { self.snapshot.waterMl += ml }
    }

    func logWorkout(_ summary: [String: Any]) {
        var payload = summary
        payload["action"] = "logWorkout"
        send(payload, label: "workout")
    }

    private func send(_ payload: [String: Any], label: String) {
        guard let session, session.activationState == .activated else { return }
        DispatchQueue.main.async { self.pendingAction = label }
        let clear = { DispatchQueue.main.async { self.pendingAction = nil } }

        if session.isReachable {
            session.sendMessage(
                payload,
                replyHandler: { _ in clear() },
                errorHandler: { _ in
                    // Reachability can lapse between the check and the send.
                    session.transferUserInfo(payload)
                    clear()
                }
            )
        } else {
            session.transferUserInfo(payload)
            clear()
        }
    }
}

extension WatchConnectivityStore: WCSessionDelegate {
    func session(
        _ session: WCSession,
        activationDidCompleteWith state: WCSessionActivationState,
        error: Error?
    ) {
        guard state == .activated else { return }
        apply(session.receivedApplicationContext)
    }

    func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        apply(applicationContext)
    }
}
