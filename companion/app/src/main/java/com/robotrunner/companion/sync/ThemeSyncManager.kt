package com.robotrunner.companion.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ThemeSyncData(
    val theme: String = "dark",
    val primaryColor: String? = null,
    val userName: String? = null,
    val userEmail: String? = null,
    val userPhotoBase64: String? = null,
    val logoBase64: String? = null
)

object ThemeSyncManager {
    private val _themeState = MutableStateFlow(ThemeSyncData())
    val themeState: StateFlow<ThemeSyncData> = _themeState.asStateFlow()
    
    private var resetJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    @Synchronized
    fun heartbeat() {
        resetJob?.cancel()
        resetJob = scope.launch {
            delay(15000) // Reset after 15 seconds of no activity
            _themeState.value = ThemeSyncData()
        }
    }

    fun updateTheme(
        theme: String,
        primaryColor: String?,
        userName: String?,
        userEmail: String?,
        userPhotoBase64: String?,
        logoBase64: String?
    ) {
        _themeState.value = ThemeSyncData(
            theme = theme,
            primaryColor = primaryColor,
            userName = userName,
            userEmail = userEmail,
            userPhotoBase64 = userPhotoBase64,
            logoBase64 = logoBase64
        )
    }
}
