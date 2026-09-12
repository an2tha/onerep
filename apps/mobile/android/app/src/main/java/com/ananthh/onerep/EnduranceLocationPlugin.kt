package com.ananthh.onerep

import android.Manifest
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import org.json.JSONObject

@CapacitorPlugin(name = "EnduranceLocation", permissions = [Permission(alias = "location", strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION])])
class EnduranceLocationPlugin : Plugin() {
    private fun run(call: PluginCall, operation: (EnduranceJournal) -> JSONObject) {
        activity.runOnUiThread {
            try { call.resolve(JSObject(operation(EnduranceLocationService.journal(context)).toString())) }
            catch (error: Exception) { call.reject(error.message ?: "Native route recording failed.") }
        }
    }
    @PluginMethod fun reset(call: PluginCall) {
        activity.runOnUiThread {
            try {
                context.stopService(Intent(context, EnduranceLocationService::class.java))
                EnduranceLocationService.reset(context)
                call.resolve()
            } catch (error: Exception) { call.reject(error.message ?: "Could not stop the native workout.") }
        }
    }
    @PluginMethod fun getState(call: PluginCall) = run(call) { it.state() }
    @PluginMethod fun start(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) { requestPermissionForAlias("location", call, "locationPermissionResult"); return }
        begin(call, false)
    }
    @PermissionCallback private fun locationPermissionResult(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) { call.reject("Allow Precise Location for OneRep in Settings to record your route."); return }
        begin(call, call.methodName == "resume")
    }
    @PluginMethod fun resume(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) { requestPermissionForAlias("location", call, "locationPermissionResult"); return }
        begin(call, true)
    }
    private fun begin(call: PluginCall, resume: Boolean) = run(call) { store ->
        check(activity.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) { "Open OneRep to start or resume route tracking." }
        val id = call.getString("sessionId") ?: error("Missing workout identifier.")
        if (resume) store.control(id, true, System.currentTimeMillis().toDouble())
        else store.start(id, call.getString("seed") ?: error("Missing workout snapshot."))
        if (store.state().optString("status") == "recording") {
            try { ContextCompat.startForegroundService(context, Intent(context, EnduranceLocationService::class.java)) }
            catch (error: Exception) { store.control(id, false, System.currentTimeMillis().toDouble(), error = error.message); throw error }
        }
        store.state()
    }
    @PluginMethod fun pause(call: PluginCall) = end(call, false)
    @PluginMethod fun stop(call: PluginCall) = end(call, true)
    private fun end(call: PluginCall, stopped: Boolean) = run(call) { store ->
        store.control(call.getString("sessionId") ?: "", false, System.currentTimeMillis().toDouble(), stopped)
        context.stopService(Intent(context, EnduranceLocationService::class.java))
        store.state()
    }
    @PluginMethod fun read(call: PluginCall) = run(call) { store ->
        val cursor = call.getDouble("cursor") ?: 0.0
        require(cursor.isFinite() && cursor >= 0 && cursor <= 64 * 1024 * 1024 && cursor % 1 == 0.0) { "Invalid route cursor." }
        store.read(call.getString("sessionId") ?: "", cursor.toLong())
    }
    @PluginMethod fun checkpoint(call: PluginCall) = run(call) { store ->
        store.checkpoint(call.getString("sessionId") ?: "", call.getString("seed") ?: "")
        JSONObject()
    }
    @PluginMethod fun clear(call: PluginCall) = run(call) { store -> store.clear(call.getString("sessionId") ?: ""); JSONObject() }
}
