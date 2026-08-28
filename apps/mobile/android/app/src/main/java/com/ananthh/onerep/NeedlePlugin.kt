package com.ananthh.onerep

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONArray

/**
 * The Android half of `@repo/needle`, over the JNI shim in `src/main/cpp`.
 *
 * A mirror of NeedlePlugin.swift, on purpose and down to the buffer size. Two
 * platforms sharing one TypeScript interface is only worth anything if they
 * also share their failure modes; a plugin that truncates at a different length
 * on Android would surface as "the model is worse on my phone".
 */
@CapacitorPlugin(name = "Needle")
class NeedlePlugin : Plugin() {

    /**
     * The engine is one process-global instance behind four free functions —
     * `needle_reset()` takes no handle — so overlapping completions do not race
     * on a lock, they interleave inside one KV cache and answer each other's
     * questions. One thread, in order, for the life of the app.
     */
    private val engine = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "needle").apply { isDaemon = true }
    }

    private var loaded = false

    /** Whether tuned weights have replaced the ones the archive was built with. */
    private var overridden = false

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", true).put("platform", "android"))
    }

    /**
     * Almost always a no-op, and deliberately so.
     *
     * `libneedle.a` is two objects: the NEON kernels, and 13.7 MB that is
     * `needle2.cact` embedded verbatim as `needle_weights`. The kernel object
     * references that symbol as undefined — it reads the linked-in weights
     * directly — so an app that ships the archive already has the model, and
     * `needle_load` is the override rather than the setup step. Calling this
     * with no arguments transfers nothing and touches no disk.
     *
     * The override exists for tuned `.cact` files. A URL beats base64 by a
     * distance: 13.7 MB across the bridge is an 18 MB JSON string. Cached in
     * the app's no-backup files directory, because it is a redownloadable
     * artifact and 13 MB of somebody's Google Drive quota is not ours to spend.
     */
    @PluginMethod
    fun load(call: PluginCall) {
        engine.execute {
            val override = call.getString("url") ?: call.getString("data")
            if (override == null) {
                loaded = true
                call.resolve(JSObject().put("bytes", 0).put("source", "embedded"))
                return@execute
            }
            if (overridden) {
                call.resolve(JSObject().put("bytes", 0).put("source", "cached"))
                return@execute
            }
            try {
                val bytes = weightBytes(call)
                val code = nativeLoad(bytes)
                if (code < 0) {
                    call.reject("needle_load failed ($code)")
                    return@execute
                }
                loaded = true
                overridden = true
                val source = if (call.getString("url") == null) "data" else "url"
                call.resolve(JSObject().put("bytes", bytes.size).put("source", source))
            } catch (error: Throwable) {
                call.reject("needle: could not load weights — ${error.message}", error)
            }
        }
    }

    /** Rebuild the context: system facts, tool schemas, and the grammar built from them. */
    @PluginMethod
    fun init(call: PluginCall) {
        val toolsJson = call.getString("toolsJson")
        if (toolsJson == null) {
            call.reject("needle: init needs toolsJson")
            return
        }
        val system = call.getString("system")
        val indexPath = call.getString("toolIndexPath") ?: defaultIndexPath()
        engine.execute {
            if (!loaded) {
                call.reject("needle: init before load")
                return@execute
            }
            // Negative is the failure, not non-zero: needle_init answers with
            // the size of the tool context in tokens, and needle_complete with
            // the bytes it wrote.
            val code = nativeInit(system, toolsJson, indexPath)
            if (code < 0) {
                call.reject("needle_init failed ($code)")
                return@execute
            }
            val tools = runCatching { JSONArray(toolsJson).length() }.getOrDefault(0)
            call.resolve(JSObject().put("tools", tools))
        }
    }

    /**
     * One turn. The JSON goes back untouched — parsing it here would mean a
     * second parser to keep in step with `packages/needle/src/turn.ts`, for no
     * gain, since the bridge serialises on the way out anyway.
     */
    @PluginMethod
    fun complete(call: PluginCall) {
        val input = call.getString("input")
        if (input == null) {
            call.reject("needle: complete needs input")
            return
        }
        val maxNewTokens = call.getInt("maxNewTokens") ?: DEFAULT_MAX_NEW_TOKENS
        engine.execute {
            if (!loaded) {
                call.reject("needle: complete before load")
                return@execute
            }
            val json = nativeComplete(input, maxNewTokens, BUFFER_BYTES)
            if (json == null) {
                call.reject("needle_complete failed")
                return@execute
            }
            call.resolve(JSObject().put("json", json))
        }
    }

    @PluginMethod
    fun reset(call: PluginCall) {
        engine.execute {
            nativeReset()
            call.resolve()
        }
    }

    private fun weightBytes(call: PluginCall): ByteArray {
        call.getString("data")?.let { return Base64.decode(it, Base64.DEFAULT) }
        val url = call.getString("url") ?: error("load needs either url or data")
        if (url.startsWith("file://") || url.startsWith("/")) {
            return File(url.removePrefix("file://")).readBytes()
        }
        // The file name carries the version — the fetch script publishes under a
        // versioned prefix — so a new build lands beside the old one rather than
        // reusing a stale cache entry under the same name.
        val cached = File(needleDir(), url.substringAfterLast('/'))
        if (cached.exists()) return cached.readBytes()
        val bytes = URL(url).openStream().use { it.readBytes() }
        // Written to a sibling first: a download killed halfway through is a
        // file that exists, is the right name, and is not the model.
        val partial = File(cached.parentFile, "${cached.name}.partial")
        partial.writeBytes(bytes)
        partial.renameTo(cached)
        return bytes
    }

    private fun needleDir(): File =
        File(context.noBackupFilesDir, "needle").apply { mkdirs() }

    /**
     * Where the engine persists tool embeddings between launches.
     *
     * Only pays for itself past five tools, where retrieval engages and every
     * schema has to be embedded at init. Keyed by a fingerprint over the schemas
     * and the model, so a changed tool re-embeds only itself.
     */
    private fun defaultIndexPath(): String = File(needleDir(), "tool-index.bin").path

    private companion object {
        init {
            System.loadLibrary("needlejni")
        }

        /** Matches the iOS plugin and the wasm runtime. A turn is JSON, not prose. */
        const val BUFFER_BYTES = 65_536
        const val DEFAULT_MAX_NEW_TOKENS = 256

        @JvmStatic external fun nativeLoad(weights: ByteArray): Int

        @JvmStatic
        external fun nativeInit(system: String?, tools: String, indexPath: String?): Int

        @JvmStatic
        external fun nativeComplete(input: String, maxNewTokens: Int, capacity: Int): String?

        @JvmStatic external fun nativeReset()
    }
}
