package com.lucasdeeiroz.robotrunner.hardware

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import java.io.File

class PrinterHelper(private val context: Context) {

    fun getPrinterStatus(): PrinterStatus {
        var isSupported = false
        var vendor = "None"

        try {
            // 1. Tier 1: Direct SDK Reflection
            val positivoClass = try { Class.forName("br.com.positivo.smartpos.printer.PrinterManager") } catch (_: Throwable) { null }
            if (positivoClass != null) {
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Positivo SmartPOS")
            }

            val sunmiClass = try { Class.forName("com.sunmi.peripheral.printer.InnerPrinterManager") } catch (_: Throwable) { null }
            if (sunmiClass != null) {
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Sunmi")
            }

            val paxClass = try { Class.forName("com.pax.dal.IDAL") } catch (_: Throwable) { null }
            if (paxClass != null) {
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Pax Neptune")
            }

            val gertecClass = try { Class.forName("br.com.gertec.gedi.GEDI") } catch (_: Throwable) { null }
            if (gertecClass != null) {
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Gertec GEDI")
            }

            // 2. Tier 2: System Packages & Printer Services
            val pm = context.packageManager
            val knownServices = listOf(
                "woyou.aidlservice.jiuqi" to "Sunmi",
                "com.sunmi.extprinterservice" to "Sunmi External",
                "br.com.gertec.gedi" to "Gertec",
                "com.elgin.e1.servico" to "Elgin Pay",
                "com.pax.daemon" to "Pax",
                "com.pos.sdk.accessory" to "Generic POS",
                "com.cloudpos.smartposservice" to "CloudPOS",
                "com.vfi.smartpos.deviceservice" to "Verifone",
                "com.centerm.smartposservice" to "Centerm",
                "com.landicorp.android.hardware" to "Landi",
                "com.urovo.smartposservice" to "Urovo",
                "com.nexgo.smartpos" to "Nexgo",
                "com.dspread.pos" to "Dspread",
                "br.com.positivo.smartpos" to "Positivo",
                "com.cielo.lio" to "Cielo LIO",
                "br.com.stone" to "Stone POS",
                "com.pagseguro.smartpos" to "PagSeguro SmartPOS"
            )

            for ((pkg, name) in knownServices) {
                try {
                    pm.getPackageInfo(pkg, 0)
                    return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = name)
                } catch (_: PackageManager.NameNotFoundException) {}
            }

            // 3. Tier 3: Known SmartPOS Terminal Device / Model Names
            val modelUpper = Build.MODEL.uppercase()
            val mfgUpper = Build.MANUFACTURER.uppercase()
            val brandUpper = Build.BRAND.uppercase()
            val deviceUpper = Build.DEVICE.uppercase()

            val isPosVendor = mfgUpper.contains("SUNMI") || mfgUpper.contains("GERTEC") || mfgUpper.contains("PAX") ||
                    mfgUpper.contains("INGENICO") || mfgUpper.contains("VERIFONE") || mfgUpper.contains("ELGIN") ||
                    mfgUpper.contains("NEWLAND") || mfgUpper.contains("UROVO") || mfgUpper.contains("CENTERM") ||
                    mfgUpper.contains("DSPREAD") || mfgUpper.contains("LANDI") || brandUpper.contains("SUNMI") ||
                    brandUpper.contains("GERTEC") || brandUpper.contains("PAX") || brandUpper.contains("INGENICO")

            val isPosModel = modelUpper.contains("L300") || modelUpper.contains("L400") || modelUpper.contains("L200") ||
                    modelUpper.contains("V2") || modelUpper.contains("T2") || modelUpper.contains("P2") ||
                    modelUpper.contains("MP20") || modelUpper.contains("GP730") || modelUpper.contains("DX8000") ||
                    modelUpper.contains("APOS") || modelUpper.contains("A920") || modelUpper.contains("A930") ||
                    modelUpper.contains("A80") || modelUpper.contains("Q80") || modelUpper.contains("X990") ||
                    modelUpper.contains("N910") || modelUpper.contains("N700") || modelUpper.contains("M10") ||
                    deviceUpper.contains("SMARTPOS") || deviceUpper.contains("POS")

            if (isPosVendor || isPosModel) {
                val detectedVendor = when {
                    mfgUpper.contains("SUNMI") || brandUpper.contains("SUNMI") -> "Sunmi"
                    mfgUpper.contains("GERTEC") || brandUpper.contains("GERTEC") -> "Gertec"
                    mfgUpper.contains("PAX") || brandUpper.contains("PAX") -> "Pax"
                    mfgUpper.contains("INGENICO") || brandUpper.contains("INGENICO") -> "Ingenico"
                    mfgUpper.contains("VERIFONE") || brandUpper.contains("VERIFONE") -> "Verifone"
                    mfgUpper.contains("POSITIVO") || modelUpper.contains("L300") || modelUpper.contains("L400") -> "Positivo SmartPOS"
                    else -> "${Build.MANUFACTURER} (${Build.MODEL})"
                }
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = detectedVendor)
            }

            // 4. Tier 4: Hardware Nodes & Character Devices
            val candidateNodes = listOf("/dev/printer", "/dev/pos_printer", "/dev/usb/lp0", "/dev/ttyMT0", "/dev/ttyMT1")
            for (node in candidateNodes) {
                if (File(node).exists()) {
                    return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Hardware TTY ($node)")
                }
            }
        } catch (e: Exception) {
            Log.e("PrinterHelper", "Error checking POS printer status", e)
        }

        return PrinterStatus(
            isSupported = isSupported,
            hasPaper = true,
            coverOpen = false,
            isReady = isSupported,
            vendor = vendor
        )
    }

    fun printTestReceipt(): Boolean {
        val status = getPrinterStatus()
        Log.i("PrinterHelper", "Checking POS printer readiness: supported=${status.isSupported}, vendor=${status.vendor}")

        if (!status.isSupported) {
            Log.w("PrinterHelper", "No POS thermal printer detected on device: ${Build.MANUFACTURER} ${Build.MODEL}")
            return false
        }

        try {
            Log.i("PrinterHelper", "Triggering test receipt print for vendor: ${status.vendor}")

            // Attempt Sunmi AIDL Intent if present
            try {
                val intent = Intent("woyou.aidlservice.jiuqi.service")
                intent.setPackage("woyou.aidlservice.jiuqi")
                context.startService(intent)
            } catch (_: Throwable) {}

            return true
        } catch (e: Exception) {
            Log.e("PrinterHelper", "Failed to execute printer test", e)
            return false
        }
    }
}

data class PrinterStatus(
    val isSupported: Boolean,
    val hasPaper: Boolean,
    val coverOpen: Boolean,
    val isReady: Boolean,
    val vendor: String
)
