package com.lucasdeeiroz.robotrunner.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.lucasdeeiroz.robotrunner.CompanionServerService

class CompanionCommandReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i("CompanionCommandReceiver", "Received broadcast action: $action")

        when (action) {
            CompanionServerService.ACTION_START_SERVER -> {
                val timeout = intent.getIntExtra(
                    CompanionServerService.EXTRA_IDLE_TIMEOUT_SECONDS,
                    CompanionServerService.DEFAULT_DESKTOP_TIMEOUT_SECONDS
                )
                val srvIntent = Intent(context, CompanionServerService::class.java).apply {
                    this.action = CompanionServerService.ACTION_START_SERVER
                    putExtra(CompanionServerService.EXTRA_IDLE_TIMEOUT_SECONDS, timeout)
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
