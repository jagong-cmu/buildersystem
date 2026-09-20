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
        // Must run before anything touches Wearables.shared. In the Simulator
        // the Mock Device Kit is enabled from the UI (Developer section).
        try? Wearables.configure()
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
