import XCTest
@testable import GlassesBridge

final class HubProtocolTests: XCTestCase {
    func testEncodeFrameLayoutMatchesHub() throws {
        let header = FrameHeader(sourceId: "glasses", seq: 7, ts: 1_700_000_000_000, w: 960, h: 540)
        let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])
        let out = try HubProtocol.encodeFrame(header: header, jpeg: jpeg)

        let len = out.prefix(4).reduce(0) { ($0 << 8) | Int($1) }
        XCTAssertEqual(out.count, 4 + len + jpeg.count)
        XCTAssertEqual(out.suffix(4), jpeg)

        let json = try JSONSerialization.jsonObject(with: out.subdata(in: 4 ..< 4 + len)) as! [String: Any]
        XCTAssertEqual(json["v"] as? Int, 1)
        XCTAssertEqual(json["sourceId"] as? String, "glasses")
        XCTAssertEqual(json["seq"] as? Int, 7)
        XCTAssertEqual(json["ts"] as? Int, 1_700_000_000_000)
        XCTAssertEqual(json["w"] as? Int, 960)
        XCTAssertEqual(json["h"] as? Int, 540)
        XCTAssertEqual(json["mime"] as? String, "image/jpeg")
        XCTAssertEqual(Set(json.keys), ["v", "sourceId", "seq", "ts", "w", "h", "mime"])
    }

    func testRoundTrip() throws {
        let header = FrameHeader(sourceId: "glasses", seq: 1, ts: 42, w: 10, h: 20)
        let jpeg = Data(repeating: 0xAB, count: 1000)
        let decoded = try HubProtocol.decodeFrame(try HubProtocol.encodeFrame(header: header, jpeg: jpeg))
        XCTAssertEqual(decoded.header, header)
        XCTAssertEqual(decoded.jpeg, jpeg)
    }

    func testControlMessagesEncode() throws {
        func obj(_ m: ControlMessage) throws -> [String: Any] {
            try JSONSerialization.jsonObject(with: m.encoded()) as! [String: Any]
        }
        XCTAssertEqual(try obj(.scanStart(source: "glasses"))["type"] as? String, "scan.start")
        XCTAssertEqual(try obj(.check(step: 3))["step"] as? Int, 3)
        XCTAssertNil(try obj(.check(step: nil))["step"])
        XCTAssertEqual(try obj(.next)["type"] as? String, "next")
        XCTAssertEqual(try obj(.prev)["type"] as? String, "prev")
        let missing = try obj(.partMissing(partType: "Plate 1x4", color: "blue", qty: 2))
        XCTAssertEqual(missing["type"] as? String, "part.missing")
        XCTAssertEqual(missing["partType"] as? String, "Plate 1x4")
        XCTAssertEqual(missing["color"] as? String, "blue")
        XCTAssertEqual(missing["qty"] as? Int, 2)
    }

    func testControlMessagesDecode() {
        let say = ControlMessage.decode(#"{"type":"say","text":"Step 2. Attach the plate."}"#.data(using: .utf8)!)
        XCTAssertEqual(say, .say(text: "Step 2. Attach the plate."))

        let step = ControlMessage.decode(#"""
        {"type":"step.activated","manualId":"phone-stand","step":2,"total":6,"text":"Attach",
         "callouts":[{"partType":"Plate 1x4","qty":2,"color":"blue"},{"partType":"Brick 2x2","qty":1}]}
        """#.data(using: .utf8)!)
        XCTAssertEqual(step, .stepActivated(
            manualId: "phone-stand", step: 2, text: "Attach", total: 6,
            callouts: [.init(partType: "Plate 1x4", qty: 2, color: "blue"), .init(partType: "Brick 2x2", qty: 1, color: nil)]))

        // Legacy step.activated without callouts/total still decodes.
        XCTAssertEqual(
            ControlMessage.decode(#"{"type":"step.activated","manualId":"m","step":1,"text":"t"}"#.data(using: .utf8)!),
            .stepActivated(manualId: "m", step: 1, text: "t", total: nil, callouts: []))

        XCTAssertEqual(ControlMessage.decode(#"{"type":"motion","source":"glasses","state":"settled","score":0}"#.data(using: .utf8)!), .other(type: "motion"))
        XCTAssertNil(ControlMessage.decode(Data("nope".utf8)))
    }

    func testHubEndpoints() {
        let e = HubEndpoints("192.168.1.20:8787")!
        XCTAssertEqual(e.produce(source: "glasses").absoluteString, "ws://192.168.1.20:8787/produce?source=glasses&kind=glasses")
        XCTAssertEqual(e.controlSocket.absoluteString, "ws://192.168.1.20:8787/control")
        XCTAssertEqual(e.controlPost.absoluteString, "http://192.168.1.20:8787/control")

        XCTAssertEqual(HubEndpoints("https://hub.example.com/")!.produce(source: "g").absoluteString, "wss://hub.example.com/produce?source=g&kind=glasses")
        XCTAssertEqual(HubEndpoints("ws://10.0.0.1:8787/control")!.controlPost.absoluteString, "http://10.0.0.1:8787/control")
        XCTAssertNil(HubEndpoints(""))
        XCTAssertNil(HubEndpoints("   "))
    }
}
