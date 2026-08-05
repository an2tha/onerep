//
//  NativePoseEstimation.swift
//  App
//
//  Created by Anantha Halmuttur on 05.08.26.
//
//  CoreML YOLO11n-pose + MotionBERT, exposed to Capacitor.
//
//  This plugin runs the two forward passes and nothing else. Letterboxing,
//  its inverse, and `cropScale` normalization all stay in TypeScript — a second
//  copy of any of that geometry here would drift from the web path and produce
//  a skeleton that looks correct and measures wrong, with nothing to flag it.
//
//  The one exception is the argmax over anchors in `detect`, duplicated because
//  returning the raw [56, N] tensor would put ~230k floats per frame through
//  the JSON bridge and cost more than the inference it accelerates.
//  MIN_PERSON_SCORE below must stay in sync with yolo-pose.ts.
//

import CoreML
import Vision
import UIKit
import Capacitor

@objc(NativePoseEstimation)
public class NativePoseEstimation: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativePoseEstimation"
    public let jsName = "PoseEstimation"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isReady", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "detect",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lift",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unload",  returnType: CAPPluginReturnPromise),
    ]

    // Must match the exported .mlpackage files AND the constants in yolo-pose.ts.
    private enum Dims {
        static let inputSize = 448          // export with imgsz=448
        static let clipLength = 243
        static let joints = 17
        static let channels = 3
        static let personScoreRow = 4
        static let firstKeypointRow = 5
        static let minPersonScore: Float = 0.25
        static var liftFlatCount: Int { clipLength * joints * channels }
    }

    private var detector: Yolo11nPose?
    private var vnDetector: VNCoreMLModel?
    private var lifter: MotionBERT?

    /// Reused across calls — 12,393 floats is not worth reallocating per window.
    private var liftBuffer: MLMultiArray?

    /// Serial: the reused buffer is not safe under concurrent calls, and two
    /// simultaneous CoreML requests would contend for the ANE anyway.
    private let queue = DispatchQueue(label: "pose.coreml", qos: .userInitiated)

    // MARK: - Lifecycle

    @objc func prepare(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }

            if self.detector != nil && self.lifter != nil {
                call.resolve(self.readyPayload(loadTimeMs: 0))
                return
            }

            do {
                let config = MLModelConfiguration()
                config.computeUnits = .all

                let start = CFAbsoluteTimeGetCurrent()

                let d = try Yolo11nPose(configuration: config)
                self.detector = d
                self.vnDetector = try VNCoreMLModel(for: d.model)

                self.lifter = try MotionBERT(configuration: config)
                self.liftBuffer = try MLMultiArray(
                    shape: [1,
                            NSNumber(value: Dims.clipLength),
                            NSNumber(value: Dims.joints),
                            NSNumber(value: Dims.channels)],
                    dataType: .float32
                )

                let ms = (CFAbsoluteTimeGetCurrent() - start) * 1000
                call.resolve(self.readyPayload(loadTimeMs: Int(ms)))
            } catch {
                call.reject("Failed to load CoreML models: \(error.localizedDescription)",
                            "MODEL_LOAD_FAILED", error)
            }
        }
    }

    private func readyPayload(loadTimeMs: Int) -> [String: Any] {
        [
            "loadTimeMs": loadTimeMs,
            "inputSize": Dims.inputSize,
            "clipLength": Dims.clipLength,
            "joints": Dims.joints,
        ]
    }

    @objc func isReady(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }
            call.resolve([
                "ready": self.detector != nil && self.lifter != nil,
                "inputSize": Dims.inputSize,
                "clipLength": Dims.clipLength,
            ])
        }
    }

    @objc func unload(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            self?.detector = nil
            self?.vnDetector = nil
            self?.lifter = nil
            self?.liftBuffer = nil
            call.resolve()
        }
    }

    // MARK: - Detect

    /// The image arrives already letterboxed to inputSize x inputSize by the
    /// caller, so there is no geometry to do here — just run and argmax.
    @objc func detect(_ call: CAPPluginCall) {
        guard let payload = call.getString("image") else {
            call.reject("Missing 'image'", "BAD_INPUT")
            return
        }

        queue.async { [weak self] in
            guard let self else { return }
            guard let vn = self.vnDetector else {
                call.reject("Detector not loaded — call prepare() first", "NOT_READY")
                return
            }

            guard let cg = Self.decodeImage(payload) else {
                call.reject("Could not decode base64 image", "BAD_IMAGE")
                return
            }

            // A mismatch here means the JS INPUT_SIZE and the exported imgsz
            // have diverged. Vision would silently rescale and quietly cost
            // accuracy, so fail loudly instead.
            guard cg.width == Dims.inputSize, cg.height == Dims.inputSize else {
                call.reject(
                    "Expected \(Dims.inputSize)x\(Dims.inputSize), got \(cg.width)x\(cg.height)",
                    "BAD_SIZE"
                )
                return
            }

            do {
                let request = VNCoreMLRequest(model: vn)
                request.imageCropAndScaleOption = .scaleFill  // already exact

                let start = CFAbsoluteTimeGetCurrent()
                try VNImageRequestHandler(cgImage: cg, orientation: .up)
                    .perform([request])
                let ms = (CFAbsoluteTimeGetCurrent() - start) * 1000

                guard let obs = request.results as? [VNCoreMLFeatureValueObservation],
                      let out = obs.first?.featureValue.multiArrayValue else {
                    call.reject("Detector returned no feature value", "INFERENCE_FAILED")
                    return
                }

                // Shape [1, 56, N]; N is read off the tensor, never assumed,
                // so a re-export at a different imgsz cannot misalign the rows.
                let anchors = out.shape.last!.intValue
                let ptr = out.dataPointer.bindMemory(to: Float.self, capacity: out.count)

                var bestAnchor = -1
                var bestScore = Dims.minPersonScore
                for a in 0..<anchors {
                    let s = ptr[Dims.personScoreRow * anchors + a]
                    if s > bestScore { bestScore = s; bestAnchor = a }
                }

                guard bestAnchor >= 0 else {
                    call.resolve([
                        "detected": false,
                        "keypoints": NSNull(),
                        "inferenceMs": Int(ms),
                    ])
                    return
                }

                var keypoints: [Double] = []
                keypoints.reserveCapacity(Dims.joints * 3)
                for j in 0..<Dims.joints {
                    let row = Dims.firstKeypointRow + j * 3
                    keypoints.append(Double(ptr[row * anchors + bestAnchor]))
                    keypoints.append(Double(ptr[(row + 1) * anchors + bestAnchor]))
                    keypoints.append(Double(ptr[(row + 2) * anchors + bestAnchor]))
                }

                call.resolve([
                    "detected": true,
                    "keypoints": keypoints,
                    "inferenceMs": Int(ms),
                ])
            } catch {
                call.reject("Detection failed: \(error.localizedDescription)",
                            "INFERENCE_FAILED", error)
            }
        }
    }

    // MARK: - Lift

    /// Input is already normalized by `cropScale` on the JS side, laid out
    /// [frame][joint][x, y, score] and padded to exactly `clipLength` frames.
    @objc func lift(_ call: CAPPluginCall) {
        guard let flat = call.getArray("keypoints", NSNumber.self) else {
            call.reject("Missing or malformed 'keypoints'", "BAD_INPUT")
            return
        }

        guard flat.count == Dims.liftFlatCount else {
            call.reject(
                "Expected \(Dims.liftFlatCount) values (\(Dims.clipLength)x\(Dims.joints)x\(Dims.channels)), got \(flat.count). Pad short windows on the caller side.",
                "BAD_SHAPE"
            )
            return
        }

        queue.async { [weak self] in
            guard let self else { return }
            guard let model = self.lifter, let input = self.liftBuffer else {
                call.reject("Lifter not loaded — call prepare() first", "NOT_READY")
                return
            }

            // Raw pointer rather than MLMultiArray subscripts: the subscript
            // path boxes every element through NSNumber and is measurably
            // slower at this size.
            let ptr = input.dataPointer.bindMemory(to: Float.self, capacity: input.count)
            for i in 0..<flat.count {
                ptr[i] = flat[i].floatValue
            }

            do {
                let start = CFAbsoluteTimeGetCurrent()
                let output = try model.prediction(keypoints_2d: input)
                let ms = (CFAbsoluteTimeGetCurrent() - start) * 1000

                let result = output.keypoints_3d
                let outPtr = result.dataPointer.bindMemory(to: Float.self,
                                                          capacity: result.count)
                var values = [Double](repeating: 0, count: result.count)
                for i in 0..<result.count {
                    values[i] = Double(outPtr[i])
                }

                call.resolve([
                    "keypoints3d": values,
                    "shape": result.shape.map { $0.intValue },
                    "inferenceMs": Int(ms),
                ])
            } catch {
                call.reject("Lift failed: \(error.localizedDescription)",
                            "INFERENCE_FAILED", error)
            }
        }
    }

    // MARK: - Helpers

    /// Accepts both a bare base64 payload and a `data:image/jpeg;base64,...`
    /// URL, since `canvas.toDataURL()` produces the latter.
    private static func decodeImage(_ payload: String) -> CGImage? {
        var encoded = payload
        if payload.hasPrefix("data:"), let comma = payload.firstIndex(of: ",") {
            encoded = String(payload[payload.index(after: comma)...])
        }
        guard let data = Data(base64Encoded: encoded,
                              options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)?.cgImage
    }
}
