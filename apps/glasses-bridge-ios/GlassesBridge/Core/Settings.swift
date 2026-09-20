import Foundation
import SwiftUI

/// Persisted user settings (UserDefaults via @AppStorage-compatible keys).
@MainActor
final class BridgeSettings: ObservableObject {
    @AppStorage("hubURL") var hubURL = BridgeSettings.buildDefault("DefaultHubURL") ?? "http://192.168.1.10:8787"
    @AppStorage("sourceId") var sourceId = "glasses"
    @AppStorage("maxFps") var maxFps = 10.0
    @AppStorage("maxWidth") var maxWidth = 960.0
    @AppStorage("jpegQuality") var jpegQuality = 0.6
    @AppStorage("narrate") var narrate = true
    /// Web app origin, used for the "open guide" link only.
    @AppStorage("webURL") var webURL = "http://192.168.1.10:3000"

    var endpoints: HubEndpoints? { HubEndpoints(hubURL) }

    /// Build-time default from Info.plist, e.g.
    /// `xcodebuild … DEFAULT_HUB_URL=https://hub.example.com` (see project.yml),
    /// so a demo build lands on the right hub with nothing to type.
    static func buildDefault(_ key: String) -> String? {
        guard let s = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !s.isEmpty else { return nil }
        return s
    }
}
