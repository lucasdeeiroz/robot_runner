package com.lucasdeeiroz.robotrunner

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
import com.lucasdeeiroz.robotrunner.server.CompanionHttpServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CompanionServerService : Service() {

    private val binder = LocalBinder()
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var watchdogJob: Job? = null

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
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_STOP_SERVER) {
            Log.i("CompanionService", "Received ACTION_STOP_SERVER command")
            stopServer()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            stopSelf()
            return START_NOT_STICKY
        }

        val timeoutSeconds = intent?.getIntExtra(EXTRA_IDLE_TIMEOUT_SECONDS, DEFAULT_DESKTOP_TIMEOUT_SECONDS)
            ?: DEFAULT_DESKTOP_TIMEOUT_SECONDS

        startForegroundServiceNotification()
        startServer(timeoutSeconds)
        return START_STICKY
    }

    fun startServer(timeoutSeconds: Int = DEFAULT_DESKTOP_TIMEOUT_SECONDS) {
        if (server != null) {
            server?.touchRequest()
            startWatchdog(timeoutSeconds)
            return
        }
        try {
            server = CompanionHttpServer(SERVER_PORT, this).apply {
                onStatusChangedListener = {
                    this@CompanionServerService.onStatusChangedListener?.invoke()
                }
                start(5000, false)
            }
            server?.touchRequest()
            isRunning = true
            startForegroundServiceNotification()
            startWatchdog(timeoutSeconds)
            onStatusChangedListener?.invoke()
            Log.i("CompanionService", "HTTP Server started on port $SERVER_PORT with idle timeout ${timeoutSeconds}s")
        } catch (e: Exception) {
            Log.e("CompanionService", "Failed to start Companion HTTP server", e)
            isRunning = false
        }
    }

    private fun startWatchdog(timeoutSeconds: Int) {
        watchdogJob?.cancel()
        if (timeoutSeconds <= 0) return

        watchdogJob = serviceScope.launch {
            val timeoutMs = timeoutSeconds * 1000L
            while (isActive && isRunning) {
                delay(5000L)
                val idleMs = server?.getIdleDurationMs() ?: 0L
                if (idleMs >= timeoutMs) {
                    Log.i("CompanionService", "Idle timeout of ${timeoutSeconds}s reached (idle for ${idleMs}ms). Stopping Companion HTTP server.")
                    withContext(Dispatchers.Main) {
                        stopServer()
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            stopForeground(STOP_FOREGROUND_REMOVE)
                        } else {
                            @Suppress("DEPRECATION")
                            stopForeground(true)
                        }
                        stopSelf()
                    }
                    break
                }
            }
        }
    }

    fun stopServer() {
        watchdogJob?.cancel()
        watchdogJob = null
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
        serviceScope.cancel()
        if (instance === this) {
            instance = null
        }
        stopServer()
        super.onDestroy()
    }

    fun updateForegroundNotification(notification: Notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                try {
                    startForeground(1001, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                } catch (_: Exception) {
                    startForeground(1001, notification)
                }
            } else {
                startForeground(1001, notification)
            }
        } catch (e: Exception) {
            Log.w("CompanionService", "Failed to update foreground notification: ${e.message}")
        }
    }

    fun restoreDefaultNotification() {
        startForegroundServiceNotification()
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
        const val ACTION_START_SERVER = "com.lucasdeeiroz.robotrunner.START_SERVER"
        const val ACTION_STOP_SERVER = "com.lucasdeeiroz.robotrunner.STOP_SERVER"
        const val EXTRA_IDLE_TIMEOUT_SECONDS = "IDLE_TIMEOUT_SECONDS"
        const val DEFAULT_DESKTOP_TIMEOUT_SECONDS = 120 // 2 minutes for desktop connection
        const val DEFAULT_MANUAL_TIMEOUT_SECONDS = 900 // 15 minutes extended timeout for on-device manual start

        var instance: CompanionServerService? = null
            private set
    }
}
