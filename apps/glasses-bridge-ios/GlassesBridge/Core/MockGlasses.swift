// Meta Mock Device Kit wiring for hardware-free development. Only compiled
// into Simulator Debug builds; on a device this file is empty and the real
// glasses are used.
import Foundation

#if DEBUG && targetEnvironment(simulator)
import MWDATMockDevice

@MainActor
final class MockGlassesController: ObservableObject {
    enum Feed: String, CaseIterable, Identifiable {
        case phoneBack = "Mac camera"
        case sampleVideo = "Bundled video"
        var id: String { rawValue }
    }

    @Published private(set) var enabled = false
    @Published private(set) var paired = false
    @Published private(set) var worn = false
    @Published var feed: Feed = .phoneBack
    @Published private(set) var status = "Mock Device Kit off"

    private var glasses: (any MWDATMockDevice.MockGlasses)?

    static let available = true

    func enable() {
        guard !enabled else { return }
        MockDeviceKit.shared.enable(config: MockDeviceKitConfig(initiallyRegistered: true, initialPermissionsGranted: true))
        enabled = true
        status = "Mock kit on (registered, camera permission granted)"
    }

    func pair() {
        enable()
        do {
            let g = try MockDeviceKit.shared.pairGlasses(model: .rayBanMeta)
            glasses = g
            g.powerOn()
            g.unfold()
            applyFeed()
            paired = true
            status = "Mock Ray-Ban Meta paired and powered on"
        } catch {
            status = "pair failed: \(error)"
        }
    }

    func don() {
        glasses?.don()
        worn = true
        status = "Wearing the mock glasses"
    }

    func doff() {
        glasses?.doff()
        worn = false
        status = "Mock glasses taken off"
    }

    func applyFeed() {
        guard let glasses else { return }
        switch feed {
        case .phoneBack:
            glasses.services.camera.setCameraFeed(cameraFacing: .back)
        case .sampleVideo:
            if let url = Bundle.main.url(forResource: "sample-pile", withExtension: "mp4") {
                glasses.services.camera.setCameraFeed(fileURL: url)
            } else {
                status = "Add sample-pile.mp4 to the app bundle for the video feed"
            }
        }
    }

    func unpair() {
        if let glasses { MockDeviceKit.shared.unpairDevice(glasses) }
        glasses = nil
        paired = false
        worn = false
        status = "Mock glasses unpaired"
    }
}
#else
@MainActor
final class MockGlassesController: ObservableObject {
    static let available = false
    @Published private(set) var status = "Mock Device Kit is Simulator-only"
}
#endif
