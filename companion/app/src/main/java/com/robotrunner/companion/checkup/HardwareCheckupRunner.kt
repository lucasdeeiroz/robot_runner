package com.robotrunner.companion.checkup

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NfcAdapter
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import com.robotrunner.companion.hardware.PrinterHelper
import com.robotrunner.companion.service.CompanionAccessibilityService

class HardwareCheckupRunner(private val context: Context) {

    private val printerHelper = PrinterHelper(context)

    fun runLocalCheckup(): LocalCheckupResult {
        // Battery
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

        // Memory
        val actManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        actManager?.getMemoryInfo(memInfo)

        // Storage
        val stat = StatFs(Environment.getDataDirectory().path)
        val bytesAvailable = stat.blockSizeLong * stat.availableBlocksLong
        val bytesTotal = stat.blockSizeLong * stat.blockCountLong

        // NFC & Printer
        val nfcAdapter = NfcAdapter.getDefaultAdapter(context)
        val printerStatus = printerHelper.getPrinterStatus()

        return LocalCheckupResult(
            timestamp = System.currentTimeMillis(),
            manufacturer = Build.MANUFACTURER,
            model = Build.MODEL,
            brand = Build.BRAND,
            androidVersion = Build.VERSION.RELEASE,
            sdkInt = Build.VERSION.SDK_INT,
            serial = try { Build.getSerial() } catch (e: Throwable) { Build.SERIAL },
            batteryLevel = if (level != -1 && scale != -1) (level * 100 / scale) else -1,
            batteryHealth = healthStr,
            batteryVoltage = if (voltage != -1) voltage / 1000.0 else 0.0,
            batteryTemp = if (temp != -1) temp / 10.0 else 0.0,
            batteryCurrentNowmA = currentNowMicro / 1000,
            batteryPlugType = plugStr,
            isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL,
            freeRamBytes = memInfo.availMem,
            totalRamBytes = memInfo.totalMem,
            freeStorageBytes = bytesAvailable,
            totalStorageBytes = bytesTotal,
            isNfcSupported = nfcAdapter != null,
            isNfcEnabled = nfcAdapter?.isEnabled == true,
            isPrinterSupported = printerStatus.isSupported,
            printerVendor = printerStatus.vendor,
            isPrinterHasPaper = printerStatus.hasPaper,
            isAccessibilityEnabled = CompanionAccessibilityService.isRunning
        )
    }
}

data class LocalCheckupResult(
    val timestamp: Long,
    val manufacturer: String,
    val model: String,
    val brand: String,
    val androidVersion: String,
    val sdkInt: Int,
    val serial: String,
    val batteryLevel: Int,
    val batteryHealth: String,
    val batteryVoltage: Double,
    val batteryTemp: Double,
    val batteryCurrentNowmA: Int,
    val batteryPlugType: String,
    val isCharging: Boolean,
    val freeRamBytes: Long,
    val totalRamBytes: Long,
    val freeStorageBytes: Long,
    val totalStorageBytes: Long,
    val isNfcSupported: Boolean,
    val isNfcEnabled: Boolean,
    val isPrinterSupported: Boolean,
    val printerVendor: String,
    val isPrinterHasPaper: Boolean,
    val isAccessibilityEnabled: Boolean
)
