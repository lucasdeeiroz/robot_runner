package com.robotrunner.companion.performance

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import com.robotrunner.companion.hardware.HardwareSpecsProvider

class FloatingHudService : Service() {

    private var windowManager: WindowManager? = null
    private var hudView: View? = null
    private val handler = Handler(Looper.getMainLooper())

    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f

    private val updateRunnable = object : Runnable {
        override fun run() {
            updateMetrics()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createHudView()
        handler.post(updateRunnable)
    }

    private fun createHudView() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#EE0F172A"))
            setPadding(24, 16, 24, 16)
        }

        val titleTv = TextView(this).apply {
            text = "⚡ ROBOT RUNNER HUD"
            setTextColor(Color.parseColor("#FF38BDF8"))
            textSize = 10f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        val metricsTv = TextView(this).apply {
            id = View.generateViewId()
            text = "CPU: 0% | RAM: 0MB"
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = android.graphics.Typeface.MONOSPACE
        }

        val closeTv = TextView(this).apply {
            text = "[Close HUD]"
            setTextColor(Color.parseColor("#FFEF4444"))
            textSize = 10f
            setPadding(0, 8, 0, 0)
            setOnClickListener { stopSelf() }
        }

        layout.addView(titleTv)
        layout.addView(metricsTv)
        layout.addView(closeTv)
        hudView = layout

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 50
            y = 200
        }

        layout.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager?.updateViewLayout(hudView, params)
                    true
                }
                else -> false
            }
        }

        try {
            windowManager?.addView(hudView, params)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun updateMetrics() {
        hudView?.let { view ->
            val layout = view as? LinearLayout ?: return
            val metricsTv = layout.getChildAt(1) as? TextView ?: return

            val telemetry = HardwareSpecsProvider.getLiveTelemetry(this, isServerRunning = true, activeClients = 1)
            metricsTv.text = "CPU: ${telemetry.cpuUsagePercent}% | RAM: ${telemetry.ramUsedMb}MB\nBat: ${telemetry.batteryPercent}% (${telemetry.batteryCurrentMa}mA)"
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(updateRunnable)
        hudView?.let {
            try {
                windowManager?.removeView(it)
            } catch (_: Exception) {}
        }
        hudView = null
        super.onDestroy()
    }
}
