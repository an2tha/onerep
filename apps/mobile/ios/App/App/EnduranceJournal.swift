import Foundation

/// A bounded append-only journal, independent of the WebView and its timers.
/// The replay cursor and computed totals are checkpointed together in `seed`.
final class EnduranceJournal {
    private let directory: URL
    private let metadataURL: URL
    private let pointsURL: URL
    private(set) var metadata: [String: Any]?
    private let maxBytes: UInt64 = 64 * 1024 * 1024

    init(directory: URL) throws {
        self.directory = directory
        metadataURL = directory.appendingPathComponent("session.json")
        pointsURL = directory.appendingPathComponent("points.jsonl")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        #if os(iOS)
        var noBackupDirectory = directory
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try noBackupDirectory.setResourceValues(resourceValues)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
        #endif
        if FileManager.default.fileExists(atPath: metadataURL.path) {
            guard let stored = try JSONSerialization.jsonObject(with: Data(contentsOf: metadataURL)) as? [String: Any] else { throw NSError(domain: "EnduranceLocation", code: 1, userInfo: [NSLocalizedDescriptionKey: "The workout backup could not be read. It has been kept for recovery."]) }
            metadata = stored
        }
    }
    private func save() throws {
        guard let metadata else { return }
        try JSONSerialization.data(withJSONObject: metadata).write(to: metadataURL, options: .atomic)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: metadataURL.path)
        #endif
    }
    private func require(_ id: String) throws {
        guard metadata?["sessionId"] as? String == id else { throw failure("The recorded workout does not match this session.") }
    }
    private func failure(_ message: String) -> NSError { NSError(domain: "EnduranceLocation", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    func state() throws -> [String: Any] {
        guard let metadata else { return ["active": false] }
        var result = metadata
        result["active"] = true
        result["seed"] = String(data: try JSONSerialization.data(withJSONObject: metadata["seed"] as? [String: Any] ?? [:]), encoding: .utf8)!
        return result
    }
    func start(id: String, seed: String) throws {
        guard let data = seed.data(using: .utf8), data.count <= 2_000_000,
              var parsed = try JSONSerialization.jsonObject(with: data) as? [String: Any], parsed["id"] as? String == id else { throw failure("Invalid workout snapshot.") }
        if metadata != nil {
            try require(id)
            return
        }
        parsed["nativeCursor"] = 0
        parsed.removeValue(forKey: "nativeLastPoint")
        parsed.removeValue(forKey: "nativeElevationAnchor")
        try Data().write(to: pointsURL)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: pointsURL.path)
        #endif
        metadata = ["sessionId": id, "seed": parsed, "status": parsed["status"] as? String ?? "recording", "segmentStart": true]
        try save()
    }
    func control(id: String, recording: Bool, now: Double, stopped: Bool = false, error: String? = nil) throws {
        try require(id)
        var seed = metadata!["seed"] as? [String: Any] ?? [:]
        if recording {
            try repairTail()
            if let paused = seed["pausedAt"] as? Double {
                seed["pausedDurationMs"] = (seed["pausedDurationMs"] as? Double ?? 0) + max(0, now - paused)
            }
            seed.removeValue(forKey: "pausedAt")
            seed["status"] = "recording"
        } else {
            if seed["status"] as? String != "paused" { seed["pausedAt"] = now }
            seed["status"] = "paused"
        }
        metadata!["seed"] = seed
        metadata!["status"] = stopped ? "stopped" : recording ? "recording" : "paused"
        metadata!["segmentStart"] = true
        metadata!["error"] = error
        try save()
    }
    func append(_ raw: [String: Any]) throws {
        guard metadata?["status"] as? String == "recording" else { return }
        let timestamp = raw["timestamp"] as? Double ?? 0
        guard timestamp > (metadata?["lastTimestamp"] as? Double ?? 0) else { return }
        var point = raw
        if metadata?["segmentStart"] as? Bool == true { point["segmentStart"] = true }
        let handle = try FileHandle(forWritingTo: pointsURL)
        defer { try? handle.close() }
        let size = try handle.seekToEnd()
        guard size < maxBytes else { throw failure("The route journal is full. Finish this workout before starting another.") }
        var data = try JSONSerialization.data(withJSONObject: point)
        data.append(10)
        try handle.write(contentsOf: data)
        try handle.synchronize()
        metadata!["lastTimestamp"] = timestamp
        metadata!["segmentStart"] = false
        try save()
    }
    func read(id: String, cursor: UInt64) throws -> [String: Any] {
        try require(id)
        let handle = try FileHandle(forReadingFrom: pointsURL)
        defer { try? handle.close() }
        let size = try handle.seekToEnd()
        guard cursor <= size else { throw failure("The route journal is incomplete. Keep this workout for recovery.") }
        try handle.seek(toOffset: cursor)
        let data = try handle.read(upToCount: 256 * 1024) ?? Data()
        var points: [[String: Any]] = []
        var start = data.startIndex
        var consumed: UInt64 = 0
        for index in data.indices where data[index] == 10 {
            let row = data[start..<index]
            if !row.isEmpty, let point = try JSONSerialization.jsonObject(with: row) as? [String: Any] { points.append(point) }
            consumed = UInt64(index + 1)
            start = index + 1
            if points.count == 500 { break }
        }
        var result = try state()
        result["points"] = points
        result["nextCursor"] = cursor + consumed
        result["hasMore"] = cursor + consumed < size && consumed > 0
        return result
    }
    func checkpoint(id: String, seed: String) throws {
        try require(id)
        guard let data = seed.data(using: .utf8), data.count <= 2_000_000,
              var parsed = try JSONSerialization.jsonObject(with: data) as? [String: Any], parsed["id"] as? String == id else { throw failure("Invalid workout checkpoint.") }
        let old = metadata!["seed"] as? [String: Any] ?? [:]
        for key in ["status", "pausedAt", "pausedDurationMs"] { parsed[key] = old[key] }
        metadata!["seed"] = parsed
        try save()
    }
    private func repairTail() throws {
        // A torn final write must neither poison replay nor join the next JSON row.
        let handle = try FileHandle(forUpdating: pointsURL)
        defer { try? handle.close() }
        let size = try handle.seekToEnd()
        let tailStart = size > 8192 ? size - 8192 : 0
        try handle.seek(toOffset: tailStart)
        let tail = try handle.readToEnd() ?? Data()
        if let lastNewline = tail.lastIndex(of: 10) {
            try handle.truncate(atOffset: tailStart + UInt64(lastNewline + 1))
            let previous = tail[..<lastNewline].lastIndex(of: 10).map { $0 + 1 } ?? 0
            if let point = try? JSONSerialization.jsonObject(with: tail[previous..<lastNewline]) as? [String: Any] { metadata!["lastTimestamp"] = point["timestamp"] }
        } else if size <= 8192 { try handle.truncate(atOffset: 0) } else { throw failure("The route journal has a damaged tail. It has been kept for recovery.") }
    }
    func recoverInterrupted(now: Double) throws {
        guard let id = metadata?["sessionId"] as? String else { return }
        try repairTail()
        guard metadata?["status"] as? String == "recording" else { return }
        let seed = metadata?["seed"] as? [String: Any] ?? [:]
        let end = metadata?["lastTimestamp"] as? Double ?? seed["startedAt"] as? Double ?? now
        try control(id: id, recording: false, now: min(now, end), error: "Recording was interrupted. Your saved route is recovered; tap Resume to continue.")
    }
    func clear(id: String) throws {
        try require(id)
        guard metadata?["status"] as? String != "recording" else { throw failure("Stop recording before clearing the journal.") }
        try FileManager.default.removeItem(at: metadataURL)
        try? FileManager.default.removeItem(at: pointsURL)
        metadata = nil
    }
}
