package com.ananthh.onerep

import android.util.Base64
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/** Native trust boundary for signed OTA release manifests. */
@CapacitorPlugin(name = "OtaTrust")
class OtaTrustPlugin : Plugin() {

    @PluginMethod
    fun verifyManifest(call: PluginCall) {
        val valid = runCatching {
            if (call.getString("keyId") != KEY_ID) return@runCatching false
            val payload = Base64.decode(call.getString("payload"), Base64.DEFAULT)
            val signatureBytes = Base64.decode(call.getString("signature"), Base64.DEFAULT)
            val keyBytes = Base64.decode(PUBLIC_KEY_DER_BASE64, Base64.DEFAULT)
            val publicKey = KeyFactory.getInstance("RSA")
                .generatePublic(X509EncodedKeySpec(keyBytes))
            Signature.getInstance("SHA256withRSA").run {
                initVerify(publicKey)
                update(payload)
                verify(signatureBytes)
            }
        }.getOrDefault(false)

        call.resolve(com.getcapacitor.JSObject().put("valid", valid))
    }

    private companion object {
        const val KEY_ID = "onerep-ota-2026-01"
        const val PUBLIC_KEY_DER_BASE64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtatptEi35zWra6vKngJ7uXyeMVfojMxGLDWT+bRRHOmv/thgn6GIUS0p7a6pbRYo94tLbSM2Pw8qSFAvvrhntpCzAPXTv6bf6VOjRbwR8I6y0MmnuPqV5rYaUFkm0MB98QczWlTHD/WAEi/O3bGopwCoFuJEInPztZfBVP0cbqcdaqSUkODs8Ic+4YqlE5NPTecH2vSCcwCa5pJo4NGyftOibEufjRw8sQgnlTLMa9pIJY19T6V2THFx5ehj5VONtR7dh65ZruvziX6IWQGHcH6rb5c9k8ZgyMAbTlAaeBFXIqm1vkdnaMw19uZiLjN1Gy71B2w6pKTkHX9FZlqOtwIDAQAB"
    }
}
