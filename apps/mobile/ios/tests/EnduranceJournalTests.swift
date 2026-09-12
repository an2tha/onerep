import Foundation

@main struct EnduranceJournalTests {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let seed = "{\"id\":\"hike-1\",\"startedAt\":1000,\"pausedDurationMs\":0,\"status\":\"recording\",\"nativeCursor\":900}"
        let journal = try EnduranceJournal(directory: directory)
        try journal.start(id: "hike-1", seed: seed)
        let starting = try JSONSerialization.jsonObject(with: (journal.state()["seed"] as! String).data(using: .utf8)!) as! [String: Any]
        assert(starting["nativeCursor"] as? Int == 0, "A new journal resets an old cursor")
        for index in 0..<1200 {
            try journal.append(["latitude": 48.0 + Double(index) / 100000, "longitude": 11, "altitude": NSNull(), "accuracy": 5, "timestamp": Double(2000 + index * 2000)])
        }
        let first = try journal.read(id: "hike-1", cursor: 0)
        assert((first["points"] as! [[String: Any]]).count == 500)
        assert(first["hasMore"] as! Bool)
        assert((first["points"] as! [[String: Any]])[0]["segmentStart"] as? Bool == true)
        let second = try journal.read(id: "hike-1", cursor: first["nextCursor"] as! UInt64)
        assert((second["points"] as! [[String: Any]]).count == 500)
        let third = try journal.read(id: "hike-1", cursor: second["nextCursor"] as! UInt64)
        assert((third["points"] as! [[String: Any]]).count == 200)
        assert(!(third["hasMore"] as! Bool))
        try journal.control(id: "hike-1", recording: false, now: 2_500_000)
        try journal.append(["timestamp": 2_600_000])
        let paused = try journal.read(id: "hike-1", cursor: third["nextCursor"] as! UInt64)
        assert((paused["points"] as! [[String: Any]]).isEmpty)
        let tornPaused = try FileHandle(forWritingTo: directory.appendingPathComponent("points.jsonl"))
        try tornPaused.seekToEnd(); try tornPaused.write(contentsOf: Data("{\"partial\":".utf8)); try tornPaused.close()
        try journal.control(id: "hike-1", recording: true, now: 2_700_000)
        try journal.append(["latitude": 49, "longitude": 11, "accuracy": 5, "timestamp": 2_800_000.0])
        let resumed = try journal.read(id: "hike-1", cursor: third["nextCursor"] as! UInt64)
        assert((resumed["points"] as! [[String: Any]])[0]["segmentStart"] as? Bool == true)
        let checkpoint = "{\"id\":\"hike-1\",\"distanceMeters\":1200,\"nativeCursor\":\(resumed["nextCursor"]!),\"status\":\"paused\"}"
        try journal.checkpoint(id: "hike-1", seed: checkpoint)
        let handle = try FileHandle(forWritingTo: directory.appendingPathComponent("points.jsonl"))
        try handle.seekToEnd(); try handle.write(contentsOf: Data("{\"partial\":".utf8)); try handle.close()
        let restored = try EnduranceJournal(directory: directory)
        try restored.recoverInterrupted(now: 9_000_000)
        let recovered = try restored.state()
        assert(recovered["status"] as? String == "paused")
        let recoveredSeed = try JSONSerialization.jsonObject(with: (recovered["seed"] as! String).data(using: .utf8)!) as! [String: Any]
        assert(recoveredSeed["pausedAt"] as? Double == 2_800_000)
        assert(recoveredSeed["pausedDurationMs"] as? Double == 200_000)
        assert(recoveredSeed["distanceMeters"] as? Int == 1200)
        let remaining = try restored.read(id: "hike-1", cursor: resumed["nextCursor"] as! UInt64)
        assert((remaining["points"] as! [[String: Any]]).isEmpty)
        do { try restored.clear(id: "someone-else"); fatalError("Cross-session clear must fail") } catch {}
        try restored.clear(id: "hike-1")
        let cleared = try restored.state()
        assert(cleared["active"] as? Bool == false)
        print("PASS: Swift journal paging, paused writes, segment boundaries, checkpoint, torn-write recovery, frozen clock, ownership and cleanup")
    }
}
