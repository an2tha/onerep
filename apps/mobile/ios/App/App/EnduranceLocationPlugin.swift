import Capacitor
import CoreLocation
import Foundation
import UIKit

/// Survives WebView reloads. Core Location writes to disk without JavaScript.
final class EnduranceLocationEngine: NSObject, CLLocationManagerDelegate {
    static let shared = EnduranceLocationEngine()
    let manager = CLLocationManager()
    private(set) var journal: EnduranceJournal?
    private var startupError: Error?
    private var permissionCompletion: ((Error?) -> Void)?
    private override init() {
        super.init()
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("EnduranceLocation")
            journal = try EnduranceJournal(directory: directory)
            try journal?.recoverInterrupted(now: Date().timeIntervalSince1970 * 1000)
        } catch { startupError = error }
        manager.delegate = self
        manager.activityType = .fitness
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
    }
    func reset() throws {
        manager.stopUpdatingLocation()
        let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("EnduranceLocation")
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
        journal = try EnduranceJournal(directory: directory)
        startupError = nil
    }
    func store() throws -> EnduranceJournal {
        if let startupError { throw startupError }
        guard let journal else { throw NSError(domain: "EnduranceLocation", code: 1, userInfo: [NSLocalizedDescriptionKey: "Device route storage is unavailable."]) }
        return journal
    }
    func authorize(_ completion: @escaping (Error?) -> Void) {
        guard UIApplication.shared.applicationState == .active else { completion(problem("Open OneRep to start or resume location tracking.")); return }
        guard CLLocationManager.locationServicesEnabled() else { completion(problem("Turn on Location Services to record your route.")); return }
        switch manager.authorizationStatus {
        case .notDetermined:
            guard permissionCompletion == nil else { completion(problem("A location permission request is already open.")); return }
            permissionCompletion = completion
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            completion(manager.accuracyAuthorization == .fullAccuracy ? nil : problem("Enable Precise Location for OneRep to record your route."))
        default: completion(problem("Allow location access for OneRep in Settings to record your route."))
        }
    }
    private func problem(_ message: String) -> NSError { NSError(domain: "EnduranceLocation", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if let completion = permissionCompletion, manager.authorizationStatus != .notDetermined {
            permissionCompletion = nil
            let allowed = manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse
            completion(allowed && manager.accuracyAuthorization == .fullAccuracy ? nil : problem("Allow Precise Location for OneRep to record your route."))
        } else if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            fail("Location permission was removed. Your route is saved; allow location access to resume.")
        }
    }
    func fail(_ message: String) {
        manager.stopUpdatingLocation()
        if let id = journal?.metadata?["sessionId"] as? String {
            try? journal?.control(id: id, recording: false, now: Date().timeIntervalSince1970 * 1000, error: message)
        }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            guard location.horizontalAccuracy >= 0, abs(location.timestamp.timeIntervalSinceNow) < 30 else { continue }
            let point: [String: Any] = [
                "latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy, "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
                "altitude": location.verticalAccuracy >= 0 ? location.altitude as Any : NSNull(),
                "altitudeAccuracy": location.verticalAccuracy >= 0 ? location.verticalAccuracy as Any : NSNull(),
            ]
            do { try store().append(point) } catch { fail(error.localizedDescription); return }
        }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { fail("Location access is unavailable. Check Location Services and resume your workout.") }
    }
}

@objc(EnduranceLocationPlugin)
public class EnduranceLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EnduranceLocationPlugin"
    public let jsName = "EnduranceLocation"
    public let pluginMethods: [CAPPluginMethod] = ["getState", "start", "resume", "pause", "stop", "read", "checkpoint", "clear", "reset"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private func run(_ call: CAPPluginCall, _ operation: @escaping (EnduranceLocationEngine, EnduranceJournal) throws -> [String: Any]) {
        DispatchQueue.main.async {
            let engine = EnduranceLocationEngine.shared
            do { call.resolve(try operation(engine, engine.store())) } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { try EnduranceLocationEngine.shared.reset(); call.resolve() }
            catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func getState(_ call: CAPPluginCall) { run(call) { _, store in try store.state() } }
    @objc func start(_ call: CAPPluginCall) { begin(call, resume: false) }
    @objc func resume(_ call: CAPPluginCall) { begin(call, resume: true) }
    private func begin(_ call: CAPPluginCall, resume: Bool) {
        DispatchQueue.main.async {
            let engine = EnduranceLocationEngine.shared
            engine.authorize { error in
                if let error { call.reject(error.localizedDescription); return }
                do {
                    let store = try engine.store()
                    let id = call.getString("sessionId") ?? ""
                    if !resume { try store.start(id: id, seed: call.getString("seed") ?? "") }
                    // start is idempotent; only an explicit resume restarts a paused session.
                    if resume { try store.control(id: id, recording: true, now: Date().timeIntervalSince1970 * 1000) }
                    if store.metadata?["status"] as? String == "recording" { engine.manager.startUpdatingLocation() }
                    call.resolve(try store.state())
                } catch { call.reject(error.localizedDescription) }
            }
        }
    }
    @objc func pause(_ call: CAPPluginCall) { end(call, stopped: false) }
    @objc func stop(_ call: CAPPluginCall) { end(call, stopped: true) }
    private func end(_ call: CAPPluginCall, stopped: Bool) {
        run(call) { engine, store in
            let id = call.getString("sessionId") ?? ""
            guard store.metadata?["sessionId"] as? String == id else { throw NSError(domain: "EnduranceLocation", code: 1, userInfo: [NSLocalizedDescriptionKey: "Workout does not match the native recording."]) }
            engine.manager.stopUpdatingLocation()
            try store.control(id: id, recording: false, now: Date().timeIntervalSince1970 * 1000, stopped: stopped)
            return try store.state()
        }
    }
    @objc func read(_ call: CAPPluginCall) {
        run(call) { _, store in
            let cursor = call.getDouble("cursor") ?? 0
            guard cursor.isFinite, cursor >= 0, cursor.rounded() == cursor, cursor <= 64 * 1024 * 1024 else { throw NSError(domain: "EnduranceLocation", code: 1) }
            return try store.read(id: call.getString("sessionId") ?? "", cursor: UInt64(cursor))
        }
    }
    @objc func checkpoint(_ call: CAPPluginCall) {
        run(call) { _, store in try store.checkpoint(id: call.getString("sessionId") ?? "", seed: call.getString("seed") ?? ""); return [:] }
    }
    @objc func clear(_ call: CAPPluginCall) {
        run(call) { _, store in try store.clear(id: call.getString("sessionId") ?? ""); return [:] }
    }
}
