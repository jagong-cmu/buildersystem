// Control bus: subscribes to `<hub>/control` (WebSocket) for narration and
// step state, and POSTs button presses to `<hub>/control` over HTTP so a
// press still goes through when the socket is mid-reconnect.
import Foundation

@MainActor
final class ControlClient: NSObject, ObservableObject {
    struct ActiveStep: Equatable {
        let manualId: String
        let step: Int
        let total: Int?
        let text: String
        let callouts: [ControlMessage.Callout]
    }

    @Published private(set) var connected = false
    @Published private(set) var activeStep: ActiveStep?
    @Published private(set) var lastSaid: String?
    @Published private(set) var lastVerify: String?

    /// Called for every `say` message (Narrator speaks it).
    var onSay: ((String) -> Void)?

    private var endpoints: HubEndpoints?
    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var backoff = Backoff()
    private var reconnect: Task<Void, Never>?
    private var wantOpen = false

    func connect(_ endpoints: HubEndpoints) {
        self.endpoints = endpoints
        wantOpen = true
        backoff.reset()
        open()
    }

    func disconnect() {
        wantOpen = false
        reconnect?.cancel()
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        connected = false
    }

    private func open() {
        guard wantOpen, let endpoints else { return }
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        self.session = session
        let task = session.webSocketTask(with: endpoints.controlSocket)
        self.task = task
        task.resume()
        receive(task)
    }

    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self, self.task === task else { return }
                switch result {
                case .success(let message):
                    let data: Data? = switch message {
                    case .data(let d): d
                    case .string(let s): s.data(using: .utf8)
                    @unknown default: nil
                    }
                    if let data, let msg = ControlMessage.decode(data) { self.handle(msg) }
                    self.receive(task)
                case .failure:
                    self.scheduleReconnect()
                }
            }
        }
    }

    private func handle(_ msg: ControlMessage) {
        switch msg {
        case .say(let text):
            lastSaid = text
            onSay?(text)
        case .stepActivated(let manualId, let step, let text, let total, let callouts):
            activeStep = ActiveStep(manualId: manualId, step: step, total: total, text: text, callouts: callouts)
        case .verifyResult(let step, let status, let hint):
            lastVerify = "step \(step): \(status)" + (hint.map { " — \($0)" } ?? "")
        default:
            break
        }
    }

    private func scheduleReconnect() {
        connected = false
        task?.cancel()
        task = nil
        guard wantOpen else { return }
        let delay = backoff.next()
        reconnect?.cancel()
        reconnect = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.open()
        }
    }

    /// Fire-and-forget POST; errors are reported to the caller for the status line.
    func send(_ msg: ControlMessage) async -> String? {
        guard let endpoints else { return "no hub configured" }
        var req = URLRequest(url: endpoints.controlPost)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.timeoutInterval = 5
        do {
            req.httpBody = try msg.encoded()
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, http.statusCode >= 300 {
                return "hub replied \(http.statusCode)"
            }
            return nil
        } catch {
            return error.localizedDescription
        }
    }
}

extension ControlClient: URLSessionWebSocketDelegate {
    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        Task { @MainActor in
            guard self.task === webSocketTask else { return }
            self.backoff.reset()
            self.connected = true
        }
    }

    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        Task { @MainActor in
            guard self.task === webSocketTask else { return }
            self.scheduleReconnect()
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard error != nil else { return }
        Task { @MainActor in
            guard self.task === task else { return }
            self.scheduleReconnect()
        }
    }
}
