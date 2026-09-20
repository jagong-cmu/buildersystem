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
    private let deviceSelector: AutoDeviceSelector
    private var registrationTask: Task<Void, Never>?
    private var devicesTask: Task<Void, Never>?
    private var deviceListenerTokens: [DeviceIdentifier: [AnyListenerToken]] = [:]

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
                let problem = eligibilityProblem()
                let selector = deviceSelector
                try await withTimeout(seconds: 5, or: StreamError.noEligibleDevice(problem)) {
                    for await device in selector.activeDeviceStream() where device != nil { return }
                    throw StreamError.noEligibleDevice(problem)
                }
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
                Task { @MainActor [weak self] in self?.lastError = String(describing: error) }
            }.store(in: tokens)

            try session.start()
            try await withTimeout(seconds: 15, or: StreamError.failed("timed out connecting to the glasses")) {
                for await state in session.stateStream() {
                    if state == .started { return }
                    if state == .stopped { throw StreamError.failed("session stopped before it started") }
                }
                throw StreamError.failed("session state stream ended")
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

    func stop() async {
        if phase == .idle { return }
        phase = .stopping
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
            guard !busy, throttle.admit(now: now) else { return false }
            busy = true
            return true
        }
        if let fps { onSourceFps?(fps) }
        guard admitted else { return }
        queue.async { [self] in
            defer { lock.withLock { busy = false } }
            guard let image = frame.makeUIImage() else { return }
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
