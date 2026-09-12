package com.ananthh.onerep

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject
import java.nio.file.Files
import java.io.File

class EnduranceJournalTest {
    private fun seed() = JSONObject().put("id", "hike").put("startedAt", 1000).put("status", "recording").put("pausedDurationMs", 0).put("nativeCursor", 800).toString()
    private fun point(time: Long) = JSONObject().put("latitude", 48.0).put("longitude", 11.0).put("accuracy", 5).put("timestamp", time)
    @Test fun replaysBoundedPagesAndResetsOldCursor() {
        val directory = Files.createTempDirectory("endurance-journal").toFile()
        try {
            val store = EnduranceJournal(directory)
            store.start("hike", seed())
            assertEquals(0, JSONObject(store.state().getString("seed")).getInt("nativeCursor"))
            repeat(1200) { store.append(point(2000L + it * 2000L)) }
            val first = store.read("hike", 0)
            assertEquals(500, first.getJSONArray("points").length())
            assertTrue(first.getBoolean("hasMore"))
            val second = store.read("hike", first.getLong("nextCursor"))
            assertEquals(500, second.getJSONArray("points").length())
            val third = store.read("hike", second.getLong("nextCursor"))
            assertEquals(200, third.getJSONArray("points").length())
            assertFalse(third.getBoolean("hasMore"))
            assertEquals(first.toString(), store.read("hike", 0).toString())
        } finally { directory.deleteRecursively() }
    }
    @Test fun pausedPointsAreIgnoredAndResumeStartsANewSegment() {
        val directory = Files.createTempDirectory("endurance-pause").toFile()
        try {
            val store = EnduranceJournal(directory)
            store.start("hike", seed()); store.append(point(2000))
            val first = store.read("hike", 0)
            store.control("hike", false, 3000.0)
            store.append(point(4000))
            assertEquals(0, store.read("hike", first.getLong("nextCursor")).getJSONArray("points").length())
            File(directory, "points.jsonl").appendText("{\"partial\":")
            store.control("hike", true, 5000.0); store.append(point(6000))
            assertTrue(store.read("hike", first.getLong("nextCursor")).getJSONArray("points").getJSONObject(0).getBoolean("segmentStart"))
            assertEquals(2000.0, JSONObject(store.state().getString("seed")).getDouble("pausedDurationMs"), 0.0)
        } finally { directory.deleteRecursively() }
    }
    @Test fun interruptedRecordingRecoversCheckpointAndTrimsTornWrite() {
        val directory = Files.createTempDirectory("endurance-recovery").toFile()
        try {
            val store = EnduranceJournal(directory)
            store.start("hike", seed()); store.append(point(2000)); store.append(point(4000))
            val page = store.read("hike", 0)
            val checkpoint = JSONObject(seed()).put("nativeCursor", page.getLong("nextCursor")).put("distanceMeters", 1234)
            store.checkpoint("hike", checkpoint.toString())
            File(directory, "points.jsonl").appendText("{\"partial\":")
            val reopened = EnduranceJournal(directory)
            reopened.recoverInterrupted(90000.0)
            val state = reopened.state()
            assertEquals("paused", state.getString("status"))
            val restored = JSONObject(state.getString("seed"))
            assertEquals(4000.0, restored.getDouble("pausedAt"), 0.0)
            assertEquals(1234, restored.getInt("distanceMeters"))
            assertEquals(0, reopened.read("hike", page.getLong("nextCursor")).getJSONArray("points").length())
            reopened.control("hike", true, 100000.0); reopened.append(point(102000))
            assertEquals(1, reopened.read("hike", page.getLong("nextCursor")).getJSONArray("points").length())
        } finally { directory.deleteRecursively() }
    }
    @Test fun controlsAreScopedAndStoppedJournalCanBeCleared() {
        val directory = Files.createTempDirectory("endurance-owner").toFile()
        try {
            val store = EnduranceJournal(directory); store.start("hike", seed())
            assertThrows(IllegalStateException::class.java) { store.clear("other") }
            assertThrows(IllegalStateException::class.java) { store.clear("hike") }
            store.control("hike", false, 5000.0, true)
            store.append(point(6000))
            assertEquals(0, store.read("hike", 0).getJSONArray("points").length())
            store.clear("hike")
            assertFalse(EnduranceJournal(directory).state().getBoolean("active"))
        } finally { directory.deleteRecursively() }
    }
}
