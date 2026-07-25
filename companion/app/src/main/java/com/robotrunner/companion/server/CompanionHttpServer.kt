package com.robotrunner.companion.server

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NfcAdapter
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.wifi.WifiManager
import android.util.Base64
import java.net.NetworkInterface
import java.io.ByteArrayOutputStream
import com.robotrunner.companion.checkup.HardwareCheckupRunner
import com.robotrunner.companion.checkup.PdfReportGenerator
import com.robotrunner.companion.hardware.DisplayTestActivity
import com.robotrunner.companion.hardware.PrinterHelper
import com.robotrunner.companion.service.CompanionAccessibilityService
import fi.iki.elonen.NanoHTTPD

class CompanionHttpServer(
    port: Int,
    private val context: Context
) : NanoHTTPD(port) {

    private val gson = Gson()
    private val printerHelper = PrinterHelper(context)
    private val checkupRunner = HardwareCheckupRunner(context)
    private val pdfGenerator = PdfReportGenerator(context)

    var onStatusChangedListener: (() -> Unit)? = null
    var requestCount = 0
        private set

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method
        Log.i("CompanionHttpServer", "Received ${method.name} request for $uri")
        requestCount++
        onStatusChangedListener?.invoke()

        if (uri == "/screenshot/fast" || uri == "/screenshot/720p") {
            val service = CompanionAccessibilityService.instance
            if (service != null) {
                val latch = java.util.concurrent.CountDownLatch(1)
                var imageBytes: ByteArray? = null
                service.takeDownscaledJpegFrame(720, 60) { bytes ->
                    imageBytes = bytes
                    latch.countDown()
                }
                try {
                    latch.await(300, java.util.concurrent.TimeUnit.MILLISECONDS)
                    if (imageBytes != null) {
                        val stream = java.io.ByteArrayInputStream(imageBytes)
                        return newFixedLengthResponse(Response.Status.OK, "image/jpeg", stream, imageBytes!!.size.toLong())
                    }
                } catch (e: Exception) {
                    Log.e("CompanionHttpServer", "Timeout or error taking fast downscaled screenshot", e)
                }
            }
            val errJson = JsonObject().apply {
                addProperty("status", "error")
                addProperty("message", "Accessibility fast screenshot unavailable")
            }
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", errJson.toString())
        }

        if (uri == "/screenshot" || uri == "/screenshot/jpeg") {
            val service = CompanionAccessibilityService.instance
            if (service != null) {
                val latch = java.util.concurrent.CountDownLatch(1)
                var imageBytes: ByteArray? = null
                service.takeInstantScreenshot { bytes ->
                    imageBytes = bytes
                    latch.countDown()
                }
                try {
                    latch.await(200, java.util.concurrent.TimeUnit.MILLISECONDS)
                    if (imageBytes != null) {
                        val stream = java.io.ByteArrayInputStream(imageBytes)
                        return newFixedLengthResponse(Response.Status.OK, "image/jpeg", stream, imageBytes!!.size.toLong())
                    }
                } catch (e: Exception) {
                    Log.e("CompanionHttpServer", "Timeout or error taking screenshot", e)
                }
            }
            val errJson = JsonObject().apply {
                addProperty("status", "error")
                addProperty("message", "Accessibility screenshot unavailable on this device/API level")
            }
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", errJson.toString())
        }

        val responseJson = when (uri) {
            "/ping" -> JsonObject().apply {
                addProperty("status", "ok")
                addProperty("type", "pong")
                addProperty("timestamp", System.currentTimeMillis())
            }

            "/device-info", "/info" -> buildDeviceInfoPayload()

            "/telemetry" -> {
                val targetPkg = session.parameters["package"]?.firstOrNull()
                buildTelemetryPayload(targetPkg)
            }

            "/ui-tree" -> {
                val service = CompanionAccessibilityService.instance
                if (service != null) {
                    service.getInstantUiTreeJson()
                } else {
                    JsonObject().apply {
                        addProperty("status", "disabled")
                        addProperty("message", "Accessibility Service is not enabled")
                    }
                }
            }

            "/events/recent" -> {
                val array = JsonArray()
                CompanionAccessibilityService.recentEvents.forEach { evt ->
                    val obj = JsonObject().apply {
                        addProperty("type", evt.type)
                        addProperty("packageName", evt.packageName)
                        addProperty("message", evt.message)
                        addProperty("timestamp", evt.timestamp)
                    }
                    array.add(obj)
                }
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("events", array)
                }
            }

            "/action/tap" -> {
                val service = CompanionAccessibilityService.instance
                if (service != null) {
                    try {
                        val map = HashMap<String, String>()
                        session.parseBody(map)
                        val postData = map["postData"]
                        val json = gson.fromJson(postData, JsonObject::class.java)
                        val x = json?.get("x")?.asFloat ?: 0f
                        val y = json?.get("y")?.asFloat ?: 0f
                        val success = service.performTap(x, y)
                        JsonObject().apply {
                            addProperty("status", if (success) "ok" else "error")
                            addProperty("tapped", success)
                        }
                    } catch (e: Exception) {
                        JsonObject().apply {
                            addProperty("status", "error")
                            addProperty("message", e.message ?: "Failed to parse tap body")
                        }
                    }
                } else {
                    JsonObject().apply {
                        addProperty("status", "disabled")
                        addProperty("message", "Accessibility Service is not active")
                    }
                }
            }

            "/action/node-perform" -> {
                val service = CompanionAccessibilityService.instance
                if (service != null) {
                    try {
                        val map = HashMap<String, String>()
                        session.parseBody(map)
                        val postData = map["postData"]
                        val json = gson.fromJson(postData, JsonObject::class.java)
                        val resourceId = json?.get("resourceId")?.asString
                        val textMatch = json?.get("text")?.asString
                        val contentDesc = json?.get("contentDescription")?.asString
                        val action = json?.get("action")?.asString ?: "click"
                        val value = json?.get("value")?.asString

                        val success = service.performNodeActionByMatch(
                            resourceId = resourceId,
                            textMatch = textMatch,
                            contentDescMatch = contentDesc,
                            action = action,
                            textValue = value
                        )
                        JsonObject().apply {
                            addProperty("status", if (success) "ok" else "error")
                            addProperty("performed", success)
                        }
                    } catch (e: Exception) {
                        JsonObject().apply {
                            addProperty("status", "error")
                            addProperty("message", e.message ?: "Failed to parse action body")
                        }
                    }
                } else {
                    JsonObject().apply {
                        addProperty("status", "disabled")
                        addProperty("message", "Accessibility Service is not active")
                    }
                }
            }

            "/frame-delta" -> {
                JsonObject().apply {
                    addProperty("status", "ok")
                    addProperty("tti_ms", CompanionAccessibilityService.lastFrameRedrawDeltaMs)
                    addProperty("last_touch_timestamp", CompanionAccessibilityService.lastTouchTimestamp)
                    addProperty("last_redraw_timestamp", CompanionAccessibilityService.lastRedrawTimestamp)
                    addProperty("package_name", CompanionAccessibilityService.activePackageName ?: "")
                    addProperty("source", "companion_hardware")
                }
            }

            "/apps" -> getInstalledAppsPayload()

            "/app/icon" -> {
                val params = session.parms
                val pkg = params["package"] ?: params["pkg"] ?: ""
                if (pkg.isNotEmpty()) {
                    getAppIconPayload(pkg)
                } else {
                    JsonObject().apply {
                        addProperty("status", "error")
                        addProperty("message", "Package parameter is required")
                    }
                }
            }

            "/network/interfaces" -> {
                val array = JsonArray()
                val interfaces = kotlinx.coroutines.runBlocking { com.robotrunner.companion.net.NetworkInspector.getNetworkInterfaces() }
                interfaces.forEach { iface ->
                    val obj = JsonObject().apply {
                        addProperty("name", iface.name)
                        addProperty("displayName", iface.displayName)
                        addProperty("ipv4", iface.ipv4)
                        addProperty("ipv6", iface.ipv6)
                        addProperty("macAddress", iface.macAddress)
                        addProperty("type", iface.interfaceType.name)
                        addProperty("isUp", iface.isUp)
                    }
                    array.add(obj)
                }
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("interfaces", array)
                }
            }

            "/logcat/recent" -> {
                val array = JsonArray()
                val recentLogs = com.robotrunner.companion.logcat.LogcatStreamer.getFilteredLogs()
                recentLogs.takeLast(200).forEach { msg ->
                    val obj = JsonObject().apply {
                        addProperty("timestamp", msg.timestamp)
                        addProperty("pid", msg.pid)
                        addProperty("tid", msg.tid)
                        addProperty("level", msg.level.name)
                        addProperty("tag", msg.tag)
                        addProperty("message", msg.message)
                    }
                    array.add(obj)
                }
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("logs", array)
                }
            }

            "/performance/history" -> {
                val array = JsonArray()
                val history = com.robotrunner.companion.performance.PerformanceCollector.getHistorySnapshot()
                history.forEach { sample ->
                    val obj = JsonObject().apply {
                        addProperty("timestamp", sample.timestamp)
                        addProperty("cpuUsagePercent", sample.cpuUsagePercent)
                        addProperty("ramUsedMb", sample.ramUsedMb)
                        addProperty("ramTotalMb", sample.ramTotalMb)
                        addProperty("batteryCurrentMa", sample.batteryCurrentMa)
                        addProperty("batteryTempC", sample.batteryTempC)
                    }
                    array.add(obj)
                }
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("samples", array)
                }
            }

            "/stopwatch/start" -> {
                com.robotrunner.companion.stopwatch.RedrawStopwatchEngine.startSession()
                JsonObject().apply {
                    addProperty("status", "ok")
                    addProperty("message", "Benchmark session started")
                }
            }

            "/stopwatch/stop" -> {
                val benchSession = com.robotrunner.companion.stopwatch.RedrawStopwatchEngine.stopSession()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("session", gson.toJsonTree(benchSession))
                }
            }

            "/stopwatch/laps" -> {
                val laps = com.robotrunner.companion.stopwatch.RedrawStopwatchEngine.getLapsSnapshot()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("laps", gson.toJsonTree(laps))
                }
            }

            "/bdd/suites" -> {
                val suites = com.robotrunner.companion.bdd.BddRunnerEngine.getSampleSuites()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("suites", gson.toJsonTree(suites))
                }
            }

            "/bdd/status" -> {
                JsonObject().apply {
                    addProperty("status", "ok")
                    addProperty("isRunning", com.robotrunner.companion.bdd.BddRunnerEngine.isRunning)
                    addProperty("currentStep", com.robotrunner.companion.bdd.BddRunnerEngine.currentStepDescription)
                }
            }

            "/inspector/tree" -> {
                val elements = com.robotrunner.companion.inspector.UiInspectorEngine.captureActiveUiTree()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("elements", gson.toJsonTree(elements))
                }
            }

            "/inspector/map" -> {
                val elements = com.robotrunner.companion.inspector.UiInspectorEngine.getCapturedElementsSnapshot()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("elements", gson.toJsonTree(elements))
                }
            }

            "/explorer/start" -> {
                com.robotrunner.companion.explorer.AutonomousExplorerEngine.startExploration()
                JsonObject().apply {
                    addProperty("status", "ok")
                    addProperty("message", "Autonomous DFS exploration started")
                }
            }

            "/explorer/stop" -> {
                com.robotrunner.companion.explorer.AutonomousExplorerEngine.stopExploration()
                JsonObject().apply {
                    addProperty("status", "ok")
                    addProperty("message", "Autonomous DFS exploration stopped")
                }
            }

            "/explorer/status" -> {
                val report = com.robotrunner.companion.explorer.AutonomousExplorerEngine.reportFlow.value
                JsonObject().apply {
                    addProperty("status", "ok")
                    addProperty("state", report.currentState.name)
                    addProperty("visitedScreensCount", report.visitedScreensCount)
                    addProperty("totalActionsCount", report.totalActionsCount)
                    addProperty("deadEndsHandled", report.deadEndsHandled)
                    addProperty("activeScreenName", report.activeScreenName)
                }
            }

            "/golden/verify" -> {
                val verification = com.robotrunner.companion.checkup.UiTextVerifier.verifyActiveScreenText()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("verification", gson.toJsonTree(verification))
                }
            }

            "/checkup/pdf" -> {
                val checkup = checkupRunner.runLocalCheckup()
                val uiText = com.robotrunner.companion.checkup.UiTextVerifier.verifyActiveScreenText()
                val pdfGen = com.robotrunner.companion.checkup.PdfReportGenerator(context)
                val pdfFile = pdfGen.generatePdfReport(checkup, uiText)
                JsonObject().apply {
                    addProperty("status", if (pdfFile != null) "ok" else "error")
                    addProperty("filePath", pdfFile?.absolutePath ?: "")
                }
            }

            "/device/info" -> getDeviceInfoPayload()

            "/checkup/run" -> {
                val result = checkupRunner.runLocalCheckup()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("checkup", gson.toJsonTree(result))
                }
            }

            "/sync/artifacts" -> {
                val syncManager = com.robotrunner.companion.sync.SyncManager(context)
                val artifacts = kotlinx.coroutines.runBlocking { syncManager.listLocalArtifacts() }
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("artifacts", gson.toJsonTree(artifacts))
                }
            }

            "/fleet/peers" -> {
                val peers = com.robotrunner.companion.sync.FleetP2pBridge.peersFlow.value
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("peers", gson.toJsonTree(peers))
                }
            }

            "/printer/test-print" -> {
                val printed = printerHelper.printTestReceipt()
                JsonObject().apply {
                    addProperty("status", if (printed) "ok" else "error")
                    addProperty("printed", printed)
                }
            }

            "/display/color-test" -> {
                try {
                    val intent = Intent(context, DisplayTestActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    JsonObject().apply {
                        addProperty("status", "ok")
                        addProperty("message", "Display color test launched")
                    }
                } catch (e: Exception) {
                    JsonObject().apply {
                        addProperty("status", "error")
                        addProperty("message", e.message ?: "Failed to launch display test")
                    }
                }
            }

            else -> JsonObject().apply {
                addProperty("status", "error")
                addProperty("message", "Unknown endpoint: $uri")
            }
        }

        val res = newFixedLengthResponse(
            Response.Status.OK,
            "application/json",
            gson.toJson(responseJson)
        )
        res.addHeader("Access-Control-Allow-Origin", "*")
        res.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.addHeader("Access-Control-Allow-Headers", "Content-Type")
        return res
    }

    private fun buildDeviceInfoPayload(): JsonObject {
        return JsonObject().apply {
            addProperty("status", "ok")
            addProperty("type", "device_info")
            addProperty("manufacturer", Build.MANUFACTURER)
            addProperty("model", Build.MODEL)
            addProperty("brand", Build.BRAND)
            addProperty("androidVersion", Build.VERSION.RELEASE)
            addProperty("sdkInt", Build.VERSION.SDK_INT)
            addProperty("serial", try { Build.getSerial() } catch (e: Throwable) { Build.SERIAL })
            addProperty("isAccessibilityEnabled", CompanionAccessibilityService.isRunning)

            // Battery Info
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val temp = batteryIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
            val voltage = batteryIntent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1) ?: -1
            val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val healthInt = batteryIntent?.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN) ?: BatteryManager.BATTERY_HEALTH_UNKNOWN
            val plugInt = batteryIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1

            val currentNowMicro = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) ?: 0
            val currentAvgMicro = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_AVERAGE) ?: 0

            val healthStr = when (healthInt) {
                BatteryManager.BATTERY_HEALTH_GOOD -> "GOOD"
                BatteryManager.BATTERY_HEALTH_OVERHEAT -> "OVERHEAT"
                BatteryManager.BATTERY_HEALTH_DEAD -> "DEAD"
                BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "OVER_VOLTAGE"
                BatteryManager.BATTERY_HEALTH_COLD -> "COLD"
                else -> "UNKNOWN"
            }

            val plugStr = when (plugInt) {
                BatteryManager.BATTERY_PLUGGED_AC -> "AC"
                BatteryManager.BATTERY_PLUGGED_USB -> "USB"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "WIRELESS"
                else -> "NONE"
            }

            val batteryObj = JsonObject().apply {
                addProperty("level", if (level != -1 && scale != -1) (level * 100 / scale) else -1)
                addProperty("temperature", if (temp != -1) temp / 10.0 else 0.0)
                addProperty("voltage", if (voltage != -1) voltage / 1000.0 else 0.0)
                addProperty("isCharging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
                addProperty("health", healthStr)
                addProperty("plugType", plugStr)
                addProperty("currentNowmA", currentNowMicro / 1000)
                addProperty("currentAvgmA", currentAvgMicro / 1000)
            }
            add("battery", batteryObj)

            // Storage Info
            val stat = StatFs(Environment.getDataDirectory().path)
            val bytesAvailable = stat.blockSizeLong * stat.availableBlocksLong
            val bytesTotal = stat.blockSizeLong * stat.blockCountLong

            val storageObj = JsonObject().apply {
                addProperty("freeBytes", bytesAvailable)
                addProperty("totalBytes", bytesTotal)
            }
            add("storage", storageObj)

            // NFC Status
            val nfcAdapter = NfcAdapter.getDefaultAdapter(context)
            val nfcObj = JsonObject().apply {
                addProperty("isSupported", nfcAdapter != null)
                addProperty("isEnabled", nfcAdapter?.isEnabled == true)
            }
            add("nfc", nfcObj)

            // POS Printer Status
            val printerStatus = printerHelper.getPrinterStatus()
            val printerObj = JsonObject().apply {
                addProperty("isSupported", printerStatus.isSupported)
                addProperty("hasPaper", printerStatus.hasPaper)
                addProperty("coverOpen", printerStatus.coverOpen)
                addProperty("isReady", printerStatus.isReady)
                addProperty("vendor", printerStatus.vendor)
            }
            add("printer", printerObj)
        }
    }

    private fun buildTelemetryPayload(targetPackage: String? = null): JsonObject {
        return JsonObject().apply {
            addProperty("status", "ok")
            addProperty("type", "telemetry")
            addProperty("source", "companion")

            // RAM Info
            val actManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            if (actManager != null) {
                actManager.getMemoryInfo(memInfo)
            }
            val totalMem = memInfo.totalMem
            val availMem = memInfo.availMem
            val ramTotalKb: Long = totalMem / 1024L
            val ramUsedKb: Long = (totalMem - availMem) / 1024L
            addProperty("ram_total", ramTotalKb)
            addProperty("ram_used", ramUsedKb)

            // Battery Info
            val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val temp = batteryIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
            val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val plugInt = batteryIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1

            val batteryLevel = if (level != -1 && scale != -1) (level * 100 / scale) else 0
            val temperature = if (temp != -1) (temp / 10.0f) else 0.0f
            val batteryStatusStr = when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
                BatteryManager.BATTERY_STATUS_FULL -> "full"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
                else -> "unknown"
            }
            val plugStr = when (plugInt) {
                BatteryManager.BATTERY_PLUGGED_AC -> "ac"
                BatteryManager.BATTERY_PLUGGED_USB -> "usb"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
                else -> "none"
            }

            addProperty("battery_level", batteryLevel)
            addProperty("temperature", temperature)
            addProperty("battery_status", batteryStatusStr)
            addProperty("battery_power_source", plugStr)

            // Real-time CPU Usage estimation
            val cpuUsage = getProcessCpuUsage()
            addProperty("cpu_usage", cpuUsage)

            // Active Package/Window
            val activePkg = CompanionAccessibilityService.activePackageName ?: "unknown"
            addProperty("foreground_activity", activePkg)

            // Target Package App Stats
            val appStatsObj = getAppStatsPayload(targetPackage)
            if (appStatsObj != null) {
                add("app_stats", appStatsObj)
            }
        }
    }

    private var lastTotalTime: Long = 0
    private var lastIdleTime: Long = 0

    private fun getProcessCpuUsage(): Float {
        // Priority 1: /proc/stat delta (most accurate, but Knox/Android 16 may deny access)
        try {
            val statFile = java.io.File("/proc/stat")
            if (statFile.exists() && statFile.canRead()) {
                val line = statFile.useLines { it.firstOrNull() }
                if (line != null) {
                    val toks = line.split("\\s+".toRegex())
                    if (toks.size >= 8) {
                        val idle = toks[4].toLongOrNull() ?: 0L
                        val total = toks.slice(1..7).mapNotNull { it.toLongOrNull() }.sum()
                        if (lastTotalTime > 0 && total > lastTotalTime) {
                            val totalDelta = total - lastTotalTime
                            val idleDelta = idle - lastIdleTime
                            lastTotalTime = total
                            lastIdleTime = idle
                            if (totalDelta > 0) {
                                val usage = ((totalDelta - idleDelta).toFloat() / totalDelta.toFloat()) * 100.0f
                                return Math.min(100.0f, Math.max(0.0f, usage))
                            }
                        }
                        lastTotalTime = total
                        lastIdleTime = idle
                        // First call: no delta yet, fall through to dumpsys
                    }
                }
            }
        } catch (_: Throwable) { /* Fall through to dumpsys fallback */ }

        // Priority 2: dumpsys cpuinfo (works on Knox-restricted devices)
        return getCpuViaDumpsys()
    }

    private fun getCpuViaDumpsys(): Float {
        return try {
            // Use 'top -b -n 1 -m 0' which is accessible from any Android process (no DUMP permission needed)
            val process = Runtime.getRuntime().exec(arrayOf("top", "-b", "-n", "1", "-m", "0"))
            val output = process.inputStream.bufferedReader().readText()
            process.waitFor()
            // Parse "%cpu" / "%idle" header line like: "800%cpu  62%user  12%nice  68%sys  639%idle  9%iow  6%irq  2%sirq  0%host"
            for (line in output.lines()) {
                if (line.contains("%cpu") && line.contains("%idle")) {
                    val parts = line.trim().split("\\s+".toRegex())
                    var totalCap = 0.0f
                    var idle = 0.0f
                    for (part in parts) {
                        if (part.endsWith("%cpu")) {
                            totalCap = part.replace("%cpu", "").toFloatOrNull() ?: 0.0f
                        } else if (part.endsWith("%idle")) {
                            idle = part.replace("%idle", "").toFloatOrNull() ?: 0.0f
                        }
                    }
                    if (totalCap > 0) {
                        val used = totalCap - idle
                        return Math.min(100.0f, Math.max(0.0f, (used / totalCap) * 100.0f))
                    }
                }
            }
            0.0f
        } catch (e: Throwable) {
            Log.w("CompanionHttpServer", "top-based CPU fallback failed", e)
            0.0f
        }
    }

    private fun getAppStatsPayload(targetPackage: String?): JsonObject? {
        if (targetPackage.isNullOrEmpty()) return null
        return try {
            val actManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return null

            // RAM: Use dumpsys meminfo for reliable PSS
            var pssKb = 0L
            var appCpu = 0.0f
            var appPid = 0

            // Find PID via pidof or top
            try {
                val pidProc = Runtime.getRuntime().exec(arrayOf("pidof", targetPackage))
                val pidOut = pidProc.inputStream.bufferedReader().readText().trim()
                pidProc.waitFor()
                appPid = pidOut.split("\\s+".toRegex()).firstOrNull()?.toIntOrNull() ?: 0
            } catch (_: Throwable) { }

            // If pidof failed (common for non-root process on third-party packages), find PID & CPU from top output
            try {
                val cpuProc = Runtime.getRuntime().exec(arrayOf("top", "-b", "-n", "1", "-m", "50"))
                val cpuOutput = cpuProc.inputStream.bufferedReader().readText()
                cpuProc.waitFor()
                for (line in cpuOutput.lines()) {
                    val trimmed = line.trim()
                    if (trimmed.isEmpty()) continue
                    if (trimmed.contains(targetPackage)) {
                        val cols = trimmed.split("\\s+".toRegex())
                        val linePid = cols.getOrNull(0)?.toIntOrNull()
                        if (linePid != null && linePid > 0) {
                            if (appPid == 0) appPid = linePid
                            if (linePid == appPid && cols.size >= 9) {
                                appCpu = cols[8].toFloatOrNull() ?: 0.0f
                                break
                            }
                        }
                    }
                }
            } catch (_: Throwable) { }

            // Get PSS / Resident RAM via ActivityManager (works even when runningAppProcesses is restricted)
            if (appPid > 0) {
                try {
                    val memInfos = actManager.getProcessMemoryInfo(intArrayOf(appPid))
                    if (memInfos != null && memInfos.isNotEmpty()) {
                        val info = memInfos[0]
                        pssKb = if (info.totalPss > 0) {
                            info.totalPss.toLong()
                        } else {
                            (info.totalPrivateDirty + info.totalSharedDirty).toLong()
                        }
                    }
                } catch (_: Throwable) { }
            }

            // Get FPS from dumpsys gfxinfo
            val fps = getAppFpsFromGfxInfo(targetPackage)

            JsonObject().apply {
                addProperty("cpu_usage", appCpu)
                addProperty("ram_used", pssKb)
                addProperty("fps", fps)
            }
        } catch (e: Throwable) {
            Log.w("CompanionHttpServer", "Failed to get app stats for $targetPackage", e)
            null
        }
    }

    private var lastAppFrameCount: Long = 0
    private var lastAppFrameTime: Long = 0

    private fun getAppFpsFromGfxInfo(packageName: String): Int {
        return try {
            val proc = Runtime.getRuntime().exec(arrayOf("dumpsys", "gfxinfo", packageName))
            val output = proc.inputStream.bufferedReader().readText()
            proc.waitFor()
            var totalFrames = 0L
            for (line in output.lines()) {
                if (line.startsWith("Total frames rendered:")) {
                    totalFrames = line.replace("Total frames rendered:", "").trim().toLongOrNull() ?: 0L
                    break
                }
            }
            val now = System.currentTimeMillis()
            if (lastAppFrameTime > 0 && totalFrames > lastAppFrameCount) {
                val framesDelta = totalFrames - lastAppFrameCount
                val timeDelta = (now - lastAppFrameTime) / 1000.0
                lastAppFrameCount = totalFrames
                lastAppFrameTime = now
                if (timeDelta > 0) {
                    return Math.min(120, (framesDelta / timeDelta).toInt())
                }
            }
            lastAppFrameCount = totalFrames
            lastAppFrameTime = now
            0 // First sample, no delta yet
        } catch (e: Throwable) {
            Log.w("CompanionHttpServer", "gfxinfo FPS extraction failed", e)
            0
        }
    }

    private fun getInstalledAppsPayload(): JsonObject {
        return try {
            val pm = context.packageManager
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val array = JsonArray()

            for (app in apps) {
                val obj = JsonObject().apply {
                    addProperty("name", app.packageName)
                    addProperty("label", app.loadLabel(pm).toString())
                    addProperty("path", app.sourceDir ?: "")
                    addProperty("is_system", (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                    addProperty("is_disabled", !app.enabled)

                    var version = ""
                    try {
                        val pkgInfo = pm.getPackageInfo(app.packageName, 0)
                        version = pkgInfo.versionName ?: ""
                    } catch (_: Exception) {}
                    addProperty("version", version)
                }
                array.add(obj)
            }

            JsonObject().apply {
                addProperty("status", "ok")
                addProperty("total", array.size())
                add("apps", array)
            }
        } catch (e: Exception) {
            JsonObject().apply {
                addProperty("status", "error")
                addProperty("message", e.message ?: "Failed to list applications")
            }
        }
    }

    private fun getAppIconPayload(packageName: String): JsonObject {
        return try {
            val pm = context.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            val drawable = appInfo.loadIcon(pm)
            val bitmap = if (drawable is BitmapDrawable) {
                drawable.bitmap
            } else {
                val w = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
                val h = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
                val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                val c = Canvas(b)
                drawable.setBounds(0, 0, c.width, c.height)
                drawable.draw(c)
                b
            }
            val scaled = Bitmap.createScaledBitmap(bitmap, 96, 96, true)
            val baos = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.PNG, 90, baos)
            val base64 = "data:image/png;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)

            JsonObject().apply {
                addProperty("status", "ok")
                addProperty("package", packageName)
                addProperty("icon", base64)
            }
        } catch (e: Exception) {
            JsonObject().apply {
                addProperty("status", "error")
                addProperty("message", e.message ?: "Failed to extract app icon")
            }
        }
    }

    private fun getDeviceInfoPayload(): JsonObject {
        return try {
            val model = Build.MODEL ?: ""
            val manufacturer = Build.MANUFACTURER ?: ""
            val brand = Build.BRAND ?: ""
            val androidVersion = Build.VERSION.RELEASE ?: ""
            val sdkInt = Build.VERSION.SDK_INT

            val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val batteryPct = if (level >= 0 && scale > 0) (level * 100) / scale else -1
            val tempTenths = batteryIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
            val batteryTempC = if (tempTenths > 0) tempTenths / 10.0f else 0.0f
            val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

            var wifiIp = ""
            try {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                val ipInt = wifiManager?.connectionInfo?.ipAddress ?: 0
                if (ipInt != 0) {
                    wifiIp = String.format(
                        java.util.Locale.US, "%d.%d.%d.%d",
                        ipInt and 0xff, ipInt shr 8 and 0xff, ipInt shr 16 and 0xff, ipInt shr 24 and 0xff
                    )
                }
            } catch (_: Exception) {}

            if (wifiIp.isEmpty() || wifiIp == "0.0.0.0") {
                try {
                    val interfaces = NetworkInterface.getNetworkInterfaces()
                    while (interfaces.hasMoreElements()) {
                        val iface = interfaces.nextElement()
                        if (iface.name.contains("wlan") || iface.name.contains("eth")) {
                            val addrs = iface.inetAddresses
                            while (addrs.hasMoreElements()) {
                                val addr = addrs.nextElement()
                                if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                                    wifiIp = addr.hostAddress ?: ""
                                    break
                                }
                            }
                        }
                    }
                } catch (_: Exception) {}
            }

            val actManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            actManager?.getMemoryInfo(memInfo)
            val totalRamMb = (memInfo.totalMem / (1024 * 1024)).toInt()
            val availRamMb = (memInfo.availMem / (1024 * 1024)).toInt()

            JsonObject().apply {
                addProperty("status", "ok")
                addProperty("model", model)
                addProperty("manufacturer", manufacturer)
                addProperty("brand", brand)
                addProperty("android_version", androidVersion)
                addProperty("sdk_int", sdkInt)
                addProperty("battery_level", batteryPct)
                addProperty("battery_temp", batteryTempC)
                addProperty("is_charging", isCharging)
                addProperty("wifi_ip", wifiIp)
                addProperty("total_ram_mb", totalRamMb)
                addProperty("avail_ram_mb", availRamMb)
                addProperty("companion_version", "2.3.3")
                addProperty("accessibility_active", CompanionAccessibilityService.activePackageName != null)
            }
        } catch (e: Exception) {
            JsonObject().apply {
                addProperty("status", "error")
                addProperty("message", e.message ?: "Failed to query device info")
            }
        }
    }
}
