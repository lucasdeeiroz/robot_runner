package com.lucasdeeiroz.robotrunner.performance

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
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.lucasdeeiroz.robotrunner.explorer.AutonomousExplorerEngine
import com.lucasdeeiroz.robotrunner.explorer.ExplorerState
import com.lucasdeeiroz.robotrunner.hardware.HardwareSpecsProvider
import com.lucasdeeiroz.robotrunner.inspector.UiInspectorEngine
import com.lucasdeeiroz.robotrunner.logcat.LogcatStreamer
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import com.lucasdeeiroz.robotrunner.stopwatch.RedrawStopwatchEngine

class FloatingHudService : Service() {

    companion object {
        const val EXTRA_HUD_MODE = "EXTRA_HUD_MODE"
        const val MODE_PERFORMANCE = "PERFORMANCE"
        const val MODE_STOPWATCH = "STOPWATCH"
        const val MODE_LOGCAT = "LOGCAT"
        const val MODE_INSPECTOR = "INSPECTOR"
        const val MODE_EXPLORER = "EXPLORER"

        @Volatile
        var isRunning = false
            private set

        @Volatile
        var activeMode = MODE_PERFORMANCE
    }

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

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringExtra(EXTRA_HUD_MODE)?.let { mode ->
            activeMode = mode
            updateMetrics()
        }
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }

        isRunning = true
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createHudView()
        handler.post(updateRunnable)
    }

    private fun createHudView() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F00F172A"))
            setPadding(18, 14, 18, 14)
        }

        // Header Row: Title & Close
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val titleTv = TextView(this).apply {
            text = "⚡ ROBOT RUNNER HUD"
            setTextColor(Color.parseColor("#FF38BDF8"))
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val closeTv = TextView(this).apply {
            text = "✖"
            setTextColor(Color.parseColor("#FFEF4444"))
            textSize = 12f
            setPadding(10, 0, 0, 0)
            setOnClickListener { stopSelf() }
        }

        headerRow.addView(titleTv)
        headerRow.addView(closeTv)
        layout.addView(headerRow)

        // Mode Selector Bar
        val modeSelectorRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 6, 0, 6)
        }

        val perfBtn = TextView(this).apply {
            text = "PERF"
            setTextColor(if (activeMode == MODE_PERFORMANCE) Color.parseColor("#FF38BDF8") else Color.GRAY)
            textSize = 8.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(4, 4, 4, 4)
            setOnClickListener {
                activeMode = MODE_PERFORMANCE
                updateMetrics()
            }
        }

        val stopBtn = TextView(this).apply {
            text = "TIMER"
            setTextColor(if (activeMode == MODE_STOPWATCH) Color.parseColor("#FF38BDF8") else Color.GRAY)
            textSize = 8.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(4, 4, 4, 4)
            setOnClickListener {
                activeMode = MODE_STOPWATCH
                updateMetrics()
            }
        }

        val logcatBtn = TextView(this).apply {
            text = "LOGS"
            setTextColor(if (activeMode == MODE_LOGCAT) Color.parseColor("#FF38BDF8") else Color.GRAY)
            textSize = 8.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(4, 4, 4, 4)
            setOnClickListener {
                activeMode = MODE_LOGCAT
                updateMetrics()
            }
        }

        val inspectBtn = TextView(this).apply {
            text = "INSPECT"
            setTextColor(if (activeMode == MODE_INSPECTOR) Color.parseColor("#FF38BDF8") else Color.GRAY)
            textSize = 8.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(4, 4, 4, 4)
            setOnClickListener {
                activeMode = MODE_INSPECTOR
                updateMetrics()
            }
        }

        val exploreBtn = TextView(this).apply {
            text = "CRAWL"
            setTextColor(if (activeMode == MODE_EXPLORER) Color.parseColor("#FF38BDF8") else Color.GRAY)
            textSize = 8.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(4, 4, 4, 4)
            setOnClickListener {
                activeMode = MODE_EXPLORER
                updateMetrics()
            }
        }

        modeSelectorRow.addView(perfBtn)
        modeSelectorRow.addView(stopBtn)
        modeSelectorRow.addView(logcatBtn)
        modeSelectorRow.addView(inspectBtn)
        modeSelectorRow.addView(exploreBtn)
        layout.addView(modeSelectorRow)

        // Dynamic Metrics / Log TextView
        val metricsTv = TextView(this).apply {
            id = View.generateViewId()
            text = "Initializing HUD..."
            setTextColor(Color.WHITE)
            textSize = 10f
            typeface = android.graphics.Typeface.MONOSPACE
        }
        layout.addView(metricsTv)

        // Stopwatch Quick Actions Row
        val stopwatchActionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 6, 0, 0)
            visibility = if (activeMode == MODE_STOPWATCH) View.VISIBLE else View.GONE
        }

        val recBtn = TextView(this).apply {
            text = "[Rec/Stop]"
            setTextColor(Color.parseColor("#FF6366F1"))
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 0, 12, 0)
            setOnClickListener {
                if (RedrawStopwatchEngine.isRecordingSession) {
                    RedrawStopwatchEngine.stopSession()
                } else {
                    RedrawStopwatchEngine.startSession()
                }
                updateMetrics()
            }
        }

        val lapBtn = TextView(this).apply {
            text = "[+ Lap]"
            setTextColor(Color.parseColor("#FF22C55E"))
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setOnClickListener {
                val lastDelta = CompanionAccessibilityService.lastFrameRedrawDeltaMs
                val now = System.currentTimeMillis()
                val touchTs = if (CompanionAccessibilityService.lastTouchTimestamp > 0) CompanionAccessibilityService.lastTouchTimestamp else now - lastDelta
                val activePkg = CompanionAccessibilityService.activePackageName ?: "target_app"
                RedrawStopwatchEngine.recordLap(
                    touchTimestamp = touchTs,
                    redrawTimestamp = now,
                    deltaMs = if (lastDelta > 0) lastDelta else 16L,
                    packageName = activePkg,
                    actionType = "hud_lap"
                )
                updateMetrics()
            }
        }

        stopwatchActionsRow.addView(recBtn)
        stopwatchActionsRow.addView(lapBtn)
        layout.addView(stopwatchActionsRow)

        // Inspector Quick Actions Row
        val inspectorActionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 6, 0, 0)
            visibility = if (activeMode == MODE_INSPECTOR) View.VISIBLE else View.GONE
        }

        val captureUiBtn = TextView(this).apply {
            text = "[🔍 Capture Screen UI]"
            setTextColor(Color.parseColor("#FF38BDF8"))
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setOnClickListener {
                UiInspectorEngine.captureActiveUiTree()
                updateMetrics()
            }
        }

        inspectorActionsRow.addView(captureUiBtn)
        layout.addView(inspectorActionsRow)

        // Explorer Quick Actions Row
        val explorerActionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 6, 0, 0)
            visibility = if (activeMode == MODE_EXPLORER) View.VISIBLE else View.GONE
        }

        val startExpBtn = TextView(this).apply {
            text = "[▶ Start]"
            setTextColor(Color.parseColor("#FF22C55E"))
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 0, 8, 0)
            setOnClickListener {
                AutonomousExplorerEngine.startExploration()
                updateMetrics()
            }
        }

        val pauseExpBtn = TextView(this).apply {
            text = "[⏸ Pause]"
            setTextColor(Color.parseColor("#FFF59E0B"))
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 0, 8, 0)
            setOnClickListener {
                AutonomousExplorerEngine.pauseExploration()
                updateMetrics()
            }
        }

        val stopExpBtn = TextView(this).apply {
            text = "[⏹ Stop]"
            setTextColor(Color.parseColor("#FFEF4444"))
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setOnClickListener {
                AutonomousExplorerEngine.stopExploration()
                updateMetrics()
            }
        }

        explorerActionsRow.addView(startExpBtn)
        explorerActionsRow.addView(pauseExpBtn)
        explorerActionsRow.addView(stopExpBtn)
        layout.addView(explorerActionsRow)

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
            x = 40
            y = 180
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
            val modeRow = layout.getChildAt(1) as? LinearLayout
            val metricsTv = layout.getChildAt(2) as? TextView ?: return
            val stopwatchActionsRow = layout.getChildAt(3) as? LinearLayout
            val inspectorActionsRow = layout.getChildAt(4) as? LinearLayout
            val explorerActionsRow = layout.getChildAt(5) as? LinearLayout

            // Update Mode Selector Highlight
            modeRow?.let { row ->
                val perfTv = row.getChildAt(0) as? TextView
                val stopTv = row.getChildAt(1) as? TextView
                val logcatTv = row.getChildAt(2) as? TextView
                val inspectTv = row.getChildAt(3) as? TextView
                val exploreTv = row.getChildAt(4) as? TextView

                perfTv?.setTextColor(if (activeMode == MODE_PERFORMANCE) Color.parseColor("#FF38BDF8") else Color.GRAY)
                stopTv?.setTextColor(if (activeMode == MODE_STOPWATCH) Color.parseColor("#FF38BDF8") else Color.GRAY)
                logcatTv?.setTextColor(if (activeMode == MODE_LOGCAT) Color.parseColor("#FF38BDF8") else Color.GRAY)
                inspectTv?.setTextColor(if (activeMode == MODE_INSPECTOR) Color.parseColor("#FF38BDF8") else Color.GRAY)
                exploreTv?.setTextColor(if (activeMode == MODE_EXPLORER) Color.parseColor("#FF38BDF8") else Color.GRAY)
            }

            stopwatchActionsRow?.visibility = if (activeMode == MODE_STOPWATCH) View.VISIBLE else View.GONE
            inspectorActionsRow?.visibility = if (activeMode == MODE_INSPECTOR) View.VISIBLE else View.GONE
            explorerActionsRow?.visibility = if (activeMode == MODE_EXPLORER) View.VISIBLE else View.GONE

            when (activeMode) {
                MODE_PERFORMANCE -> {
                    val telemetry = HardwareSpecsProvider.getLiveTelemetry(this, isServerRunning = true, activeClients = 1)
                    metricsTv.text = "CPU: ${telemetry.cpuUsagePercent}% | RAM: ${telemetry.ramUsedMb}MB\nBat: ${telemetry.batteryPercent}% (${telemetry.batteryCurrentMa}mA)"
                }
                MODE_STOPWATCH -> {
                    val delta = CompanionAccessibilityService.lastFrameRedrawDeltaMs
                    val isRec = RedrawStopwatchEngine.isRecordingSession
                    val lapsCount = RedrawStopwatchEngine.getLapsSnapshot().size
                    val statusStr = when {
                        delta <= 0 -> "STANDBY"
                        delta < 50 -> "FAST (<50ms)"
                        delta < 200 -> "NORMAL (50-200ms)"
                        else -> "SLOW (>200ms)"
                    }
                    val stateStr = if (isRec) "🔴 REC ($lapsCount laps)" else "⏹️ IDLE"
                    metricsTv.text = "Redraw Delta: ${delta} ms\nStatus: $statusStr\nState: $stateStr"
                }
                MODE_LOGCAT -> {
                    val recentLogs = LogcatStreamer.getFilteredLogs().takeLast(3)
                    if (recentLogs.isEmpty()) {
                        metricsTv.text = "Logcat: Listening for stream..."
                    } else {
                        val logText = recentLogs.joinToString("\n") { msg ->
                            "[${msg.level.name.take(1)}] ${msg.tag}: ${msg.message.take(35)}"
                        }
                        metricsTv.text = logText
                    }
                }
                MODE_INSPECTOR -> {
                    val captured = UiInspectorEngine.getCapturedElementsSnapshot()
                    if (captured.isEmpty()) {
                        metricsTv.text = "Inspector: Tap [Capture Screen UI]\nto inspect target app elements."
                    } else {
                        val topItem = captured.firstOrNull { it.name.isNotBlank() }
                        val nameStr = topItem?.name ?: "Element"
                        val locStr = topItem?.accessibilityId?.ifBlank { topItem.resourceId }?.ifBlank { topItem.xpath } ?: ""
                        metricsTv.text = "Captured: ${captured.size} interactive nodes\nTop: $nameStr\nLoc: ${locStr.take(30)}"
                    }
                }
                MODE_EXPLORER -> {
                    val report = AutonomousExplorerEngine.reportFlow.value
                    val stateLabel = report.currentState.name
                    val pkgLabel = AutonomousExplorerEngine.targetPackageName?.takeLast(20) ?: "All Apps"
                    metricsTv.text = "DFS Explorer: $stateLabel\nTarget: $pkgLabel\nScreens: ${report.visitedScreensCount} | Actions: ${report.totalActionsCount}"
                }
            }
        }
    }

    override fun onDestroy() {
        isRunning = false
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
