package com.lucasdeeiroz.robotrunner.performance

import android.content.Context
import com.lucasdeeiroz.robotrunner.hardware.HardwareSpecsProvider
import kotlinx.coroutines.*
import java.util.Collections
import java.util.LinkedList

data class PerformanceSample(
    val timestamp: Long,
    val cpuUsagePercent: Float,
    val ramUsedMb: Long,
    val ramTotalMb: Long,
    val batteryCurrentMa: Int,
    val batteryTempC: Float
)

object PerformanceCollector {

    private const val MAX_HISTORY_SAMPLES = 30
    private val samplesHistory = Collections.synchronizedList(LinkedList<PerformanceSample>())
    private var job: Job? = null

    @Volatile
    var isCollecting = false
        private set

    fun startCollecting(context: Context, scope: CoroutineScope) {
        if (isCollecting) return
        isCollecting = true

        job = scope.launch(Dispatchers.IO) {
            while (isActive && isCollecting) {
                try {
                    val telemetry = HardwareSpecsProvider.getLiveTelemetry(
                        context = context,
                        isServerRunning = true,
                        activeClients = 1
                    )

                    val sample = PerformanceSample(
                        timestamp = System.currentTimeMillis(),
                        cpuUsagePercent = telemetry.cpuUsagePercent.toFloat(),
                        ramUsedMb = telemetry.ramUsedMb,
                        ramTotalMb = telemetry.ramTotalMb,
                        batteryCurrentMa = telemetry.batteryCurrentMa,
                        batteryTempC = telemetry.batteryTempC
                    )

                    synchronized(samplesHistory) {
                        if (samplesHistory.size >= MAX_HISTORY_SAMPLES) {
                            samplesHistory.removeAt(0)
                        }
                        samplesHistory.add(sample)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                delay(1000)
            }
        }
    }

    fun stopCollecting() {
        isCollecting = false
        job?.cancel()
        job = null
    }

    fun getHistorySnapshot(): List<PerformanceSample> {
        return synchronized(samplesHistory) { ArrayList(samplesHistory) }
    }
}
