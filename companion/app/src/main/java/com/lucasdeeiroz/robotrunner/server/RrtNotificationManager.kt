package com.lucasdeeiroz.robotrunner.server

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.lucasdeeiroz.robotrunner.MainActivity
import com.lucasdeeiroz.robotrunner.R

object RrtNotificationManager {
    private const val TAG = "RrtNotificationManager"
    private const val CHANNEL_ID = "rrt_live_updates_v5"
    private const val NOTIFICATION_ID = 98760

    fun initChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "RRT Live Updates"
            val descriptionText = "Shows real-time progress of running RRT tests"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                setShowBadge(true)
                enableVibration(false)
                enableLights(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            notificationManager?.createNotificationChannel(channel)
        }
    }

    fun showProgress(
        context: Context,
        suiteName: String,
        currentStep: Int,
        totalSteps: Int,
        stepKeyword: String
    ) {
        try {
            initChannel(context)
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

            val maxSteps = totalSteps.coerceAtLeast(1)
            val current = currentStep.coerceIn(0, maxSteps)
            val percent = if (totalSteps > 0) (currentStep * 100 / totalSteps).coerceIn(0, 100) else 0
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
            )

            Log.i(TAG, "Dispatching Live Notification on Android ${Build.VERSION.SDK_INT}: [$currentStep/$totalSteps] $stepKeyword ($percent%)")

            // Android 16+ (API 36+) Live Updates with Notification.ProgressStyle
            if (Build.VERSION.SDK_INT >= 36) {
                try {
                    // Reflection-based instantiation of Notification.ProgressStyle, Segment and Point
                    val progressStyleClass = Class.forName("android.app.Notification\$ProgressStyle")
                    val segmentClass = Class.forName("android.app.Notification\$ProgressStyle\$Segment")
                    val pointClass = Class.forName("android.app.Notification\$ProgressStyle\$Point")
                    val styleClass = Class.forName("android.app.Notification\$Style")

                    val progressStyle = progressStyleClass.getConstructor().newInstance()

                    // progressStyle.setProgress(current)
                    progressStyleClass.getMethod("setProgress", Int::class.javaPrimitiveType)
                        .invoke(progressStyle, current)

                    // progressStyle.setStyledByProgress(true)
                    try {
                        progressStyleClass.getMethod("setStyledByProgress", Boolean::class.javaPrimitiveType)
                            .invoke(progressStyle, true)
                    } catch (_: Throwable) {}

                    // segment = Segment(maxSteps).setColor(0xFF3B82F6.toInt())
                    val segmentCons = segmentClass.getConstructor(Int::class.javaPrimitiveType)
                    val segment = segmentCons.newInstance(maxSteps)
                    try {
                        segmentClass.getMethod("setColor", Int::class.javaPrimitiveType)
                            .invoke(segment, 0xFF3B82F6.toInt())
                    } catch (_: Throwable) {}

                    // progressStyle.addProgressSegment(segment)
                    progressStyleClass.getMethod("addProgressSegment", segmentClass)
                        .invoke(progressStyle, segment)

                    // Add Progress Points for each step milestone
                    for (stepIdx in 1..maxSteps) {
                        try {
                            val pointCons = pointClass.getConstructor(Int::class.javaPrimitiveType)
                            val point = pointCons.newInstance(stepIdx)
                            val pointColor = if (stepIdx <= current) 0xFF22C55E.toInt() else 0xFF64748B.toInt()
                            try {
                                pointClass.getMethod("setColor", Int::class.javaPrimitiveType)
                                    .invoke(point, pointColor)
                            } catch (_: Throwable) {}
                            progressStyleClass.getMethod("addProgressPoint", pointClass)
                                .invoke(progressStyle, point)
                        } catch (_: Throwable) {}
                    }

                    // Set Progress Tracker Icon
                    try {
                        val icon = android.graphics.drawable.Icon.createWithResource(context, R.drawable.ic_launcher_chromakey)
                        progressStyleClass.getMethod("setProgressTrackerIcon", android.graphics.drawable.Icon::class.java)
                            .invoke(progressStyle, icon)
                    } catch (_: Throwable) {}

                    val builder = Notification.Builder(context, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_launcher_chromakey)
                        .setColor(0xFF3B82F6.toInt())
                        .setColorized(true)
                        .setContentTitle("[RRT] $suiteName")
                        .setContentText(if (totalSteps > 0) "[$currentStep/$totalSteps] $stepKeyword" else stepKeyword)
                        .setSubText("$percent%")
                        .setOngoing(true)
                        .setOnlyAlertOnce(true)
                        .setShowWhen(true)
                        .setCategory(Notification.CATEGORY_PROGRESS)
                        .setContentIntent(pendingIntent)
                        .addAction(
                            Notification.Action.Builder(
                                android.graphics.drawable.Icon.createWithResource(context, R.drawable.ic_launcher_chromakey),
                                "Ver Detalhes",
                                pendingIntent
                            ).build()
                        )

                    // Request Promoted Ongoing / Live Update on Android 16
                    try {
                        builder.javaClass.getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType)
                            .invoke(builder, true)
                    } catch (_: Throwable) {}
                    try {
                        builder.javaClass.getMethod("setRequestLiveUpdate", Boolean::class.javaPrimitiveType)
                            .invoke(builder, true)
                    } catch (_: Throwable) {}

                    val extras = builder.extras
                    extras.putBoolean("android.requestPromotedOngoing", true)
                    extras.putBoolean("android.requestLiveUpdate", true)
                    extras.putBoolean("android.liveUpdate", true)
                    extras.putBoolean("com.samsung.android.live_notification", true)
                    extras.putBoolean("com.samsung.android.now_bar", true)
                    extras.putString("android.substName", "Robot Runner")
                    builder.setExtras(extras)

                    // builder.setStyle(progressStyle)
                    builder.javaClass.getMethod("setStyle", styleClass)
                        .invoke(builder, progressStyle)

                    val notification = builder.build()
                    notificationManager.notify(NOTIFICATION_ID, notification)
                    com.lucasdeeiroz.robotrunner.CompanionServerService.instance?.updateForegroundNotification(notification)
                    Log.i(TAG, "Successfully dispatched Android 16 ProgressStyle Live Update notification!")
                    return
                } catch (e: Throwable) {
                    Log.w(TAG, "Android 16 ProgressStyle reflection failed, falling back: ${e.message}", e)
                }
            }

            // Legacy Android (8.0 to 15) Ongoing Notification with Progress
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_chromakey)
                .setContentTitle("[RRT] $suiteName")
                .setContentText(if (totalSteps > 0) "[$currentStep/$totalSteps] $stepKeyword" else stepKeyword)
                .setSubText("$percent%")
                .setProgress(totalSteps.coerceAtLeast(1), currentStep, false)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setContentIntent(pendingIntent)

            val legacyNotification = builder.build()
            notificationManager.notify(NOTIFICATION_ID, legacyNotification)
            com.lucasdeeiroz.robotrunner.CompanionServerService.instance?.updateForegroundNotification(legacyNotification)
        } catch (e: Exception) {
            Log.e(TAG, "Error posting RRT progress notification", e)
        }
    }

    fun showCompletion(
        context: Context,
        suiteName: String,
        passed: Boolean,
        passedCount: Int,
        totalCount: Int
    ) {
        try {
            initChannel(context)
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
            )

            val title = if (passed) "✅ [RRT] Sucesso: $suiteName" else "❌ [RRT] Falha: $suiteName"
            val text = "Cenários: $passedCount/$totalCount concluídos com sucesso"

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_chromakey)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(false)
                .setAutoCancel(true)
                .setProgress(0, 0, false)
                .setContentIntent(pendingIntent)

            notificationManager.notify(NOTIFICATION_ID, builder.build())
            com.lucasdeeiroz.robotrunner.CompanionServerService.instance?.restoreDefaultNotification()
        } catch (e: Exception) {
            Log.w(TAG, "Error posting RRT completion notification", e)
        }
    }

    fun cancel(context: Context) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            notificationManager?.cancel(NOTIFICATION_ID)
            com.lucasdeeiroz.robotrunner.CompanionServerService.instance?.restoreDefaultNotification()
        } catch (_: Exception) {}
    }
}
