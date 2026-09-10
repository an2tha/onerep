import Capacitor
import Foundation
import Security

/// Verifies OTA release metadata before replaceable web code may consume it.
/// The private signing key exists only in release CI; this public key is safe
/// to ship and deliberately lives in the reviewed native shell.
@objc(OtaTrustPlugin)
public final class OtaTrustPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OtaTrustPlugin"
    public let jsName = "OtaTrust"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "verifyManifest", returnType: CAPPluginReturnPromise)
    ]

    private static let keyId = "onerep-ota-2026-01"
    private static let publicKeyDerBase64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtatptEi35zWra6vKngJ7uXyeMVfojMxGLDWT+bRRHOmv/thgn6GIUS0p7a6pbRYo94tLbSM2Pw8qSFAvvrhntpCzAPXTv6bf6VOjRbwR8I6y0MmnuPqV5rYaUFkm0MB98QczWlTHD/WAEi/O3bGopwCoFuJEInPztZfBVP0cbqcdaqSUkODs8Ic+4YqlE5NPTecH2vSCcwCa5pJo4NGyftOibEufjRw8sQgnlTLMa9pIJY19T6V2THFx5ehj5VONtR7dh65ZruvziX6IWQGHcH6rb5c9k8ZgyMAbTlAaeBFXIqm1vkdnaMw19uZiLjN1Gy71B2w6pKTkHX9FZlqOtwIDAQAB"

    @objc func verifyManifest(_ call: CAPPluginCall) {
        guard call.getString("keyId") == Self.keyId,
              let payloadBase64 = call.getString("payload"),
              let signatureBase64 = call.getString("signature"),
              let payload = Data(base64Encoded: payloadBase64),
              let signature = Data(base64Encoded: signatureBase64),
              let keyData = Data(base64Encoded: Self.publicKeyDerBase64),
              let publicKey = SecKeyCreateWithData(
                keyData as CFData,
                [
                    kSecAttrKeyType: kSecAttrKeyTypeRSA,
                    kSecAttrKeyClass: kSecAttrKeyClassPublic,
                    kSecAttrKeySizeInBits: 2048
                ] as CFDictionary,
                nil
              ) else {
            call.resolve(["valid": false])
            return
        }

        var error: Unmanaged<CFError>?
        let valid = SecKeyVerifySignature(
            publicKey,
            .rsaSignatureMessagePKCS1v15SHA256,
            payload as CFData,
            signature as CFData,
            &error
        )
        call.resolve(["valid": valid])
    }
}
