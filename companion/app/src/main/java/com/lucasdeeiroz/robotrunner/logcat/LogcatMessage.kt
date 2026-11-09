package com.lucasdeeiroz.robotrunner.logcat

enum class LogLevel {
    VERBOSE,
    DEBUG,
    INFO,
    WARN,
    ERROR,
    FATAL,
    UNKNOWN
}

data class LogcatMessage(
    val timestamp: String,
    val pid: String,
    val tid: String,
    val level: LogLevel,
    val tag: String,
    val message: String,
    val rawLine: String = ""
)
