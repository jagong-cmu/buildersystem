// Still-photo input: pick from the library or take one, push it to the hub
// as a single frame (PRD G1 "photo upload as a fallback"). No live stream
// needed; the laptop's /scan runs vision on it like any other frame.
import PhotosUI
import SwiftUI
import UIKit

struct PhotoSendSection: View {
    @EnvironmentObject private var settings: BridgeSettings
    @EnvironmentObject private var stream: GlassesStream
    @State private var pick: PhotosPickerItem?
    @State private var showCamera = false
    @State private var status: String?

    var body: some View {
        Section {
            HStack {
                PhotosPicker(selection: $pick, matching: .images) {
                    Text("Choose photo").frame(maxWidth: .infinity)
                }.buttonStyle(.bordered)
                Button {
                    showCamera = true
                } label: { Text("Take photo").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                    .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
            }
            .disabled(settings.endpoints == nil)
            if let status { Text(status).font(.footnote).foregroundStyle(.secondary) }
        } header: { Text("Photo") } footer: {
            Text("Sends one picture to the hub as a frame; the laptop's Scan page runs detection on it. \(stream.photosSent) sent this session.")
        }
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                status = "loading…"
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    await send(image)
                } else {
                    status = "couldn't read that photo"
                }
                pick = nil
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                if let image { Task { await send(image) } }
            }
            .ignoresSafeArea()
        }
    }

    private func send(_ image: UIImage) async {
        guard let endpoints = settings.endpoints else { return }
        status = "sending…"
        await stream.sendPhoto(image, endpoints: endpoints, sourceId: settings.sourceId,
                               maxWidth: settings.maxWidth, quality: settings.jpegQuality)
        status = stream.lastError ?? "sent \(Int(image.size.width))×\(Int(image.size.height)) → \(settings.sourceId)"
    }
}

/// UIImagePickerController (camera) — no secure-context or getUserMedia
/// requirement, unlike a web page.
struct CameraPicker: UIViewControllerRepresentable {
    let onDone: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onDone: (UIImage?) -> Void
        init(onDone: @escaping (UIImage?) -> Void) { self.onDone = onDone }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onDone(info[.originalImage] as? UIImage)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onDone(nil) }
    }
}
