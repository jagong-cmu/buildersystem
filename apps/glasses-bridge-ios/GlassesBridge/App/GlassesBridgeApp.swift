import MWDATCore
import SwiftUI

@main
struct GlassesBridgeApp: App {
    @StateObject private var settings = BridgeSettings()
    @StateObject private var stream: GlassesStream
    @StateObject private var control = ControlClient()
    @StateObject private var narrator = Narrator()
    @StateObject private var mock = MockGlassesController()

    init() {
        // Must run before anything touches Wearables.shared (Meta's docs:
        // configure() first, then MockDeviceKit.enable() in the Simulator).
        // A failure here is fatal on the first `Wearables.shared` access, so
        // never swallow it silently.
        do {
            try Wearables.configure()
        } catch {
            print("[GlassesBridge] Wearables.configure() failed: \(error) (\(error.description))")
        }
        _stream = StateObject(wrappedValue: GlassesStream())
    }

    var body: some Scene {
        WindowGroup {
            BridgeView()
                .environmentObject(settings)
                .environmentObject(stream)
                .environmentObject(control)
                .environmentObject(narrator)
                .environmentObject(mock)
                .onOpenURL { url in Task { await GlassesStream.handle(url: url) } }
                .onAppear {
                    control.onSay = { [weak narrator] text in narrator?.say(text) }
                    narrator.enabled = settings.narrate
                }
        }
    }
}
