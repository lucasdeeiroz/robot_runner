package com.lucasdeeiroz.robotrunner.stopwatch

import android.os.Environment
import com.google.gson.GsonBuilder
import com.lucasdeeiroz.robotrunner.logcat.LogcatMessage
import com.lucasdeeiroz.robotrunner.logcat.LogcatStreamer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Collections

data class LogcatLap(
    val lapNumber: Int,
    val keyword: String,
    val timestamp: Long,
    val deltaMs: Long
)

data class LogcatSavedRound(
    val id: String,
    val totalTimeMs: Long,
    val laps: List<LogcatLap>
)

object LogcatStopwatchEngine {
    private val lapsList = Collections.synchronizedList(mutableListOf<LogcatLap>())
    private val savedRounds = Collections.synchronizedList(mutableListOf<LogcatSavedRound>())
    private var keywordsList = listOf<String>()
    
    private val _sharedKeywords = MutableStateFlow(listOf("ActivityResume", "NetworkSuccess"))
    val sharedKeywords: StateFlow<List<String>> = _sharedKeywords.asStateFlow()
    
    fun updateSharedKeywords(keywords: List<String>) {
        _sharedKeywords.value = keywords
        keywordsList = keywords.filter { it.isNotBlank() }
    }
    
    @Volatile
    var isRecordingSession = false
        private set

    private var sessionStartTime: Long = 0
    private var lapCounter = 0

    private val logcatObserver: (LogcatMessage) -> Unit = { msg ->
        if (isRecordingSession) {
            val text = msg.rawLine
            android.util.Log.d("StopwatchDebug", "Checking log line against keywords: $keywordsList | Text: $text")
            val matchedKeyword = keywordsList.find { kw -> 
                if (kw.contains("*")) {
                    try {
                        val regexStr = kw.split("*").joinToString(".*") { Regex.escape(it) }
                        Regex(regexStr, RegexOption.IGNORE_CASE).containsMatchIn(text)
                    } catch (e: Exception) {
                        text.contains(kw, ignoreCase = true)
                    }
                } else {
                    text.contains(kw, ignoreCase = true)
                }
            }
            if (matchedKeyword != null) {
                val now = System.currentTimeMillis()
                val delta = synchronized(lapsList) {
                    if (lapsList.isEmpty()) 0L else Math.max(0L, now - lapsList.last().timestamp)
                }
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
        android.util.Log.d("StopwatchDebug", "Session started with keywords: $keywordsList")
        LogcatStreamer.addObserver(logcatObserver)
        if (!LogcatStreamer.isStreaming) {
            android.util.Log.d("StopwatchDebug", "Starting LogcatStreamer...")
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
    
    fun getSavedRoundsSnapshot(): List<LogcatSavedRound> {
        return synchronized(savedRounds) { ArrayList(savedRounds) }
    }

    fun removeLap(index: Int) {
        synchronized(lapsList) {
            if (index in lapsList.indices) {
                lapsList.removeAt(index)
                for (i in lapsList.indices) {
                    val current = lapsList[i]
                    val newDelta = if (i == 0) 0L else Math.max(0L, current.timestamp - lapsList[i - 1].timestamp)
                    lapsList[i] = current.copy(lapNumber = i + 1, deltaMs = newDelta)
                }
                lapCounter = lapsList.size
            }
        }
    }

    fun saveRound() {
        val currentLaps = synchronized(lapsList) { ArrayList(lapsList) }
        if (currentLaps.isEmpty()) return
        
        val totalTime = currentLaps.sumOf { it.deltaMs }
        val round = LogcatSavedRound(
            id = "round_${System.currentTimeMillis()}",
            totalTimeMs = totalTime,
            laps = currentLaps
        )
        synchronized(savedRounds) {
            savedRounds.add(round)
        }
        clearLaps()
    }

    fun clearLaps() {
        synchronized(lapsList) {
            lapsList.clear()
        }
        lapCounter = 0
    }
    
    fun clearAllSavedRounds() {
        synchronized(savedRounds) {
            savedRounds.clear()
        }
    }

    fun removeSavedRound(id: String) {
        synchronized(savedRounds) {
            savedRounds.removeAll { it.id == id }
        }
    }
    fun clearSession() {
        isRecordingSession = false
        LogcatStreamer.removeObserver(logcatObserver)
        clearLaps()
        clearAllSavedRounds()
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
