import Foundation
import Translation

struct Job: Codable { let language: String; let source: String }
struct Result: Codable { let language: String; let source: String; let translation: String }

@main struct LocalTranslation {
    static let placeholder = try! NSRegularExpression(pattern: #"\{\{\w+\}\}"#)
    static func tokens(_ source: String) -> [String] {
        placeholder.matches(in: source, range: NSRange(source.startIndex..., in: source)).compactMap { Range($0.range, in: source).map { String(source[$0]) } }.sorted()
    }
    static func encode(_ source: String) -> (String, [(String, String)]) {
        var encoded = source
        let values = Array(Set(tokens(source))).sorted()
        let replacements = values.enumerated().map { (String(98765001 + $0.offset), $0.element) }
        for (number, token) in replacements { encoded = encoded.replacingOccurrences(of: token, with: number) }
        return (encoded, replacements)
    }
    static func decode(_ translated: String, source: String, replacements: [(String, String)]) -> String? {
        var text = translated
        for (number, token) in replacements {
            let pattern = number.map(String.init).joined(separator: #"[\s.,]*"#)
            guard let expression = try? NSRegularExpression(pattern: pattern) else { return nil }
            text = expression.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: token)
        }
        guard tokens(source) == tokens(text) else { return nil }
        let prefix = source.prefix(while: { $0.isWhitespace })
        let suffix = String(source.reversed().prefix(while: { $0.isWhitespace }).reversed())
        return String(prefix) + text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "—", with: ",") + suffix
    }
    static func main() async throws {
        guard CommandLine.arguments.count == 3 else { fatalError("Usage: translate-local requests.json results.jsonl") }
        let jobs = try JSONDecoder().decode([Job].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        let output = CommandLine.arguments[2]
        if !FileManager.default.fileExists(atPath: output) { FileManager.default.createFile(atPath: output, contents: nil) }
        let handle = try FileHandle(forWritingTo: URL(fileURLWithPath: output))
        try handle.seekToEnd()
        defer { try? handle.close() }
        let encoder = JSONEncoder()
        var completed = 0
        for language in ["de", "es", "fr", "it", "pt"] {
            let group = jobs.filter { $0.language == language }
            if group.isEmpty { continue }
            let session = TranslationSession(installedSource: Locale.Language(identifier: "en"), target: Locale.Language(identifier: language == "pt" ? "pt-PT" : language), preferredStrategy: .highFidelity)
            guard await session.isReady else { throw NSError(domain: "OneRepLocalization", code: 1, userInfo: [NSLocalizedDescriptionKey: "Language is not installed: \(language)"]) }
            for start in stride(from: 0, to: group.count, by: 50) {
                let batch = Array(group[start..<min(start + 50, group.count)])
                let prepared = batch.map { encode($0.source) }
                let requests = prepared.enumerated().map { TranslationSession.Request(sourceText: $0.element.0, clientIdentifier: String($0.offset)) }
                var invalid = 0
                for try await response in session.translate(batch: requests) {
                    guard let index = Int(response.clientIdentifier ?? ""), batch.indices.contains(index) else { continue }
                    let job = batch[index]
                    guard let translated = decode(response.targetText, source: job.source, replacements: prepared[index].1) else { invalid += 1; continue }
                    let record = Result(language: language, source: job.source, translation: translated)
                    try handle.write(contentsOf: encoder.encode(record) + Data([0x0a]))
                    completed += 1
                }
                try handle.synchronize()
                print("\(language): \(min(start + 50, group.count))/\(group.count), \(invalid) need placeholder review, \(completed) saved")
                fflush(stdout)
            }
        }
    }
}
