package com.lucasdeeiroz.robotrunner.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.lucasdeeiroz.robotrunner.CompanionServerService
import com.lucasdeeiroz.robotrunner.server.CompanionAuth

class CompanionCommandReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i("CompanionCommandReceiver", "Received broadcast action: $action")

        when (action) {
            CompanionServerService.ACTION_START_SERVER -> {
                val timeout = CompanionServerService.clampIdleTimeout(
                    intent.getIntExtra(
                        CompanionServerService.EXTRA_IDLE_TIMEOUT_SECONDS,
                        CompanionServerService.DEFAULT_DESKTOP_TIMEOUT_SECONDS
                    )
                )
                // This receiver is protected by android.permission.DUMP (held by the adb shell UID),
                // so it is the only entry point allowed to deliver the desktop session token.
                val token = intent.getStringExtra(CompanionAuth.EXTRA_AUTH_TOKEN)
                val validToken = token?.takeIf { CompanionAuth.isValidFormat(it) }
                if (token != null && validToken == null) {
                    Log.w("CompanionCommandReceiver", "Ignoring AUTH_TOKEN extra with invalid format")
                }
                // Update the token in place first so an already running server switches immediately.
                if (validToken != null) {
                    CompanionAuth.setToken(validToken)
                }
                val srvIntent = Intent(context, CompanionServerService::class.java).apply {
                    this.action = CompanionServerService.ACTION_START_SERVER
                    putExtra(CompanionServerService.EXTRA_IDLE_TIMEOUT_SECONDS, timeout)
                    if (validToken != null) {
                        putExtra(CompanionAuth.EXTRA_AUTH_TOKEN, validToken)
                    }
                }
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(srvIntent)
                    } else {
                        context.startService(srvIntent)
                    }
                    Log.i("CompanionCommandReceiver", "Dispatched startForegroundService to CompanionServerService with timeout $timeout")
                } catch (e: Exception) {
                    Log.e("CompanionCommandReceiver", "Failed to start service from broadcast", e)
                }
            }
            CompanionServerService.ACTION_STOP_SERVER -> {
                val srvIntent = Intent(context, CompanionServerService::class.java).apply {
                    this.action = CompanionServerService.ACTION_STOP_SERVER
                }
                try {
                    context.startService(srvIntent)
                    Log.i("CompanionCommandReceiver", "Dispatched stop to CompanionServerService")
                } catch (e: Exception) {
                    Log.e("CompanionCommandReceiver", "Failed to stop service from broadcast", e)
                }
            }
        }
    }
}
