// Meta DAT integration: registration, device eligibility, and a long-lived
// camera stream whose frames are throttled, downscaled, JPEG-encoded and
// handed to FrameSocket. Adapted from Brownmellon's DATGlassesSession
// (jagong-cmu/hackmit), which proved this SDK path on hardware; the
// difference is that this session stays open for the whole build instead
// of taking one still.
import Combine
import Foundation
import MWDATCamera
import MWDATCore
import UIKit

@MainActor
final class GlassesStream: ObservableObject {
    enum Phase: Equatable {
        case idle, starting, streaming, stopping
        case error(String)
    }

    struct DeviceStatus: Identifiable, Equatable {
        let id: DeviceIdentifier
        let name: String
        let linkState: LinkState
        let compatibility: Compatibility
        var isEligible: Bool { linkState == .connected && compatibility == .compatible }
    }

    @Published private(set) var registrationState: RegistrationState
    @Published private(set) var deviceStatuses: [DeviceStatus] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var streamState: String = "stopped"
    @Published private(set) var preview: UIImage?
    @Published private(set) var lastError: String?
    /// Frames received from the SDK (before throttling), for the readout.
    @Published private(set) var sourceFps: Double = 0

    let socket = FrameSocket()

    private let wearables: WearablesInterface
    /// Long-lived (it resolves asynchronously; see start()), but rebuilt when it
    /// goes stale: after a link drop + reconnect it never re-resolves.
    private var deviceSelector: AutoDeviceSelector
    private var registrationTask: Task<Void, Never>?
    private var devicesTask: Task<Void, Never>?
    private var deviceListenerTokens: [DeviceIdentifier: [AnyListenerToken]] = [:]

    private let phoneCamera = PhoneCamera()
    /// True while the phone's own camera (not the glasses) is the producer.
    @Published private(set) var usingPhoneCamera = false
    private var session: DeviceSession?
    private var camera: Camera?
    private var tokens = ListenerTokenBag()
    private let pipeline = FramePipeline()

    init() {
        let wearables = Wearables.shared
        self.wearables = wearables
        deviceSelector = AutoDeviceSelector(wearables: wearables)
        registrationState = wearables.registrationState

        registrationTask = Task { [weak self] in
            for await state in wearables.registrationStateStream() {
                self?.registrationState = state
            }
        }
        devicesTask = Task { [weak self] in
            for await devices in wearables.devicesStream() {
                self?.trackDevices(devices)
            }
        }
        trackDevices(wearables.devices)

        pipeline.onEncoded = { [weak self] jpeg, size, capturedAt, preview in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.socket.send(jpeg: jpeg, width: Int(size.width), height: Int(size.height), sourceId: self.pipeline.sourceId, capturedAt: capturedAt)
                if let preview { self.preview = preview }
            }
        }
        pipeline.onSourceFps = { [weak self] fps in
            Task { @MainActor [weak self] in self?.sourceFps = fps }
        }
    }

    // MARK: - Devices / registration

    var isRegistered: Bool { registrationState == .registered }

    private func trackDevices(_ identifiers: [DeviceIdentifier]) {
        let current = Set(identifiers)
        deviceListenerTokens = deviceListenerTokens.filter { current.contains($0.key) }
        for id in identifiers where deviceListenerTokens[id] == nil {
            guard let device = wearables.deviceForIdentifier(id) else { continue }
            let refresh: @Sendable () -> Void = { [weak self] in
                Task { @MainActor [weak self] in self?.refreshDeviceStatuses() }
            }
            deviceListenerTokens[id] = [
                device.addLinkStateListener { _ in refresh() },
                device.addCompatibilityListener { _ in refresh() },
            ]
        }
        refreshDeviceStatuses()
    }

    private func refreshDeviceStatuses() {
        deviceStatuses = wearables.devices.compactMap { id in
            guard let device = wearables.deviceForIdentifier(id) else { return nil }
            return DeviceStatus(id: id, name: device.nameOrId(), linkState: device.linkState, compatibility: device.compatibility())
        }
    }

    private func eligibilityProblem() -> String {
        refreshDeviceStatuses()
        guard let status = deviceStatuses.first else {
            return "Meta AI hasn't reported any glasses. Are they paired and on?"
        }
        switch (status.linkState, status.compatibility) {
        case (.disconnected, _):
            return "\(status.name) isn't connected over Bluetooth. Open the hinges, check they show as connected in Meta AI, and that Developer Mode is on for these glasses."
        case (.connecting, _):
            return "\(status.name) is still connecting — try again in a few seconds."
        case (_, .deviceUpdateRequired):
            return "\(status.name) needs a firmware update (Meta AI → your glasses → update)."
        case (_, .sdkUpdateRequired):
            return "This app's DAT SDK is too old for \(status.name) — bump meta-wearables-dat-ios in project.yml."
        case (_, .undefined):
            return "The SDK hasn't determined compatibility for \(status.name) yet — try again in a few seconds."
        case (.connected, .compatible):
            return "\(status.name) looks eligible — transient SDK state; try again."
        @unknown default:
            return "\(status.name) is in a state this build doesn't recognize."
        }
    }

    func connectGlasses() async {
        guard registrationState != .registering else { return }
        do { try await wearables.startRegistration() } catch { lastError = error.localizedDescription }
    }

    func disconnectGlasses() async {
        await stop()
        do { try await wearables.startUnregistration() } catch { lastError = error.localizedDescription }
    }

    func openFirmwareUpdate() async {
        do { try await wearables.openFirmwareUpdate() } catch { lastError = error.localizedDescription }
    }

    static func handle(url: URL) async {
        _ = try? await Wearables.shared.handleUrl(url)
    }

    // MARK: - Streaming

    func start(endpoints: HubEndpoints, sourceId: String, maxFps: Double, maxWidth: Double, quality: Double) async {
        guard phase == .idle || phase.isError else { return }
        phase = .starting
        lastError = nil
        pipeline.configure(sourceId: sourceId, maxFps: maxFps, maxWidth: CGFloat(maxWidth), quality: CGFloat(quality))
        socket.connect(to: endpoints.produce(source: sourceId))
        UIApplication.shared.isIdleTimerDisabled = true

        do {
            if try await wearables.checkPermissionStatus(.camera) != .granted {
                guard try await wearables.requestPermission(.camera) == .granted else {
                    throw StreamError.cameraPermissionDenied
                }
            }

            if deviceSelector.activeDevice == nil {
                // Two passes: the existing selector, then a fresh one. The SDK's
                // AutoDeviceSelector goes stale after the glasses drop and
                // reconnect (it never re-resolves), which otherwise needs an
                // app restart even though the device reads connected+compatible.
                var picked = false
                for attempt in 0 ..< 2 {
                    if attempt == 1 { deviceSelector = AutoDeviceSelector(wearables: wearables) }
                    let selector = deviceSelector
                    picked = await withTimeoutOrNil(seconds: 5) {
                        for await device in selector.activeDeviceStream() where device != nil { return true }
                        return false
                    } ?? false
                    if picked { break }
                }
                if !picked { throw StreamError.noEligibleDevice(eligibilityProblem()) }
            }

            let session: DeviceSession
            do {
                session = try wearables.createSession(deviceSelector: deviceSelector)
            } catch DeviceSessionError.noEligibleDevice {
                throw StreamError.noEligibleDevice(eligibilityProblem())
            } catch {
                throw StreamError.failed(String(describing: error))
            }
            self.session = session
            session.errorPublisher.listen { [weak self] error in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let message = Self.explain(sessionError: error)
                    self.lastError = message
                    if self.phase == .streaming { self.phase = .error(message) }
                }
            }.store(in: tokens)

            // Errors and states arrive on separate streams; subscribe to both
            // before start() so a start failure is reported as the SDK's own
            // reason rather than as a timeout / "stopped before it started".
            let states = session.stateStream()
            let errors = session.errorStream()
            do {
                try session.start()
            } catch {
                throw StreamError.failed(Self.explain(sessionError: error))
            }
            try await withTimeout(seconds: 15, or: StreamError.failed("timed out connecting to the glasses")) {
                try await withThrowingTaskGroup(of: Void.self) { group in
                    group.addTask {
                        for await state in states {
                            if state == .started { return }
                            if state == .stopped { throw StreamError.failed("session stopped before it started") }
                        }
                        throw StreamError.failed("session state stream ended")
                    }
                    group.addTask {
                        for await error in errors {
                            throw StreamError.failed(Self.explain(sessionError: error))
                        }
                        // Error stream finished without an error; leave the
                        // outcome to the state task.
                        while true { try await Task.sleep(nanoseconds: 1_000_000_000) }
                    }
                    try await group.next()!
                    group.cancelAll()
                }
            }

            // The SDK accepts 2/7/15/24/30 fps; we ask for the lowest rate that
            // still lets the ≤10 fps throttle pick evenly spaced frames, and
            // medium resolution (504×896) which already fits under 960 px.
            let config = StreamConfiguration(videoCodec: .raw, resolution: .medium, frameRate: 15)
            guard let camera = try session.addCamera(config: config) else {
                throw StreamError.failed("couldn't attach the camera")
            }
            self.camera = camera
            let stream = camera.stream
            let pipeline = self.pipeline

            stream.statePublisher.listen { [weak self] state in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.streamState = String(describing: state)
                    switch state {
                    case .streaming: self.phase = .streaming
                    case .stopped where self.phase == .streaming: self.phase = .error("camera stream stopped")
                    default: break
                    }
                }
            }.store(in: tokens)
            stream.errorPublisher.listen { [weak self] error in
                Task { @MainActor [weak self] in self?.lastError = String(describing: error) }
            }.store(in: tokens)
            stream.videoFramePublisher.listen { frame in
                pipeline.ingest(frame)
            }.store(in: tokens)
            stream.start()
        } catch {
            lastError = (error as? StreamError)?.message ?? error.localizedDescription
            await stop()
            phase = .error(lastError ?? "failed")
        }
    }

    /// Like withTimeout but yields nil on expiry instead of throwing.
    private func withTimeoutOrNil<T: Sendable>(seconds: Double, _ body: @escaping @Sendable () async -> T) async -> T? {
        await withTaskGroup(of: T?.self) { group in
            group.addTask { await body() }
            group.addTask { try? await Task.sleep(for: .seconds(seconds)); return nil }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }

    /// Photos pushed as single frames this session (shown in the UI).
    @Published private(set) var photosSent = 0

    /// Still-photo path: push one picked/taken photo to the hub as a frame. The
    /// laptop's /scan treats it like any new frame — runs vision, merges the
    /// inventory — with no live stream involved. Works alongside a stream too.
    func sendPhoto(_ image: UIImage, endpoints: HubEndpoints, sourceId: String, maxWidth: Double, quality: Double) async {
        lastError = nil
        if phase == .idle || phase.isError {
            pipeline.configure(sourceId: sourceId, maxFps: 10, maxWidth: CGFloat(maxWidth), quality: CGFloat(quality))
        }
        if socket.state != .open {
            socket.connect(to: endpoints.produce(source: sourceId))
            for _ in 0 ..< 50 where socket.state != .open { try? await Task.sleep(for: .milliseconds(100)) }
            guard socket.state == .open else { lastError = "hub socket didn't open — check the Hub URL"; return }
        }
        pipeline.ingest(force: true) { image }
        photosSent += 1
        if phase == .idle { streamState = "photo sent" }
    }

    /// Demo fallback: stream the phone's back camera as the same source id.
    func startPhoneCamera(endpoints: HubEndpoints, sourceId: String, maxFps: Double, maxWidth: Double, quality: Double) async {
        guard phase == .idle || phase.isError else { return }
        phase = .starting
        lastError = nil
        pipeline.configure(sourceId: sourceId, maxFps: maxFps, maxWidth: CGFloat(maxWidth), quality: CGFloat(quality))
        socket.connect(to: endpoints.produce(source: sourceId))
        UIApplication.shared.isIdleTimerDisabled = true
        do {
            try await phoneCamera.start(into: pipeline)
            usingPhoneCamera = true
            streamState = "phone camera"
            phase = .streaming
        } catch PhoneCamera.CameraError.denied {
            lastError = "Camera permission for GlassesBridge was denied in iOS Settings."
            await stop()
            phase = .error(lastError ?? "failed")
        } catch {
            lastError = "phone camera: \(error.localizedDescription)"
            await stop()
            phase = .error(lastError ?? "failed")
        }
    }

    func stop() async {
        if phase == .idle { return }
        phase = .stopping
        if usingPhoneCamera { phoneCamera.stop(); usingPhoneCamera = false }
        tokens.clear()
        tokens = ListenerTokenBag()
        camera?.stop()
        camera = nil
        session?.stop()
        session = nil
        socket.disconnect()
        UIApplication.shared.isIdleTimerDisabled = false
        streamState = "stopped"
        sourceFps = 0
        phase = .idle
    }

    /// Turns a `DeviceSessionError` into something the wearer can act on. The
    /// SDK's own text for the DAM start failure is just "Device unavailable".
    nonisolated static func explain(sessionError error: Error) -> String {
        let raw = String(describing: error)
        guard let sessionError = error as? DeviceSessionError else { return raw }
        switch sessionError {
        case .noEligibleDevice:
            return "No eligible glasses: they must be on, hinges open, connected in Meta AI, and worn."
        case .dwaUnavailable:
            return "The DAT app on the glasses isn't reachable. Put the glasses on, make sure Meta AI shows them connected, and check Meta AI → your glasses → App Connections."
        case .datAppOnTheGlassesUpdateRequired:
            return "The DAT app on the glasses needs an update: Meta AI → your glasses → App Connections."
        case .unexpectedError(let description) where description.localizedCaseInsensitiveContains("unavailable"):
            return "\(description). The glasses refused the session — usually they aren't being worn, the DAT glasses app needs an update (Meta AI → App Connections), or Wi-Fi is off on the phone (the SDK needs local networking for the camera link)."
        case .batteryCritical, .thermalCritical, .thermalEmergency, .peakPowerShutdown:
            return "\(raw) — let the glasses cool down / charge, then try again."
        default:
            return raw
        }
    }

    func openGlassesAppUpdate() async {
        do { try await wearables.openDATGlassesAppUpdate() } catch { lastError = error.localizedDescription }
    }

    enum StreamError: Error {
        case cameraPermissionDenied
        case noEligibleDevice(String)
        case failed(String)

        var message: String {
            switch self {
            case .cameraPermissionDenied: return "Camera permission for the glasses was denied in Meta AI."
            case .noEligibleDevice(let why), .failed(let why): return why
            }
        }
    }

    private func withTimeout<T: Sendable>(seconds: Double, or timeoutError: Error, _ body: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await body() }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw timeoutError
            }
            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }
}

extension GlassesStream.Phase {
    var isError: Bool { if case .error = self { return true } else { return false } }
}

/// Off-main-thread frame work: throttle → downscale → JPEG. Admission state
/// is guarded by `lock`; encoding runs on `queue`. SDK callbacks arrive on the
/// SDK's own queue.
final class FramePipeline: @unchecked Sendable {
    private let queue = DispatchQueue(label: "glasses-bridge.frames", qos: .userInitiated)
    private let lock = NSLock()
    private var throttle = FrameThrottle(maxFps: 10)
    private var maxWidth: CGFloat = 960
    private var quality: CGFloat = 0.6
    private var busy = false
    private var previewCounter = 0
    private var fpsWindowStart: TimeInterval = 0
    private var fpsCount = 0
    private(set) var sourceId = "glasses"

    var onEncoded: ((Data, CGSize, Date, UIImage?) -> Void)?
    var onSourceFps: ((Double) -> Void)?

    func configure(sourceId: String, maxFps: Double, maxWidth: CGFloat, quality: CGFloat) {
        lock.withLock {
            self.sourceId = sourceId
            self.throttle = FrameThrottle(maxFps: maxFps)
            self.fpsCount = 0
            self.fpsWindowStart = 0
        }
        queue.sync {
            self.maxWidth = maxWidth
            self.quality = quality
        }
    }

    func ingest(_ frame: VideoFrame) {
        ingest { frame.makeUIImage() }
    }

    /// Any source that can produce a UIImage on demand (the closure runs on the
    /// encode queue only for admitted frames, so rejected frames cost nothing).
    func ingest(makeImage: @escaping @Sendable () -> UIImage?) {
        ingest(force: false, makeImage: makeImage)
    }

    /// `force` bypasses the fps throttle and the busy check: a still photo must
    /// never be dropped the way a redundant live frame is.
    func ingest(force: Bool, makeImage: @escaping @Sendable () -> UIImage?) {
        let capturedAt = Date()
        let now = capturedAt.timeIntervalSince1970
        // Admission is decided on the SDK's thread so frames are dropped, never
        // queued, while a previous frame is still encoding.
        var fps: Double?
        let admitted: Bool = lock.withLock {
            fpsCount += 1
            if fpsWindowStart == 0 { fpsWindowStart = now }
            if now - fpsWindowStart >= 1 {
                fps = Double(fpsCount) / (now - fpsWindowStart)
                fpsWindowStart = now
                fpsCount = 0
            }
            if force { return true }
            guard !busy, throttle.admit(now: now) else { return false }
            busy = true
            return true
        }
        if let fps { onSourceFps?(fps) }
        guard admitted else { return }
        queue.async { [self] in
            defer { if !force { lock.withLock { busy = false } } }
            guard let image = makeImage() else { return }
            let target = fitWidth(image.size, maxWidth: maxWidth)
            let scaled: UIImage
            if target == image.size {
                scaled = image
            } else {
                let format = UIGraphicsImageRendererFormat()
                format.scale = 1
                scaled = UIGraphicsImageRenderer(size: target, format: format).image { _ in
                    image.draw(in: CGRect(origin: .zero, size: target))
                }
            }
            guard let jpeg = scaled.jpegData(compressionQuality: quality) else { return }
            previewCounter += 1
            let preview = previewCounter % 3 == 0 ? scaled : nil
            onEncoded?(jpeg, CGSize(width: scaled.size.width * scaled.scale, height: scaled.size.height * scaled.scale), capturedAt, preview)
        }
    }
}
