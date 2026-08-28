import Capacitor
import Foundation

/// The iOS half of `@repo/needle`.
///
/// Needle 2 is 45M parameters at two bits a weight — 14 MB of engine and 13 MB
/// of `.cact` — which is small enough that it runs on the CPU and asks for
/// nothing from CoreML, no `.mlpackage` to compile, no ANE to fight over with
/// the pose pipeline. That is the whole reason it is here rather than on a
/// server: an on-device tool call costs no round trip, no key, and nothing the
/// user has to be told about in a privacy label.
///
/// Deliberately dumb. Every decision about what tools exist, what a low
/// confidence means, and how many steps a loop may take lives in TypeScript,
/// once, where the web build reads it too. This file marshals four C calls.
@objc(NeedlePlugin)
public class NeedlePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NeedlePlugin"
    public let jsName = "Needle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "init", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "complete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise),
    ]

    /// The engine is one process-global instance behind four free functions —
    /// `needle_reset()` takes no handle and returns nothing — so two overlapping
    /// completions do not race on a lock, they interleave inside one KV cache
    /// and answer each other's questions. Everything runs here, in order.
    private let queue = DispatchQueue(label: "life.onerep.needle")

    /// Override weights, held for the life of the process — and nil in every
    /// build that has not asked for tuned ones.
    ///
    /// `needle_load` is handed a pointer and the header makes no promise about
    /// copying. Keeping the `Data` alive is 13 MB of resident memory and the
    /// alternative is finding out on a customer's phone.
    private var weights: Data?
    private var loaded = false

    /// Sized to match the wasm runtime and the Python binding. A turn is a JSON
    /// object with a short derivation attached, not prose; the engine truncates
    /// rather than growing, so the only thing this ceiling ever costs is the
    /// tail of `reasoning`.
    private static let bufferBytes = 65_536

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true, "platform": "ios"])
    }

    /// Almost always a no-op, and deliberately so.
    ///
    /// `libneedle.a` is two objects: 421 KB of NEON kernels, and 13.7 MB that is
    /// `needle2.cact` embedded verbatim as `needle_weights`. The kernel object
    /// references that symbol as undefined — it reads the linked-in weights
    /// directly — so an app that ships the archive already has the model, and
    /// `needle_load` is the override rather than the setup step. Calling this
    /// with no arguments transfers nothing and touches no disk.
    ///
    /// The override exists for tuned `.cact` files. A URL beats base64 by a
    /// distance: 13.7 MB across the bridge is an 18 MB JSON string. The file is
    /// cached in Application Support, keyed by the URL's last path component,
    /// and excluded from iCloud backup — it is a redownloadable artifact, and
    /// 13 MB of every customer's iCloud quota is not ours to spend.
    @objc func load(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }
            let override = call.getString("url") ?? call.getString("data")
            if override == nil {
                self.loaded = true
                call.resolve(["bytes": 0, "source": "embedded"])
                return
            }
            if self.loaded, let weights = self.weights {
                call.resolve(["bytes": weights.count, "source": "cached"])
                return
            }
            do {
                let data = try self.weightBytes(call)
                let code = data.withUnsafeBytes { buffer -> Int32 in
                    guard let base = buffer.bindMemory(to: UInt8.self).baseAddress else {
                        return -1
                    }
                    return Int32(needle_load(base, UInt64(buffer.count)))
                }
                guard code >= 0 else {
                    call.reject("needle_load failed (\(code))")
                    return
                }
                self.weights = data
                self.loaded = true
                call.resolve([
                    "bytes": data.count,
                    "source": call.getString("url") == nil ? "data" : "url",
                ])
            } catch {
                call.reject("needle: could not load weights — \(error.localizedDescription)")
            }
        }
    }

    /// Rebuild the context: system facts, tool schemas, and the decode grammar
    /// compiled from them. Cheap enough to call whenever the toolbox changes,
    /// which is what the TypeScript side does.
    @objc func `init`(_ call: CAPPluginCall) {
        guard let toolsJson = call.getString("toolsJson") else {
            call.reject("needle: init needs toolsJson")
            return
        }
        let system = call.getString("system")
        let indexPath = call.getString("toolIndexPath") ?? Self.defaultIndexPath()
        queue.async { [weak self] in
            guard let self else { return }
            guard self.loaded else {
                call.reject("needle: init before load")
                return
            }
            let code = withOptionalCString(system) { systemPointer in
                toolsJson.withCString { toolsPointer in
                    withOptionalCString(indexPath) { indexPointer in
                        Int32(needle_init(systemPointer, toolsPointer, indexPointer))
                    }
                }
            }
            // Negative is the failure, not non-zero: needle_init answers with
            // the size of the tool context in tokens, and needle_complete with
            // the bytes it wrote.
            guard code >= 0 else {
                call.reject("needle_init failed (\(code))")
                return
            }
            let count = (try? JSONSerialization.jsonObject(with: Data(toolsJson.utf8))) as? [Any]
            call.resolve(["tools": count?.count ?? 0])
        }
    }

    /// One turn. The raw JSON goes back untouched — parsing it here would mean
    /// a second parser to keep in step with `packages/needle/src/turn.ts`, for
    /// no gain, since the bridge serialises to JSON on the way out anyway.
    @objc func complete(_ call: CAPPluginCall) {
        guard let input = call.getString("input") else {
            call.reject("needle: complete needs input")
            return
        }
        let maxNewTokens = Int32(call.getInt("maxNewTokens") ?? 256)
        queue.async { [weak self] in
            guard let self else { return }
            guard self.loaded else {
                call.reject("needle: complete before load")
                return
            }
            var buffer = [CChar](repeating: 0, count: Self.bufferBytes)
            let written = input.withCString { inputPointer in
                Int32(needle_complete(inputPointer, maxNewTokens, &buffer, Int32(buffer.count)))
            }
            guard written >= 0 else {
                call.reject("needle_complete failed (\(written))")
                return
            }
            call.resolve(["json": String(cString: buffer)])
        }
    }

    @objc func reset(_ call: CAPPluginCall) {
        queue.async {
            needle_reset()
            call.resolve()
        }
    }

    // MARK: - Weights

    private func weightBytes(_ call: CAPPluginCall) throws -> Data {
        if let encoded = call.getString("data") {
            guard let decoded = Data(base64Encoded: encoded) else {
                throw NeedleError.badBase64
            }
            return decoded
        }
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            throw NeedleError.noSource
        }
        if url.isFileURL { return try Data(contentsOf: url) }
        let cached = try Self.cacheURL(for: url)
        if FileManager.default.fileExists(atPath: cached.path) {
            return try Data(contentsOf: cached)
        }
        let data = try Data(contentsOf: url)
        try data.write(to: cached, options: .atomic)
        var resource = URLResourceValues()
        resource.isExcludedFromBackup = true
        var mutable = cached
        try? mutable.setResourceValues(resource)
        return data
    }

    private static func supportDirectory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("needle", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    private static func cacheURL(for url: URL) throws -> URL {
        // The file name carries the version — the fetch script publishes under a
        // versioned prefix — so a new build lands beside the old one rather than
        // reusing a stale cache entry under the same name.
        try supportDirectory().appendingPathComponent(url.lastPathComponent)
    }

    /// Where the engine persists tool embeddings between launches.
    ///
    /// Only pays for itself past five tools, where retrieval engages and every
    /// schema has to be embedded once at init. Keyed by a fingerprint over the
    /// schemas and the model, so a changed tool re-embeds only itself.
    private static func defaultIndexPath() -> String? {
        try? supportDirectory().appendingPathComponent("tool-index.bin").path
    }

    private enum NeedleError: LocalizedError {
        case badBase64
        case noSource

        var errorDescription: String? {
            switch self {
            case .badBase64: return "weights were not valid base64"
            case .noSource: return "load needs either url or data"
            }
        }
    }
}

/// `withCString` on an optional, without the pyramid of nested closures that
/// writing it inline three times would produce.
private func withOptionalCString<Result>(
    _ value: String?,
    _ body: (UnsafePointer<CChar>?) -> Result
) -> Result {
    guard let value else { return body(nil) }
    return value.withCString { body($0) }
}
