package com.lucasdeeiroz.robotrunner.stopwatch

import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    private val _lapsFlow = MutableStateFlow<List<ScannerLap>>(emptyList())
    val lapsFlow: StateFlow<List<ScannerLap>> = _lapsFlow.asStateFlow()

    private val _isScanningFlow = MutableStateFlow(false)
    val isScanningFlow: StateFlow<Boolean> = _isScanningFlow.asStateFlow()

    val isScanning: Boolean
        get() = _isScanningFlow.value

    private val _pendingLapFlow = MutableStateFlow<ScannerLap?>(null)
    val pendingLapFlow: StateFlow<ScannerLap?> = _pendingLapFlow.asStateFlow()

    val pendingLap: ScannerLap?
        get() = _pendingLapFlow.value

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
            .setBarcodeFormats(
                Barcode.FORMAT_QR_CODE,
                Barcode.FORMAT_AZTEC,
                Barcode.FORMAT_DATA_MATRIX,
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_CODE_39,
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A,
                Barcode.FORMAT_UPC_E,
                Barcode.FORMAT_PDF417
            )
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

    fun warmUp() {
        try {
            // Trigger lazy initialization of MLKit BarcodeScanning client and native dependencies
            scanner
        } catch (e: Throwable) {
            android.util.Log.w("ScannerStopwatch", "MLKit warm-up warning", e)
        }
    }

    private var lastScannedValue: String? = null
    private var lastScannedTimestamp: Long = 0

    fun startSession() {
        lapsList.clear()
        _lapsFlow.value = emptyList()
        lastScannedValue = null
        lastScannedTimestamp = 0
        _pendingLapFlow.value = null
        isCameraReady = false
        sessionStartTime = System.currentTimeMillis()
        _isScanningFlow.value = true
    }

    fun stopSession() {
        _isScanningFlow.value = false
        _pendingLapFlow.value = null
    }

    fun savePendingLap() {
        _pendingLapFlow.value?.let { lap ->
            synchronized(lapsList) {
                lapsList.add(lap)
                _lapsFlow.value = ArrayList(lapsList)
            }
        }
        _pendingLapFlow.value = null
        isCameraReady = false
        sessionStartTime = System.currentTimeMillis()
        _isScanningFlow.value = true // Resume scanning after save
    }

    fun discardPendingLap() {
        _pendingLapFlow.value = null
        isCameraReady = false
        sessionStartTime = System.currentTimeMillis()
        _isScanningFlow.value = true // Resume scanning after discard
    }

    @OptIn(ExperimentalGetImage::class)
    fun processImageProxy(imageProxy: ImageProxy) {
        if (!_isScanningFlow.value) {
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

            val client = scanner
            if (client != null) {
                client.process(image)
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

                            _pendingLapFlow.value = lap
                            _isScanningFlow.value = false
                            break
                        }
                    }
                    .addOnCompleteListener {
                        imageProxy.close()
                    }
            } else {
                imageProxy.close()
            }
        } else {
            imageProxy.close()
        }
    }

    fun clearLaps() {
        synchronized(lapsList) {
            lapsList.clear()
            _lapsFlow.value = emptyList()
        }
    }

    fun getLapsSnapshot(): List<ScannerLap> {
        return synchronized(lapsList) { ArrayList(lapsList) }
    }
}
