// Small pure-logic helpers for the frame pipeline; unit-tested in
// GlassesBridgeTests/PacingTests.swift.
import Foundation

/// Rate limiter: admits at most `maxFps` frames per second, dropping the rest.
struct FrameThrottle {
    let minInterval: TimeInterval
    private var last: TimeInterval = -.infinity

    init(maxFps: Double) {
        minInterval = 1.0 / max(0.1, maxFps)
    }

    /// Returns true when the frame at `now` (seconds) should be sent.
    mutating func admit(now: TimeInterval) -> Bool {
        // Small tolerance so a source at exactly maxFps isn't halved by jitter.
        guard now - last >= minInterval * 0.95 else { return false }
        last = now
        return true
    }
}

/// Exponential backoff with a cap: 0.5s, 1s, 2s, 4s, 8s, 8s, …
struct Backoff {
    let initial: TimeInterval
    let cap: TimeInterval
    private(set) var attempt = 0

    init(initial: TimeInterval = 0.5, cap: TimeInterval = 8) {
        self.initial = initial
        self.cap = cap
    }

    mutating func next() -> TimeInterval {
        let delay = min(cap, initial * pow(2, Double(attempt)))
        attempt += 1
        return delay
    }

    mutating func reset() { attempt = 0 }
}

/// Target size for a frame: fit within `maxWidth` while keeping aspect ratio;
/// never upscale.
func fitWidth(_ size: CGSize, maxWidth: CGFloat) -> CGSize {
    guard size.width > maxWidth, size.width > 0 else { return size }
    let scale = maxWidth / size.width
    return CGSize(width: maxWidth, height: (size.height * scale).rounded())
}

/// Rolling fps / latency readout for the UI.
struct StreamStats: Equatable {
    var sent = 0
    var dropped = 0
    var fps: Double = 0
    /// Frame capture → socket send, in milliseconds (last sample).
    var latencyMs: Double = 0
    private var windowStart: TimeInterval = 0
    private var windowCount = 0

    mutating func recordSent(now: TimeInterval, latencyMs: Double) {
        sent += 1
        self.latencyMs = latencyMs
        if windowStart == 0 {
            windowStart = now
            return
        }
        windowCount += 1
        let elapsed = now - windowStart
        if elapsed >= 1 {
            fps = Double(windowCount) / elapsed
            windowStart = now
            windowCount = 0
        }
    }

    mutating func recordDropped() { dropped += 1 }

    mutating func reset() { self = StreamStats() }
}
