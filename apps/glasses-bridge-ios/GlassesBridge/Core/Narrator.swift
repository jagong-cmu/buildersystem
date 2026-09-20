// Speaks `say` messages with AVSpeechSynthesizer. Audio is routed through
// the phone's current output: when the glasses are paired as the phone's
// Bluetooth audio device, that is the glasses' open-ear speakers.
import AVFoundation
import Foundation

@MainActor
final class Narrator: NSObject, ObservableObject {
    @Published var enabled = true
    @Published private(set) var speaking = false
    @Published private(set) var queueDepth = 0

    private let synthesizer = AVSpeechSynthesizer()
    private var queue: [String] = []

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func say(_ text: String) {
        guard enabled, !text.isEmpty else { return }
        // Newest instruction wins: a "Step 4" announcement should not wait
        // behind three stale countdown ticks.
        if queue.count >= 2 { queue.removeFirst(queue.count - 1) }
        queue.append(text)
        queueDepth = queue.count
        pump()
    }

    func stop() {
        queue.removeAll()
        queueDepth = 0
        synthesizer.stopSpeaking(at: .immediate)
        speaking = false
    }

    private func pump() {
        guard !speaking, !queue.isEmpty else { return }
        let text = queue.removeFirst()
        queueDepth = queue.count
        Self.configureAudioSession()
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        speaking = true
        synthesizer.speak(utterance)
    }

    private static func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .spokenAudio, options: [.allowBluetoothA2DP, .duckOthers])
            try session.setActive(true)
        } catch {
            // Fall back to whatever route iOS picks; the phone speaker still demos the path.
        }
    }
}

extension Narrator: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finished() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finished() }
    }

    private func finished() {
        speaking = false
        pump()
    }
}
