package com.ananthh.onerep

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.getcapacitor.BridgeActivity

/** The action Health Connect uses on Android 13 and below. */
private const val ACTION_SHOW_PERMISSIONS_RATIONALE =
    "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"

/** And the one the platform itself uses from Android 14 onwards. */
private const val ACTION_VIEW_PERMISSION_USAGE =
    "android.intent.action.VIEW_PERMISSION_USAGE"

private const val HEALTH_SETTINGS_LINK = "onerep://settings?view=health"

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Registration must happen before super.onCreate: BridgeActivity builds
        // the bridge there, and anything registered afterwards is invisible to JS.
        registerPlugin(HealthConnectPlugin::class.java)
        registerPlugin(WorkoutStatusPlugin::class.java)
        registerPlugin(HomeWidgetsPlugin::class.java)
        registerPlugin(NativeTabBarPlugin::class.java)
        registerPlugin(PushSupportPlugin::class.java)
        intent = rewriteHealthRationale(intent)
        super.onCreate(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(rewriteHealthRationale(intent) ?: intent)
    }

    /**
     * Health Connect opens us to ask "why do you want this data?" and expects a
     * screen, not a bridge callback. Capacitor knows nothing about either
     * action, so the intent is rewritten into the deep link the WebView already
     * understands and the user lands on Settings › Health — which is where the
     * consent copy and the permission toggles live anyway.
     */
    private fun rewriteHealthRationale(intent: Intent?): Intent? {
        val action = intent?.action ?: return intent
        if (
            action != ACTION_SHOW_PERMISSIONS_RATIONALE &&
            action != ACTION_VIEW_PERMISSION_USAGE
        ) {
            return intent
        }
        return intent.apply {
            setAction(Intent.ACTION_VIEW)
            data = Uri.parse(HEALTH_SETTINGS_LINK)
        }
    }
}
