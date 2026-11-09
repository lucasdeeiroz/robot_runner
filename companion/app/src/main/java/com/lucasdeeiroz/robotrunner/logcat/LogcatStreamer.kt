package com.lucasdeeiroz.robotrunner.logcat

import android.content.Context
import android.os.Environment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.util.Collections
import java.util.ArrayDeque

object LogcatStreamer {

    private const val MAX_RING_BUFFER_SIZE = 1000
    private val ringBuffer = ArrayDeque<LogcatMessage>(MAX_RING_BUFFER_SIZE)
    private val observers = Collections.synchronizedList(mutableListOf<(LogcatMessage) -> Unit>())

    @Volatile
    var isStreaming = false
        private set

    @Volatile
    var isPaused = false

    private var workerThread: Thread? = null
    private var process: Process? = null

    fun startStreaming() {
        if (isStreaming) return
        isStreaming = true
        isPaused = false

        workerThread = Thread {
            try {
                process = ProcessBuilder("logcat", "-v", "threadtime")
                    .redirectErrorStream(true)
                    .start()
                val reader = BufferedReader(InputStreamReader(process!!.inputStream))
                var line: String? = null

                val myPid = android.os.Process.myPid().toString()
                val ignoredTags = listOf("CompanionHttpServer", "NanoHTTPd")

                while (isStreaming && reader.readLine().also { line = it } != null) {
                    val currentLine = line ?: continue
                    if (isPaused) continue
                    val msg = parseLogcatLine(currentLine)
                    if (msg != null) {
                        val isIgnored = msg.pid == myPid || ignoredTags.any { msg.tag.contains(it, ignoreCase = true) }
                        if (!isIgnored) {
                            synchronized(ringBuffer) {
                                if (ringBuffer.size >= MAX_RING_BUFFER_SIZE) {
                                    ringBuffer.removeFirst()
                                }
                                ringBuffer.addLast(msg)
                            }
                            synchronized(observers) {
                                observers.forEach { it(msg) }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("LogcatStreamer", "Error in LogcatStreamer thread", e)
            } finally {
                stopStreaming()
            }
        }
        workerThread?.start()
    }

    fun stopStreaming() {
        isStreaming = false
        try {
            process?.destroy()
        } catch (_: Exception) {}
        process = null
        workerThread = null
    }

    fun clearLogs() {
        synchronized(ringBuffer) {
            ringBuffer.clear()
        }
    }

    fun addObserver(observer: (LogcatMessage) -> Unit) {
        synchronized(observers) {
            if (!observers.contains(observer)) {
                observers.add(observer)
            }
        }
    }

    fun removeObserver(observer: (LogcatMessage) -> Unit) {
        synchronized(observers) {
            observers.remove(observer)
        }
    }

    fun getFilteredLogs(
        minLevel: LogLevel = LogLevel.VERBOSE,
        searchQuery: String = ""
    ): List<LogcatMessage> {
        val snapshot = synchronized(ringBuffer) { ArrayList(ringBuffer) }
        return snapshot.filter { msg ->
            msg.level.ordinal >= minLevel.ordinal &&
                    (searchQuery.isEmpty() ||
                            msg.tag.contains(searchQuery, ignoreCase = true) ||
                            msg.message.contains(searchQuery, ignoreCase = true) ||
                            msg.pid.contains(searchQuery))
        }
    }

    suspend fun exportLogs(onlyFiltered: Boolean = false, level: LogLevel = LogLevel.VERBOSE, query: String = ""): File? = withContext(Dispatchers.IO) {
        try {
            val snapshot = synchronized(ringBuffer) { ArrayList(ringBuffer) }
            val logsToExport = if (onlyFiltered) {
                snapshot.filter { msg ->
                    (level == LogLevel.VERBOSE || msg.level.ordinal >= level.ordinal) &&
                    (query.isEmpty() || msg.tag.contains(query, ignoreCase = true) || msg.message.contains(query, ignoreCase = true))
                }
            } else {
                snapshot
            }

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "logcat_export_${System.currentTimeMillis()}.log"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                logsToExport.forEach { msg ->
                    val line = "${msg.timestamp} ${msg.pid}-${msg.tid} [${msg.level.name.take(1)}] ${msg.tag}: ${msg.message}\n"
                    out.write(line.toByteArray())
                }
            }
            file
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun parseLogcatLine(line: String): LogcatMessage? {
        val trimmed = line.trim()
        if (trimmed.isEmpty() || trimmed.startsWith("---------")) return null

        return try {
            // Standard threadtime line: "07-25 17:15:00.123 1234 5678 I TagName : Message"
            val parts = trimmed.split("\\s+".toRegex(), 6)
            if (parts.size >= 6) {
                val timestamp = "${parts[0]} ${parts[1]}"
                val pid = parts[2]
                val tid = parts[3]
                val levelChar = parts[4]
                val rest = parts[5]

                val level = when (levelChar) {
                    "V" -> LogLevel.VERBOSE
                    "D" -> LogLevel.DEBUG
                    "I" -> LogLevel.INFO
                    "W" -> LogLevel.WARN
                    "E" -> LogLevel.ERROR
                    "F" -> LogLevel.FATAL
                    else -> LogLevel.UNKNOWN
                }

                val tagMsg = rest.split(":", limit = 2)
                val tag = tagMsg.getOrNull(0)?.trim() ?: "Unknown"
                val message = tagMsg.getOrNull(1)?.trim() ?: rest

                LogcatMessage(timestamp, pid, tid, level, tag, message, line)
            } else {
                LogcatMessage("", "", "", LogLevel.INFO, "System", line, line)
            }
        } catch (e: Exception) {
            LogcatMessage("", "", "", LogLevel.INFO, "Raw", line, line)
        }
    }
}
