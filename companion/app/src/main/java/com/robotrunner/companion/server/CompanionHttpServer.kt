package com.robotrunner.companion.server

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

        val responseJson = when (uri) {
            "/ping" -> JsonObject().apply {
                addProperty("status", "ok")
                addProperty("type", "pong")
                addProperty("timestamp", System.currentTimeMillis())
            }

            "/device-info", "/info" -> buildDeviceInfoPayload()

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

            "/checkup/run" -> {
                val result = checkupRunner.runLocalCheckup()
                JsonObject().apply {
                    addProperty("status", "ok")
                    add("checkup", gson.toJsonTree(result))
                }
            }

            "/checkup/pdf" -> {
                val result = checkupRunner.runLocalCheckup()
                val file = pdfGenerator.generatePdfReport(result)
                JsonObject().apply {
                    if (file != null) {
                        addProperty("status", "ok")
                        addProperty("pdfPath", file.absolutePath)
                        addProperty("fileName", file.name)
                    } else {
                        addProperty("status", "error")
                        addProperty("message", "Failed to generate PDF report")
                    }
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
}
