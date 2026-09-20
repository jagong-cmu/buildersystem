// Wire format shared with services/stream-hub/src/protocol.ts:
//   uint32 big-endian header length | UTF-8 JSON header | JPEG bytes
// Keep this file free of UIKit/DAT so it can be unit-tested anywhere.
import Foundation

struct FrameHeader: Codable, Equatable {
    var v: Int = 1
    var sourceId: String
    var seq: Int
    var ts: Int      // ms since epoch
    var w: Int
    var h: Int
    var mime: String = "image/jpeg"
}

enum HubProtocol {
    static func encodeFrame(header: FrameHeader, jpeg: Data) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let json = try encoder.encode(header)
        var out = Data(capacity: 4 + json.count + jpeg.count)
        var len = UInt32(json.count).bigEndian
        withUnsafeBytes(of: &len) { out.append(contentsOf: $0) }
        out.append(json)
        out.append(jpeg)
        return out
    }

    static func decodeFrame(_ data: Data) throws -> (header: FrameHeader, jpeg: Data) {
        guard data.count >= 4 else { throw ProtocolError.truncated }
        let len = Int(data.prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) })
        guard data.count >= 4 + len else { throw ProtocolError.truncated }
        let header = try JSONDecoder().decode(FrameHeader.self, from: data.subdata(in: 4 ..< 4 + len))
        return (header, data.subdata(in: (4 + len) ..< data.count))
    }

    enum ProtocolError: Error { case truncated }
}

/// Control-bus messages we send and the subset we react to. Every message is
/// a JSON object with a `type` field; unknown types are ignored.
enum ControlMessage: Equatable {
    case scanStart(source: String?)
    case scanStop
    case check(step: Int?)
    case next
    case prev
    case partMissing(partType: String, color: String?, qty: Int?)
    case say(text: String)
    case stepActivated(manualId: String, step: Int, text: String, total: Int?, callouts: [Callout])
    case verifyResult(step: Int, status: String, hint: String?)
    case other(type: String)

    struct Callout: Codable, Equatable, Hashable {
        let partType: String
        let qty: Int
        let color: String?
    }

    var json: [String: Any] {
        switch self {
        case .scanStart(let source):
            var m: [String: Any] = ["type": "scan.start"]
            if let source { m["source"] = source }
            return m
        case .scanStop: return ["type": "scan.stop"]
        case .check(let step):
            var m: [String: Any] = ["type": "check"]
            if let step { m["step"] = step }
            return m
        case .next: return ["type": "next"]
        case .prev: return ["type": "prev"]
        case .partMissing(let partType, let color, let qty):
            var m: [String: Any] = ["type": "part.missing", "partType": partType]
            if let color { m["color"] = color }
            if let qty { m["qty"] = qty }
            return m
        case .say(let text): return ["type": "say", "text": text]
        case .stepActivated(let manualId, let step, let text, let total, let callouts):
            var m: [String: Any] = ["type": "step.activated", "manualId": manualId, "step": step, "text": text]
            if let total { m["total"] = total }
            m["callouts"] = callouts.map { c -> [String: Any] in
                var d: [String: Any] = ["partType": c.partType, "qty": c.qty]
                if let color = c.color { d["color"] = color }
                return d
            }
            return m
        case .verifyResult(let step, let status, let hint):
            var m: [String: Any] = ["type": "verify.result", "step": step, "status": status]
            if let hint { m["hint"] = hint }
            return m
        case .other(let type): return ["type": type]
        }
    }

    func encoded() throws -> Data {
        try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])
    }

    static func decode(_ data: Data) -> ControlMessage? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return nil }
        switch type {
        case "say":
            guard let text = obj["text"] as? String else { return nil }
            return .say(text: text)
        case "step.activated":
            guard let step = obj["step"] as? Int, let text = obj["text"] as? String else { return nil }
            let callouts = (obj["callouts"] as? [[String: Any]] ?? []).compactMap { c -> Callout? in
                guard let p = c["partType"] as? String else { return nil }
                return Callout(partType: p, qty: c["qty"] as? Int ?? 1, color: c["color"] as? String)
            }
            return .stepActivated(
                manualId: obj["manualId"] as? String ?? "",
                step: step, text: text, total: obj["total"] as? Int, callouts: callouts)
        case "verify.result":
            guard let step = obj["step"] as? Int, let status = obj["status"] as? String else { return nil }
            return .verifyResult(step: step, status: status, hint: obj["hint"] as? String)
        case "scan.start": return .scanStart(source: obj["source"] as? String)
        case "scan.stop": return .scanStop
        case "check": return .check(step: obj["step"] as? Int)
        case "next": return .next
        case "prev": return .prev
        case "part.missing":
            guard let p = obj["partType"] as? String else { return nil }
            return .partMissing(partType: p, color: obj["color"] as? String, qty: obj["qty"] as? Int)
        default: return .other(type: type)
        }
    }
}

/// Builds hub URLs from the user-entered base ("http://192.168.1.20:8787").
struct HubEndpoints: Equatable {
    let base: URL

    init?(_ text: String) {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if !s.contains("://") { s = "http://" + s }
        guard var c = URLComponents(string: s), c.host != nil else { return nil }
        if c.scheme == "ws" { c.scheme = "http" } else if c.scheme == "wss" { c.scheme = "https" }
        c.path = ""
        c.query = nil
        guard let url = c.url else { return nil }
        base = url
    }

    private var wsScheme: String { base.scheme == "https" ? "wss" : "ws" }

    private func ws(_ path: String, query: [URLQueryItem] = []) -> URL {
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        c.scheme = wsScheme
        c.path = path
        c.queryItems = query.isEmpty ? nil : query
        return c.url!
    }

    func produce(source: String, kind: String = "glasses") -> URL {
        ws("/produce", query: [URLQueryItem(name: "source", value: source), URLQueryItem(name: "kind", value: kind)])
    }

    var controlSocket: URL { ws("/control") }
    var controlPost: URL { base.appendingPathComponent("control") }
    var health: URL { base.appendingPathComponent("health") }
}
