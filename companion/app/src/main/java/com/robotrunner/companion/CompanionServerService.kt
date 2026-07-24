package com.robotrunner.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.robotrunner.companion.server.CompanionHttpServer

class CompanionServerService : Service() {

    private val binder = LocalBinder()
    var server: CompanionHttpServer? = null
        private set

    var isRunning = false
        private set

    val activeClientsCount: Int
        get() = server?.requestCount ?: 0

    var onStatusChangedListener: (() -> Unit)? = null

    inner class LocalBinder : Binder() {
        fun getService(): CompanionServerService = this@CompanionServerService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceNotification()
        startServer()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            startServer()
        }
        return START_STICKY
    }

    fun startServer() {
        if (server != null) return
        try {
            server = CompanionHttpServer(SERVER_PORT, this).apply {
                onStatusChangedListener = {
                    this@CompanionServerService.onStatusChangedListener?.invoke()
                }
                start(5000, false)
            }
            isRunning = true
            onStatusChangedListener?.invoke()
            Log.i("CompanionService", "HTTP Server started successfully on port $SERVER_PORT")
        } catch (e: Exception) {
            Log.e("CompanionService", "Failed to start Companion HTTP server", e)
            isRunning = false
        }
    }

    fun stopServer() {
        try {
            server?.stop()
        } catch (e: Exception) {
            Log.e("CompanionService", "Error stopping server", e)
        }
        server = null
        isRunning = false
        onStatusChangedListener?.invoke()
    }

    override fun onDestroy() {
        stopServer()
        super.onDestroy()
    }

    private fun startForegroundServiceNotification() {
        try {
            val channelId = "companion_service_channel"
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    channelId,
                    "Robot Runner Companion Daemon",
                    NotificationManager.IMPORTANCE_LOW
                )
                manager.createNotificationChannel(channel)
            }

            val notification: Notification = NotificationCompat.Builder(this, channelId)
                .setContentTitle("Robot Runner Companion Active")
                .setContentText("Listening on port $SERVER_PORT")
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                try {
                    startForeground(1001, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                } catch (e: Exception) {
                    Log.w("CompanionService", "Failed to startForeground with SPECIAL_USE: ${e.message}")
                    startForeground(1001, notification)
                }
            } else {
                startForeground(1001, notification)
            }
        } catch (e: Exception) {
            Log.e("CompanionService", "Error in startForegroundServiceNotification", e)
        }
    }

    companion object {
        const val SERVER_PORT = 9876
    }
}
