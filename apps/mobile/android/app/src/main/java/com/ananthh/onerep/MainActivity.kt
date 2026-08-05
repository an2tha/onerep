package com.ananthh.onerep

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Registration must happen before super.onCreate: BridgeActivity builds
        // the bridge there, and anything registered afterwards is invisible to JS.
        registerPlugin(HealthConnectPlugin::class.java)
        registerPlugin(WorkoutStatusPlugin::class.java)
        registerPlugin(HomeWidgetsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
