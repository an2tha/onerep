package com.ananthh.onerep

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Answers one question: can this build actually register for FCM?
 *
 * It exists because `PushNotifications.register()` does not fail politely on a
 * build with no `google-services.json` — it throws on Capacitor's plugin
 * thread, which takes the whole process down before any rejection can reach the
 * JS that called it. So the check has to happen before the call, natively.
 *
 * The signal is the resource the google-services Gradle plugin generates. It is
 * the same value Firebase's own init provider reads, so its absence means the
 * default FirebaseApp was never created, which is exactly the crash condition.
 */
@CapacitorPlugin(name = "PushSupport")
class PushSupportPlugin : Plugin() {

    @PluginMethod
    fun isConfigured(call: PluginCall) {
        val id = context.resources.getIdentifier(
            "google_app_id", "string", context.packageName
        )
        call.resolve(JSObject().put("configured", id != 0))
    }
}
