package com.lucasdeeiroz.robotrunner.stopwatch

import android.content.Context
import android.os.Environment
import com.google.gson.GsonBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.Collections

object RedrawStopwatchEngine {

    private val lapsList = Collections.synchronizedList(mutableListOf<RedrawLap>())
    
    @Volatile
    var isRecordingSession = false
        private set

    private var sessionStartTime: Long = 0
    private var lapCounter = 0

    fun startSession() {
        lapsList.clear()
        lapCounter = 0
        sessionStartTime = System.currentTimeMillis()
        isRecordingSession = true
    }

    fun recordLap(
        touchTimestamp: Long,
        redrawTimestamp: Long,
        deltaMs: Long,
        packageName: String = "target_app",
        actionType: String = "touch_redraw"
    ): RedrawLap {
        lapCounter++
        val lap = RedrawLap(
            lapNumber = lapCounter,
            touchTimestamp = touchTimestamp,
            redrawTimestamp = redrawTimestamp,
            deltaMs = deltaMs,
            packageName = packageName,
            actionType = actionType
        )
        synchronized(lapsList) {
            lapsList.add(lap)
        }
        return lap
    }

    fun stopSession(): BenchmarkSession {
        isRecordingSession = false
        val endTime = System.currentTimeMillis()
        val snapshot = getLapsSnapshot()

        if (snapshot.isEmpty()) {
            return BenchmarkSession(
                sessionId = "bench_${sessionStartTime}",
                startTime = sessionStartTime,
                endTime = endTime,
                laps = emptyList(),
                minDeltaMs = 0,
                maxDeltaMs = 0,
                avgDeltaMs = 0,
                p95DeltaMs = 0
            )
        }

        val deltas = snapshot.map { it.deltaMs }.sorted()
        val min = deltas.first()
        val max = deltas.last()
        val avg = deltas.average().toLong()
        val p95Index = ((deltas.size * 0.95) - 1).coerceAtLeast(0.0).toInt()
        val p95 = deltas.getOrNull(p95Index) ?: max

        return BenchmarkSession(
            sessionId = "bench_${sessionStartTime}",
            startTime = sessionStartTime,
            endTime = endTime,
            laps = snapshot,
            minDeltaMs = min,
            maxDeltaMs = max,
            avgDeltaMs = avg,
            p95DeltaMs = p95
        )
    }

    fun getLapsSnapshot(): List<RedrawLap> {
        return synchronized(lapsList) { ArrayList(lapsList) }
    }

    fun clearSession() {
        isRecordingSession = false
        synchronized(lapsList) {
            lapsList.clear()
        }
        lapCounter = 0
    }

    suspend fun exportSessionJson(): File? = withContext(Dispatchers.IO) {
        try {
            val session = stopSession()
            val gson = GsonBuilder().setPrettyPrinting().create()
            val jsonStr = gson.toJson(session)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "benchmark_${session.sessionId}.json"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(jsonStr.toByteArray())
            }
            file
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
