package com.lucasdeeiroz.robotrunner.stopwatch

import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.Collections

data class ScannerLap(
    val frameTimestamp: Long,
    val detectTimestamp: Long,
    val decodeTimestamp: Long,
    val totalLatencyMs: Long,
    val barcodeValue: String,
    val format: Int
)

object ScannerStopwatchEngine {
    private val lapsList = Collections.synchronizedList(mutableListOf<ScannerLap>())
    
    @Volatile
    var isScanning = false
        private set
        
    var pendingLap: ScannerLap? = null
        private set

    @Volatile
    var sessionStartTime: Long = 0
        private set
        
    private val scannerOptions = BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
        .build()
        
    private val scanner = BarcodeScanning.getClient(scannerOptions)
    
    private var lastScannedValue: String? = null
    private var lastScannedTimestamp: Long = 0
    
    fun startSession() {
        lapsList.clear()
        lastScannedValue = null
        lastScannedTimestamp = 0
        pendingLap = null
        sessionStartTime = System.currentTimeMillis()
        isScanning = true
    }

    fun stopSession() {
        isScanning = false
        pendingLap = null
    }
    
    fun savePendingLap() {
        pendingLap?.let { lap ->
            synchronized(lapsList) {
                lapsList.add(lap)
            }
        }
        pendingLap = null
        sessionStartTime = System.currentTimeMillis()
        isScanning = true // Resume scanning after save
    }
    
    fun discardPendingLap() {
        pendingLap = null
        sessionStartTime = System.currentTimeMillis()
        isScanning = true // Resume scanning after discard
    }
    
    @OptIn(ExperimentalGetImage::class)
    fun processImageProxy(imageProxy: ImageProxy) {
        if (!isScanning) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val frameTimestamp = System.currentTimeMillis()
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            
            scanner.process(image)
                .addOnSuccessListener { barcodes ->
                    val detectTimestamp = System.currentTimeMillis()
                    for (barcode in barcodes) {
                        val rawValue = barcode.rawValue ?: continue
                        val format = barcode.format
                        
                        val decodeTimestamp = System.currentTimeMillis()
                        
                        // Debounce: ignore same barcode scanned within 2 seconds
                        if (rawValue == lastScannedValue && (decodeTimestamp - lastScannedTimestamp) < 2000) {
                            continue
                        }
                        
                        lastScannedValue = rawValue
                        lastScannedTimestamp = decodeTimestamp
                        
                        val totalLatency = decodeTimestamp - sessionStartTime
                        
                        val lap = ScannerLap(
                            frameTimestamp = frameTimestamp,
                            detectTimestamp = detectTimestamp,
                            decodeTimestamp = decodeTimestamp,
                            totalLatencyMs = totalLatency,
                            barcodeValue = rawValue,
                            format = format
                        )
                        
                        pendingLap = lap
                        isScanning = false
                        break
                    }
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }
    
    fun getLapsSnapshot(): List<ScannerLap> {
        return synchronized(lapsList) { ArrayList(lapsList) }
    }
}
