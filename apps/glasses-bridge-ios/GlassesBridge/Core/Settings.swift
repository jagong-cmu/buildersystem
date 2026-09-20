import Foundation
import SwiftUI

/// Persisted user settings (UserDefaults via @AppStorage-compatible keys).
@MainActor
final class BridgeSettings: ObservableObject {
    @AppStorage("hubURL") var hubURL = "http://192.168.1.10:8787"
    @AppStorage("sourceId") var sourceId = "glasses"
    @AppStorage("maxFps") var maxFps = 10.0
    @AppStorage("maxWidth") var maxWidth = 960.0
    @AppStorage("jpegQuality") var jpegQuality = 0.6
    @AppStorage("narrate") var narrate = true
    /// Web app origin, used for the "open guide" link only.
    @AppStorage("webURL") var webURL = "http://192.168.1.10:3000"

    var endpoints: HubEndpoints? { HubEndpoints(hubURL) }
}
