package com.lucasdeeiroz.robotrunner.stopwatch

import android.os.Environment
import com.google.gson.GsonBuilder
import com.lucasdeeiroz.robotrunner.logcat.LogcatMessage
import com.lucasdeeiroz.robotrunner.logcat.LogcatStreamer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.Collections

data class LogcatLap(
    val lapNumber: Int,
    val keyword: String,
    val timestamp: Long,
    val deltaMs: Long
)

object LogcatStopwatchEngine {
    private val lapsList = Collections.synchronizedList(mutableListOf<LogcatLap>())
    private var keywordsList = listOf<String>()
    
    @Volatile
    var isRecordingSession = false
        private set

    private var sessionStartTime: Long = 0
    private var lapCounter = 0

    private val logcatObserver: (LogcatMessage) -> Unit = { msg ->
        if (isRecordingSession) {
            val text = "${msg.tag} ${msg.message}"
            val matchedKeyword = keywordsList.find { text.contains(it, ignoreCase = true) }
            if (matchedKeyword != null) {
                val now = System.currentTimeMillis()
                val delta = now - sessionStartTime
                recordLap(matchedKeyword, now, delta)
            }
        }
    }

    fun startSession(keywords: List<String>) {
        lapsList.clear()
        lapCounter = 0
        keywordsList = keywords.filter { it.isNotBlank() }
        sessionStartTime = System.currentTimeMillis()
        isRecordingSession = true
        LogcatStreamer.addObserver(logcatObserver)
        if (!LogcatStreamer.isStreaming) {
            LogcatStreamer.startStreaming()
        }
    }

    private fun recordLap(keyword: String, timestamp: Long, deltaMs: Long) {
        lapCounter++
        val lap = LogcatLap(lapCounter, keyword, timestamp, deltaMs)
        synchronized(lapsList) {
            lapsList.add(lap)
        }
    }

    fun stopSession(): List<LogcatLap> {
        isRecordingSession = false
        LogcatStreamer.removeObserver(logcatObserver)
        return getLapsSnapshot()
    }

    fun getLapsSnapshot(): List<LogcatLap> {
        return synchronized(lapsList) { ArrayList(lapsList) }
    }

    fun clearSession() {
        isRecordingSession = false
        LogcatStreamer.removeObserver(logcatObserver)
        synchronized(lapsList) {
            lapsList.clear()
        }
        lapCounter = 0
    }

    suspend fun exportSessionJson(): File? = withContext(Dispatchers.IO) {
        try {
            val snapshot = stopSession()
            val gson = GsonBuilder().setPrettyPrinting().create()
            val map = mapOf(
                "sessionId" to "logcat_bench_${sessionStartTime}",
                "startTime" to sessionStartTime,
                "endTime" to System.currentTimeMillis(),
                "laps" to snapshot
            )
            val jsonStr = gson.toJson(map)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "logcat_benchmark_${sessionStartTime}.json"
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
