package com.lucasdeeiroz.robotrunner.stopwatch

data class RedrawLap(
    val lapNumber: Int,
    val touchTimestamp: Long,
    val redrawTimestamp: Long,
    val deltaMs: Long,
    val packageName: String,
    val actionType: String
)

data class BenchmarkSession(
    val sessionId: String,
    val startTime: Long,
    val endTime: Long,
    val laps: List<RedrawLap>,
    val minDeltaMs: Long,
    val maxDeltaMs: Long,
    val avgDeltaMs: Long,
    val p95DeltaMs: Long
)
