// Producer WebSocket to `<hub>/produce?source=glasses&kind=glasses`.
// Frames are dropped (not queued) when the socket has a send in flight or
// is not connected, so a slow Wi-Fi link never builds up latency.
import Foundation

@MainActor
final class FrameSocket: NSObject, ObservableObject {
    enum State: Equatable { case idle, connecting, open, reconnecting(in: TimeInterval), failed(String) }

    @Published private(set) var state: State = .idle
    @Published private(set) var stats = StreamStats()

    /// Sends in flight above this are treated as "backed up" and frames are dropped.
    var maxInFlight = 1

    private var url: URL?
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var inFlight = 0
    private var backoff = Backoff()
    private var reconnectTimer: Task<Void, Never>?
    private var wantOpen = false
    private var seq = 0

    func connect(to url: URL) {
        self.url = url
        wantOpen = true
        backoff.reset()
        stats.reset()
        seq = 0
        open()
    }

    func disconnect() {
        wantOpen = false
        reconnectTimer?.cancel()
        reconnectTimer = nil
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        state = .idle
    }

    private func open() {
        guard wantOpen, let url else { return }
        state = .connecting
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 10
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        self.session = session
        let task = session.webSocketTask(with: url)
        task.maximumMessageSize = 8 * 1024 * 1024
        self.task = task
        task.resume()
        receiveLoop(task)
    }

    /// Keep a receive pending so close frames / errors are surfaced promptly.
    private func receiveLoop(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self, self.task === task else { return }
                switch result {
                case .success: self.receiveLoop(task)
                case .failure(let error): self.handleDrop(error.localizedDescription)
                }
            }
        }
    }

    private func handleDrop(_ reason: String) {
        guard wantOpen else { return }
        task?.cancel()
        task = nil
        inFlight = 0
        let delay = backoff.next()
        state = .reconnecting(in: delay)
        reconnectTimer?.cancel()
        reconnectTimer = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.open()
        }
        _ = reason
    }

    /// Send one encoded JPEG. Returns false when the frame was dropped.
    @discardableResult
    func send(jpeg: Data, width: Int, height: Int, sourceId: String, capturedAt: Date) -> Bool {
        guard state == .open, let task, inFlight < maxInFlight else {
            stats.recordDropped()
            return false
        }
        seq += 1
        let header = FrameHeader(sourceId: sourceId, seq: seq, ts: Int(Date().timeIntervalSince1970 * 1000), w: width, h: height)
        guard let payload = try? HubProtocol.encodeFrame(header: header, jpeg: jpeg) else { return false }
        inFlight += 1
        let latency = Date().timeIntervalSince(capturedAt) * 1000
        task.send(.data(payload)) { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.inFlight = max(0, self.inFlight - 1)
                if let error {
                    self.handleDrop(error.localizedDescription)
                } else {
                    self.stats.recordSent(now: Date().timeIntervalSince1970, latencyMs: latency)
                }
            }
        }
        return true
    }
}

extension FrameSocket: URLSessionWebSocketDelegate {
    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        Task { @MainActor in
            guard self.task === webSocketTask else { return }
            self.backoff.reset()
            self.state = .open
        }
    }

    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        Task { @MainActor in
            guard self.task === webSocketTask else { return }
            self.handleDrop("closed (\(closeCode.rawValue))")
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        Task { @MainActor in
            guard self.task === task else { return }
            if !self.wantOpen { return }
            self.state = .failed(error.localizedDescription)
            self.handleDrop(error.localizedDescription)
        }
    }
}
