package com.lucasdeeiroz.robotrunner.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Collections

data class HostMetadata(
    val hostname: String,
    val osName: String,
    val osVersion: String,
    val userName: String?,
    val timestamp: Long
)

data class ActivityEvent(
    val type: String, // "test_run", "connection", "error"
    val status: String, // "success", "failed", "running"
    val message: String,
    val timestamp: Long
)

object DesktopSyncManager {
    private val _hostState = MutableStateFlow<HostMetadata?>(null)
    val hostState: StateFlow<HostMetadata?> = _hostState.asStateFlow()

    private val _activityEvents = MutableStateFlow<List<ActivityEvent>>(emptyList())
    val activityEvents: StateFlow<List<ActivityEvent>> = _activityEvents.asStateFlow()

    private var hostResetJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    // Using a synchronized list to prevent ConcurrentModificationException when pushing from REST server
    private val eventQueue = Collections.synchronizedList(mutableListOf<ActivityEvent>())
    private const val MAX_EVENTS = 50 // Limit to avoid memory leaks on long runs

    @Synchronized
    fun updateHost(
        hostname: String,
        osName: String,
        osVersion: String,
        userName: String?
    ) {
        _hostState.value = HostMetadata(
            hostname = hostname,
            osName = osName,
            osVersion = osVersion,
            userName = userName,
            timestamp = System.currentTimeMillis()
        )

        // Reset host state if we don't hear from it in 5 minutes
        hostResetJob?.cancel()
        hostResetJob = scope.launch {
            delay(5 * 60 * 1000)
            _hostState.value = null
        }
    }

    @Synchronized
    fun pushActivity(
        type: String,
        status: String,
        message: String,
        timestamp: Long? = null
    ) {
        val event = ActivityEvent(
            type = type,
            status = status,
            message = message,
            timestamp = timestamp ?: System.currentTimeMillis()
        )
        
        eventQueue.add(0, event) // add at the beginning
        if (eventQueue.size > MAX_EVENTS) {
            eventQueue.removeAt(eventQueue.size - 1)
        }
        
        _activityEvents.value = eventQueue.toList()
    }
}
