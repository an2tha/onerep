package com.ananthh.onerep

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile

/** Append-only storage with bounded reads; no dependency on a running WebView. */
class EnduranceJournal(private val directory: File) {
    private val metadataFile = File(directory, "session.json")
    private val pointsFile = File(directory, "points.jsonl")
    private var metadata: JSONObject?
    init {
        directory.mkdirs()
        metadata = if (metadataFile.exists()) JSONObject(metadataFile.readText()) else null
    }
    @Synchronized private fun save() {
        val current = metadata ?: return
        val temporary = File(directory, "session.tmp")
        temporary.outputStream().use { it.write(current.toString().toByteArray(Charsets.UTF_8)); it.fd.sync() }
        check(temporary.renameTo(metadataFile)) { "Could not save the workout journal." }
    }
    private fun requireSession(id: String): JSONObject {
        val current = metadata
        check(current != null && current.optString("sessionId") == id) { "The recorded workout does not match this session." }
        return current
    }
    @Synchronized fun state(): JSONObject {
        val current = metadata ?: return JSONObject().put("active", false)
        return JSONObject(current.toString()).put("active", true).put("seed", current.getJSONObject("seed").toString())
    }
    @Synchronized fun start(id: String, seed: String) {
        require(seed.toByteArray().size <= 2_000_000) { "Workout snapshot is too large." }
        val parsed = JSONObject(seed)
        require(parsed.getString("id") == id) { "Invalid workout snapshot." }
        if (metadata != null) { requireSession(id); return }
        parsed.put("nativeCursor", 0)
        parsed.remove("nativeLastPoint")
        parsed.remove("nativeElevationAnchor")
        pointsFile.writeBytes(byteArrayOf())
        metadata = JSONObject().put("sessionId", id).put("seed", parsed).put("status", parsed.optString("status", "recording")).put("segmentStart", true)
        save()
    }
    @Synchronized fun control(id: String, recording: Boolean, now: Double, stopped: Boolean = false, error: String? = null) {
        val current = requireSession(id)
        val seed = current.getJSONObject("seed")
        if (recording) {
            repairTail()
            if (seed.has("pausedAt")) seed.put("pausedDurationMs", seed.optDouble("pausedDurationMs", 0.0) + (now - seed.getDouble("pausedAt")).coerceAtLeast(0.0))
            seed.remove("pausedAt")
            seed.put("status", "recording")
        } else {
            if (seed.optString("status") != "paused") seed.put("pausedAt", now)
            seed.put("status", "paused")
        }
        current.put("status", if (stopped) "stopped" else if (recording) "recording" else "paused").put("segmentStart", true)
        if (error == null) current.remove("error") else current.put("error", error)
        save()
    }
    @Synchronized fun append(raw: JSONObject) {
        val current = metadata ?: return
        if (current.optString("status") != "recording") return
        val timestamp = raw.getDouble("timestamp")
        if (timestamp <= current.optDouble("lastTimestamp", 0.0)) return
        val point = JSONObject(raw.toString())
        if (current.optBoolean("segmentStart")) point.put("segmentStart", true)
        check(pointsFile.length() < 64 * 1024 * 1024) { "The route journal is full. Finish this workout before starting another." }
        pointsFile.appendOutputStream().use { it.write((point.toString() + "\n").toByteArray(Charsets.UTF_8)); it.fd.sync() }
        current.put("lastTimestamp", timestamp).put("segmentStart", false)
        save()
    }
    private fun File.appendOutputStream() = java.io.FileOutputStream(this, true)
    @Synchronized fun read(id: String, cursor: Long): JSONObject {
        requireSession(id)
        val points = JSONArray()
        var nextCursor = cursor
        var hasMore = false
        RandomAccessFile(pointsFile, "r").use { file ->
            require(cursor >= 0 && cursor <= file.length()) { "The route journal is incomplete. Keep this workout for recovery." }
            file.seek(cursor)
            while (points.length() < 500 && file.filePointer - cursor < 256 * 1024) {
                val line = file.readLine() ?: break
                // A crash during an append can leave an incomplete last row.
                if (file.filePointer == file.length() && pointsFile.length() > 0) {
                    val end = file.filePointer
                    file.seek(end - 1)
                    val terminated = file.readByte().toInt() == 10
                    file.seek(end)
                    if (!terminated) break
                }
                if (line.isNotBlank()) points.put(JSONObject(line))
                nextCursor = file.filePointer
            }
            hasMore = nextCursor < file.length() && nextCursor > cursor
        }
        return state().put("points", points).put("nextCursor", nextCursor).put("hasMore", hasMore)
    }
    @Synchronized fun checkpoint(id: String, seed: String) {
        val current = requireSession(id)
        require(seed.toByteArray().size <= 2_000_000) { "Workout checkpoint is too large." }
        val parsed = JSONObject(seed)
        require(parsed.getString("id") == id) { "Invalid workout checkpoint." }
        val old = current.getJSONObject("seed")
        for (key in listOf("status", "pausedAt", "pausedDurationMs")) {
            if (old.has(key)) parsed.put(key, old.get(key)) else parsed.remove(key)
        }
        current.put("seed", parsed)
        save()
    }
    private fun repairTail() {
        RandomAccessFile(pointsFile, "rw").use { file ->
            var end = file.length()
            while (end > 0) { file.seek(end - 1); if (file.readByte().toInt() == 10) break; end-- }
            file.setLength(end)
            if (end > 0) {
                var start = end - 1
                while (start > 0) { file.seek(start - 1); if (file.readByte().toInt() == 10) break; start-- }
                file.seek(start)
                val last = JSONObject(file.readLine())
                metadata?.put("lastTimestamp", last.getDouble("timestamp"))
            }
        }
    }
    @Synchronized fun recoverInterrupted(now: Double) {
        val current = metadata ?: return
        repairTail()
        if (current.optString("status") != "recording") return
        val end = current.optDouble("lastTimestamp", current.getJSONObject("seed").optDouble("startedAt", now))
        control(current.getString("sessionId"), false, minOf(now, end), error = "Recording was interrupted. Your saved route is recovered; tap Resume to continue.")
    }
    @Synchronized fun clear(id: String) {
        val current = requireSession(id)
        check(current.optString("status") != "recording") { "Stop recording before clearing the journal." }
        check(metadataFile.delete()) { "Could not clear the workout journal." }
        pointsFile.delete()
        metadata = null
    }
}
