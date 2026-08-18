package com.lucasdeeiroz.robotrunner.stopwatch

import android.content.Context
import android.os.Environment
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageProxy
import com.google.gson.GsonBuilder
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.Collections
import kotlin.math.roundToInt

enum class ScannerStartMode {
    HOT,
    COLD
}

@androidx.annotation.Keep
data class ScannerLap(
    val lapNumber: Int,
    val startMode: String,
    val cameraInitMs: Long,
    val searchMs: Long,
    val decodeMs: Long,
    val totalLatencyMs: Long,
    val barcodeValue: String,
    val format: Int,
    val formatName: String,
    val torchEnabled: Boolean = false,
    val estimatedDistanceCm: Int? = null,
    val timestamp: Long = System.currentTimeMillis()
)

@androidx.annotation.Keep
data class ScannerBenchmarkSession(
    val sessionId: String,
    val startTime: Long,
    val endTime: Long,
    val totalRounds: Int,
    val laps: List<ScannerLap>,
    val minLatencyMs: Long,
    val maxLatencyMs: Long,
    val avgLatencyMs: Long,
    val p95LatencyMs: Long,
    val hotRoundsCount: Int,
    val coldRoundsCount: Int
)

object ScannerStopwatchEngine {
    private val lapsList = Collections.synchronizedList(mutableListOf<ScannerLap>())

    private val _lapsFlow = MutableStateFlow<List<ScannerLap>>(emptyList())
    val lapsFlow: StateFlow<List<ScannerLap>> = _lapsFlow.asStateFlow()

    private val _startModeFlow = MutableStateFlow(ScannerStartMode.HOT)
    val startModeFlow: StateFlow<ScannerStartMode> = _startModeFlow.asStateFlow()

    private val _isTorchEnabledFlow = MutableStateFlow(false)
    val isTorchEnabledFlow: StateFlow<Boolean> = _isTorchEnabledFlow.asStateFlow()

    private val _isScanningFlow = MutableStateFlow(false)
    val isScanningFlow: StateFlow<Boolean> = _isScanningFlow.asStateFlow()

    val isScanning: Boolean
        get() = _isScanningFlow.value

    private val _pendingLapFlow = MutableStateFlow<ScannerLap?>(null)
    val pendingLapFlow: StateFlow<ScannerLap?> = _pendingLapFlow.asStateFlow()

    val pendingLap: ScannerLap?
        get() = _pendingLapFlow.value

    private val _estimatedDistanceCmFlow = MutableStateFlow<Int?>(null)
    val estimatedDistanceCmFlow: StateFlow<Int?> = _estimatedDistanceCmFlow.asStateFlow()

    @Volatile
    var sessionStartTime: Long = 0
        private set

    @Volatile
    var isCameraReady: Boolean = false
        private set

    @Volatile
    var firstFrameTimestamp: Long = 0
        private set

    @Volatile
    private var currentRoundMode: ScannerStartMode = ScannerStartMode.HOT

    @Volatile
    private var currentRoundTorch: Boolean = false

    private val scannerOptions by lazy {
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_QR_CODE,
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_ITF
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
            // Pre-initialize MLKit BarcodeScanning client and native dependencies
            scanner
        } catch (e: Throwable) {
            android.util.Log.w("ScannerStopwatch", "MLKit warm-up warning", e)
        }
    }

    fun setStartMode(mode: ScannerStartMode) {
        _startModeFlow.value = mode
    }

    fun setTorchEnabled(enabled: Boolean) {
        _isTorchEnabledFlow.value = enabled
    }

    private var smoothedDistance: Float = 0f
    private var lastDistanceEmitTime: Long = 0

    fun updateEstimatedDistance(rawDistanceCm: Int) {
        if (rawDistanceCm !in 3..400) return
        val now = System.currentTimeMillis()

        if (smoothedDistance <= 0f) {
            smoothedDistance = rawDistanceCm.toFloat()
        } else {
            // Exponential Moving Average (EMA): 80% weight on smoothed history, 20% on new sample
            smoothedDistance = (smoothedDistance * 0.80f) + (rawDistanceCm.toFloat() * 0.20f)
        }

        val smoothedInt = smoothedDistance.roundToInt()
        val currentEmitted = _estimatedDistanceCmFlow.value

        // Throttle UI emissions: only emit if changed by at least 2cm or after 250ms interval
        if (currentEmitted == null || Math.abs(smoothedInt - currentEmitted) >= 2 || (now - lastDistanceEmitTime > 250 && smoothedInt != currentEmitted)) {
            _estimatedDistanceCmFlow.value = smoothedInt
            lastDistanceEmitTime = now
        }
    }

    private var lastScannedValue: String? = null
    private var lastScannedTimestamp: Long = 0

    fun startRound(mode: ScannerStartMode = _startModeFlow.value, torch: Boolean = _isTorchEnabledFlow.value) {
        currentRoundMode = mode
        currentRoundTorch = torch
        lastScannedValue = null
        lastScannedTimestamp = 0
        _pendingLapFlow.value = null
        sessionStartTime = System.currentTimeMillis()

        if (mode == ScannerStartMode.HOT) {
            isCameraReady = true
            firstFrameTimestamp = sessionStartTime
        } else {
            isCameraReady = false
            firstFrameTimestamp = 0
        }

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
        _isScanningFlow.value = false
    }

    fun discardPendingLap() {
        _pendingLapFlow.value = null
        _isScanningFlow.value = false
    }

    private var lastStagingAnalysisTime: Long = 0

    @OptIn(ExperimentalGetImage::class)
    fun processImageProxy(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        val frameTimestamp = System.currentTimeMillis()
        val rotationDegrees = imageProxy.imageInfo.rotationDegrees
        val image = InputImage.fromMediaImage(mediaImage, rotationDegrees)
        val client = scanner

        if (client == null) {
            imageProxy.close()
            return
        }

        // 1. If currently in active scanning benchmark mode:
        if (_isScanningFlow.value) {
            if (!isCameraReady) {
                isCameraReady = true
                firstFrameTimestamp = System.currentTimeMillis()
            }

            client.process(image)
                .addOnSuccessListener { barcodes ->
                    val detectTimestamp = System.currentTimeMillis()
                    for (barcode in barcodes) {
                        val rawValue = barcode.rawValue ?: continue
                        val format = barcode.format
                        val decodeTimestamp = System.currentTimeMillis()

                        // Debounce: ignore same barcode scanned within 1.5 seconds
                        if (rawValue == lastScannedValue && (decodeTimestamp - lastScannedTimestamp) < 1500) {
                            continue
                        }

                        lastScannedValue = rawValue
                        lastScannedTimestamp = decodeTimestamp

                        // Optical distance estimation from bounding box if available
                        val bbox = barcode.boundingBox
                        if (bbox != null && bbox.width() > 10) {
                            val imgWidth = if (rotationDegrees == 90 || rotationDegrees == 270) imageProxy.height else imageProxy.width
                            val estimatedCm = ((imgWidth.toFloat() / bbox.width().toFloat()) * 5.5f).roundToInt().coerceIn(5, 300)
                            updateEstimatedDistance(estimatedCm)
                        }

                        val cameraInitMs = if (currentRoundMode == ScannerStartMode.HOT) {
                            0L
                        } else {
                            (firstFrameTimestamp - sessionStartTime).coerceAtLeast(0L)
                        }

                        val searchMs = (frameTimestamp - (if (currentRoundMode == ScannerStartMode.HOT) sessionStartTime else firstFrameTimestamp)).coerceAtLeast(0L)
                        val decodeMs = (decodeTimestamp - frameTimestamp).coerceAtLeast(0L)
                        val totalLatency = if (currentRoundMode == ScannerStartMode.HOT) {
                            (searchMs + decodeMs)
                        } else {
                            (decodeTimestamp - sessionStartTime)
                        }

                        val lapNumber = synchronized(lapsList) { lapsList.size + 1 }

                        val lap = ScannerLap(
                            lapNumber = lapNumber,
                            startMode = currentRoundMode.name,
                            cameraInitMs = cameraInitMs,
                            searchMs = searchMs,
                            decodeMs = decodeMs,
                            totalLatencyMs = totalLatency,
                            barcodeValue = rawValue,
                            format = format,
                            formatName = getFormatName(format),
                            torchEnabled = currentRoundTorch,
                            estimatedDistanceCm = _estimatedDistanceCmFlow.value,
                            timestamp = decodeTimestamp
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
            // 2. In Staging Mode (Hot Start preparation): throttle analysis to at most 1 frame per 450ms (leaves 100% CPU free for live tests)
            val now = System.currentTimeMillis()
            if (now - lastStagingAnalysisTime < 450) {
                imageProxy.close()
                return
            }
            lastStagingAnalysisTime = now

            client.process(image)
                .addOnSuccessListener { barcodes ->
                    for (barcode in barcodes) {
                        val bbox = barcode.boundingBox
                        if (bbox != null && bbox.width() > 10) {
                            val imgWidth = if (rotationDegrees == 90 || rotationDegrees == 270) imageProxy.height else imageProxy.width
                            val estimatedCm = ((imgWidth.toFloat() / bbox.width().toFloat()) * 5.5f).roundToInt().coerceIn(5, 300)
                            updateEstimatedDistance(estimatedCm)
                            break
                        }
                    }
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        }
    }

    fun getFormatName(format: Int): String {
        return when (format) {
            Barcode.FORMAT_QR_CODE -> "QR Code"
            Barcode.FORMAT_EAN_13 -> "GS1 EAN-13"
            Barcode.FORMAT_EAN_8 -> "EAN-8"
            Barcode.FORMAT_CODE_128 -> "GS1-128"
            Barcode.FORMAT_ITF -> "ITF-14"
            else -> "FORMAT_$format"
        }
    }

    fun getSessionSummary(): ScannerBenchmarkSession? {
        val snapshot = getLapsSnapshot()
        if (snapshot.isEmpty()) return null

        val latencies = snapshot.map { it.totalLatencyMs }.sorted()
        val min = latencies.first()
        val max = latencies.last()
        val avg = latencies.average().toLong()
        val p95Index = ((latencies.size * 0.95) - 1).coerceAtLeast(0.0).toInt()
        val p95 = latencies.getOrNull(p95Index) ?: max

        val hotCount = snapshot.count { it.startMode == ScannerStartMode.HOT.name }
        val coldCount = snapshot.count { it.startMode == ScannerStartMode.COLD.name }

        return ScannerBenchmarkSession(
            sessionId = "scanner_bench_${sessionStartTime}",
            startTime = snapshot.minOf { it.timestamp },
            endTime = snapshot.maxOf { it.timestamp },
            totalRounds = snapshot.size,
            laps = snapshot,
            minLatencyMs = min,
            maxLatencyMs = max,
            avgLatencyMs = avg,
            p95LatencyMs = p95,
            hotRoundsCount = hotCount,
            coldRoundsCount = coldCount
        )
    }

    suspend fun exportSessionJson(context: Context? = null): File? = withContext(Dispatchers.IO) {
        try {
            val snapshot = getLapsSnapshot()
            if (snapshot.isEmpty()) return@withContext null

            val summary = getSessionSummary() ?: return@withContext null
            val gson = GsonBuilder().setPrettyPrinting().create()
            val json = gson.toJson(summary)

            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!dir.exists()) dir.mkdirs()

            val file = File(dir, "scanner_benchmark_${System.currentTimeMillis()}.json")
            FileOutputStream(file).use { out ->
                out.write(json.toByteArray(Charsets.UTF_8))
            }
            file
        } catch (e: Throwable) {
            android.util.Log.e("ScannerStopwatch", "Failed to export scanner benchmark json", e)
            null
        }
    }

    fun clearLaps() {
        synchronized(lapsList) {
            lapsList.clear()
            _lapsFlow.value = emptyList()
        }
        _pendingLapFlow.value = null
        _isScanningFlow.value = false
    }

    fun getLapsSnapshot(): List<ScannerLap> {
        return synchronized(lapsList) { ArrayList(lapsList) }
    }
}
