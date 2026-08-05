//
//  PosePipeline.swift
//  App
//
//  base64 JPEG/PNG frame -> YOLO11-pose (2D) -> COCO->H36M remap
//  -> rolling 243-frame buffer -> MotionBERT -> 3D keypoints.
//
//  Deliberately free of Capacitor imports so it can be unit-tested and
//  driven from a native camera feed later without touching the bridge.
//

import CoreML
import Vision
import UIKit
import Accelerate

// MARK: - Errors

enum PoseError: LocalizedError {
    case badBase64
    case badImage
    case notLoaded
    case noPersonDetected
    case bufferNotFull(have: Int, need: Int)
    case inference(String)

    var errorDescription: String? {
        switch self {
        case .badBase64:                   return "Could not decode base64 payload"
        case .badImage:                    return "Decoded bytes are not a valid image"
        case .notLoaded:                   return "Models not loaded — call prepare() first"
        case .noPersonDetected:            return "No person above confidence threshold"
        case .bufferNotFull(let h, let n): return "Buffer warming up: \(h)/\(n) frames"
        case .inference(let m):            return "Inference failed: \(m)"
        }
    }

    var code: String {
        switch self {
        case .badBase64:        return "BAD_BASE64"
        case .badImage:         return "BAD_IMAGE"
        case .notLoaded:        return "NOT_READY"
        case .noPersonDetected: return "NO_PERSON"
        case .bufferNotFull:    return "WARMING_UP"
        case .inference:        return "INFERENCE_FAILED"
        }
    }
}

// MARK: - Geometry

struct Keypoint {
    var x: Float        // pixels, original image space
    var y: Float
    var score: Float
}

/// Letterbox transform: how the original image was mapped into the 640x640 square.
private struct Letterbox {
    let scale: CGFloat
    let padX: CGFloat
    let padY: CGFloat

    /// Map a coordinate in model space back to original image space.
    func invert(x: Float, y: Float) -> (Float, Float) {
        (Float((CGFloat(x) - padX) / scale),
         Float((CGFloat(y) - padY) / scale))
    }
}

// MARK: - Pipeline

final class PosePipeline {

    // Must match the exported .mlpackage files.
    enum Config {
        static let inputSize      = 640
        static let clipLength     = 243     // MotionBERT T
        static let joints         = 17
        static let channels       = 3       // x, y, confidence
        static let numAnchors     = 8400    // YOLO11 @ 640: 80²+40²+20²
        static let numOutputs     = 56      // 4 box + 1 conf + 17*3 kpts
        static let confThreshold: Float = 0.35
    }

    private var yolo: Yolo11nPose?
    private var motionBERT: MotionBERT?
    private var vnYolo: VNCoreMLModel?

    /// Reused input tensor for MotionBERT — 12,393 floats, don't reallocate per call.
    private var mbInput: MLMultiArray?

    /// Rolling window of H36M keypoints, normalized. Oldest first.
    private var window: [[Keypoint]] = []

    // MARK: Lifecycle

    func prepare() throws {
        guard yolo == nil else { return }

        let config = MLModelConfiguration()
        config.computeUnits = .all

        let y = try Yolo11nPose(configuration: config)
        self.yolo = y
        self.vnYolo = try VNCoreMLModel(for: y.model)
        self.motionBERT = try MotionBERT(configuration: config)

        self.mbInput = try MLMultiArray(
            shape: [1,
                    NSNumber(value: Config.clipLength),
                    NSNumber(value: Config.joints),
                    NSNumber(value: Config.channels)],
            dataType: .float32
        )
    }

    func unload() {
        yolo = nil
        vnYolo = nil
        motionBERT = nil
        mbInput = nil
        window.removeAll()
    }

    func reset() {
        window.removeAll()
    }

    var bufferCount: Int { window.count }
    var isReady: Bool { yolo != nil && motionBERT != nil }

    // MARK: - Stage 1: base64 -> CGImage

    func decode(base64: String) throws -> CGImage {
        // Tolerate data-URL prefixes from canvas.toDataURL()
        let cleaned: String
        if let comma = base64.range(of: ",") , base64.hasPrefix("data:") {
            cleaned = String(base64[comma.upperBound...])
        } else {
            cleaned = base64
        }

        guard let data = Data(base64Encoded: cleaned, options: .ignoreUnknownCharacters) else {
            throw PoseError.badBase64
        }
        guard let image = UIImage(data: data)?.cgImage else {
            throw PoseError.badImage
        }
        return image
    }

    // MARK: - Stage 2: letterbox to 640x640

    /// Ultralytics trains with letterboxing (aspect preserved, grey padding).
    /// Vision's .scaleFill would stretch and shift every keypoint, so do it manually.
    private func letterbox(_ image: CGImage) -> (CVPixelBuffer, Letterbox)? {
        let side = Config.inputSize
        let sw = CGFloat(image.width), sh = CGFloat(image.height)
        let scale = min(CGFloat(side) / sw, CGFloat(side) / sh)
        let dw = sw * scale, dh = sh * scale
        let padX = (CGFloat(side) - dw) / 2
        let padY = (CGFloat(side) - dh) / 2

        var pb: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ]
        guard CVPixelBufferCreate(kCFAllocatorDefault, side, side,
                                  kCVPixelFormatType_32BGRA,
                                  attrs as CFDictionary, &pb) == kCVReturnSuccess,
              let buffer = pb else { return nil }

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        guard let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: side, height: side,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
                      | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }

        // Ultralytics pads with (114,114,114)
        ctx.setFillColor(red: 114/255, green: 114/255, blue: 114/255, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))

        // CGContext is bottom-left origin; flip so padY is measured from the top,
        // matching the coordinate convention the model outputs.
        ctx.draw(image, in: CGRect(x: padX,
                                   y: CGFloat(side) - padY - dh,
                                   width: dw, height: dh))

        return (buffer, Letterbox(scale: scale, padX: padX, padY: padY))
    }

    // MARK: - Stage 3: YOLO11-pose

    /// Returns the highest-confidence person's 17 COCO keypoints in original
    /// image pixel coordinates.
    ///
    /// Note: we take argmax over anchors rather than running NMS. For a
    /// single-subject app this is correct and much cheaper. If you need
    /// multiple people, collect all boxes above threshold and NMS them here.
    private func detect2D(pixelBuffer: CVPixelBuffer,
                          lb: Letterbox) throws -> [Keypoint] {
        guard let vn = vnYolo else { throw PoseError.notLoaded }

        let request = VNCoreMLRequest(model: vn)
        request.imageCropAndScaleOption = .scaleFill   // already exactly 640x640

        try VNImageRequestHandler(cvPixelBuffer: pixelBuffer,
                                  orientation: .up).perform([request])

        guard let obs = request.results as? [VNCoreMLFeatureValueObservation],
              let out = obs.first?.featureValue.multiArrayValue else {
            throw PoseError.inference("YOLO returned no feature value")
        }

        // Shape (1, 56, 8400), contiguous float32.
        let ptr = out.dataPointer.bindMemory(to: Float.self, capacity: out.count)
        let A = Config.numAnchors

        // Find best anchor by objectness (channel 4).
        var bestIdx = -1
        var bestScore: Float = Config.confThreshold
        for a in 0..<A {
            let s = ptr[4 * A + a]
            if s > bestScore { bestScore = s; bestIdx = a }
        }
        guard bestIdx >= 0 else { throw PoseError.noPersonDetected }

        // Keypoints start at channel 5, three channels each (x, y, score).
        var coco: [Keypoint] = []
        coco.reserveCapacity(Config.joints)
        for j in 0..<Config.joints {
            let kx = ptr[(5 + 3 * j)     * A + bestIdx]
            let ky = ptr[(5 + 3 * j + 1) * A + bestIdx]
            let ks = ptr[(5 + 3 * j + 2) * A + bestIdx]
            let (ox, oy) = lb.invert(x: kx, y: ky)
            coco.append(Keypoint(x: ox, y: oy, score: ks))
        }
        return coco
    }

    // MARK: - Stage 4: COCO -> H36M

    /// Port of MotionBERT's `coco2h36m` (lib/utils/utils_data.py).
    /// VERIFY this against your checkout before trusting the 3D output —
    /// a wrong remap produces plausible-looking but incorrect poses.
    private func coco2h36m(_ c: [Keypoint]) -> [Keypoint] {
        func mid(_ a: Keypoint, _ b: Keypoint) -> Keypoint {
            Keypoint(x: (a.x + b.x) * 0.5,
                     y: (a.y + b.y) * 0.5,
                     score: min(a.score, b.score))
        }

        var h = [Keypoint](repeating: Keypoint(x: 0, y: 0, score: 0),
                           count: Config.joints)
        h[0]  = mid(c[11], c[12])   // pelvis
        h[1]  = c[12]               // R hip
        h[2]  = c[14]               // R knee
        h[3]  = c[16]               // R ankle
        h[4]  = c[11]               // L hip
        h[5]  = c[13]               // L knee
        h[6]  = c[15]               // L ankle
        h[8]  = mid(c[5], c[6])     // thorax / neck
        h[7]  = mid(h[0], h[8])     // spine
        h[9]  = c[0]                // nose
        h[10] = mid(c[1], c[2])     // head
        h[11] = c[5]                // L shoulder
        h[12] = c[7]                // L elbow
        h[13] = c[9]                // L wrist
        h[14] = c[6]                // R shoulder
        h[15] = c[8]                // R elbow
        h[16] = c[10]               // R wrist
        return h
    }

    // MARK: - Stage 5: normalize

    /// MotionBERT's `normalize_screen_coordinates`:
    ///   x' = x / w * 2 - 1
    ///   y' = y / w * 2 - h / w
    /// Note both axes divide by WIDTH — that is intentional, it preserves aspect.
    private func normalize(_ kps: [Keypoint],
                           width: Int, height: Int) -> [Keypoint] {
        let w = Float(width), h = Float(height)
        return kps.map {
            Keypoint(x: $0.x / w * 2 - 1,
                     y: $0.y / w * 2 - h / w,
                     score: $0.score)
        }
    }

    // MARK: - Stage 6: MotionBERT

    struct Lift3D {
        let values: [Float]     // flat, T * 17 * 3
        let shape: [Int]
        let inferenceMs: Double
    }

    private func lift() throws -> Lift3D {
        guard let model = motionBERT, let input = mbInput else {
            throw PoseError.notLoaded
        }
        guard window.count == Config.clipLength else {
            throw PoseError.bufferNotFull(have: window.count, need: Config.clipLength)
        }

        let ptr = input.dataPointer.bindMemory(to: Float.self, capacity: input.count)
        var i = 0
        for frame in window {
            for kp in frame {
                ptr[i]     = kp.x
                ptr[i + 1] = kp.y
                ptr[i + 2] = kp.score
                i += 3
            }
        }

        let start = CFAbsoluteTimeGetCurrent()
        let out: MotionBERTOutput
        do {
            out = try model.prediction(keypoints_2d: input)
        } catch {
            throw PoseError.inference(error.localizedDescription)
        }
        let ms = (CFAbsoluteTimeGetCurrent() - start) * 1000

        let result = out.keypoints_3d
        let outPtr = result.dataPointer.bindMemory(to: Float.self, capacity: result.count)
        let values = Array(UnsafeBufferPointer(start: outPtr, count: result.count))

        return Lift3D(values: values,
                      shape: result.shape.map { $0.intValue },
                      inferenceMs: ms)
    }

    // MARK: - Public entry points

    struct FrameResult {
        let detected: Bool
        let bufferCount: Int
        let keypoints2D: [Keypoint]?    // original pixel space, for overlay drawing
        let detectMs: Double
    }

    /// Push one frame. Cheap — runs YOLO only. Call this per camera frame.
    @discardableResult
    func pushFrame(base64: String) throws -> FrameResult {
        guard isReady else { throw PoseError.notLoaded }

        let start = CFAbsoluteTimeGetCurrent()
        let image = try decode(base64: base64)

        guard let (buffer, lb) = letterbox(image) else {
            throw PoseError.badImage
        }

        let coco: [Keypoint]
        do {
            coco = try detect2D(pixelBuffer: buffer, lb: lb)
        } catch PoseError.noPersonDetected {
            // Hold the last pose rather than injecting zeros — a zero frame
            // creates a visible discontinuity the temporal model will smear.
            if let last = window.last { window.append(last) }
            if window.count > Config.clipLength { window.removeFirst() }
            return FrameResult(detected: false,
                               bufferCount: window.count,
                               keypoints2D: nil,
                               detectMs: (CFAbsoluteTimeGetCurrent() - start) * 1000)
        }

        let h36m = coco2h36m(coco)
        let normalized = normalize(h36m, width: image.width, height: image.height)

        window.append(normalized)
        if window.count > Config.clipLength { window.removeFirst() }

        return FrameResult(detected: true,
                           bufferCount: window.count,
                           keypoints2D: coco,
                           detectMs: (CFAbsoluteTimeGetCurrent() - start) * 1000)
    }

    /// Run the 3D lift over the current window. Expensive — call at most a few
    /// times a second, not per frame.
    func lift3D() throws -> Lift3D {
        try lift()
    }

    /// Convenience: push a frame and lift if the window is full.
    func process(base64: String) throws -> (FrameResult, Lift3D?) {
        let frame = try pushFrame(base64: base64)
        guard window.count == Config.clipLength else { return (frame, nil) }
        return (frame, try lift())
    }
}
