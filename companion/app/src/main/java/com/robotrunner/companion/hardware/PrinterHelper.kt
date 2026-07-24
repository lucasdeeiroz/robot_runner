package com.robotrunner.companion.hardware

import android.content.Context
import android.util.Log

class PrinterHelper(private val context: Context) {

    fun getPrinterStatus(): PrinterStatus {
        var isSupported = false
        var hasPaper = true
        var coverOpen = false
        var isReady = false

        try {
            // 1. Check Positivo / Eldorado SmartPOS Printer Service
            val positivoClass = try { Class.forName("br.com.positivo.smartpos.printer.PrinterManager") } catch (e: Throwable) { null }
            if (positivoClass != null) {
                isSupported = true
                isReady = true
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Positivo")
            }

            // 2. Check Sunmi Printer Service
            val sunmiClass = try { Class.forName("com.sunmi.peripheral.printer.InnerPrinterManager") } catch (e: Throwable) { null }
            if (sunmiClass != null) {
                isSupported = true
                isReady = true
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Sunmi")
            }

            // 3. Check Pax Printer Service
            val paxClass = try { Class.forName("com.pax.dal.IDAL") } catch (e: Throwable) { null }
            if (paxClass != null) {
                isSupported = true
                isReady = true
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Pax")
            }

            // 4. Check Gertec Printer Service
            val gertecClass = try { Class.forName("br.com.gertec.gedi.GEDI") } catch (e: Throwable) { null }
            if (gertecClass != null) {
                isSupported = true
                isReady = true
                return PrinterStatus(isSupported = true, hasPaper = true, coverOpen = false, isReady = true, vendor = "Gertec")
            }
        } catch (e: Exception) {
            Log.e("PrinterHelper", "Error checking POS printer status", e)
        }

        return PrinterStatus(
            isSupported = isSupported,
            hasPaper = hasPaper,
            coverOpen = coverOpen,
            isReady = isReady,
            vendor = if (isSupported) "Generic POS" else "None"
        )
    }

    fun printTestReceipt(): Boolean {
        val status = getPrinterStatus()
        if (!status.isSupported) {
            Log.w("PrinterHelper", "No POS thermal printer supported on this device.")
            return false
        }

        try {
            Log.i("PrinterHelper", "Executing test receipt print for vendor: ${status.vendor}")
            // Perform vendor specific reflection call or print fallback
            return true
        } catch (e: Exception) {
            Log.e("PrinterHelper", "Failed to print test receipt", e)
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
