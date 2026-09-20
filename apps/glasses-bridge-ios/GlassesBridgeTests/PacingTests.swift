import XCTest
@testable import GlassesBridge

final class PacingTests: XCTestCase {
    func testThrottleCapsAtMaxFps() {
        var t = FrameThrottle(maxFps: 10)
        var admitted = 0
        // 30 fps source for 2 seconds → at most ~20 admitted (±1 for window edges).
        for i in 0 ..< 60 where t.admit(now: Double(i) / 30) { admitted += 1 }
        XCTAssertGreaterThanOrEqual(admitted, 19)
        XCTAssertLessThanOrEqual(admitted, 21)
    }

    func testThrottlePassesSlowSourceThrough() {
        var t = FrameThrottle(maxFps: 10)
        var admitted = 0
        for i in 0 ..< 10 where t.admit(now: Double(i) / 2) { admitted += 1 }
        XCTAssertEqual(admitted, 10)
    }

    func testBackoffDoublesAndCaps() {
        var b = Backoff(initial: 0.5, cap: 8)
        XCTAssertEqual([b.next(), b.next(), b.next(), b.next(), b.next(), b.next(), b.next()], [0.5, 1, 2, 4, 8, 8, 8])
        b.reset()
        XCTAssertEqual(b.next(), 0.5)
    }

    func testFitWidthNeverUpscales() {
        XCTAssertEqual(fitWidth(CGSize(width: 1280, height: 720), maxWidth: 960), CGSize(width: 960, height: 540))
        XCTAssertEqual(fitWidth(CGSize(width: 504, height: 896), maxWidth: 960), CGSize(width: 504, height: 896))
        XCTAssertEqual(fitWidth(CGSize(width: 960, height: 100), maxWidth: 960), CGSize(width: 960, height: 100))
    }

    func testStatsFps() {
        var s = StreamStats()
        for i in 0 ..< 11 { s.recordSent(now: 100 + Double(i) * 0.1, latencyMs: 40) }
        XCTAssertEqual(s.sent, 11)
        XCTAssertEqual(s.fps, 10, accuracy: 0.5)
        XCTAssertEqual(s.latencyMs, 40)
        s.recordDropped()
        XCTAssertEqual(s.dropped, 1)
    }
}
