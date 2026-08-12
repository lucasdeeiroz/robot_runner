package com.lucasdeeiroz.robotrunner.stopwatch

import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.Collections

@androidx.annotation.Keep
data class ScannerLap(
    val cameraInitMs: Long,
    val searchMs: Long,
    val decodeMs: Long,
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
        
    @Volatile
    var isCameraReady: Boolean = false
        private set
        
    @Volatile
    var firstFrameTimestamp: Long = 0
        private set
        
    private val scannerOptions by lazy {
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
            .build()
    }
        
    private val scanner by lazy {
        try {
            BarcodeScanning.getClient(scannerOptions)
        } catch (e: Throwable) {
            android.util.Log.e("ScannerStopwatch", "Failed to initialize MLKit BarcodeScanner", e)
            null
        }
    }
    
    private var lastScannedValue: String? = null
    private var lastScannedTimestamp: Long = 0
    
    fun startSession() {
        lapsList.clear()
        lastScannedValue = null
        lastScannedTimestamp = 0
        pendingLap = null
        isCameraReady = false // Stopwatch will start on first frame
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
        isCameraReady = false
        sessionStartTime = System.currentTimeMillis()
        isScanning = true // Resume scanning after save
    }
    
    fun discardPendingLap() {
        pendingLap = null
        isCameraReady = false
        sessionStartTime = System.currentTimeMillis()
        isScanning = true // Resume scanning after discard
    }
    
    @OptIn(ExperimentalGetImage::class)
    fun processImageProxy(imageProxy: ImageProxy) {
        if (!isScanning) {
            imageProxy.close()
            return
        }

        if (!isCameraReady) {
            isCameraReady = true
            firstFrameTimestamp = System.currentTimeMillis()
        }

        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val frameTimestamp = System.currentTimeMillis()
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            
            scanner?.process(image)
                ?.addOnSuccessListener { barcodes ->
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
                        
                        val cameraInitMs = firstFrameTimestamp - sessionStartTime
                        val searchMs = frameTimestamp - firstFrameTimestamp
                        val decodeMs = decodeTimestamp - frameTimestamp
                        val totalLatency = decodeTimestamp - sessionStartTime
                        
                        val lap = ScannerLap(
                            cameraInitMs = cameraInitMs,
                            searchMs = searchMs,
                            decodeMs = decodeMs,
                            totalLatencyMs = totalLatency,
                            barcodeValue = rawValue,
                            format = format
                        )
                        
                        pendingLap = lap
                        isScanning = false
                        break
                    }
                }
                ?.addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }
    
    fun clearLaps() {
        synchronized(lapsList) {
            lapsList.clear()
        }
    }
    
    fun getLapsSnapshot(): List<ScannerLap> {
        return synchronized(lapsList) { ArrayList(lapsList) }
    }
}
