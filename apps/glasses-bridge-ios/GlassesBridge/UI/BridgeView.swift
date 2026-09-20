import MWDATCore
import SwiftUI

struct BridgeView: View {
    @EnvironmentObject private var settings: BridgeSettings
    @EnvironmentObject private var stream: GlassesStream
    @EnvironmentObject private var control: ControlClient
    @EnvironmentObject private var narrator: Narrator
    @EnvironmentObject private var mock: MockGlassesController

    @State private var controlError: String?
    @State private var showMissing = false
    @State private var hubReachable: Bool?

    var body: some View {
        NavigationStack {
            Form {
                hubSection
                glassesSection
                streamSection
                controlsSection
                narrationSection
                if MockGlassesController.available { developerSection }
            }
            .navigationTitle("Glasses Bridge")
            .sheet(isPresented: $showMissing) { MissingSheet(control: control, error: $controlError) }
            .task(id: settings.hubURL) { await probeHub() }
            .onChange(of: settings.hubURL, initial: true) { _, _ in reconnectControl() }
        }
    }

    // MARK: Hub

    private var hubSection: some View {
        Section {
            TextField("Hub URL", text: $settings.hubURL)
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Source id", text: $settings.sourceId)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            HStack {
                Text("Control bus")
                Spacer()
                statusChip(control.connected ? "connected" : (hubReachable == false ? "hub unreachable" : "off"), ok: control.connected)
            }
            if settings.endpoints == nil {
                Text("Enter the laptop's LAN address, e.g. http://192.168.1.20:8787").font(.footnote).foregroundStyle(.red)
            }
        } header: { Text("Hub") } footer: {
            Text("Same address the web app uses as NEXT_PUBLIC_HUB_URL. Phone and laptop must be on the same Wi-Fi.")
        }
    }

    // MARK: Glasses

    private var glassesSection: some View {
        Section("Glasses") {
            HStack {
                Text("Meta AI registration")
                Spacer()
                statusChip(String(describing: stream.registrationState), ok: stream.isRegistered)
            }
            if stream.isRegistered {
                Button("Disconnect glasses", role: .destructive) { Task { await stream.disconnectGlasses() } }
            } else {
                Button(stream.registrationState == .registering ? "Waiting for Meta AI…" : "Connect glasses") {
                    Task { await stream.connectGlasses() }
                }.disabled(stream.registrationState == .registering)
            }
            if stream.deviceStatuses.isEmpty {
                Text("No glasses reported yet.").foregroundStyle(.secondary)
            }
            ForEach(stream.deviceStatuses) { d in
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.name).font(.headline)
                    Text("link: \(String(describing: d.linkState)) · \(String(describing: d.compatibility))")
                        .font(.footnote).foregroundStyle(d.isEligible ? .green : .secondary)
                }
                if d.compatibility == .deviceUpdateRequired {
                    Button("Update firmware in Meta AI") { Task { await stream.openFirmwareUpdate() } }
                }
            }
        }
    }

    // MARK: Stream

    private var streaming: Bool { stream.phase == .streaming || stream.phase == .starting }

    private var streamSection: some View {
        Section {
            if let preview = stream.preview {
                Image(uiImage: preview)
                    .resizable().scaledToFit()
                    .frame(maxHeight: 220).frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            HStack {
                if streaming {
                    Button("Stop stream", role: .destructive) { Task { await stream.stop() } }
                } else {
                    Button("Start stream") {
                        guard let endpoints = settings.endpoints else { return }
                        Task {
                            await stream.start(endpoints: endpoints, sourceId: settings.sourceId,
                                               maxFps: settings.maxFps, maxWidth: settings.maxWidth, quality: settings.jpegQuality)
                        }
                    }.disabled(settings.endpoints == nil)
                }
                Spacer()
                statusChip(phaseLabel, ok: stream.phase == .streaming && stream.socket.state == .open)
            }
            LabeledContent("Socket", value: socketLabel)
            LabeledContent("Glasses → phone", value: String(format: "%.1f fps (%@)", stream.sourceFps, stream.streamState))
            LabeledContent("Phone → hub", value: String(format: "%.1f fps · %.0f ms · %d sent · %d dropped",
                                                        stream.socket.stats.fps, stream.socket.stats.latencyMs,
                                                        stream.socket.stats.sent, stream.socket.stats.dropped))
            if let err = stream.lastError {
                Text(err).font(.footnote).foregroundStyle(.red)
            }
            DisclosureGroup("Encoding") {
                Stepper("Max \(Int(settings.maxFps)) fps", value: $settings.maxFps, in: 1 ... 10)
                Stepper("Max width \(Int(settings.maxWidth)) px", value: $settings.maxWidth, in: 320 ... 960, step: 64)
                Stepper(String(format: "JPEG quality %.2f", settings.jpegQuality), value: $settings.jpegQuality, in: 0.3 ... 0.9, step: 0.05)
            }
        } header: { Text("Stream") } footer: {
            Text("Screen stays awake while streaming. iOS suspends the camera stream when the app leaves the foreground — keep this screen open during the build.")
        }
    }

    private var phaseLabel: String {
        switch stream.phase {
        case .idle: return "idle"
        case .starting: return "starting"
        case .streaming: return "streaming"
        case .stopping: return "stopping"
        case .error(let e): return "error: \(e.prefix(40))"
        }
    }

    private var socketLabel: String {
        switch stream.socket.state {
        case .idle: return "closed"
        case .connecting: return "connecting"
        case .open: return "open"
        case .reconnecting(let s): return String(format: "reconnecting in %.1fs", s)
        case .failed(let e): return "failed: \(e)"
        }
    }

    // MARK: Controls

    private var controlsSection: some View {
        Section {
            if let step = control.activeStep {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Step \(step.step)\(step.total.map { " of \($0)" } ?? "")").font(.headline)
                    Text(step.text).font(.subheadline)
                }
            } else {
                Text("Open a guide in the web app to see the active step here.").foregroundStyle(.secondary)
            }
            if let v = control.lastVerify { Text(v).font(.footnote).foregroundStyle(.secondary) }
            HStack {
                controlButton("Scan", .scanStart(source: settings.sourceId))
                controlButton("Check", .check(step: control.activeStep?.step))
            }
            HStack {
                controlButton("Prev", .prev)
                controlButton("Next", .next)
                Button {
                    showMissing = true
                } label: { Text("Missing").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                    .disabled(control.activeStep?.callouts.isEmpty ?? true)
            }
            if let controlError { Text(controlError).font(.footnote).foregroundStyle(.red) }
        } header: { Text("Guide controls") } footer: {
            Text("Buttons POST to \(settings.endpoints?.controlPost.absoluteString ?? "<hub>/control"); the web guide reacts to next / prev / check.")
        }
    }

    private func controlButton(_ title: String, _ msg: ControlMessage) -> some View {
        Button {
            Task { controlError = await control.send(msg) }
        } label: { Text(title).frame(maxWidth: .infinity) }
            .buttonStyle(.borderedProminent)
    }

    private func reconnectControl() {
        control.disconnect()
        if let endpoints = settings.endpoints { control.connect(endpoints) }
    }

    private func probeHub() async {
        guard let endpoints = settings.endpoints else { hubReachable = nil; return }
        var req = URLRequest(url: endpoints.health)
        req.timeoutInterval = 3
        let ok = (try? await URLSession.shared.data(for: req)).map { ($0.1 as? HTTPURLResponse)?.statusCode == 200 } ?? false
        hubReachable = ok
    }

    // MARK: Narration

    private var narrationSection: some View {
        Section {
            Toggle("Speak \"say\" messages", isOn: $settings.narrate)
                .onChange(of: settings.narrate, initial: true) { _, on in
                    narrator.enabled = on
                    if !on { narrator.stop() }
                }
            if let said = control.lastSaid {
                Text("“\(said)”").font(.footnote).foregroundStyle(.secondary)
            }
            Button("Test voice") { narrator.say("Glasses bridge ready.") }
        } header: { Text("Narration") } footer: {
            Text("Plays through the phone's current audio output. Pair the glasses as the phone's Bluetooth audio device to hear it in the glasses.")
        }
    }

    // MARK: Developer (Simulator only)

    @ViewBuilder
    private var developerSection: some View {
        #if DEBUG && targetEnvironment(simulator)
        Section {
            Text(mock.status).font(.footnote).foregroundStyle(.secondary)
            Picker("Camera feed", selection: $mock.feed) {
                ForEach(MockGlassesController.Feed.allCases) { Text($0.rawValue).tag($0) }
            }.onChange(of: mock.feed) { _, _ in mock.applyFeed() }
            HStack {
                Button("Pair mock glasses") { mock.pair() }.disabled(mock.paired)
                Spacer()
                Button(mock.worn ? "Take off" : "Put on") { if mock.worn { mock.doff() } else { mock.don() } }.disabled(!mock.paired)
            }
            Button("Unpair", role: .destructive) { mock.unpair() }.disabled(!mock.paired)
        } header: { Text("Developer · Mock Device Kit") } footer: {
            Text("Simulator only. Pair, put on, then Start stream above: the Mac camera (or bundled video) is streamed as the glasses.")
        }
        #endif
    }

    private func statusChip(_ text: String, ok: Bool) -> some View {
        Text(text)
            .font(.caption).monospaced()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((ok ? Color.green : Color.secondary).opacity(0.2), in: Capsule())
    }
}

/// "Missing": the current step's callouts; tapping one sends `part.missing`,
/// which the web guide turns into a replan.
struct MissingSheet: View {
    @ObservedObject var control: ControlClient
    @Binding var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let step = control.activeStep {
                    Section("Step \(step.step) needs") {
                        ForEach(step.callouts, id: \.self) { c in
                            Button {
                                Task {
                                    error = await control.send(.partMissing(partType: c.partType, color: c.color, qty: c.qty))
                                    dismiss()
                                }
                            } label: {
                                HStack {
                                    Text("\(c.qty) × \(c.color.map { "\($0) " } ?? "")\(c.partType)")
                                    Spacer()
                                    Text("I don't have this").font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                } else {
                    Text("No active step.")
                }
            }
            .navigationTitle("Missing part")
            .toolbar { Button("Close") { dismiss() } }
        }
    }
}
