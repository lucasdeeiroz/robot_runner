package com.robotrunner.companion.checkup

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.os.Environment
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PdfReportGenerator(private val context: Context) {

    fun generatePdfReport(result: LocalCheckupResult): File? {
        val pdfDocument = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 Size (595x842 pt)
        val page = pdfDocument.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint()
        val titlePaint = Paint()
        val headerPaint = Paint()

        // Background
        canvas.drawColor(Color.WHITE)

        // Header Background Banner
        paint.color = Color.parseColor("#0F172A") // Dark Surface
        canvas.drawRect(0f, 0f, 595f, 90f, paint)

        // Title text
        titlePaint.color = Color.WHITE
        titlePaint.textSize = 22f
        titlePaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("ROBOT RUNNER COMPANION", 30f, 42f, titlePaint)

        titlePaint.color = Color.parseColor("#94A3B8")
        titlePaint.textSize = 12f
        titlePaint.typeface = Typeface.DEFAULT
        canvas.drawText("Standalone Hardware Audit & POS Diagnostics Report", 30f, 65f, titlePaint)

        // Date & Timestamp
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val dateStr = sdf.format(Date(result.timestamp))
        paint.color = Color.parseColor("#64748B")
        paint.textSize = 10f
        canvas.drawText("Generated: $dateStr", 420f, 65f, paint)

        var y = 120f

        fun drawSectionHeader(title: String) {
            headerPaint.color = Color.parseColor("#4F46E5") // Primary Accent
            canvas.drawRect(30f, y, 34f, y + 16f, headerPaint)

            paint.color = Color.parseColor("#1E293B")
            paint.textSize = 14f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            canvas.drawText(title, 42f, y + 13f, paint)
            y += 28f

            paint.color = Color.parseColor("#E2E8F0")
            canvas.drawLine(30f, y - 6f, 565f, y - 6f, paint)
        }

        fun drawRow(label: String, value: String) {
            paint.color = Color.parseColor("#475569")
            paint.textSize = 11f
            paint.typeface = Typeface.DEFAULT
            canvas.drawText(label, 40f, y, paint)

            paint.color = Color.parseColor("#0F172A")
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            canvas.drawText(value, 260f, y, paint)
            y += 18f
        }

        // Section 1: Device Information
        drawSectionHeader("1. Device Information")
        drawRow("Manufacturer / Brand", "${result.manufacturer} (${result.brand})")
        drawRow("Model Name", result.model)
        drawRow("Serial Number", result.serial)
        drawRow("Android OS Version", "Android ${result.androidVersion} (API ${result.sdkInt})")
        y += 15f

        // Section 2: Battery & Power Metrics
        drawSectionHeader("2. Battery & Power Meter")
        drawRow("Battery Charge Level", "${result.batteryLevel}%")
        drawRow("Health Status", result.batteryHealth)
        drawRow("Real-Time Current", "${if (result.batteryCurrentNowmA > 0) "+" else ""}${result.batteryCurrentNowmA} mA")
        drawRow("Voltage / Temperature", "${result.batteryVoltage} V  |  ${result.batteryTemp} °C")
        drawRow("Power Source / Charging", "${result.batteryPlugType} (${if (result.isCharging) "Charging" else "Discharging"})")
        y += 15f

        // Section 3: Memory & Storage
        drawSectionHeader("3. Memory & Storage Stats")
        val freeRamMb = result.freeRamBytes / (1024 * 1024)
        val totalRamMb = result.totalRamBytes / (1024 * 1024)
        val freeStorageGb = String.format(Locale.US, "%.2f", result.freeStorageBytes.toDouble() / (1024 * 1024 * 1024))
        val totalStorageGb = String.format(Locale.US, "%.2f", result.totalStorageBytes.toDouble() / (1024 * 1024 * 1024))

        drawRow("RAM Usage", "$freeRamMb MB Free / $totalRamMb MB Total")
        drawRow("Internal Storage (/data)", "$freeStorageGb GB Free / $totalStorageGb GB Total")
        y += 15f

        // Section 4: Peripherals & Accessibility
        drawSectionHeader("4. Peripherals & Service Status")
        drawRow("POS Thermal Printer", if (result.isPrinterSupported) "${result.printerVendor} (Paper: ${if (result.isPrinterHasPaper) "OK" else "Empty"})" else "Not Supported")
        drawRow("NFC Reader", if (result.isNfcSupported) (if (result.isNfcEnabled) "Enabled & Active" else "Disabled") else "Not Supported")
        drawRow("Accessibility Inspection Service", if (result.isAccessibilityEnabled) "Active (Sub-10ms UI Inspection)" else "Disabled")
        y += 30f

        // Footer
        paint.color = Color.parseColor("#94A3B8")
        paint.textSize = 9f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Robot Runner Mobile Companion • Certified Automated Test Report", 30f, 810f, paint)

        pdfDocument.finishPage(page)

        // Save PDF File
        return try {
            val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadDir.exists()) downloadDir.mkdirs()

            val fileName = "RobotRunner_Checkup_${System.currentTimeMillis()}.pdf"
            val pdfFile = File(downloadDir, fileName)
            val outputStream = FileOutputStream(pdfFile)
            pdfDocument.writeTo(outputStream)
            pdfDocument.close()
            outputStream.close()

            Log.i("PdfReportGenerator", "PDF Report saved successfully at: ${pdfFile.absolutePath}")
            pdfFile
        } catch (e: Exception) {
            Log.e("PdfReportGenerator", "Failed to generate PDF report", e)
            pdfDocument.close()
            null
        }
    }
}
