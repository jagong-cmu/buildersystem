// Phone-camera source: the on-stage fallback when the glasses won't stream.
// Feeds the phone's back camera into the same FramePipeline (throttle →
// downscale → JPEG) and FrameSocket as the glasses, so the hub and web app
// see an identical producer.
import AVFoundation
import CoreImage
import UIKit

final class PhoneCamera: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "glasses-bridge.phone-camera", qos: .userInitiated)
    private let context = CIContext()
    private var pipeline: FramePipeline?

    enum CameraError: Error { case denied, noCamera }

    var isRunning: Bool { session.isRunning }

    func start(into pipeline: FramePipeline) async throws {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else { throw CameraError.denied }
        default: throw CameraError.denied
        }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device) else { throw CameraError.noCamera }

        self.pipeline = pipeline
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        session.inputs.forEach(session.removeInput)
        session.outputs.forEach(session.removeOutput)
        session.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        session.addOutput(output)
        if let conn = output.connection(with: .video) {
            // Portrait, like the glasses' 504×896 frames, so overlays line up.
            if #available(iOS 17.0, *) { if conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 } }
        }
        session.commitConfiguration()
        queue.async { [session] in session.startRunning() }
    }

    func stop() {
        queue.async { [session] in if session.isRunning { session.stopRunning() } }
        pipeline = nil
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pipeline, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ci = CIImage(cvPixelBuffer: buffer)
        let context = self.context
        pipeline.ingest {
            guard let cg = context.createCGImage(ci, from: ci.extent) else { return nil }
            return UIImage(cgImage: cg)
        }
    }
}
